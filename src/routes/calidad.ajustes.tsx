import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Download, FileSpreadsheet, Search, Clock, CheckCircle2,
  AlertTriangle, Wrench, PlayCircle, ShieldCheck, ClipboardCheck, Lock,
  ExternalLink, TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  useQcMock, autorizarAjuste, iniciarAjuste, cerrarAjuste, calcularSla,
  SLA_HORAS,
} from "@/lib/qc-mock/store";
import type { AjusteCalidad, ResultadoAjuste } from "@/lib/qc-mock/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calidad/ajustes")({
  component: AjustesPage,
});

const TIPO_LABEL: Record<AjusteCalidad["tipo_ajuste"], string> = {
  ajuste_calidad: "Ajuste calidad",
  ajuste_maquina: "Ajuste máquina",
  ajuste_parametros: "Ajuste parámetros",
  cambio_materia_prima: "Cambio materia prima",
  reproceso: "Reproceso",
  otro: "Otro",
};

const FLUJO_LABEL: Record<AjusteCalidad["estado_flujo"], string> = {
  solicitado: "Solicitado",
  autorizado: "Autorizado",
  en_ejecucion: "En ejecución",
  cerrado: "Cerrado",
  rechazado: "Rechazado",
};

function AjustesPage() {
  const router = useRouter();
  const auth = useAuth();
  const ajustes = useQcMock((s) => s.ajustes);
  const muestras = useQcMock((s) => s.muestras);
  const ordenes = useQcMock((s) => s.ordenes);

  const canAuthorize =
    auth.hasRole("calidad") || auth.hasRole("gerente_general") || auth.hasRole("administrador");
  const canExecute =
    canAuthorize || auth.hasRole("capturista"); // operadores ejecutan

  // --- Filtros ------------------------------------------------------------
  const [fPlanta, setFPlanta] = useState("all");
  const [fMaquina, setFMaquina] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fFlujo, setFFlujo] = useState<string>("abiertos");
  const [fResultado, setFResultado] = useState("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fBusqueda, setFBusqueda] = useState("");

  const plantas = useMemo(
    () => Array.from(new Map(ordenes.map((o) => [o.planta_id, o.planta_nombre])).entries()),
    [ordenes],
  );
  const maquinas = useMemo(
    () => Array.from(new Map(ordenes.map((o) => [o.maquina_id, o.maquina_nombre])).entries()),
    [ordenes],
  );

  const enriched = useMemo(
    () =>
      ajustes.map((a) => {
        const ord = ordenes.find((o) => o.orden_id === a.orden_id);
        const muestra = muestras.find((m) => m.id === a.muestra_id);
        const sla = calcularSla(a);
        return { a, ord, muestra, sla };
      }),
    [ajustes, ordenes, muestras],
  );

  const filtradas = useMemo(() => {
    return enriched
      .filter(({ a, ord }) => {
        if (fFlujo === "abiertos") {
          if (a.estado_flujo === "cerrado" || a.estado_flujo === "rechazado") return false;
        } else if (fFlujo !== "todos" && a.estado_flujo !== fFlujo) return false;
        if (fPlanta !== "all" && a.planta_id !== fPlanta) return false;
        if (fMaquina !== "all" && a.maquina_id !== fMaquina) return false;
        if (fTipo !== "all" && a.tipo_ajuste !== fTipo) return false;
        if (fResultado !== "all" && a.resultado !== fResultado) return false;
        if (fDesde && new Date(a.solicitado_at) < new Date(fDesde)) return false;
        if (fHasta && new Date(a.solicitado_at) > new Date(fHasta + "T23:59:59")) return false;
        if (fBusqueda) {
          const txt = `${ord?.folio ?? ""} ${a.motivo} ${a.solicitado_por}`.toLowerCase();
          if (!txt.includes(fBusqueda.toLowerCase())) return false;
        }
        return true;
      })
      .sort((x, y) => +new Date(y.a.solicitado_at) - +new Date(x.a.solicitado_at));
  }, [enriched, fFlujo, fPlanta, fMaquina, fTipo, fResultado, fDesde, fHasta, fBusqueda]);

  // --- KPIs ---------------------------------------------------------------

  const kpis = useMemo(() => {
    const total = filtradas.length;
    const cerrados = filtradas.filter((x) => x.a.estado_flujo === "cerrado");
    const exitosos = cerrados.filter((x) => x.a.resultado === "exitoso").length;
    const tasaExito = cerrados.length ? Math.round((exitosos / cerrados.length) * 100) : 0;
    const vencidos = filtradas.filter((x) => x.sla.estado === "rojo").length;
    const proximos = filtradas.filter((x) => x.sla.estado === "amarillo").length;

    const horasPromedioCierre = cerrados.length
      ? cerrados.reduce((s, x) => s + x.sla.transcurridoHoras, 0) / cerrados.length
      : 0;

    // Reincidencia: top máquinas
    const porMaquina = new Map<string, { nombre: string; n: number }>();
    filtradas.forEach((x) => {
      const k = x.a.maquina_id;
      const nombre = x.ord?.maquina_nombre ?? k;
      porMaquina.set(k, { nombre, n: (porMaquina.get(k)?.n ?? 0) + 1 });
    });
    const topMaquinas = [...porMaquina.values()].sort((a, b) => b.n - a.n).slice(0, 3);

    // Top productos
    const porProducto = new Map<string, { nombre: string; n: number }>();
    filtradas.forEach((x) => {
      const k = x.ord?.producto_id ?? "—";
      const nombre = x.ord ? `${x.ord.producto_codigo} — ${x.ord.producto_nombre}` : "—";
      porProducto.set(k, { nombre, n: (porProducto.get(k)?.n ?? 0) + 1 });
    });
    const topProductos = [...porProducto.values()].sort((a, b) => b.n - a.n).slice(0, 3);

    // Top causas (motivo normalizado / tipo)
    const porTipo = new Map<string, number>();
    filtradas.forEach((x) => {
      porTipo.set(x.a.tipo_ajuste, (porTipo.get(x.a.tipo_ajuste) ?? 0) + 1);
    });
    const topCausas = [...porTipo.entries()]
      .map(([k, n]) => ({ nombre: TIPO_LABEL[k as AjusteCalidad["tipo_ajuste"]], n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);

    // Tiempo promedio de respuesta por responsable (autorizado_at - solicitado_at)
    type Resp = { nombre: string; horas: number; n: number };
    const porResp = new Map<string, Resp>();
    filtradas.forEach((x) => {
      const who = x.a.autorizado_por;
      if (!who || !x.a.autorizado_at) return;
      const horas = (new Date(x.a.autorizado_at).getTime() - new Date(x.a.solicitado_at).getTime()) / 36e5;
      const prev = porResp.get(who) ?? { nombre: who, horas: 0, n: 0 };
      porResp.set(who, { nombre: who, horas: prev.horas + horas, n: prev.n + 1 });
    });
    const tiempoRespResp = [...porResp.values()]
      .map((r) => ({ nombre: r.nombre, promedio: r.horas / r.n, n: r.n }))
      .sort((a, b) => a.promedio - b.promedio)
      .slice(0, 5);

    return {
      total, tasaExito, vencidos, proximos, horasPromedioCierre,
      topMaquinas, topProductos, topCausas, tiempoRespResp,
    };
  }, [filtradas]);

  // --- Drawer / detalle ---------------------------------------------------
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = enriched.find((x) => x.a.id === openId) ?? null;

  // --- Cierre dialog ------------------------------------------------------
  const [closeOpen, setCloseOpen] = useState(false);
  const [accionTxt, setAccionTxt] = useState("");
  const [observacion, setObservacion] = useState("");
  const [resultado, setResultado] = useState<ResultadoAjuste>("exitoso");
  const [muestraVerifId, setMuestraVerifId] = useState<string>("none");

  function actuar(action: "autorizar" | "iniciar") {
    if (!detail) return;
    const u = auth.profile?.nombre ?? auth.profile?.email ?? "operador";
    const fn = action === "autorizar" ? autorizarAjuste : iniciarAjuste;
    const res = fn(detail.a.id, u);
    if (!res.ok) toast.error(res.error);
    else toast.success(action === "autorizar" ? "Ajuste autorizado" : "Ejecución iniciada");
  }

  function ejecutarCierre() {
    if (!detail) return;
    const u = auth.profile?.nombre ?? auth.profile?.email ?? "operador";
    const res = cerrarAjuste({
      ajuste_id: detail.a.id,
      usuario: u,
      accion_realizada: accionTxt,
      observacion,
      resultado,
      muestra_verificacion_id: muestraVerifId === "none" ? null : muestraVerifId,
    });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Ajuste cerrado");
    setCloseOpen(false);
    setAccionTxt(""); setObservacion(""); setResultado("exitoso"); setMuestraVerifId("none");
  }

  // --- Export -------------------------------------------------------------
  function exportarCSV() {
    const rows = [
      [
        "ajuste_id","folio_orden","planta","maquina","tipo","motivo","flujo","resultado",
        "solicitado_por","solicitado_at","autorizado_por","autorizado_at",
        "ajustado_por","ajustado_at","sla_horas","transcurrido_horas","sla_estado",
        "muestra_origen","muestra_verificacion",
      ].join(","),
    ];
    filtradas.forEach(({ a, ord, sla }) => {
      rows.push([
        a.id, ord?.folio ?? "", ord?.planta_nombre ?? "", ord?.maquina_nombre ?? "",
        TIPO_LABEL[a.tipo_ajuste], a.motivo, FLUJO_LABEL[a.estado_flujo], a.resultado,
        a.solicitado_por, a.solicitado_at, a.autorizado_por ?? "", a.autorizado_at ?? "",
        a.ajustado_por ?? "", a.ajustado_at ?? "", a.sla_objetivo_horas,
        sla.transcurridoHoras.toFixed(2), sla.estado,
        a.muestra_id ?? "", a.muestra_verificacion_id ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-ajustes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filtradas.length} ajustes`);
  }

  // muestras candidatas para verificación: pertenecen a la misma orden,
  // posteriores al solicitado_at, liberadas o pendientes
  const muestrasVerif = useMemo(() => {
    if (!detail) return [];
    return muestras
      .filter(
        (m) =>
          m.orden_id === detail.a.orden_id &&
          m.id !== detail.a.muestra_id &&
          new Date(m.capturado_at) >= new Date(detail.a.solicitado_at),
      )
      .sort((a, b) => +new Date(b.capturado_at) - +new Date(a.capturado_at));
  }, [muestras, detail]);

  return (
    <AppLayout title="Historial de Ajustes y Reprocesos">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Historial de Ajustes y Reprocesos</h1>
              <p className="text-xs text-muted-foreground">
                Prototipo Fase 5 — {filtradas.length} ajuste(s) en vista
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!canAuthorize && (
              <Badge variant="destructive" className="gap-1">
                <Lock className="h-3 w-3" /> Solo visualización
              </Badge>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to="/calidad/revision"><ClipboardCheck className="mr-1.5 h-4 w-4" /> Bandeja de revisión</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>

        {/* KPIs principales */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard title="Ajustes totales" value={String(kpis.total)} icon={Wrench} />
          <KpiCard title="Tasa de éxito" value={`${kpis.tasaExito}%`} icon={CheckCircle2} tone="success" />
          <KpiCard
            title="SLA vencidos"
            value={String(kpis.vencidos)}
            icon={AlertTriangle}
            tone={kpis.vencidos > 0 ? "danger" : "muted"}
          />
          <KpiCard
            title="Tiempo prom. cierre"
            value={`${kpis.horasPromedioCierre.toFixed(1)} h`}
            icon={Clock}
          />
        </div>

        {/* KPIs de reincidencia y respuesta */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <RankingCard title="Top máquinas con más ajustes" items={kpis.topMaquinas} />
          <RankingCard title="Top productos con más ajustes" items={kpis.topProductos} />
          <RankingCard title="Top causas recurrentes" items={kpis.topCausas} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> Tiempo de respuesta por responsable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {kpis.tiempoRespResp.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sin autorizaciones registradas.</div>
              ) : (
                kpis.tiempoRespResp.map((r) => (
                  <div key={r.nombre} className="flex justify-between gap-2">
                    <span className="truncate">{r.nombre}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.promedio.toFixed(1)} h <span className="text-xs">({r.n})</span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <FilterSelect label="Planta" value={fPlanta} onChange={setFPlanta}
              options={plantas.map(([id, n]) => ({ value: id, label: n }))} />
            <FilterSelect label="Máquina" value={fMaquina} onChange={setFMaquina}
              options={maquinas.map(([id, n]) => ({ value: id, label: n }))} />
            <FilterSelect label="Tipo" value={fTipo} onChange={setFTipo}
              options={Object.entries(TIPO_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            <FilterSelect label="Estado" value={fFlujo} onChange={setFFlujo} includeAll={false}
              options={[
                { value: "abiertos", label: "Abiertos" },
                { value: "todos", label: "Todos" },
                ...Object.entries(FLUJO_LABEL).map(([v, l]) => ({ value: v, label: l })),
              ]} />
            <FilterSelect label="Resultado" value={fResultado} onChange={setFResultado}
              options={[
                { value: "pendiente", label: "Pendiente" },
                { value: "exitoso", label: "Exitoso" },
                { value: "parcial", label: "Parcial" },
                { value: "fallido", label: "Fallido" },
              ]} />
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-7 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por folio, motivo o solicitante…"
                value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardContent className="p-0">
            {filtradas.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No hay ajustes que coincidan con los filtros. Solicita uno desde la Bandeja de Revisión.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">SLA</th>
                      <th className="px-3 py-2 text-left">Folio orden</th>
                      <th className="px-3 py-2 text-left">Máquina</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Motivo</th>
                      <th className="px-3 py-2 text-left">Solicitado</th>
                      <th className="px-3 py-2 text-left">Solicitante</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Resultado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtradas.map(({ a, ord, sla }) => (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <SlaDot sla={sla} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{ord?.folio ?? "—"}</td>
                        <td className="px-3 py-2">{ord?.maquina_nombre ?? "—"}</td>
                        <td className="px-3 py-2">{TIPO_LABEL[a.tipo_ajuste]}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={a.motivo}>{a.motivo}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(a.solicitado_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-xs">{a.solicitado_por}</td>
                        <td className="px-3 py-2"><FlujoBadge flujo={a.estado_flujo} /></td>
                        <td className="px-3 py-2"><ResultadoBadge r={a.resultado} /></td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>
                            Detalle
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drawer / detalle como Dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Ajuste — {detail.ord?.folio}
                  <SlaDot sla={detail.sla} withLabel />
                </DialogTitle>
                <DialogDescription>
                  {TIPO_LABEL[detail.a.tipo_ajuste]} · SLA objetivo {detail.a.sla_objetivo_horas} h
                  {" · "}{SLA_HORAS[detail.a.tipo_ajuste]} h estándar
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <Card>
                  <CardContent className="p-3 space-y-2 text-sm">
                    <div><span className="text-muted-foreground">Motivo:</span> {detail.a.motivo}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Máquina:</span> {detail.ord?.maquina_nombre}</div>
                      <div><span className="text-muted-foreground">Producto:</span> {detail.ord?.producto_codigo}</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Trazabilidad</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1.5">
                    <TimelineRow label="Solicitado" by={detail.a.solicitado_por} at={detail.a.solicitado_at} />
                    <TimelineRow label="Autorizado" by={detail.a.autorizado_por} at={detail.a.autorizado_at} />
                    <TimelineRow label="Ejecutado por" by={detail.a.ajustado_por} at={detail.a.ajustado_at} />
                    {detail.a.accion_realizada && (
                      <div className="pt-1 border-t mt-1">
                        <div className="text-muted-foreground">Acción realizada:</div>
                        <div>{detail.a.accion_realizada}</div>
                      </div>
                    )}
                    {detail.a.observacion_ajuste && (
                      <div>
                        <span className="text-muted-foreground">Observación:</span> {detail.a.observacion_ajuste}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Vínculos */}
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Vínculos</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span><span className="text-muted-foreground">Muestra origen:</span> {detail.a.muestra_id ?? "—"}</span>
                      {detail.a.muestra_id && (
                        <Link
                          to="/calidad/revision"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Ver en revisión <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        <span className="text-muted-foreground">Muestra verificación:</span>{" "}
                        {detail.a.muestra_verificacion_id ?? "—"}
                      </span>
                      {detail.a.muestra_verificacion_id && (
                        <Link
                          to="/calidad/revision"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Abrir verificación <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                {detail.a.estado_flujo === "solicitado" && canAuthorize && (
                  <Button onClick={() => actuar("autorizar")}>
                    <ShieldCheck className="mr-1.5 h-4 w-4" /> Autorizar
                  </Button>
                )}
                {detail.a.estado_flujo === "autorizado" && canExecute && (
                  <Button onClick={() => actuar("iniciar")}>
                    <PlayCircle className="mr-1.5 h-4 w-4" /> Iniciar ejecución
                  </Button>
                )}
                {detail.a.estado_flujo === "en_ejecucion" && canExecute && (
                  <Button onClick={() => setCloseOpen(true)}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Cerrar ajuste
                  </Button>
                )}
                <Button variant="outline" onClick={() => setOpenId(null)}>Cerrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de cierre */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar ajuste</DialogTitle>
            <DialogDescription>
              Registra qué se hizo, vincula la muestra de verificación y marca el resultado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Acción realizada *</Label>
              <Textarea
                value={accionTxt} onChange={(e) => setAccionTxt(e.target.value)}
                placeholder="Ej: Se ajustó velocidad enrollador a 1180 m/min y se recalibró sensor de humedad."
              />
            </div>
            <div>
              <Label>Observación</Label>
              <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Resultado</Label>
                <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoAjuste)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exitoso">Exitoso</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="fallido">Fallido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Muestra de verificación</Label>
                <Select value={muestraVerifId} onValueChange={setMuestraVerifId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin vincular</SelectItem>
                    {muestrasVerif.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        Rollo #{m.numero_rollo ?? "—"} · {new Date(m.capturado_at).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
            <Button onClick={ejecutarCierre}>Confirmar cierre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// --- Subcomponentes -------------------------------------------------------

function KpiCard({
  title, value, icon: Icon, tone = "default",
}: {
  title: string; value: string; icon: any;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <Icon className={cn("h-4 w-4", tones[tone])} />
        </div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tones[tone])}>{value}</div>
      </CardContent>
    </Card>
  );
}

function RankingCard({ title, items }: { title: string; items: { nombre: string; n: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin datos.</div>
        ) : (
          items.map((it) => (
            <div key={it.nombre} className="flex justify-between gap-2">
              <span className="truncate">{it.nombre}</span>
              <span className="tabular-nums text-muted-foreground">{it.n}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SlaDot({
  sla, withLabel = false,
}: {
  sla: { estado: "verde" | "amarillo" | "rojo" | "cumplido"; transcurridoHoras: number; restantesHoras: number };
  withLabel?: boolean;
}) {
  const map = {
    verde: { c: "bg-success", t: "Dentro de tiempo" },
    amarillo: { c: "bg-warning", t: "Próximo a vencer" },
    rojo: { c: "bg-destructive", t: "Vencido" },
    cumplido: { c: "bg-success/70", t: "Cumplido" },
  } as const;
  const cfg = map[sla.estado];
  const txt =
    sla.estado === "cumplido"
      ? `${sla.transcurridoHoras.toFixed(1)} h`
      : sla.restantesHoras >= 0
        ? `${sla.restantesHoras.toFixed(1)} h restantes`
        : `+${Math.abs(sla.restantesHoras).toFixed(1)} h vencido`;
  return (
    <div className="flex items-center gap-1.5" title={`${cfg.t} · ${txt}`}>
      <span className={cn("h-2.5 w-2.5 rounded-full", cfg.c)} />
      {withLabel && <span className="text-xs text-muted-foreground">{cfg.t} · {txt}</span>}
    </div>
  );
}

function FlujoBadge({ flujo }: { flujo: AjusteCalidad["estado_flujo"] }) {
  const map: Record<AjusteCalidad["estado_flujo"], string> = {
    solicitado: "bg-muted text-foreground",
    autorizado: "bg-primary/15 text-primary",
    en_ejecucion: "bg-warning/20 text-warning-foreground",
    cerrado: "bg-success/15 text-success",
    rechazado: "bg-destructive/15 text-destructive",
  };
  return <Badge className={cn("font-normal", map[flujo])}>{FLUJO_LABEL[flujo]}</Badge>;
}

function ResultadoBadge({ r }: { r: ResultadoAjuste }) {
  if (r === "pendiente") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<ResultadoAjuste, string> = {
    pendiente: "",
    exitoso: "bg-success/15 text-success",
    parcial: "bg-warning/20 text-warning-foreground",
    fallido: "bg-destructive/15 text-destructive",
  };
  return <Badge className={cn("font-normal capitalize", map[r])}>{r}</Badge>;
}

function TimelineRow({ label, by, at }: { label: string; by: string | null; at: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span>
        {by ? by : <span className="text-muted-foreground">— pendiente —</span>}
        {at && <span className="text-muted-foreground ml-1">· {new Date(at).toLocaleString()}</span>}
      </span>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, includeAll = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; includeAll?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">Todos</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
