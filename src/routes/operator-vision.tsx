import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Maximize2,
  Radio,
  Timer,
  TrendingUp,
  XCircle,
} from "lucide-react";
import logoConvertipap from "@/assets/logo-convertipap.png";
import { getOperatorVisionData } from "@/lib/operator-vision.functions";

const MAQUINAS_VALIDAS = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;
type MaquinaValida = (typeof MAQUINAS_VALIDAS)[number];

export const Route = createFileRoute("/operator-vision")({
  head: () => ({
    meta: [
      { title: "Operator Vision · Convertipap" },
      { name: "description", content: "Pantalla operativa industrial en tiempo real" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { maquina: MaquinaValida } => {
    const m = String(search.maquina ?? "");
    return {
      maquina: (MAQUINAS_VALIDAS as readonly string[]).includes(m)
        ? (m as MaquinaValida)
        : "MP-04",
    };
  },
  component: OperatorVisionPage,
});

// ---------- helpers ----------
type VarStatus = "ok" | "warn" | "bad";

const STATUS_RING: Record<VarStatus, string> = {
  ok: "ring-emerald-400/60 shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)]",
  warn: "ring-amber-400/70 shadow-[0_0_40px_-10px_rgba(245,158,11,0.7)]",
  bad: "ring-rose-500/70 shadow-[0_0_50px_-8px_rgba(244,63,94,0.8)] animate-pulse",
};
const STATUS_BG: Record<VarStatus, string> = {
  ok: "bg-emerald-50",
  warn: "bg-amber-50",
  bad: "bg-rose-50",
};
const STATUS_TEXT: Record<VarStatus, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
};
const STATUS_DOT: Record<VarStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  bad: "bg-rose-500",
};

function useTicker(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function fmt(n: number | null, digits = 2) {
  if (n === null || isNaN(n)) return "—";
  return n.toFixed(digits);
}

function evaluate(value: number | null, min: number, max: number): VarStatus {
  if (value === null || isNaN(value)) return "ok";
  if (value < min || value > max) return "bad";
  const range = max - min;
  const margin = range * 0.1;
  if (value < min + margin || value > max - margin) return "warn";
  return "ok";
}

function statusFromLiberacion(s: string): VarStatus {
  const v = (s || "").toLowerCase();
  if (v === "liberado" || v === "l" || v === "ok") return "ok";
  if (v === "condicional" || v === "c") return "warn";
  if (v === "no_conforme" || v === "no conforme" || v === "nc") return "bad";
  return "warn";
}

function labelLiberacion(s: string): string {
  const v = (s || "").toLowerCase();
  if (v === "liberado" || v === "l" || v === "ok") return "OK";
  if (v === "condicional" || v === "c") return "COND.";
  if (v === "no_conforme" || v === "no conforme" || v === "nc") return "NC";
  return "—";
}

function KpiTile({
  label,
  value,
  unit,
  tone,
  icon: Icon,
  pulse,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "cyan" | "green" | "amber" | "red" | "slate";
  icon: React.ComponentType<{ className?: string }>;
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    cyan: "from-cyan-50 to-white border-cyan-300/70 text-cyan-700",
    green: "from-emerald-50 to-white border-emerald-300/70 text-emerald-700",
    amber: "from-amber-50 to-white border-amber-300/70 text-amber-700",
    red: "from-rose-50 to-white border-rose-300/70 text-rose-700",
    slate: "from-slate-50 to-white border-slate-300/70 text-slate-700",
  };
  const dots: Record<string, string> = {
    cyan: "bg-cyan-500",
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-rose-500",
    slate: "bg-slate-400",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br ${tones[tone]} p-5 shadow-sm`}
    >
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${dots[tone]} ${pulse ? "animate-pulse" : ""}`}
        />
        <Icon className="h-5 w-5 opacity-70" />
      </div>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-[68px] font-black leading-none tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-lg font-semibold text-slate-500">{unit}</span>
        )}
      </div>
    </div>
  );
}

