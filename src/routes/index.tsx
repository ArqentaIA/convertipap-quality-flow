import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { KPIGrid } from "@/components/qc/KPIGrid";
import { DEFAULT_GENERAL, SAMPLE_MEASUREMENTS, PLANTS } from "@/lib/qc-data";
import { ReleaseBadge } from "@/components/qc/StatusBadge";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Factory, ClipboardCheck, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  return (
    <AppLayout title="Dashboard · Calidad y Producción">
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Operación en vivo</div>
              <h2 className="mt-1 text-2xl font-bold text-foreground">Buen turno, Christian</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Resumen consolidado de las {PLANTS.length} plantas Convertipap. Última sincronización hace 2 min.
              </p>
            </div>
            <Link
              to="/control-calidad"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Nuevo registro de calidad <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <KPIGrid info={DEFAULT_GENERAL} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Últimos rollos liberados</h3>
                <p className="text-xs text-muted-foreground">Planta Tlaxcala · MP-06 · Turno 3</p>
              </div>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-2">Hora</th><th>Rollo</th><th>Peso base</th><th>Humedad</th><th>Estatus</th></tr>
                </thead>
                <tbody>
                  {SAMPLE_MEASUREMENTS.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="py-2 tabular-nums">{m.hora}</td>
                      <td className="font-medium tabular-nums">{m.rollo}</td>
                      <td className="tabular-nums">{m.pesoBase} g/m²</td>
                      <td className="tabular-nums">{m.humedad}%</td>
                      <td><ReleaseBadge s={m.estatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <CardStat icon={Factory} label="Máquinas activas" value="4 / 7" tone="primary" />
            <CardStat icon={ClipboardCheck} label="Registros hoy" value="12" tone="success" />
            <CardStat icon={AlertTriangle} label="No conformidades" value="2" tone="warning" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function CardStat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "primary" | "success" | "warning" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-foreground",
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}
