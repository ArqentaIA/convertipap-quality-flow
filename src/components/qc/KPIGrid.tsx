import { Gauge, Wind, Percent, Target } from "lucide-react";
import type { GeneralInfo } from "@/lib/qc-data";

export function KPIGrid({ info }: { info: GeneralInfo }) {
  const items = [
    { label: "Velocidad máquina", value: info.velocidadMaquina, unit: "m/min", icon: Gauge, tone: "primary" as const },
    { label: "Velocidad enrollador", value: info.velocidadEnrollador, unit: "m/min", icon: Wind, tone: "navy" as const },
    { label: "% Crepado", value: info.crepado, unit: "%", icon: Percent, tone: "warning" as const },
    { label: "Cumplimiento", value: info.cumplimiento.toFixed(2), unit: "%", icon: Target, tone: "success" as const },
  ];
  const tones: Record<string, string> = {
    primary: "from-primary/15 to-primary/0 text-primary border-primary/30",
    navy: "from-foreground/10 to-transparent text-foreground border-foreground/20",
    warning: "from-warning/20 to-transparent text-warning-foreground border-warning/40",
    success: "from-success/15 to-transparent text-success border-success/30",
  };
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map(({ label, value, unit, icon: Icon, tone }) => (
        <div key={label} className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${tones[tone]} bg-card p-4 shadow-sm`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
            <Icon className="h-5 w-5 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
