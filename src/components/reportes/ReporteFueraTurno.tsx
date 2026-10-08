import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlantaEfectivaCodigo } from "@/hooks/usePlantasPermitidas";
import { useLabFilter } from "@/lib/lab";
import { getReporteFueraTurno } from "@/lib/reporte-fuera-turno.functions";
import { exportReporteFueraTurno } from "@/lib/reporte-fuera-turno-export";
import { fechaMX } from "@/lib/format";

export function ReporteFueraTurnoSection({ enabled }: { enabled: boolean }) {
  const planta = usePlantaEfectivaCodigo();
  const lab = useLabFilter();
  const [mode, setMode] = useState<"dia" | "mes">("dia");
  const [fecha, setFecha] = useState(() => fechaMX(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    if (!enabled || !fecha || busy) return;
    setBusy(true); setError(null);
    try {
      const data = await getReporteFueraTurno({ data: { mode, fecha, planta } });
      await exportReporteFueraTurno({ ...data, rows: data.rows.filter((r) => lab.isMachineAllowed(r.maquina)) });
    }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo descargar el reporte"); }
    finally { setBusy(false); }
  };
  return <section aria-label="Capturas fuera de turno" aria-busy={busy} className="space-y-4 border-y border-border bg-accent/20 p-6">
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold uppercase text-primary">Periodo / Fecha</label>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Periodo fuera de turno" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" disabled={busy} value={mode} onChange={(e) => { setError(null); setMode(e.target.value as "dia" | "mes"); }}><option value="dia">Día</option><option value="mes">Mes</option></select>
          <input aria-label="Fecha fuera de turno" className="min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs" disabled={busy} type={mode === "dia" ? "date" : "month"} value={mode === "dia" ? fecha : fecha.slice(0, 7)} onChange={(e) => { setError(null); setFecha(mode === "mes" && e.target.value ? `${e.target.value}-01` : e.target.value); }} />
        </div>
      </div>
      <h2 className="text-sm font-bold uppercase text-foreground">Capturas fuera de turno</h2>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-3">
      {error && <p role="alert" className="mr-auto text-sm text-destructive">No se pudo generar el reporte: {error}</p>}
      <Button variant="outline" size="sm" title="Generar y descargar Excel de capturas fuera de turno" disabled={!enabled || !fecha || busy} onClick={download}><FileSpreadsheet className="h-3.5 w-3.5" />{busy ? "Generando…" : "XLSX"}</Button>
    </div>
  </section>;
}