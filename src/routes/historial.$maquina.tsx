import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReleaseBadge } from "@/components/qc/StatusBadge";
import { Search, Download, Filter, Eye, Calendar, ArrowLeft } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/historial/$maquina")({ component: HistorialPage });

type Registro = {
  folio: string;
  fecha: string;
  planta: string;
  maquina: string;
  turno: string;
  producto: string;
  jefe: string;
  rollos: number;
  cumplimiento: number;
  estatus: "L" | "NC" | "C";
};

const REGISTROS: Registro[] = [
  // MP-04
  { folio: "CAL-2026-04830", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-04", turno: "3", producto: "PST Higiénico 13 g/m²", jefe: "Palemón G.", rollos: 14, cumplimiento: 86.4, estatus: "L" },
  { folio: "CAL-2026-04822", fecha: "2026-05-25", planta: "Tlaxcala", maquina: "MP-04", turno: "2", producto: "PST Higiénico 13 g/m²", jefe: "Palemón G.", rollos: 15, cumplimiento: 90.1, estatus: "L" },
  { folio: "CAL-2026-04811", fecha: "2026-05-24", planta: "Tlaxcala", maquina: "MP-04", turno: "1", producto: "PST Higiénico 13 g/m²", jefe: "Manuel Rivas", rollos: 13, cumplimiento: 78.2, estatus: "NC" },
  // MP-05
  { folio: "CAL-2026-04831", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-05", turno: "3", producto: "PST Higiénico 13 g/m²", jefe: "Ricardo M.", rollos: 16, cumplimiento: 91.2, estatus: "L" },
  { folio: "CAL-2026-04819", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-05", turno: "2", producto: "PST Higiénico 13 g/m²", jefe: "Luis Cárdenas", rollos: 12, cumplimiento: 76.5, estatus: "NC" },
  { folio: "CAL-2026-04814", fecha: "2026-05-24", planta: "Tlaxcala", maquina: "MP-05", turno: "1", producto: "PST Higiénico 13 g/m²", jefe: "Manuel Rivas", rollos: 17, cumplimiento: 93.6, estatus: "L" },
  // MP-06
  { folio: "CAL-2026-04821", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-06", turno: "3", producto: "PST Toalla 22 g/m²", jefe: "Erick Ordoñez", rollos: 14, cumplimiento: 92.4, estatus: "L" },
  { folio: "CAL-2026-04820", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-06", turno: "2", producto: "PST Toalla 22 g/m²", jefe: "Manuel Rivas", rollos: 16, cumplimiento: 88.1, estatus: "L" },
  { folio: "CAL-2026-04817", fecha: "2026-05-25", planta: "Tlaxcala", maquina: "MP-06", turno: "1", producto: "PST Toalla 22 g/m²", jefe: "Erick Ordoñez", rollos: 15, cumplimiento: 62.1, estatus: "NC" },
  { folio: "CAL-2026-04812", fecha: "2026-05-24", planta: "Tlaxcala", maquina: "MP-06", turno: "3", producto: "PST Toalla 22 g/m²", jefe: "Erick Ordoñez", rollos: 16, cumplimiento: 87.2, estatus: "L" },
  // MP-07
  { folio: "CAL-2026-04832", fecha: "2026-05-26", planta: "Tlaxcala", maquina: "MP-07", turno: "3", producto: "PST Servilleta 17 g/m²", jefe: "Jorge H.", rollos: 15, cumplimiento: 88.0, estatus: "L" },
  { folio: "CAL-2026-04815", fecha: "2026-05-25", planta: "Tlaxcala", maquina: "MP-07", turno: "2", producto: "PST Servilleta 17 g/m²", jefe: "Adrián Pérez", rollos: 13, cumplimiento: 71.3, estatus: "NC" },
  { folio: "CAL-2026-04810", fecha: "2026-05-24", planta: "Tlaxcala", maquina: "MP-07", turno: "1", producto: "PST Servilleta 17 g/m²", jefe: "Jorge H.", rollos: 14, cumplimiento: 89.5, estatus: "L" },
];

function HistorialPage() {
  const { maquina } = Route.useParams();
  const [q, setQ] = useState("");
  const porMaquina = REGISTROS.filter((r) => r.maquina.toLowerCase() === maquina.toLowerCase());
  const filtered = porMaquina.filter((r) =>
    [r.folio, r.planta, r.maquina, r.producto, r.jefe].join(" ").toLowerCase().includes(q.toLowerCase())
  );
  const total = filtered.length;
  const liberados = filtered.filter((r) => r.estatus === "L").length;
  const noConf = filtered.filter((r) => r.estatus === "NC").length;
  const avg = (filtered.reduce((s, r) => s + r.cumplimiento, 0) / Math.max(filtered.length, 1)).toFixed(1);

  return (
    <AppLayout title={`Historial · ${maquina.toUpperCase()}`}>
      <div className="space-y-6">
        <Link
          to="/produccion"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Producción
        </Link>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Registros" value={String(total)} hint="históricos de la máquina" />
          <StatCard label="Liberados" value={String(liberados)} hint="estatus L" tone="success" />
          <StatCard label="No conformes" value={String(noConf)} hint="requieren acción" tone="danger" />
          <StatCard label="Cumplimiento prom." value={`${avg}%`} hint="objetivo ≥ 90%" tone="primary" />
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar folio, producto o jefe…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent">
              <Calendar className="h-4 w-4" /> Rango
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent">
              <Filter className="h-4 w-4" /> Filtros
            </button>
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Folio</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Planta</th>
                  <th className="px-4 py-3">Máquina</th>
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Jefe de máquina</th>
                  <th className="px-4 py-3 text-right">Rollos</th>
                  <th className="px-4 py-3 text-right">Cumpl.</th>
                  <th className="px-4 py-3">Estatus</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No hay registros de producción para {maquina.toUpperCase()}.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.folio} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-primary">{r.folio}</td>
                    <td className="px-4 py-3 tabular-nums">{r.fecha}</td>
                    <td className="px-4 py-3">{r.planta}</td>
                    <td className="px-4 py-3 font-medium">{r.maquina}</td>
                    <td className="px-4 py-3">T{r.turno}</td>
                    <td className="px-4 py-3">{r.producto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.jefe}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.rollos}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.cumplimiento.toFixed(1)}%</td>
                    <td className="px-4 py-3"><ReleaseBadge s={r.estatus} /></td>
                    <td className="px-4 py-3 text-right">
                      <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="h-3.5 w-3.5" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div>Mostrando {filtered.length} de {porMaquina.length} registros</div>
            <div className="flex items-center gap-1">
              <button className="rounded border border-input bg-background px-2 py-1 hover:bg-accent">Anterior</button>
              <span className="px-2">Página 1 / 1</span>
              <button className="rounded border border-input bg-background px-2 py-1 hover:bg-accent">Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "primary" | "success" | "danger" }) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    danger: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
