import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, Loader2, Clock, FileDown, Pencil, Save, X, History } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDetalleRollo } from "@/lib/produccion.functions";
import {
  puedeEditarRollo,
  editarRolloCalidad,
  listEdicionesRollo,
} from "@/lib/qc-edicion.functions";
import { imprimirDetalleRollo } from "@/lib/detalle-rollo-pdf";

const DICTAMENES = [
  { v: "", label: "Sin cambio" },
  { v: "liberada", label: "Liberada (L)" },
  { v: "concesion", label: "Liberada con concesión (C)" },
  { v: "rechazada", label: "No conforme (NC)" },
] as const;

/**
 * Detalle de calidad de un rollo.
 * Consulta para todos; edición autorizada (usuario + máquina + ventana de 12 h)
 * con motivo obligatorio y trazabilidad completa.
 */
export function DetalleCalidadModal({
  muestraId,
  folio,
  open,
  onOpenChange,
}: {
  muestraId: string | null;
  folio: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fn = useServerFn(getDetalleRollo);
  const permisoFn = useServerFn(puedeEditarRollo);
  const editarFn = useServerFn(editarRolloCalidad);
  const bitacoraFn = useServerFn(listEdicionesRollo);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["detalle-rollo", muestraId],
    queryFn: () => fn({ data: { muestra_id: muestraId! } }),
    enabled: open && !!muestraId,
  });

  const { data: permiso } = useQuery({
    queryKey: ["permiso-edicion-rollo", muestraId],
    queryFn: () => permisoFn({ data: { muestra_id: muestraId! } }),
    enabled: open && !!muestraId,
    staleTime: 30_000,
  });

  const { data: bitacora = [] } = useQuery({
    queryKey: ["bitacora-rollo", muestraId],
    queryFn: () => bitacoraFn({ data: { muestra_id: muestraId! } }),
    enabled: open && !!muestraId,
  });

  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [operador, setOperador] = useState("");
  const [jefe, setJefe] = useState("");
  const [analista, setAnalista] = useState("");
  const [obs, setObs] = useState("");
  const [sku, setSku] = useState("");
  const [dictamen, setDictamen] = useState("");

  const r = data?.rollo;
  const meds = useMemo(() => data?.mediciones ?? [], [data]);

  // Reset al cerrar / cambiar de rollo
  useEffect(() => {
    setEditando(false);
    setMotivo("");
    setDictamen("");
  }, [muestraId, open]);

  const iniciarEdicion = () => {
    if (!r) return;
    const v: Record<string, string> = {};
    for (const m of meds) v[m.clave] = m.valor == null ? "" : String(m.valor);
    setValores(v);
    setOperador(r.operador === "—" ? "" : r.operador);
    setJefe(r.jefeMaquina === "—" ? "" : r.jefeMaquina);
    setAnalista(r.analista === "—" ? "" : r.analista);
    setObs(r.observaciones ?? "");
    setSku(r.skuSap ?? "");
    setDictamen("");
    setMotivo("");
    setEditando(true);
  };

  const guardar = async () => {
    if (!muestraId || !r) return;
    if (motivo.trim().length < 10) {
      toast.error("Escribe el motivo de la corrección (mínimo 10 caracteres).");
      return;
    }
    if (obs.trim().length < 10) {
      toast.error("Escribe las observaciones (mínimo 10 caracteres).");
      return;
    }
    const cambiosMed = meds
      .filter((m) => {
        const nuevo = (valores[m.clave] ?? "").trim();
        if (nuevo === "") return false;
        return Number(nuevo) !== (m.valor ?? NaN);
      })
      .map((m) => ({ clave: m.clave, valor: Number(valores[m.clave]) }));

    if (cambiosMed.some((c) => !Number.isFinite(c.valor))) {
      toast.error("Hay valores numéricos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const res = await editarFn({
        data: {
          muestra_id: muestraId,
          motivo: motivo.trim(),
          ...(cambiosMed.length ? { mediciones: cambiosMed } : {}),
          operador,
          jefe_maquina: jefe,
          analista,
          observaciones_generales: obs,
          sku_sap: sku.trim(),
          ...(dictamen ? { dictamen: dictamen as "liberada" | "concesion" | "rechazada" } : {}),
        },
      });
      if (res.cambios === 0) {
        toast.info("No se detectaron cambios que aplicar.");
      } else {
        toast.success(`Cambios aplicados (${res.cambios}). Trazabilidad registrada.`);
      }
      setEditando(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["detalle-rollo", muestraId] }),
        qc.invalidateQueries({ queryKey: ["bitacora-rollo", muestraId] }),
        qc.invalidateQueries({ queryKey: ["rollos-maquina"] }),
        qc.invalidateQueries({ queryKey: ["produccion"] }),
        qc.invalidateQueries({ queryKey: ["buscar-rollo"] }),
        qc.invalidateQueries({ queryKey: ["qc"] }),
        qc.invalidateQueries({ queryKey: ["reportes"] }),
      ]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const puede = permiso?.puede === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <DialogTitle className="text-lg">
              Detalle de calidad{folio ? ` · ${folio}` : ""}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {r && puede && !editando && (
                <Button size="sm" variant="outline" onClick={iniciarEdicion}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              )}
              {editando && (
                <>
                  <Button size="sm" variant="ghost" disabled={guardando} onClick={() => setEditando(false)}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={guardando} onClick={guardar}>
                    {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                </>
              )}
              <Button
                size="sm"
                className="bg-[#EB1000] hover:bg-[#C20B00] text-white border-transparent"
                disabled={!r}
                onClick={async () => {
                  if (!r) return;
                  try {
                    await imprimirDetalleRollo({
                      rollo: {
                        numero: r.numero,
                        folioOrden: r.folioOrden,
                        producto: r.producto,
                        productoCodigo: r.productoCodigo,
                        maquina: r.maquina,
                        planta: r.planta,
                        capturadoAt: r.capturadoAt,
                        turno: r.turno,
                        operador: r.operador,
                        jefeMaquina: r.jefeMaquina,
                        analista: r.analista,
                        estatus: r.estatus,
                        cumplimientoVariables: r.cumplimientoVariables,
                        ncCount: r.ncCount,
                        defectos: r.defectos,
                        observaciones: r.observaciones,
                      },
                      mediciones: meds.map((m) => ({
                        clave: m.clave,
                        etiqueta: m.etiqueta,
                        unidad: m.unidad,
                        min: m.min,
                        objetivo: m.objetivo,
                        max: m.max,
                        valor: m.valor,
                        estado: m.estado,
                      })),
                    });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando detalle…
            </div>
          )}
          {isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Error: {(error as Error)?.message}
            </div>
          )}
          {r && (
            <div className="space-y-4 pt-2">
              {/* Aviso de ventana de edición */}
              {permiso && (
                <div
                  className={`rounded-md border px-3 py-2 text-[11px] ${
                    puede
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {puede ? (
                    <>
                      Edición autorizada hasta{" "}
                      <strong>
                        {permiso.expira_at ? new Date(permiso.expira_at).toLocaleString("es-MX") : "—"}
                      </strong>{" "}
                      (12 h desde la captura). Todo cambio requiere motivo y queda registrado.
                    </>
                  ) : (
                    <>Solo consulta. {permiso.motivo}</>
                  )}
                </div>
              )}

              {/* Cabecera con datos del rollo */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <Field label="Rollo" value={r.numero} strong />
                  <Field label="Orden" value={r.folioOrden} />
                  <Field label="Producto" value={`${r.producto}${r.productoCodigo !== "—" ? ` (${r.productoCodigo})` : ""}`} />
                  {editando ? (
                    <EditField label="SKU SAP" value={sku} onChange={setSku} />
                  ) : (
                    <Field label="SKU SAP" value={r.skuSap || "—"} />
                  )}
                  <Field label="Máquina / Planta" value={`${r.maquina} · ${r.planta}`} />
                  <Field label="Capturado" value={new Date(r.capturadoAt).toLocaleString("es-MX")} />
                  <Field label="Turno" value={r.turno} />
                  {editando ? (
                    <>
                      <EditField label="Operador" value={operador} onChange={setOperador} />
                      <EditField label="Jefe Máquina" value={jefe} onChange={setJefe} />
                      <EditField label="Analista" value={analista} onChange={setAnalista} />
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estatus oficial</div>
                        <select
                          value={dictamen}
                          onChange={(e) => setDictamen(e.target.value)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                        >
                          {DICTAMENES.map((d) => (
                            <option key={d.v} value={d.v}>
                              {d.v === "" ? `Sin cambio (${r.estatus})` : d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="Operador" value={r.operador} />
                      <Field label="Jefe Máquina" value={r.jefeMaquina} />
                      <Field label="Analista" value={r.analista} />
                      <Field label="Estatus oficial" value={r.estatus} />
                    </>
                  )}
                  <Field label="Cumplimiento variables" value={r.cumplimientoVariables == null ? "—" : `${r.cumplimientoVariables}%`} />
                  <Field label="Variables fuera de spec" value={String(r.ncCount)} tone={r.ncCount > 0 ? "danger" : "default"} />
                </div>
                {r.tieneVariablesFueraSpec && (r.estatus === "L" || r.estatus === "C" || r.estatus === "liberada" || r.estatus === "concesion") && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <strong>Aviso informativo:</strong> el estatus oficial de este rollo es{" "}
                      <strong>{r.estatus}</strong>, pero presenta {r.ncCount} variable
                      {r.ncCount === 1 ? "" : "s"} fuera de especificación. Esta información es
                      complementaria y no modifica el dictamen de liberación.
                    </div>
                  </div>
                )}
              </div>

              {/* Motivo + observaciones en modo edición */}
              {editando && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Observaciones
                    </label>
                    <Textarea
                      value={obs}
                      maxLength={500}
                      onChange={(e) => setObs(e.target.value)}
                      className="mt-1 text-xs"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Motivo de la corrección (obligatorio, mínimo 10 caracteres)
                    </label>
                    <Textarea
                      value={motivo}
                      maxLength={300}
                      onChange={(e) => setMotivo(e.target.value)}
                      className="mt-1 text-xs"
                      rows={2}
                      placeholder="Ej. Corrección por error de captura en tensión seca MD verificada en laboratorio."
                    />
                  </div>
                </div>
              )}

              {/* Tabla de variables */}
              {meds.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Este rollo no tiene variables de calidad registradas.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Variable</th>
                        <th className="px-3 py-2 text-right">Mín</th>
                        <th className="px-3 py-2 text-right">Objetivo</th>
                        <th className="px-3 py-2 text-right">Máx</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meds.map((m, i) => {
                        const malo = m.estado === "no_conforme" || m.estado === "fuera_rango_critico";
                        const pendiente = m.estado === "pendiente" || m.valor == null;
                        return (
                          <tr
                            key={`${m.clave}-${i}`}
                            className={`border-t border-border ${malo ? "bg-destructive/5" : pendiente ? "bg-muted/20" : ""}`}
                          >
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground">{m.etiqueta}</div>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.clave}</div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.min ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.objetivo ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.max ?? "—"}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${malo ? "text-destructive" : pendiente ? "text-muted-foreground" : "text-foreground"}`}>
                              {editando && m.valor != null ? (
                                <Input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  value={valores[m.clave] ?? ""}
                                  onChange={(e) =>
                                    setValores((prev) => ({ ...prev, [m.clave]: e.target.value }))
                                  }
                                  className="h-8 w-24 text-right text-xs"
                                />
                              ) : (
                                m.valor ?? "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{m.unidad || "—"}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  malo
                                    ? "bg-destructive/15 text-destructive"
                                    : pendiente
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-success/15 text-success"
                                }`}
                              >
                                {malo ? <AlertTriangle className="h-3 w-3" /> : pendiente ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                {m.estado}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!editando && (r.defectos.length > 0 || r.observaciones) && (
                <div className="space-y-1 rounded-lg border border-border bg-muted/10 p-3 text-xs">
                  {r.defectos.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Defectos: </span>
                      <span className="text-destructive">{r.defectos.join(", ")}</span>
                    </div>
                  )}
                  {r.observaciones && (
                    <div>
                      <span className="text-muted-foreground">Observaciones: </span>
                      {r.observaciones}
                    </div>
                  )}
                </div>
              )}

              {/* Bitácora de ediciones */}
              {bitacora.length > 0 && (
                <div className="rounded-lg border border-border">
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <History className="h-3.5 w-3.5" /> Historial de ediciones ({bitacora.length})
                  </div>
                  <ul className="max-h-56 divide-y divide-border overflow-y-auto text-xs">
                    {bitacora.map((b, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold text-foreground">{b.campo}</span>
                          <span className="text-muted-foreground">
                            {b.valorAnterior} → <strong className="text-foreground">{b.valorNuevo}</strong>
                          </span>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {new Date(b.fecha).toLocaleString("es-MX")} · {b.usuario}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">Motivo: {b.motivo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                {editando ? "Modo edición" : "Vista de solo consulta"} · {meds.length} variables
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  strong = false,
  tone = "default",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`${strong ? "text-base font-bold text-primary" : "font-semibold"} ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Input
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-8 text-xs"
      />
    </div>
  );
}
