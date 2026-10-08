import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlantaEfectivaCodigo } from "@/hooks/usePlantasPermitidas";
import { useLabFilter } from "@/lib/lab";
import { getReporteFueraTurno } from "@/lib/reporte-fuera-turno.functions";
import { exportReporteFueraTurno } from "@/lib/reporte-fuera-turno-export";
import { fechaMX, fechaCortoMX, horaMX } from "@/lib/format";

export function ReporteFueraTurnoSection({ enabled }: { enabled: boolean }) {
  const planta = usePlantaEfectivaCodigo();
  const lab = useLabFilter();
  const [mode, setMode] = useState<"dia" | "mes">("dia");
  const [fecha, setFecha] = useState(() => fechaMX(new Date()));
  const [consulta, setConsulta] = useState<{ mode: "dia" | "mes"; fecha: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reporte-fuera-turno", consulta, planta],
    queryFn: () => {
      if (!consulta) throw new Error("Selecciona un periodo");
      return getReporteFueraTurno({ data: { ...consulta, planta } });
    }, enabled: enabled && !!consulta, retry: false, staleTime: 0,
  });
  const data = query.data ? { ...query.data, rows: query.data.rows.filter((r) => lab.isMachineAllowed(r.maquina)) } : null;
  const download = async () => {
    if (!data || query.isError || query.isFetching) return;
    setBusy(true); setError(null);
    try { await exportReporteFueraTurno(data); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo descargar el reporte"); }
    finally { setBusy(false); }
  };
  return <section aria-label="Capturas fuera de turno" className="space-y-4 border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-sm font-bold">Capturas fuera de turno</h2>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">Periodo <select aria-label="Periodo fuera de turno" className="rounded-md border border-input bg-background p-2" value={mode} onChange={(e) => setMode(e.target.value as "dia" | "mes")}><option value="dia">Día</option><option value="mes">Mes</option></select></label>
        <input aria-label="Fecha fuera de turno" className="rounded-md border border-input bg-background p-2 text-xs" type={mode === "dia" ? "date" : "month"} value={mode === "dia" ? fecha : fecha.slice(0, 7)} onChange={(e) => setFecha(mode === "mes" ? `${e.target.value}-01` : e.target.value)} />
        <Button variant="outline" size="sm" disabled={!enabled || !fecha || query.isFetching} onClick={() => { setError(null); if (consulta?.mode === mode && consulta.fecha === fecha) void query.refetch(); else setConsulta({ mode, fecha }); }}><Search className="h-4 w-4" />Consultar</Button>
        <Button variant="outline" size="sm" disabled={!data || !data.rows.length || query.isError || query.isFetching || busy} onClick={download}><FileSpreadsheet className="h-4 w-4" />{busy ? "Generando…" : "XLSX"}</Button>
      </div>
    </div>
    {query.isFetching ? <p className="text-xs text-muted-foreground">Cargando reporte completo…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">No se pudo cargar el reporte: {query.error.message}</p> : data ? <>
      <p className="text-xs text-muted-foreground">{data.periodo} · {data.rows.length} registros · Fecha de captura · Hora de México</p>
      {data.rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin capturas fuera de turno en el periodo solicitado.</p> : <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-background"><tr>{["Rollo", "Fecha de captura", "Hora", "Máquina", "Turno declarado", "SKU SAP", "Capturado por", "Motivo"].map((h) => <th key={h} className="whitespace-nowrap border-b border-border p-2">{h}</th>)}</tr></thead><tbody>{data.rows.map((r) => <tr key={r.id}>{[r.rollo, fechaCortoMX(r.capturadoAt), horaMX(r.capturadoAt), r.maquina, r.turno, r.skuSap ?? "—", r.capturadoPor, r.motivo].map((v, i) => <td key={i} className="border-b border-border p-2 align-top">{v}</td>)}</tr>)}</tbody></table></div>}
    </> : null}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}