function QualityCard({
  label,
  value,
  unit,
  min,
  obj,
  max,
  status,
  digits,
}: {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  obj: number;
  max: number;
  status: VarStatus;
  digits: number;
}) {
  const pct =
    value === null || max === min
      ? 50
      : Math.max(2, Math.min(98, ((value - min) / (max - min)) * 100));
  return (
    <div
      className={`relative rounded-2xl border-2 border-slate-200 ${STATUS_BG[status]} p-5 ring-4 ${STATUS_RING[status]} transition-all`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
          {label}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-current/30 bg-white/70 px-2.5 py-1 text-[11px] font-bold ${STATUS_TEXT[status]}`}
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          {status === "ok" ? "OK" : status === "warn" ? "ATENCIÓN" : "CRÍTICO"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`font-mono text-[56px] font-black leading-none tabular-nums ${STATUS_TEXT[status]}`}
        >
          {fmt(value, digits)}
        </span>
        <span className="text-base font-semibold text-slate-500">{unit}</span>
      </div>
      <div className="mt-4">
        <div className="relative h-2.5 w-full rounded-full bg-slate-200">
          <div className="absolute inset-y-0 left-[10%] right-[10%] rounded-full bg-emerald-200/70" />
          <div
            className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700"
            style={{ left: "50%" }}
            title="Objetivo"
          />
          <div
            className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white ${STATUS_DOT[status]} shadow-md`}
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
          <span>{min}</span>
          <span>obj {obj}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="truncate text-sm font-bold text-slate-800">
        {value || "—"}
      </span>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: VarStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[tone]}`} />
      {label}
    </span>
  );
}

// ---------- variables prioritarias para tarjetas grandes ----------
const TARJETAS_CLAVE = [
  "pesoBase",
  "humedad",
  "calibre",
  "diametro",
  "relMDCD",
  "anchoUtil",
];

function OperatorVisionPage() {
  const { maquina } = Route.useSearch();
  const now = useTicker(1000);

  const { data, isLoading, error } = useQuery({
    queryKey: ["operator-vision", maquina],
    queryFn: () => getOperatorVisionData({ data: { maquina } }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const muestras = data?.muestras ?? [];
  const current = muestras[muestras.length - 1];
  const orden = data?.orden;
  const variables = data?.variables ?? [];

  const rollosOK = muestras.filter((m) => statusFromLiberacion(m.estatus) === "ok").length;
  const rollosNC = muestras.filter((m) => statusFromLiberacion(m.estatus) === "bad").length;

  const ncConsecutivos = useMemo(() => {
    let count = 0;
    for (let i = muestras.length - 1; i >= 0; i--) {
      if (statusFromLiberacion(muestras[i].estatus) === "bad") count++;
      else break;
    }
    return count;
  }, [muestras]);
  const ncAlerta = ncConsecutivos >= 2;

  // Minutos desde la última captura real
  const lastCaptureMin = useMemo(() => {
    if (!current) return 0;
    const diff = now.getTime() - new Date(current.capturadoAt).getTime();
    return Math.max(0, Math.floor(diff / 60_000));
  }, [now, current]);

  const sinCapturaTone: "green" | "amber" | "red" =
    lastCaptureMin < 30 ? "green" : lastCaptureMin < 60 ? "amber" : "red";

  // Estado de máquina
  const estadoMaquinaRaw = data?.estadoMaquina?.estado ?? "libre";
  const machineStatus: VarStatus =
    estadoMaquinaRaw === "produciendo"
      ? "ok"
      : estadoMaquinaRaw === "paro"
        ? "bad"
        : "warn";
  const machineLabel = estadoMaquinaRaw.toUpperCase();

  // % cumplimiento de la orden
  const cumplimiento =
    orden && orden.objetivoKg && orden.objetivoKg > 0
      ? (orden.producidoKg / orden.objetivoKg) * 100
      : null;

  // Mapa rápido de mediciones del rollo actual por clave
  const mapMedActual = useMemo(() => {
    const m = new Map<string, number | null>();
    current?.mediciones.forEach((x: { clave: string; valor: number | null }) =>
      m.set(x.clave, x.valor),
    );
    return m;
  }, [current]);

  // Tarjetas de calidad: usa los rangos del spec
  const qualityCards = TARJETAS_CLAVE.map((clave) =>
    variables.find((v) => v.clave === clave),
  ).filter(Boolean) as typeof variables;

  const fechaStr = now.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const horaStr = now.toLocaleTimeString("es-MX", { hour12: false });

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div
      className="min-h-screen w-full overflow-hidden bg-slate-50 text-slate-900"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    >
      {/* Alerta NC consecutivos */}
      {ncAlerta && (
        <div className="pointer-events-none fixed inset-0 z-[60] animate-[ncFlash_2s_ease-in-out_infinite]">
          <div className="absolute inset-0 bg-rose-600/25 mix-blend-multiply" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="select-none font-black uppercase tracking-[0.25em] text-rose-600/30"
              style={{ fontSize: "clamp(80px, 14vw, 260px)", transform: "rotate(-18deg)" }}
            >
              NO CONFORME
            </div>
          </div>
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full border-2 border-rose-600 bg-white/95 px-6 py-2 text-base font-black uppercase tracking-widest text-rose-700 shadow-lg">
            ⚠ {ncConsecutivos} rollos NC consecutivos — atención inmediata
          </div>
          <style>{`@keyframes ncFlash { 0%,100% { opacity: 0.25 } 50% { opacity: 1 } }`}</style>
        </div>
      )}

      {/* HEADER */}
      <header className="relative border-b-2 border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-6 px-8 py-4">
          <div className="flex items-center gap-3">
            <img
              src={logoConvertipap}
              alt="Convertipap"
              className="h-15 w-auto object-contain"
              style={{ height: "3.75rem" }}
            />
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-900">
                Fabricación <span className="text-cyan-700">Tissue</span>
                <span className="ml-3 rounded-md bg-slate-900 px-2.5 py-1 align-middle font-mono text-base font-black tracking-wider text-white">
                  {maquina}
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto grid grid-cols-5 gap-x-8 gap-y-1 text-sm">
            <HeaderField label="Producto" value={orden?.producto ?? ""} />
            <HeaderField label="OF" value={orden?.folio ?? ""} />
            <HeaderField label="Turno" value={orden?.turno ? `T${orden.turno}` : current?.turno ? `T${current.turno}` : ""} />
            <HeaderField label="Operador" value={current?.operador ?? ""} />
            <HeaderField label="Analista" value={current?.analista ?? ""} />
          </div>

          <div className="flex items-center gap-4 pl-6">
            <div
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wider ${
                machineStatus === "ok"
                  ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                  : machineStatus === "warn"
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-rose-500 bg-rose-50 text-rose-700"
              }`}
            >
              <Radio className="h-4 w-4 animate-pulse" />
              {machineLabel}
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-black tabular-nums text-slate-900">
                {horaStr}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {fechaStr}
              </div>
            </div>
            <button
              onClick={goFullscreen}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100"
              title="Pantalla completa"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Banner de estado de carga / error */}
      {isLoading && !data && (
        <div className="px-8 pt-4 text-center text-sm font-semibold text-slate-500">
          Cargando datos de la máquina…
        </div>
      )}
      {error && (
        <div className="mx-8 mt-4 rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700">
          Error al consultar datos en tiempo real: {(error as Error).message}
        </div>
      )}

      {/* KPIs */}
      <section className="px-8 pt-6">
        <div className="grid grid-cols-6 gap-4">
          <KpiTile
            label="Cumplimiento"
            value={cumplimiento === null ? "—" : cumplimiento.toFixed(1)}
            unit="%"
            tone={
              cumplimiento === null
                ? "slate"
                : cumplimiento >= 90
                  ? "green"
                  : cumplimiento >= 80
                    ? "amber"
                    : "red"
            }
            icon={TrendingUp}
          />
          <KpiTile
            label="Producido"
            value={orden ? Math.round(orden.producidoKg).toString() : "—"}
            unit="kg"
            tone="cyan"
            icon={Gauge}
          />
          <KpiTile
            label="Rollos prod."
            value={orden ? orden.producidoRollos.toString() : "—"}
            tone="cyan"
            icon={Activity}
            pulse
          />
          <KpiTile
            label="Rollos OK"
            value={rollosOK.toString()}
            tone="green"
            icon={CheckCircle2}
          />
          <KpiTile
            label="No Conformes"
            value={rollosNC.toString()}
            tone={rollosNC === 0 ? "slate" : "red"}
            icon={XCircle}
            pulse={rollosNC > 0}
          />
          <KpiTile
            label="Sin Captura"
            value={`${lastCaptureMin}`}
            unit="min"
            tone={sinCapturaTone}
            icon={Timer}
            pulse={sinCapturaTone === "red"}
          />
        </div>
      </section>

      {/* CALIDAD ROLLO ACTUAL */}
      <section className="px-8 pt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
              Calidad · Rollo actual
            </h2>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono text-4xl font-black tracking-tight text-slate-900">
                {current?.rollo ?? "—"}
              </span>
              {current && (
                <span className="text-sm font-semibold text-slate-500">
                  capturado{" "}
                  {new Date(current.capturadoAt).toLocaleTimeString("es-MX", {
                    hour12: false,
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <LegendDot tone="ok" label="En rango" />
            <LegendDot tone="warn" label="Cerca del límite" />
            <LegendDot tone="bad" label="Fuera de rango" />
          </div>
        </div>

        {qualityCards.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm font-semibold text-slate-500">
            No hay especificación activa para la orden en curso.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
            {qualityCards.map((v) => {
              const raw = mapMedActual.get(v.clave) ?? null;
              const status = evaluate(raw, v.min, v.max);
              const digits =
                v.clave === "diametro" || v.clave === "anchoUtil" ? 0 : 2;
              return (
                <QualityCard
                  key={v.clave}
                  label={v.etiqueta}
                  value={raw}
                  unit={v.unidad ?? ""}
                  min={v.min}
                  obj={v.objetivo}
                  max={v.max}
                  status={status}
                  digits={digits}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* TIMELINE ROLLOS */}
      <section className="px-8 py-6 pb-16">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
            Últimos rollos producidos
          </h2>
          <div className="text-[11px] font-semibold text-slate-400">
            ◄ más antiguos · más recientes ►
          </div>
        </div>
        <div className="relative rounded-2xl border-2 border-slate-200 bg-white/70 p-5 shadow-sm">
          {muestras.length === 0 ? (
            <div className="py-6 text-center text-sm font-semibold text-slate-400">
              Aún no hay capturas para esta máquina.
            </div>
          ) : (
            <div className="flex items-stretch gap-3 overflow-x-auto">
              {muestras.map((m, idx) => {
                const st = statusFromLiberacion(m.estatus);
                const color =
                  st === "ok"
                    ? "from-emerald-400 to-emerald-600 border-emerald-500"
                    : st === "warn"
                      ? "from-amber-300 to-amber-500 border-amber-500"
                      : "from-rose-400 to-rose-600 border-rose-600";
                const isCurrent = idx === muestras.length - 1;
                const hora = new Date(m.capturadoAt).toLocaleTimeString("es-MX", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={m.id}
                    className={`min-w-[140px] flex-1 rounded-xl border-2 bg-gradient-to-br ${color} p-3 text-white shadow ${
                      isCurrent ? "ring-4 ring-cyan-400/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-90">
                      <span>{hora}</span>
                      <span>{labelLiberacion(m.estatus)}</span>
                    </div>
                    <div className="mt-1 font-mono text-2xl font-black tabular-nums">
                      {m.rollo}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold opacity-90">
                      {st === "ok" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : st === "warn" ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span>T{m.turno}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-slate-200 bg-white/90 px-8 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Realtime conectado · Convertipap Quality Flow
          </div>
          <div>
            Actualización cada 10 s · {data?.maquina?.area || "Conversión Tissue"}
          </div>
        </div>
      </footer>
    </div>
  );
}
