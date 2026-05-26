import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Factory, Gauge, Clock, Pause, Play, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/produccion")({ component: ProduccionPage });

type Maquina = {
  codigo: string;
  planta: string;
  producto: string;
  orden: string;
  estado: "operando" | "paro" | "ajuste";
  velocidad: number;
  velocidadObj: number;
  oee: number;
  turnoHoras: number;
  rollosTurno: number;
  operador: string;
};

const MAQUINAS: Maquina[] = [
  { codigo: "MP-05", planta: "Tlaxcala", producto: "PST Higiénico 13 g/m²", orden: "OF-44218", estado: "operando", velocidad: 1720, velocidadObj: 1800, oee: 86.4, turnoHoras: 6.2, rollosTurno: 14, operador: "Palemón G." },
  { codigo: "MP-06", planta: "Tlaxcala", producto: "PST Higiénico 13 g/m²", orden: "OF-44219", estado: "operando", velocidad: 1815, velocidadObj: 1800, oee: 91.2, turnoHoras: 6.5, rollosTurno: 16, operador: "Ricardo M." },
  { codigo: "MP-07", planta: "Planta 2", producto: "PST Toalla 22 g/m²", orden: "OF-44225", estado: "ajuste", velocidad: 0, velocidadObj: 1500, oee: 62.1, turnoHoras: 4.0, rollosTurno: 8, operador: "Adrián P." },
  { codigo: "MP-08", planta: "Planta 2", producto: "PST Servilleta 17 g/m²", orden: "OF-44230", estado: "operando", velocidad: 1480, velocidadObj: 1500, oee: 88.0, turnoHoras: 6.0, rollosTurno: 15, operador: "Jorge H." },
  { codigo: "MP-09", planta: "Planta 3", producto: "PST Facial 15 g/m²", orden: "OF-44241", estado: "operando", velocidad: 1600, velocidadObj: 1650, oee: 84.7, turnoHoras: 5.8, rollosTurno: 12, operador: "Roberto M." },
  { codigo: "MP-10", planta: "Planta 3", producto: "PST Higiénico 12.5 g/m²", orden: "OF-44242", estado: "paro", velocidad: 0, velocidadObj: 1700, oee: 41.3, turnoHoras: 2.1, rollosTurno: 4, operador: "Daniel R." },
];

function ProduccionPage() {
  const activos = MAQUINAS.filter((m) => m.estado === "operando").length;
  const oeeProm = (MAQUINAS.reduce((s, m) => s + m.oee, 0) / MAQUINAS.length).toFixed(1);
  const rollos = MAQUINAS.reduce((s, m) => s + m.rollosTurno, 0);

  return (
    <AppLayout title="Producción · Estado de máquinas">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPI icon={Factory} label="Máquinas activas" value={`${activos} / ${MAQUINAS.length}`} tone="primary" />
          <KPI icon={Gauge} label="OEE promedio" value={`${oeeProm}%`} tone="success" />
          <KPI icon={Clock} label="Rollos turno actual" value={String(rollos)} />
          <KPI icon={AlertTriangle} label="Paros activos" value={String(MAQUINAS.filter(m => m.estado !== "operando").length)} tone="warning" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MAQUINAS.map((m) => {
            const pct = m.velocidadObj ? Math.min(100, (m.velocidad / m.velocidadObj) * 100) : 0;
            return (
              <div key={m.codigo} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{m.planta}</div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-lg font-bold text-foreground">{m.codigo}</h3>
                      <span className="text-xs text-muted-foreground">· {m.orden}</span>
                    </div>
                  </div>
                  <EstadoChip estado={m.estado} />
                </div>

                <div className="mt-3 text-sm text-foreground">{m.producto}</div>
                <div className="text-xs text-muted-foreground">Operador: {m.operador}</div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Velocidad</span>
                    <span className="tabular-nums">
                      <strong className="text-foreground">{m.velocidad}</strong> / {m.velocidadObj} m/min
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${m.estado === "operando" ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <Mini label="OEE" value={`${m.oee.toFixed(1)}%`} />
                  <Mini label="Horas" value={`${m.turnoHoras.toFixed(1)}h`} />
                  <Mini label="Rollos" value={String(m.rollosTurno)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}

function EstadoChip({ estado }: { estado: Maquina["estado"] }) {
  const map = {
    operando: { cls: "bg-success/15 text-success border-success/30", icon: Play, txt: "Operando" },
    ajuste: { cls: "bg-warning/20 text-foreground border-warning/40", icon: Clock, txt: "Ajuste" },
    paro: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: Pause, txt: "Paro" },
  } as const;
  const { cls, icon: Icon, txt } = map[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

function KPI({ icon: Icon, label, value, tone = "default" }: { icon: any; label: string; value: string; tone?: "default" | "primary" | "success" | "warning" }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
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
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
