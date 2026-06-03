import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDetalleCalidadOrden } from "@/lib/produccion.functions";

type Rango = "dia" | "semana" | "mes" | "año" | "todo";

const RANGOS: { v: Rango; label: string }[] = [
  { v: "dia", label: "Día" },
  { v: "semana", label: "Semana" },
  { v: "mes", label: "Mes" },
  { v: "año", label: "Año" },
  { v: "todo", label: "Todo" },
];

export function DetalleCalidadModal({
  ordenId,
  folio,
  open,
  onOpenChange,
}: {
  ordenId: string | null;
  folio: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rango, setRango] = useState<Rango>("todo");
  const fn = useServerFn(getDetalleCalidadOrden);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["detalle-calidad", ordenId, rango],
    queryFn: () => fn({ data: { orden_id: ordenId!, rango } }),
    enabled: open && !!ordenId,
  });

  const exportCSV = () => {
    if (!data) return;
    const headers = ["Rollo", "Fecha", "Turno", "Operador", "Jefe Máquina", "Analista", "Estatus", "Peso (kg)", "Cumpl. %", "NC", "Variable", "Valor", "Min", "Obj", "Max", "Estado medición", "Defectos", "Observaciones"];
    const rows: string[][] = [];
    for (const f of data.filas) {
      const baseDef = (f.defectos ?? []).join("; ");
      if (f.mediciones.length === 0) {
        rows.push([
          f.rollo, new Date(f.capturadoAt).toLocaleString("es-MX"), f.turno, f.operador, f.jefeMaquina, f.analista,
          f.estatus, String(f.pesoKg ?? ""), String(f.cumplimiento ?? ""), String(f.ncCount),
          "", "", "", "", "", "", baseDef, f.observaciones,
        ]);
      } else {
        for (const m of f.mediciones) {
          rows.push([
            f.rollo, new Date(f.capturadoAt).toLocaleString("es-MX"), f.turno, f.operador, f.jefeMaquina, f.analista,
            f.estatus, String(f.pesoKg ?? ""), String(f.cumplimiento ?? ""), String(f.ncCount),
            m.clave, String(m.valor ?? ""), String(m.min ?? ""), String(m.objetivo ?? ""), String(m.max ?? ""),
            m.estado, baseDef, f.observaciones,
          ]);
        }
      }
    }
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detalle-calidad-${data.orden.folio}-${rango}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Detalle de calidad{folio ? ` · ${folio}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
            {RANGOS.map((o) => (
              <button
                key={o.v}
                onClick={() => setRango(o.v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  rango === o.v
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={exportCSV} disabled={!data || data.filas.length === 0}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        </div>

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
          {data && (
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi label="Rollos" value={String(data.resumen.totalRollos)} />
                <Kpi label="OK" value={String(data.resumen.okRollos)} tone="success" />
                <Kpi label="NC" value={String(data.resumen.ncRollos)} tone="danger" />
                <Kpi label="Cumpl. prom." value={data.resumen.cumplimientoProm == null ? "—" : `${data.resumen.cumplimientoProm}%`} tone="primary" />
                <Kpi label="Kg total" value={data.resumen.kgTotal.toFixed(1)} />
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Field label="Producto" value={`${data.orden.producto} (${data.orden.productoCodigo})`} />
                  <Field label="Máquina" value={data.orden.maquina} />
                  <Field label="Planta" value={data.orden.planta} />
                  <Field label="Turno" value={data.orden.turno} />
                </div>
              </div>

              {data.filas.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No hay muestras en el rango seleccionado.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.filas.map((f) => (
                    <RolloCard key={f.muestraId} f={f} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" | "danger" }) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    danger: "text-destructive",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function RolloCard({ f }: { f: any }) {
  const nc = f.ncCount > 0 || f.estatus === "rechazada" || f.estatus === "NC";
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${nc ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          {nc ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
          <strong className="text-sm">Rollo {f.rollo}</strong>
          <span className="text-xs text-muted-foreground">{new Date(f.capturadoAt).toLocaleString("es-MX")}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">{f.estatus}</span>
        </div>
        <div className="flex gap-4 text-xs">
          <span><span className="text-muted-foreground">Peso:</span> <strong className="tabular-nums">{f.pesoKg == null ? "—" : `${f.pesoKg} kg`}</strong></span>
          <span><span className="text-muted-foreground">Cumpl.:</span> <strong className="tabular-nums">{f.cumplimiento == null ? "—" : `${f.cumplimiento}%`}</strong></span>
          <span><span className="text-muted-foreground">NC:</span> <strong className="tabular-nums text-destructive">{f.ncCount}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 py-2 text-xs md:grid-cols-4">
        <Field label="Operador" value={f.operador} />
        <Field label="Jefe Máquina" value={f.jefeMaquina} />
        <Field label="Analista" value={f.analista} />
        <Field label="Turno" value={f.turno} />
      </div>

      {f.mediciones.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Variable</th>
                <th className="px-2 py-1 text-right">Mín</th>
                <th className="px-2 py-1 text-right">Obj</th>
                <th className="px-2 py-1 text-right">Máx</th>
                <th className="px-2 py-1 text-right">Valor</th>
                <th className="px-2 py-1">Estado</th>
              </tr>
            </thead>
            <tbody>
              {f.mediciones.map((m: any, i: number) => {
                const malo = m.estado === "no_conforme" || m.estado === "fuera_rango_critico";
                return (
                  <tr key={i} className={`border-t border-border ${malo ? "bg-destructive/5" : ""}`}>
                    <td className="px-2 py-1 font-medium">{m.clave}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{m.min ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{m.objetivo ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{m.max ?? "—"}</td>
                    <td className={`px-2 py-1 text-right tabular-nums font-semibold ${malo ? "text-destructive" : ""}`}>{m.valor ?? "—"}</td>
                    <td className="px-2 py-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${malo ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
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

      {(f.defectos.length > 0 || f.observaciones) && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          {f.defectos.length > 0 && (
            <div><span className="text-muted-foreground">Defectos: </span><span className="text-destructive">{f.defectos.join(", ")}</span></div>
          )}
          {f.observaciones && (
            <div><span className="text-muted-foreground">Observaciones: </span>{f.observaciones}</div>
          )}
        </div>
      )}
    </div>
  );
}
