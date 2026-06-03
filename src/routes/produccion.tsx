import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Factory, Gauge, Clock, Pause, Play, AlertTriangle, AlertOctagon, CircleDashed } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { listMaquinasConEstado } from "@/lib/produccion.functions";
import { useLabFilter } from "@/lib/lab";

type Rango = "dia" | "semana" | "mes" | "año";
const RANGO_LABEL: Record<Rango, string> = { dia: "Día", semana: "Semana", mes: "Mes", año: "Año" };

export const Route = createFileRoute("/produccion")({
  component: ProduccionPage,
  errorComponent: ({ error }) => (
    <AppLayout title="Producción">
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Error cargando producción: {error.message}
      </div>
    </AppLayout>
  ),
});

type MaquinaRow = Awaited<ReturnType<typeof listMaquinasConEstado>>[number];

function ProduccionPage() {
  const labFilter = useLabFilter();
  const [rango, setRango] = useState<Rango>("dia");
  const listFn = useServerFn(listMaquinasConEstado);
  const { data: all = [], isFetching } = useQuery({
    queryKey: ["produccion", "maquinas", rango],
    queryFn: () => listFn({ data: { rango } }),
    refetchInterval: 60_000,
  });
  const maquinas = all.filter((m) => labFilter.isMachineIdAllowed(m.id));

  const activos = maquinas.filter((m) => m.estado === "operando").length;
  const oeeProm = maquinas.length
    ? (maquinas.reduce((s, m) => s + m.oee, 0) / maquinas.length).toFixed(1)
    : "—";
  const rollos = maquinas.reduce((s, m) => s + m.rollosTurno, 0);
  const enParo = maquinas.filter((m) => m.estado === "paro").length;

  return (
    <AppLayout title="Producción · Estado de máquinas">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangoTabs rango={rango} setRango={setRango} />
          <div className="text-xs text-muted-foreground">
            Datos en tiempo real · refresco 60s {isFetching && <span className="ml-1 animate-pulse">●</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPI icon={Factory} label="Máquinas activas" value={`${activos} / ${maquinas.length}`} tone="primary" />
          <KPI icon={Gauge} label={`OEE promedio (${RANGO_LABEL[rango]})`} value={`${oeeProm}${oeeProm === "—" ? "" : "%"}`} tone="success" />
          <KPI icon={Clock} label={`Rollos (${RANGO_LABEL[rango]})`} value={String(rollos)} />
          <KPI icon={AlertTriangle} label="En paro" value={String(enParo)} tone={enParo > 0 ? "warning" : "default"} />
        </div>

        {maquinas.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {maquinas.map((m) => (
              <MaquinaCard key={m.id} m={m} rangoLabel={RANGO_LABEL[rango]} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function RangoTabs({ rango, setRango }: { rango: Rango; setRango: (r: Rango) => void }) {
  const opts: Rango[] = ["dia", "semana", "mes", "año"];
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
      {opts.map((r) => (
        <button
          key={r}
          onClick={() => setRango(r)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            rango === r ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {RANGO_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      <CircleDashed className="mx-auto mb-3 h-8 w-8 opacity-50" />
      No hay máquinas activas en tu alcance. Da de alta máquinas en{" "}
      <Link to="/catalogos" className="text-primary hover:underline">Catálogos</Link>.
    </div>
  );
}

function MaquinaCard({ m, rangoLabel }: { m: MaquinaRow; rangoLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/40">
      <Link to="/historial/$maquina" params={{ maquina: m.codigo }} className="block">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{m.planta}</div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-lg font-bold text-foreground">{m.codigo}</h3>
            </div>
          </div>
          <EstadoChip estado={m.estado} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <Mini label={`OEE ${rangoLabel}`} value={`${m.oee.toFixed(1)}%`} />
          <Mini label="Rollos" value={String(m.rollosTurno)} />
          <Mini label="kg" value={m.kgTurno.toFixed(0)} />
        </div>
      </Link>

      {m.paroActivo && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1 text-xs leading-relaxed text-foreground">
              <strong className="text-destructive">Paro activo:</strong> {m.paroActivo.tipo}
              {m.paroActivo.descripcion && <div className="text-muted-foreground">{m.paroActivo.descripcion}</div>}
              <div className="mt-1 text-[10px] text-muted-foreground">
                Desde {new Date(m.paroActivo.inicio).toLocaleString("es-MX")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function EstadoChip({ estado }: { estado: MaquinaRow["estado"] }) {
  const map = {
    operando: { cls: "bg-success/15 text-success border-success/30", icon: Play, txt: "Operando" },
    mantenimiento: { cls: "bg-warning/20 text-foreground border-warning/40", icon: Clock, txt: "Mantenimiento" },
    paro: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: Pause, txt: "Paro" },
    libre: { cls: "bg-muted text-muted-foreground border-border", icon: CircleDashed, txt: "Libre" },
  } as const;
  const { cls, icon: Icon, txt } = map[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

function KPI({ icon: Icon, label, value, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "default" | "primary" | "success" | "warning" }) {
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
