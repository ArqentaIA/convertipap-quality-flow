import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Wrench, Lock,
  Download, Search, FileSpreadsheet, Clock, User, ClipboardCheck,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  useQcMock, liberarMuestra, rechazarMuestra, liberarConConcesion, solicitarAjuste,
} from "@/lib/qc-mock/store";
import type { MuestraCalidad, MedicionCalidad, TipoAjuste } from "@/lib/qc-mock/types";
import { useLabFilter } from "@/lib/lab";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calidad/revision")({
  component: RevisionPage,
});

type AccionDialog = "liberar" | "rechazar" | "concesion" | "ajuste" | null;

const ESTADO_FILTROS = [
  { value: "pendientes", label: "Pendientes" },
  { value: "todos", label: "Todos los estados" },
  { value: "pendiente_revision", label: "Pendiente revisión" },
  { value: "liberada", label: "Liberadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "concesion", label: "Concesión" },
  { value: "en_ajuste", label: "En ajuste" },
  { value: "reproceso", label: "Reproceso" },
] as const;

function RevisionPage() {
  const router = useRouter();
  const auth = useAuth();
  const labFilter = useLabFilter();
  const muestrasAll = useQcMock((s) => s.muestras);
  const mediciones = useQcMock((s) => s.mediciones);
  const ordenesAll = useQcMock((s) => s.ordenes);

  // Filtrado por laboratorio (capturistas solo ven sus máquinas).
  const muestras = useMemo(
    () => muestrasAll.filter((m) => labFilter.isMachineIdAllowed(m.maquina_id)),
    [muestrasAll, labFilter],
  );
  const ordenes = useMemo(
    () => ordenesAll.filter((o) => labFilter.isMachineIdAllowed(o.maquina_id)),
    [ordenesAll, labFilter],
  );

  const canReview =
    auth.hasRole("calidad") || auth.hasRole("gerente_general") || auth.hasRole("administrador");

  // --- Filtros ------------------------------------------------------------
  const [fPlanta, setFPlanta] = useState("all");
  const [fMaquina, setFMaquina] = useState("all");
  const [fProducto, setFProducto] = useState("all");
  const [fTurno, setFTurno] = useState("all");
  const [fEstado, setFEstado] = useState<string>("pendientes");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fOrden, setFOrden] = useState("all");
  const [fBusqueda, setFBusqueda] = useState("");

  const plantas = useMemo(
    () => Array.from(new Map(ordenes.map((o) => [o.planta_id, o.planta_nombre])).entries()),
    [ordenes],
  );
  const maquinas = useMemo(
    () => Array.from(new Map(ordenes.map((o) => [o.maquina_id, o.maquina_nombre])).entries()),
    [ordenes],
  );
  const productos = useMemo(
    () => Array.from(new Map(ordenes.map((o) => [o.producto_id, `${o.producto_codigo} — ${o.producto_nombre}`])).entries()),
    [ordenes],
  );

  const filtradas = useMemo(() => {
    return muestras
      .filter((m) => {
        if (fEstado === "pendientes") {
          if (m.estado !== "pendiente_revision") return false;
        } else if (fEstado !== "todos" && m.estado !== fEstado) return false;
        if (fPlanta !== "all" && m.planta_id !== fPlanta) return false;
        if (fMaquina !== "all" && m.maquina_id !== fMaquina) return false;
        if (fProducto !== "all" && m.producto_id !== fProducto) return false;
        if (fTurno !== "all" && m.turno !== fTurno) return false;
        if (fOrden !== "all" && m.orden_id !== fOrden) return false;
        if (fDesde && new Date(m.hora_muestreo) < new Date(fDesde)) return false;
        if (fHasta && new Date(m.hora_muestreo) > new Date(fHasta + "T23:59:59")) return false;
        if (fBusqueda) {
          const ord = ordenes.find((o) => o.orden_id === m.orden_id);
          const txt = `${ord?.folio ?? ""} ${m.numero_rollo ?? ""} ${m.capturado_por}`.toLowerCase();
          if (!txt.includes(fBusqueda.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => +new Date(b.capturado_at) - +new Date(a.capturado_at));
  }, [muestras, ordenes, fEstado, fPlanta, fMaquina, fProducto, fTurno, fOrden, fDesde, fHasta, fBusqueda]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filtradas.find((m) => m.id === selectedId) ?? filtradas[0] ?? null;
  const selectedMediciones = useMemo(
    () => (selected ? mediciones.filter((x) => x.muestra_id === selected.id) : []),
    [selected, mediciones],
  );
  const selectedOrden = selected ? ordenes.find((o) => o.orden_id === selected.orden_id) : null;

  const totalFueraSpec = selectedMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  ).length;

  // --- Diálogos -----------------------------------------------------------
  const [accion, setAccion] = useState<AccionDialog>(null);
  const [motivo, setMotivo] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjuste>("ajuste_calidad");

  function openDialog(a: AccionDialog) {
    setMotivo("");
    setTipoAjuste("ajuste_calidad");
    setAccion(a);
  }

  function ejecutar() {
    if (!selected) return;
    const revisor = auth.profile?.nombre ?? auth.profile?.email ?? "calidad";
    let res: { ok: true } | { ok: false; error: string } = { ok: false, error: "Acción inválida" };
    if (accion === "liberar") res = liberarMuestra(selected.id, revisor, motivo);
    else if (accion === "rechazar") res = rechazarMuestra(selected.id, revisor, motivo);
    else if (accion === "concesion") res = liberarConConcesion(selected.id, revisor, motivo);
    else if (accion === "ajuste")
      res = solicitarAjuste({ muestra_id: selected.id, tipo_ajuste: tipoAjuste, motivo, revisor });

    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Decisión registrada");
    setAccion(null);
  }

  // --- Exportación CSV (mock) --------------------------------------------
  function exportarCSV() {
    const rows: string[] = [];
    rows.push([
      "folio_orden", "muestra_id", "fecha", "planta", "maquina", "producto", "turno",
      "rollo", "estado", "capturado_por", "revisado_por", "dictamen", "variable",
      "valor", "min", "objetivo", "max", "estado_medicion",
    ].join(","));
    filtradas.forEach((m) => {
      const ord = ordenes.find((o) => o.orden_id === m.orden_id);
      const meds = mediciones.filter((x) => x.muestra_id === m.id);
      const base = [
        ord?.folio ?? "", m.id, m.hora_muestreo, ord?.planta_nombre ?? "",
        ord?.maquina_nombre ?? "", ord?.producto_codigo ?? "", m.turno,
        m.numero_rollo ?? "", m.estado, m.capturado_por,
        m.revisado_por ?? "", m.dictamen ?? "",
      ];
      if (meds.length === 0) { rows.push([...base, "", "", "", "", "", ""].join(",")); return; }
      meds.forEach((md) => {
        rows.push([
          ...base, md.variable_clave, md.valor, md.min_snapshot,
          md.objetivo_snapshot, md.max_snapshot, md.estado,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
      });
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-calidad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportadas ${filtradas.length} muestras a CSV`);
  }

  return (
    <AppLayout title="Bandeja de Revisión de Calidad">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Bandeja de Revisión de Calidad</h1>
              <p className="text-xs text-muted-foreground">
                Prototipo Fase 5 — {filtradas.length} muestra(s) en vista
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!canReview && (
              <Badge variant="destructive" className="gap-1">
                <Lock className="h-3 w-3" /> Solo visualización
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar Excel
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            <FilterSelect label="Planta" value={fPlanta} onChange={setFPlanta}
              options={plantas.map(([id, n]) => ({ value: id, label: n }))} />
            <FilterSelect label="Máquina" value={fMaquina} onChange={setFMaquina}
              options={maquinas.map(([id, n]) => ({ value: id, label: n }))} />
            <FilterSelect label="Producto" value={fProducto} onChange={setFProducto}
              options={productos.map(([id, n]) => ({ value: id, label: n }))} />
            <FilterSelect label="Turno" value={fTurno} onChange={setFTurno}
              options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]} />
            <FilterSelect label="Orden" value={fOrden} onChange={setFOrden}
              options={ordenes.map((o) => ({ value: o.orden_id, label: o.folio }))} />
            <FilterSelect label="Estado" value={fEstado} onChange={setFEstado}
              options={ESTADO_FILTROS.map((e) => ({ value: e.value, label: e.label }))} includeAll={false} />
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-8 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8" placeholder="Buscar por folio, rollo o capturista…"
                value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Layout 2 paneles */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {/* Lista */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Muestras ({filtradas.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filtradas.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No hay muestras que coincidan con los filtros.
                </div>
              ) : (
                <ul className="divide-y max-h-[600px] overflow-y-auto">
                  {filtradas.map((m) => {
                    const ord = ordenes.find((o) => o.orden_id === m.orden_id);
                    const meds = mediciones.filter((x) => x.muestra_id === m.id);
                    const fuera = meds.filter((x) => x.estado !== "conforme").length;
                    const isSel = (selected?.id ?? "") === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => setSelectedId(m.id)}
                          className={cn(
                            "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition",
                            isSel && "bg-primary/10 border-l-2 border-primary",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs">{ord?.folio}</span>
                            <EstadoBadge estado={m.estado} />
                          </div>
                          <div className="mt-1 text-sm">
                            {ord?.producto_codigo} · {ord?.maquina_nombre}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Rollo #{m.numero_rollo ?? "—"} · T{m.turno}</span>
                            <span>{new Date(m.capturado_at).toLocaleString()}</span>
                          </div>
                          {fuera > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {fuera} fuera de spec
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Detalle */}
          {selected && selectedOrden ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      <span className="font-mono">{selectedOrden.folio}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        · Rollo #{selected.numero_rollo ?? "—"}
                      </span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedOrden.producto_codigo} — {selectedOrden.producto_nombre} ·{" "}
                      {selectedOrden.maquina_nombre} · {selectedOrden.planta_nombre} · Turno {selected.turno}
                    </p>
                  </div>
                  <EstadoBadge estado={selected.estado} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Spec congelada */}
                <Alert>
                  <ClipboardCheck className="h-4 w-4" />
                  <AlertTitle className="text-sm">Especificación congelada</AlertTitle>
                  <AlertDescription className="text-xs">
                    Versión <Badge variant="secondary" className="ml-1">{selected.especificacion_version}</Badge>{" "}
                    capturada el {new Date(selected.capturado_at).toLocaleString()}. Las mediciones se evalúan contra esta
                    versión, no contra la spec vigente actual.
                  </AlertDescription>
                </Alert>

                {/* Mediciones vs spec */}
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Variable</th>
                        <th className="px-3 py-2 text-right font-medium">Min</th>
                        <th className="px-3 py-2 text-right font-medium">Obj.</th>
                        <th className="px-3 py-2 text-right font-medium">Max</th>
                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                        <th className="px-3 py-2 text-left font-medium">Estado</th>
                        <th className="px-3 py-2 text-left font-medium">Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMediciones.map((md) => (
                        <MedicionRow key={md.id} m={md} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalFueraSpec > 0 && (
                  <Alert variant="default" className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{totalFueraSpec} medición(es) fuera de especificación</AlertTitle>
                    <AlertDescription className="text-xs">
                      Evalúa si procede liberar, rechazar, otorgar concesión o solicitar ajuste/reproceso.
                    </AlertDescription>
                  </Alert>
                )}

                {selected.observaciones_generales && (
                  <div className="text-sm">
                    <Label className="text-xs text-muted-foreground">Observaciones del capturista</Label>
                    <p className="mt-1 rounded border bg-muted/30 p-2">{selected.observaciones_generales}</p>
                  </div>
                )}

                {/* Acciones */}
                {selected.estado === "pendiente_revision" ? (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button onClick={() => openDialog("liberar")} disabled={!canReview}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Liberar
                    </Button>
                    <Button onClick={() => openDialog("concesion")} disabled={!canReview} variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50">
                      <AlertTriangle className="mr-1.5 h-4 w-4" /> Liberar con concesión
                    </Button>
                    <Button onClick={() => openDialog("ajuste")} disabled={!canReview} variant="outline">
                      <Wrench className="mr-1.5 h-4 w-4" /> Solicitar ajuste
                    </Button>
                    <Button onClick={() => openDialog("rechazar")} disabled={!canReview} variant="destructive">
                      <XCircle className="mr-1.5 h-4 w-4" /> Rechazar
                    </Button>
                  </div>
                ) : (
                  <Alert>
                    <ClipboardCheck className="h-4 w-4" />
                    <AlertTitle className="text-sm">Muestra ya dictaminada</AlertTitle>
                    <AlertDescription className="text-xs">
                      Estado actual: <strong>{selected.estado}</strong>. Las decisiones son inmutables una vez registradas.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Historial / trazabilidad */}
                <div className="grid grid-cols-1 gap-3 border-t pt-3 text-xs md:grid-cols-2">
                  <TrazaItem icon={<User className="h-3.5 w-3.5" />} label="Capturado por">
                    {selected.capturado_por}
                    <span className="text-muted-foreground"> · {new Date(selected.capturado_at).toLocaleString()}</span>
                  </TrazaItem>
                  <TrazaItem icon={<Clock className="h-3.5 w-3.5" />} label="Hora de muestreo">
                    {new Date(selected.hora_muestreo).toLocaleString()}
                  </TrazaItem>
                  <TrazaItem icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="Revisado por">
                    {selected.revisado_por ? (
                      <>
                        {selected.revisado_por}
                        <span className="text-muted-foreground">
                          {" "}· {selected.revisado_at && new Date(selected.revisado_at).toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Pendiente</span>
                    )}
                  </TrazaItem>
                  <TrazaItem icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="Dictamen">
                    {selected.dictamen ?? <span className="text-muted-foreground">—</span>}
                    {selected.dictamen_motivo && (
                      <p className="mt-1 rounded bg-muted/40 p-1.5 text-[11px]">
                        “{selected.dictamen_motivo}”
                      </p>
                    )}
                  </TrazaItem>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Selecciona una muestra de la lista para revisar.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Diálogo de acción */}
      <Dialog open={accion !== null} onOpenChange={(v) => !v && setAccion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accion === "liberar" && "Liberar muestra"}
              {accion === "rechazar" && "Rechazar muestra"}
              {accion === "concesion" && "Liberar con concesión"}
              {accion === "ajuste" && "Solicitar ajuste / reproceso"}
            </DialogTitle>
            <DialogDescription>
              {accion === "liberar" && "Confirma que la muestra cumple con la especificación. Observación opcional."}
              {accion === "rechazar" && "Registra el motivo del rechazo. Este dictamen es inmutable."}
              {accion === "concesion" && "Justifica por qué se libera la muestra fuera de especificación."}
              {accion === "ajuste" && "Selecciona el tipo de intervención y describe el motivo."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {accion === "ajuste" && (
              <div className="space-y-1.5">
                <Label>Tipo de ajuste</Label>
                <Select value={tipoAjuste} onValueChange={(v) => setTipoAjuste(v as TipoAjuste)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ajuste_calidad">Ajuste de calidad</SelectItem>
                    <SelectItem value="ajuste_maquina">Ajuste de máquina</SelectItem>
                    <SelectItem value="ajuste_parametros">Ajuste de parámetros</SelectItem>
                    <SelectItem value="cambio_materia_prima">Cambio de materia prima</SelectItem>
                    <SelectItem value="reproceso">Reproceso</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                {accion === "liberar" ? "Observación (opcional)" : "Motivo / justificación (obligatorio)"}
              </Label>
              <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describe la decisión…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAccion(null)}>Cancelar</Button>
            <Button
              onClick={ejecutar}
              variant={accion === "rechazar" ? "destructive" : "default"}
              className={cn(
                accion === "liberar" && "bg-emerald-600 hover:bg-emerald-700",
                accion === "concesion" && "bg-amber-600 hover:bg-amber-700",
              )}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// --- Componentes auxiliares -------------------------------------------------

function FilterSelect({
  label, value, onChange, options, includeAll = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  includeAll?: boolean;
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

function EstadoBadge({ estado }: { estado: MuestraCalidad["estado"] }) {
  const cfg: Record<MuestraCalidad["estado"], { label: string; cls: string }> = {
    borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
    pendiente_revision: { label: "Pendiente", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
    liberada: { label: "Liberada", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
    rechazada: { label: "Rechazada", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
    concesion: { label: "Concesión", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
    en_ajuste: { label: "En ajuste", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
    reproceso: { label: "Reproceso", cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" },
  };
  const c = cfg[estado];
  return <span className={cn("inline-flex rounded px-2 py-0.5 text-xs font-medium", c.cls)}>{c.label}</span>;
}

function MedicionRow({ m }: { m: MedicionCalidad }) {
  const fuera = m.estado !== "conforme";
  const critico = m.estado === "fuera_rango_critico";
  return (
    <tr className={cn("border-t", critico && "bg-red-50/50 dark:bg-red-950/20", fuera && !critico && "bg-amber-50/50 dark:bg-amber-950/20")}>
      <td className="px-3 py-2 font-medium capitalize">{m.variable_clave}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.min_snapshot}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.objetivo_snapshot}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.max_snapshot}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", fuera ? (critico ? "text-red-600" : "text-amber-600") : "text-emerald-600")}>
        {m.valor}
      </td>
      <td className="px-3 py-2">
        <Badge variant={critico ? "destructive" : fuera ? "outline" : "secondary"} className={cn(!fuera && "bg-emerald-100 text-emerald-800")}>
          {m.estado.replace("_", " ")}
        </Badge>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{m.observacion || "—"}</td>
    </tr>
  );
}

function TrazaItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
