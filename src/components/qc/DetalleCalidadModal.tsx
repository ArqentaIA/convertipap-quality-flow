import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, Loader2, Clock, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDetalleRollo } from "@/lib/produccion.functions";
import { imprimirDetalleRollo } from "@/lib/detalle-rollo-pdf";


/**
 * Detalle de calidad de un rollo (solo consulta).
 * Muestra las 14 variables de calidad capturadas en la muestra,
 * con su valor, rango (mín / objetivo / máx), unidad y estado.
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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["detalle-rollo", muestraId],
    queryFn: () => fn({ data: { muestra_id: muestraId! } }),
    enabled: open && !!muestraId,
  });

  const r = data?.rollo;
  const meds = data?.mediciones ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Detalle de calidad{folio ? ` · ${folio}` : ""}
          </DialogTitle>
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
              {/* Cabecera con datos del rollo */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <Field label="Rollo" value={r.numero} strong />
                  <Field label="Orden" value={r.folioOrden} />
                  <Field label="Producto" value={`${r.producto}${r.productoCodigo !== "—" ? ` (${r.productoCodigo})` : ""}`} />
                  <Field label="Máquina / Planta" value={`${r.maquina} · ${r.planta}`} />
                  <Field label="Capturado" value={new Date(r.capturadoAt).toLocaleString("es-MX")} />
                  <Field label="Turno" value={r.turno} />
                  <Field label="Operador" value={r.operador} />
                  <Field label="Jefe Máquina" value={r.jefeMaquina} />
                  <Field label="Analista" value={r.analista} />
                  <Field label="Estatus oficial" value={r.estatus} />
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


              {/* Tabla 14 variables */}
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
                              {m.valor ?? "—"}
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

              {(r.defectos.length > 0 || r.observaciones) && (
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

              <div className="pt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Vista de solo consulta · {meds.length} variables
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
