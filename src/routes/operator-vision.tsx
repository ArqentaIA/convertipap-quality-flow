import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

import {
  QUALITY_VARIABLES,
  SAMPLE_MEASUREMENTS,
  DEFAULT_GENERAL,
  evaluateValue,
  type Measurement,
  type VarStatus,
} from "@/lib/qc-data";

export const Route = createFileRoute("/operator-vision")({
  head: () => ({
    meta: [
      { title: "Operator Vision · Convertipap" },
      { name: "description", content: "Pantalla operativa industrial en tiempo real" },
    ],
  }),
  component: OperatorVisionPage,
});

// ---------- helpers ----------
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
}: {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  obj: number;
  max: number;
  status: VarStatus;
}) {
  // bar position
  const pct =
    value === null
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
          {fmt(value, label === "Diámetro" || label === "Ancho útil" ? 0 : 2)}
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

function statusFromRelease(s: Measurement["estatus"]): VarStatus {
  return s === "L" ? "ok" : s === "C" ? "warn" : "bad";
}

function OperatorVisionPage() {
  const now = useTicker(1000);
  const info = DEFAULT_GENERAL;
  const measurements = SAMPLE_MEASUREMENTS;
  const current = measurements[measurements.length - 1];

  // KPIs derivados
  const rollosOK = measurements.filter((m) => m.estatus === "L").length;
  const rollosNC = measurements.filter((m) => m.estatus === "NC").length;

  // Tiempo sin captura desde el último rollo (simulado)
  const lastCaptureMin = useMemo(() => {
    // pretend last capture was ~3 min ago, growing live
    const base = 3 * 60_000;
    return Math.floor((base + (now.getTime() % 60_000)) / 60_000);
  }, [now]);

  const sinCapturaTone: "green" | "amber" | "red" =
    lastCaptureMin < 15 ? "green" : lastCaptureMin < 30 ? "amber" : "red";

  const machineStatus: VarStatus = "ok"; // could be derived
  const machineLabel = "OPERANDO";

  // Quality cards subset
  const wanted = [
    "pesoBase",
    "humedad",
    "calibre",
    "diametro",
    "relMDCD",
    "anchoUtil",
  ];
  const qualityCards = wanted
    .map((k) => QUALITY_VARIABLES.find((v) => v.key === k)!)
    .filter(Boolean);

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
      {/* ---------------- HEADER ---------------- */}
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
                {info.maquina} <span className="text-slate-400">/</span>{" "}
                <span className="text-cyan-700">{info.area}</span>
              </div>
            </div>
          </div>



          <div className="ml-auto grid grid-cols-5 gap-x-8 gap-y-1 text-sm">
            <HeaderField label="Producto" value={info.fabricacion} />
            <HeaderField label="OF" value={current.rollo.split("-")[0]} />
            <HeaderField label="Turno" value={`T${info.turno} · ${info.horaInicio}-${info.horaFin}`} />
            <HeaderField label="Operador" value={info.operador} />
            <HeaderField label="Analista" value={info.analista} />
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

      {/* ---------------- KPIs ---------------- */}
      <section className="px-8 pt-6">
        <div className="grid grid-cols-6 gap-4">
          <KpiTile
            label="Cumplimiento"
            value={info.cumplimiento.toFixed(1)}
            unit="%"
            tone={info.cumplimiento >= 90 ? "green" : info.cumplimiento >= 80 ? "amber" : "red"}
            icon={TrendingUp}
          />
          <KpiTile label="OEE" value="82.4" unit="%" tone="green" icon={Gauge} />
          <KpiTile
            label="Velocidad"
            value={info.velocidadMaquina.toString()}
            unit="m/min"
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

      {/* ---------------- CALIDAD ROLLO ACTUAL ---------------- */}
      <section className="px-8 pt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
              Calidad · Rollo actual
            </h2>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono text-4xl font-black tracking-tight text-slate-900">
                {current.rollo}
              </span>
              <span className="text-sm font-semibold text-slate-500">
                capturado {current.hora}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <LegendDot tone="ok" label="En rango" />
            <LegendDot tone="warn" label="Cerca del límite" />
            <LegendDot tone="bad" label="Fuera de rango" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {qualityCards.map((v) => {
            const raw = current[v.key as keyof Measurement] as number | null;
            const status = evaluateValue(v, raw);
            return (
              <QualityCard
                key={v.key}
                label={v.label}
                value={raw}
                unit={v.unit}
                min={v.min}
                obj={v.objective}
                max={v.max}
                status={status}
              />
            );
          })}
        </div>
      </section>

      {/* ---------------- TIMELINE ROLLOS ---------------- */}
      <section className="px-8 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
            Últimos rollos producidos
          </h2>
          <div className="text-[11px] font-semibold text-slate-400">
            ◄ más antiguos · más recientes ►
          </div>
        </div>
        <div className="relative rounded-2xl border-2 border-slate-200 bg-white/70 p-5 shadow-sm">
          <div className="flex items-stretch gap-3 overflow-x-auto">
            {measurements.map((m, idx) => {
              const st = statusFromRelease(m.estatus);
              const color =
                st === "ok"
                  ? "from-emerald-400 to-emerald-600 border-emerald-500"
                  : st === "warn"
                    ? "from-amber-300 to-amber-500 border-amber-500"
                    : "from-rose-400 to-rose-600 border-rose-600";
              const isCurrent = idx === measurements.length - 1;
              return (
                <div
                  key={m.id}
                  className={`min-w-[140px] flex-1 rounded-xl border-2 bg-gradient-to-br ${color} p-3 text-white shadow ${
                    isCurrent ? "ring-4 ring-cyan-400/70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-90">
                    <span>{m.hora}</span>
                    <span>
                      {m.estatus === "L"
                        ? "OK"
                        : m.estatus === "C"
                          ? "COND."
                          : "NC"}
                    </span>
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
                    <span>{m.pesoRollo ? `${m.pesoRollo} kg` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER STATUS BAR ---------------- */}
      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-slate-200 bg-white/90 px-8 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Realtime conectado · Convertipap Quality Flow
          </div>
          <div>
            Próxima captura recomendada · cada 30 min · Turno {info.turno}
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="truncate text-sm font-bold text-slate-800">{value}</span>
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
