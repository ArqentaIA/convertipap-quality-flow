import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Download, Filter, Eye, Calendar, ArrowLeft, QrCode, Lock, CircleDashed, ClipboardCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { printRollReport } from "@/lib/roll-report";
import { useLabFilter, LAB_LABEL } from "@/lib/lab";
import { resolveRolloStatus } from "@/lib/roll-status";
import { listMaquinasConEstado, listHistorialMaquina } from "@/lib/produccion.functions";
import { DetalleCalidadModal } from "@/components/qc/DetalleCalidadModal";


export const Route = createFileRoute("/historial/$maquina")({
  component: HistorialPage,
  errorComponent: ({ error }) => (
    <AppLayout title="Historial">
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Error cargando historial: {error.message}
      </div>
    </AppLayout>
  ),
});

function HistorialPage() {
  const { maquina: maquinaCodigo } = Route.useParams();
  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<{ ordenId: string; folio: string } | null>(null);
  const labFilter = useLabFilter();


  const listMaquinasFn = useServerFn(listMaquinasConEstado);
  const { data: maquinas } = useSuspenseQuery({
    queryKey: ["produccion", "maquinas"],
    queryFn: () => listMaquinasFn({ data: undefined as never }),
  });
  const maquina = maquinas.find((m) => m.codigo.toUpperCase() === maquinaCodigo.toUpperCase());

  const listHistFn = useServerFn(listHistorialMaquina);
  const { data: historial } = useSuspenseQuery({
    queryKey: ["produccion", "historial", maquina?.id ?? "none"],
    queryFn: () =>
      maquina ? listHistFn({ data: { maquina_id: maquina.id } }) : Promise.resolve([]),
  });

  if (!labFilter.isMachineAllowed(maquinaCodigo)) {
    return (
      <AppLayout title={`Historial · ${maquinaCodigo.toUpperCase()}`}>
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Sin acceso a esta máquina</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu laboratorio asignado{labFilter.lab ? ` (${LAB_LABEL[labFilter.lab]})` : ""} no opera{" "}
            <strong>{maquinaCodigo.toUpperCase()}</strong>.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!maquina) {
    return (
      <AppLayout title={`Historial · ${maquinaCodigo.toUpperCase()}`}>
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <CircleDashed className="mx-auto mb-3 h-8 w-8 opacity-50" />
          La máquina <strong>{maquinaCodigo.toUpperCase()}</strong> no existe en el catálogo.
        </div>
      </AppLayout>
    );
  }

  const filtered = useMemo(
    () =>
      historial.filter((r) =>
        [r.folio, r.planta, r.maquina, r.producto].join(" ").toLowerCase().includes(q.toLowerCase()),
      ),
    [historial, q],
  );

  const total = filtered.length;
  const liberados = filtered.filter((r) => r.estatus === "L").length;
  const noConf = filtered.filter((r) => r.estatus === "NC").length;
  const avg = filtered.length
    ? (
        filtered.reduce((s, r) => s + (r.cumplimiento ?? 0), 0) /
        Math.max(filtered.filter((r) => r.cumplimiento != null).length, 1)
      ).toFixed(1)
    : "—";

  return (
    <AppLayout title={`Historial · ${maquina.codigo}`}>
      <div className="space-y-6">
        <Link
          to="/produccion"
          className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-all hover:border-primary/60"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Volver a Producción
        </Link>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Órdenes" value={String(total)} hint="históricas" />
          <StatCard label="Liberadas" value={String(liberados)} hint="al menos 1 muestra L" tone="success" />
          <StatCard label="No conformes" value={String(noConf)} hint="con rechazos" tone="danger" />
          <StatCard label="Cumplimiento prom." value={`${avg}${avg === "—" ? "" : "%"}`} hint="muestras liberadas" tone="primary" />
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar folio, producto…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
              <Calendar className="h-4 w-4" /> Rango
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
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
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Rollos</th>
                  <th className="px-4 py-3 text-right">kg</th>
                  <th className="px-4 py-3 text-right">Muestras</th>
                  <th className="px-4 py-3 text-right">Cumpl.</th>
                  <th className="px-4 py-3">Estatus</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Sin órdenes registradas para {maquina.codigo}.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const e = resolveRolloStatus({ folio: r.folio, legacyEstatus: r.estatus });
                  return (
                    <tr key={r.ordenId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-primary">{r.folio}</td>
                      <td className="px-4 py-3 tabular-nums">{r.fecha || "—"}</td>
                      <td className="px-4 py-3">{r.planta}</td>
                      <td className="px-4 py-3">{r.turno}</td>
                      <td className="px-4 py-3">{r.producto}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.rollos}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.kg.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.muestrasTotal}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {r.cumplimiento == null ? "—" : `${r.cumplimiento.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: e.bg, color: e.color, borderColor: e.color }}
                        >
                          {e.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            onClick={() =>
                              printRollReport({
                                folio: r.folio,
                                maquina: r.maquina,
                                planta: r.planta,
                                turno: r.turno,
                                operador: "—",
                                jefeMaquina: "—",
                                fecha: r.fecha,
                                producto: r.producto,
                                estatus: r.estatus,
                                metricas: [
                                  { label: "Rollos producidos", value: r.rollos },
                                  { label: "Kg producidos", value: r.kg.toFixed(1), unit: "kg" },
                                  {
                                    label: "Cumplimiento",
                                    value: r.cumplimiento == null ? "—" : r.cumplimiento.toFixed(1),
                                    unit: "%",
                                    status: r.estatus,
                                  },
                                  { label: "Planta", value: r.planta },
                                  { label: "Máquina", value: r.maquina },
                                  { label: "Turno", value: r.turno },
                                ],
                                notas: `Orden ${r.folio} · estado ${r.estado}`,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs text-foreground hover:text-primary"
                            title="Imprimir reporte con QR"
                          >
                            <QrCode className="h-3.5 w-3.5" /> Imprimir
                          </button>
                          <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <Eye className="h-3.5 w-3.5" /> Ver
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div>Mostrando {filtered.length} de {historial.length} órdenes</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({
  label, value, hint, tone = "default",
}: { label: string; value: string; hint: string; tone?: "default" | "primary" | "success" | "danger" }) {
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
