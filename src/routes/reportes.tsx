import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { FileBarChart2, Download, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/reportes")({ component: ReportesPage });

const TENDENCIA = [
  { dia: "Lun", cumpl: 88 },
  { dia: "Mar", cumpl: 91 },
  { dia: "Mié", cumpl: 86 },
  { dia: "Jue", cumpl: 93 },
  { dia: "Vie", cumpl: 95 },
  { dia: "Sáb", cumpl: 89 },
  { dia: "Dom", cumpl: 92 },
];

const PLANTAS_PERF = [
  { planta: "Tlaxcala", cumpl: 92.4, rollos: 412, nc: 6, delta: 1.8 },
];

const VARIABLES_TOP = [
  { v: "Humedad", incidencias: 18, impacto: "Media" },
  { v: "Peso base", incidencias: 12, impacto: "Alta" },
  { v: "Tensión MD", incidencias: 9, impacto: "Alta" },
  { v: "Blancura R457", incidencias: 5, impacto: "Baja" },
];

const REPORTES = [
  { nombre: "Cumplimiento semanal por planta", freq: "Semanal", formato: "PDF" },
  { nombre: "Detalle de no conformidades", freq: "Diario", formato: "Excel" },
  { nombre: "Tendencia de variables críticas", freq: "Mensual", formato: "PDF" },
  { nombre: "OEE por máquina y turno", freq: "Semanal", formato: "Excel" },
  { nombre: "Reporte ejecutivo de calidad", freq: "Mensual", formato: "PDF" },
];

function ReportesPage() {
  const max = Math.max(...TENDENCIA.map(t => t.cumpl));
  return (
    <AppLayout title="Reportes e Indicadores">
      <div className="space-y-6">

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h3 className="text-sm font-semibold text-foreground">Desempeño por planta</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3 text-right">Cumplimiento</th>
                <th className="px-4 py-3 text-right">Rollos producidos</th>
                <th className="px-4 py-3 text-right">No conformes</th>
                <th className="px-4 py-3 text-right">Δ vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {PLANTAS_PERF.map((p) => (
                <tr key={p.planta} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{p.planta}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.cumpl}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.rollos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.nc}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.delta >= 0 ? "text-success" : "text-destructive"}`}>
                    <span className="inline-flex items-center gap-1">
                      {p.delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {p.delta > 0 ? "+" : ""}{p.delta}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h3 className="text-sm font-semibold text-foreground">Reportes disponibles</h3>
            <FileBarChart2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="divide-y divide-border">
            {REPORTES.map((r) => (
              <li key={r.nombre} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{r.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">Frecuencia: {r.freq} · {r.formato}</div>
                </div>
                <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  <Download className="h-3.5 w-3.5" /> Descargar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
