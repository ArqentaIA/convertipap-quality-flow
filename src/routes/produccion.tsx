import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertOctagon,
  CircleDashed,
  Activity,
  RefreshCw,
  Calendar,
  MapPin,
  BarChart3,
  Trophy,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { listMaquinasConEstado } from "@/lib/produccion.functions";
import { useProduccionRealtime } from "@/hooks/use-produccion-realtime";

import { BuscadorRollo } from "@/components/qc/BuscadorRollo";
import { useLabFilter } from "@/lib/lab";
import trofeoAsset from "@/assets/trofeo.png.asset.json";

const TROFEO_URL = trofeoAsset.url;

type Rango = "turno" | "dia" | "semana" | "mes" | "año";
const RANGO_LABEL: Record<Rango, string> = {
  turno: "Turno",
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  año: "Año",
};

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
  const [rango, setRango] = useState<Rango>("turno");
  const listFn = useServerFn(listMaquinasConEstado);
  const labFilter = useLabFilter();
  const rtStatus = useProduccionRealtime();
  const { data: all = [], isFetching } = useQuery({
    queryKey: ["produccion", "maquinas", rango],
    queryFn: () => listFn({ data: { rango } }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  // Todos los roles ven las estadísticas de todas las máquinas.
  // El acceso al detalle de rollos se restringe por máquina en MaquinaCard.
  const maquinas = all;

  // Ranking: orden descendente por kg, sin producción al final
  const ranking = useMemo(() => {
    const copy = [...maquinas];
    copy.sort((a, b) => {
      if (a.kgTurno === 0 && b.kgTurno > 0) return 1;
      if (b.kgTurno === 0 && a.kgTurno > 0) return -1;
      return b.kgTurno - a.kgTurno;
    });
    return copy;
  }, [maquinas]);

  const maxKg = ranking[0]?.kgTurno ?? 0;

  const plantaLabel =
    maquinas.find((m) => m.planta && m.planta !== "—")?.planta ?? "Todas las plantas";

  // hora removida: solo se muestra el indicador de auto-refresh
  const fecha = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <AppLayout title="Producción · Estado de máquinas">
      <div className="space-y-5">
        {/* Filtros + búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangoTabs rango={rango} setRango={setRango} />
          <BuscadorRollo />
        </div>

        {/* Banda informativa de contexto */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-primary">
              <MapPin className="h-3.5 w-3.5" /> {plantaLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-foreground">
              <Activity className="h-3.5 w-3.5" /> Visualizando: {RANGO_LABEL[rango]}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {fecha}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                rtStatus === "live"
                  ? "bg-success"
                  : rtStatus === "offline"
                  ? "bg-destructive"
                  : "bg-warning"
              }`}
            />
            {rtStatus === "live" ? "EN VIVO" : rtStatus === "offline" ? "SIN CONEXIÓN" : "CONECTANDO"}
            <RefreshCw className={`ml-2 h-3.5 w-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            Auto-refresh 15s
          </span>
        </div>

        {/* KPIs ejecutivos */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KPI icon={Package} label="Producción total (kg)" value={fmtNum(kgTotal)} tone="primary" />
          <KPI icon={BarChart3} label="Rollos producidos" value={fmtNum(rollosTotal)} />
          <KPI icon={Gauge} label="OEE global" value={`${oeeProm}${oeeProm === "—" ? "" : "%"}`} tone="success" />
          <KPI icon={Factory} label="Máquinas activas" value={`${activos} / ${maquinas.length}`} tone="primary" />
          <KPI icon={AlertTriangle} label="Máquinas en paro" value={String(enParo)} tone={enParo > 0 ? "warning" : "default"} />
        </div>

        {maquinas.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Comparativo de producción */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    Comparativo de producción · {RANGO_LABEL[rango]}
                  </h3>
                  <p className="text-xs text-muted-foreground">Kg producidos por máquina · ranking de desempeño</p>
                </div>
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-2.5">
                {ranking.map((m, idx) => (
                  <BarraRanking key={m.id} m={m} idx={idx} maxKg={maxKg} />
                ))}
              </div>
            </div>

            {/* Tarjetas de máquina */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {ranking.map((m, idx) => (
                <MaquinaCard
                  key={m.id}
                  m={m}
                  rangoLabel={RANGO_LABEL[rango]}
                  rank={idx + 1}
                  canAccess={labFilter.isMachineAllowed(m.codigo)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(n);
}

function RangoTabs({ rango, setRango }: { rango: Rango; setRango: (r: Rango) => void }) {
  const opts: Rango[] = ["turno", "dia", "semana", "mes", "año"];
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
      {opts.map((r) => (
        <button
          key={r}
          onClick={() => setRango(r)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
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

type EstadoVisual = "produciendo" | "espera" | "paro" | "sin_produccion";

function estadoVisual(m: MaquinaRow): EstadoVisual {
  if (m.estado === "paro") return "paro";
  if (m.estado === "operando") return "produciendo";
  if (m.kgTurno === 0 && m.rollosTurno === 0) return "sin_produccion";
  return "espera";
}

const ESTADO_MAP: Record<EstadoVisual, { dot: string; cls: string; txt: string }> = {
  produciendo: { dot: "bg-success", cls: "bg-success/10 text-success border-success/30", txt: "Produciendo" },
  espera:      { dot: "bg-warning", cls: "bg-warning/15 text-foreground border-warning/40", txt: "Espera" },
  paro:        { dot: "bg-destructive", cls: "bg-destructive/10 text-destructive border-destructive/30", txt: "Paro" },
  sin_produccion: { dot: "bg-muted-foreground/50", cls: "bg-muted text-muted-foreground border-border", txt: "Sin producción" },
};

function EstadoChip({ estado }: { estado: EstadoVisual }) {
  const { cls, dot, txt } = ESTADO_MAP[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {txt}
    </span>
  );
}

// Paleta estable por máquina: cada código mapea a un color fijo
const MAQUINA_PALETTE = [
  "#eab308", // amarillo
  "#a855f7", // púrpura
  "#14b8a6", // teal
  "#f97316", // naranja
  "#84cc16", // lima
  "#06b6d4", // cian
  "#ec4899", // rosa
  "#8b5cf6", // violeta
  "#ef4444", // rojo
  "#f59e0b", // ámbar
  "#10b981", // verde esmeralda
  "#3b82f6", // azul
];
function maquinaColor(codigo: string): string {
  let h = 0;
  for (let i = 0; i < codigo.length; i++) h = (h * 31 + codigo.charCodeAt(i)) >>> 0;
  return MAQUINA_PALETTE[h % MAQUINA_PALETTE.length];
}

function BarraRanking({ m, idx, maxKg }: { m: MaquinaRow; idx: number; maxKg: number }) {
  const ev = estadoVisual(m);
  const pct = maxKg > 0 ? Math.max(2, (m.kgTurno / maxKg) * 100) : 0;
  const isLeader = idx === 0 && m.kgTurno > 0;
  const color = maquinaColor(m.codigo);
  const hasProd = m.kgTurno > 0;
  return (
    <div
      className="flex items-center gap-3 rounded-lg p-2 transition"
      style={
        isLeader
          ? {
              background: `linear-gradient(90deg, ${color}26, ${color}0d 60%, transparent)`,
              boxShadow: `inset 0 0 0 1px ${color}66`,
            }
          : undefined
      }
    >
      <div className="flex w-10 shrink-0 items-center justify-center gap-1">
        {isLeader ? (
          <div className="relative">
            <div
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: `${color}4d` }}
            />
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg ring-2"
              style={{
                boxShadow: `0 8px 16px -4px ${color}80`,
                ['--tw-ring-color' as never]: `${color}99`,
              }}
            >
              <img src={TROFEO_URL} alt="Trofeo #1" className="h-7 w-7 object-contain" />
            </div>
          </div>
        ) : (
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">#{idx + 1}</span>
        )}
      </div>
      <div
        className="w-20 shrink-0 text-sm font-bold"
        style={{ color: hasProd ? color : undefined }}
      >
        {m.codigo}
      </div>
      <div
        className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/60"
        style={isLeader ? { boxShadow: `inset 0 0 0 1px ${color}80` } : undefined}
      >
        <div
          className="h-full rounded-md transition-all"
          style={{
            width: hasProd ? `${pct}%` : "0%",
            background: hasProd
              ? `linear-gradient(90deg, ${color}, ${color}cc)`
              : "transparent",
          }}
        />
        <span className="absolute inset-y-0 left-2 flex items-center gap-1 text-[11px] font-semibold text-foreground">
          {fmtNum(m.kgTurno)} kg · {m.rollosTurno} rollos
          {isLeader && (
            <span
              className="ml-1 rounded-sm px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"
              style={{ background: color }}
            >
              Líder
            </span>
          )}
        </span>
      </div>
      <div className="w-28 shrink-0 text-right">
        <EstadoChip estado={ev} />
      </div>
    </div>
  );
}

function MaquinaCard({
  m,
  rangoLabel,
  rank,
  canAccess,
}: {
  m: MaquinaRow;
  rangoLabel: string;
  rank: number;
  canAccess: boolean;
}) {
  const ev = estadoVisual(m);
  const isLeader = rank === 1 && m.kgTurno > 0;
  const color = maquinaColor(m.codigo);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {isLeader ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-extrabold shadow-sm ring-1"
                style={{ ['--tw-ring-color' as never]: `${color}80`, color }}
              >
                <img src={TROFEO_URL} alt="" className="h-4 w-4 object-contain" /> #1
              </span>
            ) : (
              <span
                className="rounded px-1.5 py-0.5 font-bold text-white"
                style={{ background: color }}
              >
                #{rank}
              </span>
            )}
            <span className="truncate">{m.planta}</span>
          </div>
          <h3 className="mt-1 text-lg font-bold" style={{ color }}>{m.codigo}</h3>
        </div>
        <EstadoChip estado={ev} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <Mini label="kg" value={fmtNum(m.kgTurno)} accent />
        <Mini label="Rollos" value={String(m.rollosTurno)} />
        <Mini label={`OEE ${rangoLabel}`} value={`${m.oee.toFixed(1)}%`} />
      </div>
    </>
  );
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
      style={{
        borderLeft: `4px solid ${color}`,
        ...(isLeader
          ? { boxShadow: `0 10px 24px -8px ${color}66, 0 0 0 2px ${color}55` }
          : {}),
      }}
    >
      {isLeader && (
        <>
          <div
            className="pointer-events-none absolute -right-12 top-4 z-10 rotate-45 px-12 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-md"
            style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
          >
            Líder
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{ background: `linear-gradient(90deg, ${color}, ${color}99, ${color})` }}
          />
        </>
      )}
      {canAccess ? (
        <Link to="/historial/$maquina" params={{ maquina: m.codigo }} className="block">
          {inner}
        </Link>
      ) : (
        <div
          className="block cursor-not-allowed opacity-95"
          title="Solo el laboratorio asignado puede ver el detalle de rollos"
          aria-disabled="true"
        >
          {inner}
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            Detalle restringido a su laboratorio
          </div>
        </div>
      )}

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

function KPI({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-foreground",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Mini({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
