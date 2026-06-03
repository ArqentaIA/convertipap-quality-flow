import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Wrench, Lock,
  Download, Search, FileSpreadsheet, Clock, User, ClipboardCheck,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation, useQueryClient, useSuspenseQuery, queryOptions,
} from "@tanstack/react-query";
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
  listMuestras, dictaminarMuestra, autorizarMuestra, crearAjuste,
} from "@/lib/qc.functions";
import { useLabFilter } from "@/lib/lab";
import { cn } from "@/lib/utils";

const muestrasQO = queryOptions({
  queryKey: ["qc", "muestras", "all"],
  queryFn: () => listMuestras({ data: {} }),
});

export const Route = createFileRoute("/calidad/revision")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(muestrasQO);
  },
  component: RevisionPage,
  errorComponent: ({ error }) => (
    <AppLayout title="Bandeja de Revisión de Calidad">
      <Alert variant="destructive">
        <AlertTitle>No se pudo cargar la bandeja</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </AppLayout>
  ),
});

type EstadoMuestra =
  | "borrador" | "pendiente_revision" | "liberada" | "rechazada"
  | "concesion" | "en_ajuste" | "reproceso";

type TipoAjuste =
  | "ajuste_calidad" | "ajuste_maquina" | "ajuste_parametros"
  | "cambio_materia_prima" | "reproceso" | "otro";

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
  const qc = useQueryClient();

  const { data: muestrasRaw } = useSuspenseQuery(muestrasQO);

  type MuestraRow = (typeof muestrasRaw)[number];
  type OrdenCtx = {
    orden_id: string;
    folio: string;
    planta_id: string;
    planta_nombre: string;
    maquina_id: string;
    maquina_codigo: string;
    maquina_nombre: string;
    producto_id: string;
    producto_codigo: string;
    producto_nombre: string;
  };

  // Contexto derivado por muestra (sin depender de órdenes de fabricación)
  const ordenes = useMemo<OrdenCtx[]>(() => {
    return (muestrasRaw ?? [])
      .map((m: MuestraRow) => {
        const maq = (m as unknown as { maquinas?: { id: string; codigo: string; nombre: string; plantas?: { id: string; codigo: string; nombre: string } | null } | null }).maquinas;
        const prod = (m as unknown as { productos?: { id: string; codigo: string; nombre: string } | null }).productos;
        const pl = maq?.plantas ?? null;
        return {
          orden_id: m.id,
          folio: m.numero_rollo ?? "—",
          planta_id: m.planta_id,
          planta_nombre: pl?.nombre ?? "",
          maquina_id: m.maquina_id,
          maquina_codigo: maq?.codigo ?? "",
          maquina_nombre: maq?.nombre ?? "",
          producto_id: m.producto_id,
          producto_codigo: prod?.codigo ?? "",
          producto_nombre: prod?.nombre ?? "",
        };
      })
      .filter((o) => !o.maquina_codigo || labFilter.isMachineAllowed(o.maquina_codigo));
  }, [muestrasRaw, labFilter]);

  const allowedMuestraIds = useMemo(() => new Set(ordenes.map((o) => o.orden_id)), [ordenes]);

  const muestras = useMemo(
    () => (muestrasRaw ?? []).filter((m) => allowedMuestraIds.has(m.id)),
    [muestrasRaw, allowedMuestraIds],
  );

  // Solo Calidad / Administrador pueden dictaminar (cambiar estatus de rollo).
  const canReview = auth.canChangeRollStatus;

  // --- Filtros ------------------------------------------------------------
  const [fPlanta, setFPlanta] = useState("all");
  const [fMaquina, setFMaquina] = useState("all");
  const [fProducto, setFProducto] = useState("all");
  const [fTurno, setFTurno] = useState("all");
  const [fEstado, setFEstado] = useState<string>("pendientes");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fBusqueda, setFBusqueda] = useState("");

  const plantas = useMemo<[string, string][]>(
    () => Array.from(new Map(ordenes.map((o) => [o.planta_id, o.planta_nombre] as [string, string])).entries()),
    [ordenes],
  );
  const maquinas = useMemo<[string, string][]>(
    () => Array.from(new Map(ordenes.map((o) => [o.maquina_id, o.maquina_nombre] as [string, string])).entries()),
    [ordenes],
  );
  const productos = useMemo<[string, string][]>(
    () => Array.from(new Map(ordenes.map((o) => [o.producto_id, `${o.producto_codigo} — ${o.producto_nombre}`] as [string, string])).entries()),
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
        if (fDesde && new Date(m.hora_muestreo) < new Date(fDesde)) return false;
        if (fHasta && new Date(m.hora_muestreo) > new Date(fHasta + "T23:59:59")) return false;
        if (fBusqueda) {
          const ord = ordenes.find((o) => o.orden_id === m.id);
          const txt = `${ord?.folio ?? ""} ${m.numero_rollo ?? ""} ${m.capturado_por}`.toLowerCase();
          if (!txt.includes(fBusqueda.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => +new Date(b.capturado_at) - +new Date(a.capturado_at));
  }, [muestras, ordenes, fEstado, fPlanta, fMaquina, fProducto, fTurno, fDesde, fHasta, fBusqueda]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filtradas.find((m) => m.id === selectedId) ?? filtradas[0] ?? null;
  const selectedMediciones = useMemo(
    () => (selected ? (selected.mediciones_calidad ?? []) : []),
    [selected],
  );
  const selectedOrden = selected ? ordenes.find((o) => o.orden_id === selected.id) : null;

  const totalFueraSpec = selectedMediciones.filter(
    (m) => m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
  ).length;

  // --- Mutations ---------------------------------------------------------
  const dictaminarFn = useServerFn(dictaminarMuestra);
  const autorizarFn = useServerFn(autorizarMuestra);
  const ajusteFn = useServerFn(crearAjuste);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["qc"] });
  };

  const dictaminarMut = useMutation({
    mutationFn: async (vars: {
      muestra_id: string;
      dictamen: "liberada" | "rechazada" | "concesion";
      motivo: string;
      observaciones: string;
    }) => {
      await dictaminarFn({ data: vars });
      // Auto-autorización en el mismo paso (Calidad/GG/Admin).
      await autorizarFn({ data: { muestra_id: vars.muestra_id } });
    },
    onSuccess: () => {
      toast.success("Dictamen registrado y autorizado");
      setAccion(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ajusteMut = useMutation({
    mutationFn: ajusteFn,
    onSuccess: () => {
      toast.success("Solicitud de ajuste registrada");
      setAccion(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Diálogos -----------------------------------------------------------
  const [accion, setAccion] = useState<AccionDialog>(null);
  const [motivo, setMotivo] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjuste>("ajuste_calidad");

  function openDialog(a: AccionDialog) {
    if (!canReview && a !== null) {
      toast.error("Solo Gerencia de Calidad puede dictaminar.");
      return;
    }
    setMotivo("");
    setEvidenciaUrl("");
    setObservaciones("");
    setTipoAjuste("ajuste_calidad");
    setAccion(a);
  }

  function ejecutar() {
    if (!selected || !selectedOrden) return;
    if (!canReview) { toast.error("Acción bloqueada para tu rol."); return; }

    if (accion === "ajuste") {
      if (!motivo.trim()) { toast.error("El motivo es obligatorio"); return; }
      ajusteMut.mutate({
        data: {
          muestra_id: selected.id,
          orden_id: null,
          maquina_id: selected.maquina_id,
          planta_id: selected.planta_id,
          tipo_ajuste: tipoAjuste,
          motivo,
          sla_objetivo_horas: 4,
        },
      });
      return;
    }

    if (accion === "rechazar" && !evidenciaUrl.trim()) {
      toast.error("La evidencia es obligatoria para rechazar"); return;
    }
    if ((accion === "rechazar" || accion === "concesion") && !motivo.trim()) {
      toast.error("El motivo es obligatorio"); return;
    }

    const dictamen =
      accion === "liberar" ? "liberada" :
      accion === "rechazar" ? "rechazada" :
      accion === "concesion" ? "concesion" : null;
    if (!dictamen) return;

    const obsParts = [observaciones];
    if (evidenciaUrl) obsParts.push(`Evidencia: ${evidenciaUrl}`);

    dictaminarMut.mutate({
      muestra_id: selected.id,
      dictamen,
      motivo: motivo || "(sin motivo)",
      observaciones: obsParts.filter(Boolean).join(" — "),
    });
  }

  // --- Exportación CSV ----------------------------------------------------
  function exportarCSV() {
    const rows: string[] = [];
    rows.push([
      "folio_orden", "muestra_id", "fecha", "planta", "maquina", "producto", "turno",
      "rollo", "estado", "capturado_por", "revisado_por", "dictamen", "variable",
      "valor", "min", "objetivo", "max", "estado_medicion",
    ].join(","));
    filtradas.forEach((m) => {
      const ord = ordenes.find((o) => o.orden_id === m.id);
      const meds = m.mediciones_calidad ?? [];
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

  const isPending = dictaminarMut.isPending || ajusteMut.isPending;

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
                {filtradas.length} muestra(s) en vista
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
                    const ord = ordenes.find((o) => o.orden_id === m.id);
                    const meds = m.mediciones_calidad ?? [];
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
                            <EstadoBadge estado={m.estado as EstadoMuestra} />
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
                  <EstadoBadge estado={selected.estado as EstadoMuestra} />
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

                {selected.mediciones_modificadas_at && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-sm">Mediciones modificadas post-dictamen</AlertTitle>
                    <AlertDescription className="text-xs">
                      {selected.mediciones_modificacion_motivo ?? "Se requiere nuevo dictamen."}
                    </AlertDescription>
                  </Alert>
                )}

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
                    <Button onClick={() => openDialog("liberar")} disabled={!canReview || isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Liberar
                    </Button>
                    <Button onClick={() => openDialog("concesion")} disabled={!canReview || isPending} variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50">
                      <AlertTriangle className="mr-1.5 h-4 w-4" /> Liberar con concesión
                    </Button>
                    <Button onClick={() => openDialog("ajuste")} disabled={!canReview || isPending} variant="outline">
                      <Wrench className="mr-1.5 h-4 w-4" /> Solicitar ajuste
                    </Button>
                    <Button onClick={() => openDialog("rechazar")} disabled={!canReview || isPending} variant="destructive">
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
                {accion === "liberar"
                  ? "Motivo (opcional)"
                  : "Motivo / justificación (obligatorio)"}
              </Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describe la decisión…" />
            </div>
            {(accion === "liberar" || accion === "concesion" || accion === "rechazar") && (
              <div className="space-y-1.5">
                <Label>
                  Evidencia (URL)
                  {(accion === "rechazar") && " — obligatoria"}
                  {(accion === "liberar" || accion === "concesion") && " — opcional"}
                </Label>
                <Input
                  value={evidenciaUrl}
                  onChange={(e) => setEvidenciaUrl(e.target.value)}
                  placeholder="https://…  (foto, reporte, certificado)"
                />
              </div>
            )}
            {(accion === "liberar" || accion === "concesion" || accion === "rechazar") && (
              <div className="space-y-1.5">
                <Label>Observaciones (opcional)</Label>
                <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas adicionales…" />
              </div>
            )}
          </div>


          <DialogFooter>
            <Button variant="outline" onClick={() => setAccion(null)} disabled={isPending}>Cancelar</Button>
            <Button
              onClick={ejecutar}
              disabled={isPending}
              variant={accion === "rechazar" ? "destructive" : "default"}
              className={cn(
                accion === "liberar" && "bg-emerald-600 hover:bg-emerald-700",
                accion === "concesion" && "bg-amber-600 hover:bg-amber-700",
              )}
            >
              {isPending ? "Procesando…" : "Confirmar"}
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

function EstadoBadge({ estado }: { estado: EstadoMuestra }) {
  const cfg: Record<EstadoMuestra, { label: string; cls: string }> = {
    borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
    pendiente_revision: { label: "Pendiente", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
    liberada: { label: "Liberada", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
    rechazada: { label: "Rechazada", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
    concesion: { label: "Concesión", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
    en_ajuste: { label: "En ajuste", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
    reproceso: { label: "Reproceso", cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" },
  };
  const c = cfg[estado] ?? cfg.borrador;
  return <span className={cn("inline-flex rounded px-2 py-0.5 text-xs font-medium", c.cls)}>{c.label}</span>;
}

type MedicionView = {
  id: string;
  variable_clave: string;
  valor: number;
  min_snapshot: number;
  objetivo_snapshot: number;
  max_snapshot: number;
  estado: string;
  observacion: string;
};

function MedicionRow({ m }: { m: MedicionView }) {

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
