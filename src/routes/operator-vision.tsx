import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDot,
  Droplets,
  Gauge,
  Maximize2,
  Move3d,
  PlayCircle,
  Radio,
  Ruler,
  Scale,
  Timer,
} from "lucide-react";
import { getOperatorVisionData } from "@/lib/operator-vision.functions";
import logoConvertipap from "@/assets/logo-convertipap.png";

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
type VarStatus = "ok" | "warn" | "bad" | "none";

function useTicker(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return n.toFixed(digits);
}

function evaluate(value: number | null, min: number, max: number): VarStatus {
  if (value === null || isNaN(value)) return "none";
  if (value < min || value > max) return "bad";
  const range = max - min;
  if (range <= 0) return "ok";
  const margin = range * 0.1;
  if (value < min + margin || value > max - margin) return "warn";
  return "ok";
}

function statusFromLiberacion(s: string): VarStatus {
  const v = (s || "").toLowerCase();
  if (v === "liberado" || v === "l" || v === "ok") return "ok";
  if (v === "condicional" || v === "c" || v === "advertencia") return "warn";
  if (v === "no_conforme" || v === "no conforme" || v === "nc" || v === "rechazado")
    return "bad";
  return "warn";
}

function labelLiberacion(s: VarStatus): string {
  if (s === "ok") return "CONFORME";
  if (s === "warn") return "ADVERTENCIA";
  if (s === "bad") return "NO CONFORME";
  return "—";
}

// ---------- Variables del rollo actual ----------
type CardKey = "pesoBase" | "calibre" | "humedad" | "anchoUtil" | "diametro";

const CARD_DEF: Record<
  CardKey,
  { etiqueta: string; unidad: string; digits: number; icon: React.ComponentType<{ className?: string }> }
> = {
  pesoBase: { etiqueta: "Peso Base", unidad: "g/m²", digits: 2, icon: Scale },
  calibre: { etiqueta: "Calibre", unidad: "mm", digits: 3, icon: Move3d },
  humedad: { etiqueta: "Humedad", unidad: "%", digits: 2, icon: Droplets },
  anchoUtil: { etiqueta: "Ancho Útil", unidad: "mm", digits: 0, icon: Ruler },
  diametro: { etiqueta: "Diámetro", unidad: "mm", digits: 0, icon: CircleDot },
};
const CARD_KEYS: CardKey[] = ["pesoBase", "calibre", "humedad", "anchoUtil", "diametro"];

// ---------- KPI ----------
function KpiCard({
  label,
  value,
  unit,
  state,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string;
  unit?: string;
  state: "ok" | "warn" | "bad" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  const palette: Record<typeof state, string> = {
    ok: "bg-white border-emerald-300 text-emerald-700",
    warn: "bg-amber-50 border-amber-400 text-amber-700",
    bad: "bg-rose-50 border-rose-500 text-rose-700 animate-pulse",
    neutral: "bg-white border-slate-300 text-slate-600",
  };
  const valueColor: Record<typeof state, string> = {
    ok: "text-slate-900",
    warn: "text-amber-700",
    bad: "text-rose-700",
    neutral: "text-slate-900",
  };
  return (
    <div className={`rounded-2xl border-[3px] ${palette[state]} px-6 py-5 flex flex-col shadow-md`}>
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-black uppercase tracking-[0.15em] text-slate-500">
          {label}
        </span>
        <Icon className="h-8 w-8 opacity-60" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-mono text-[88px] font-black leading-none tabular-nums ${valueColor[state]}`}>
          {value}
        </span>
        {unit && <span className="text-2xl font-bold text-slate-500">{unit}</span>}
      </div>
      {subtitle && (
        <div className={`mt-2 text-[15px] font-black uppercase tracking-wider`}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ---------- Variable card ----------
function VarCard({
  ck,
  value,
  min,
  max,
  obj,
  hasSpec,
}: {
  ck: CardKey;
  value: number | null;
  min: number;
  max: number;
  obj: number;
  hasSpec: boolean;
}) {
  const def = CARD_DEF[ck];
  const Icon = def.icon;
  const st = hasSpec ? evaluate(value, min, max) : "none";

  const ring =
    st === "bad"
      ? "border-rose-500 bg-rose-50 ring-2 ring-rose-400/60 animate-[varPulse_1.6s_ease-in-out_infinite]"
      : st === "warn"
        ? "border-amber-400 bg-amber-50"
        : st === "ok"
          ? "border-emerald-300 bg-white"
          : "border-slate-200 bg-white";

  const stateLabel =
    st === "bad" ? "FUERA" : st === "warn" ? "CERCA" : st === "ok" ? "OK" : "—";
  const stateColor =
    st === "bad"
      ? "text-rose-700"
      : st === "warn"
        ? "text-amber-700"
        : st === "ok"
          ? "text-emerald-700"
          : "text-slate-400";

  return (
    <div className={`rounded-2xl border-[3px] ${ring} p-5 flex flex-col`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-7 w-7 text-slate-500" />
          <span className="text-[18px] font-black uppercase tracking-wider text-slate-600">
            {def.etiqueta}
          </span>
        </div>
        <span className={`text-[16px] font-black uppercase ${stateColor}`}>{stateLabel}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-[96px] font-black leading-none tabular-nums text-slate-900">
          {fmt(value, def.digits)}
        </span>
        <span className="text-2xl font-bold text-slate-500">{def.unidad}</span>
      </div>
      <div className="mt-3 text-[16px] font-semibold text-slate-500 tabular-nums">
        {hasSpec ? `(${fmt(min, def.digits)} – ${fmt(max, def.digits)})` : "Sin especificación"}
      </div>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="truncate text-lg font-bold text-slate-800">{value || "-"}</span>
    </div>
  );
}

function OperatorVisionPage() {
  const { maquina } = Route.useSearch();
  const now = useTicker(1000);

  const { data, error } = useQuery({
    queryKey: ["operator-vision", maquina],
    queryFn: () => getOperatorVisionData({ data: { maquina } }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const muestrasAll = data?.muestras ?? [];
  const muestras = muestrasAll.slice(-5);
  const current = muestrasAll[muestrasAll.length - 1];
  const orden = data?.orden;
  const variables = data?.variables ?? [];

  // Estatus efectivo del rollo actual evaluando sus variables vs spec
  const mapMedActual = useMemo(() => {
    const m = new Map<string, number | null>();
    current?.mediciones.forEach((x: { clave: string; valor: number | null }) => m.set(x.clave, x.valor));
    return m;
  }, [current]);

  function evalRollo(m: typeof muestrasAll[number] | undefined): VarStatus {
    if (!m) return "none";
    // Si hay dictamen explícito úsalo
    const fromDict = statusFromLiberacion(m.estatus);
    if (fromDict !== "warn" || m.estatus) {
      // si está liberado o no conforme, respeta
      if (fromDict === "ok" || fromDict === "bad") return fromDict;
    }
    // Evalúa variables vs spec si hay
    let worst: VarStatus = "ok";
    for (const v of variables) {
      const med = m.mediciones.find((x: { clave: string; valor: number | null }) => x.clave === v.clave);
      if (!med || med.valor === null) continue;
      const s = evaluate(Number(med.valor), v.min, v.max);
      if (s === "bad") return "bad";
      if (s === "warn") worst = "warn";
    }
    return worst;
  }

  const currentStatus = evalRollo(current);

  // Contadores sobre todas las muestras conocidas
  const rollosOK = muestrasAll.filter((m) => evalRollo(m) === "ok").length;
  const rollosNC = muestrasAll.filter((m) => evalRollo(m) === "bad").length;

  // NC consecutivos al final
  const ncConsecutivos = useMemo(() => {
    let count = 0;
    for (let i = muestrasAll.length - 1; i >= 0; i--) {
      if (evalRollo(muestrasAll[i]) === "bad") count++;
      else break;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muestrasAll, variables]);

  const alertaCritica = ncConsecutivos >= 2;
  const advertencia = ncConsecutivos === 1;

  // Total de alertas activas (warn + bad recientes)
  const alertasCount = muestrasAll.slice(-10).filter((m) => {
    const s = evalRollo(m);
    return s === "warn" || s === "bad";
  }).length;

  // Minutos sin captura
  const lastCaptureMin = useMemo(() => {
    if (!current) return null;
    const diff = now.getTime() - new Date(current.capturadoAt).getTime();
    return Math.max(0, Math.floor(diff / 60_000));
  }, [now, current]);

  const sinCapturaState: "ok" | "warn" | "bad" | "neutral" =
    lastCaptureMin === null
      ? "neutral"
      : lastCaptureMin < 30
        ? "ok"
        : lastCaptureMin < 60
          ? "warn"
          : "bad";

  // Estado de máquina
  const estadoMaquinaRaw = data?.estadoMaquina?.estado ?? null;
  const produciendo = estadoMaquinaRaw === "produciendo";
  const enParo = estadoMaquinaRaw === "paro";

  const fechaStr = now
    .toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" })
    .toUpperCase();
  const horaStr = now.toLocaleTimeString("es-MX", { hour12: false });

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 text-slate-900">
      <style>{`
        @keyframes varPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.5);} 50% { box-shadow: 0 0 0 8px rgba(244,63,94,0);} }
        @keyframes critFlash { 0%,100% { background-color: rgb(225,29,72); } 50% { background-color: rgb(159,18,57); } }
      `}</style>

      {/* HEADER */}
      <header className="shrink-0 border-b-2 border-slate-200 bg-white">
        <div className="flex items-center gap-5 px-6 py-4">
          {/* Logo + título + máquina */}
          <div className="flex items-center gap-4">
            <img
              src={logoConvertipap}
              alt="Convertipap"
              className="h-16 w-auto shrink-0 object-contain"
            />
            <div>
              <div className="text-[14px] font-black uppercase tracking-[0.2em] text-slate-500">
                Máquina{" "}
                <span className="ml-1 rounded bg-emerald-600 px-2.5 py-1 font-mono text-lg text-white">
                  {maquina}
                </span>
              </div>
              <div className="text-3xl font-black tracking-tight text-slate-900">
                VISIÓN OPERADOR
              </div>
            </div>
          </div>

          {/* Estado producción central */}
          <div className="mx-auto">
            {enParo ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-rose-400 bg-rose-50 px-5 py-2">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider text-rose-700">
                    Máquina en paro
                  </div>
                  <div className="text-[11px] font-semibold text-rose-600">
                    Sin producción activa
                  </div>
                </div>
              </div>
            ) : produciendo ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-5 py-2">
                <PlayCircle className="h-6 w-6 text-emerald-600" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider text-emerald-700">
                    Producción Activa
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600">
                    Sistema funcionando correctamente
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border-2 border-slate-300 bg-slate-50 px-5 py-2">
                <Radio className="h-6 w-6 text-slate-500" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider text-slate-700">
                    {(estadoMaquinaRaw ?? "Sin estado").toUpperCase()}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Esperando datos en tiempo real
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Reloj */}
          <div className="text-right">
            <div className="font-mono text-4xl font-black tabular-nums text-slate-900">
              {horaStr}
            </div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
              {fechaStr}
            </div>
          </div>

          {/* Alertas */}
          <div className="relative flex flex-col items-center">
            <Bell className={`h-7 w-7 ${alertasCount > 0 ? "text-rose-600" : "text-slate-400"}`} />
            {alertasCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-black text-white">
                {alertasCount}
              </span>
            )}
            <span className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Alertas
            </span>
          </div>

          {/* Estado de máquina pill */}
          <div
            className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wider ${
              produciendo
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : enParo
                  ? "border-rose-500 bg-rose-50 text-rose-700"
                  : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            <Radio className="h-4 w-4 animate-pulse" />
            {(estadoMaquinaRaw ?? "LIBRE").toUpperCase()}
          </div>

          <button
            onClick={goFullscreen}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100"
            title="Pantalla completa"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
        {/* Línea contextual */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-1.5">
          <div className="grid grid-cols-5 gap-x-8 text-xs">
            <HeaderField label="Producto" value={orden?.producto ?? ""} />
            <HeaderField label="OF" value={orden?.folio ?? ""} />
            <HeaderField
              label="Turno"
              value={orden?.turno ? `T${orden.turno}` : current?.turno ? `T${current.turno}` : ""}
            />
            <HeaderField label="Operador" value={current?.operador ?? ""} />
            <HeaderField label="Analista" value={current?.analista ?? ""} />
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-2 rounded-lg border-2 border-rose-300 bg-rose-50 p-2 text-sm font-bold text-rose-700">
          Error al consultar datos: {(error as Error).message}
        </div>
      )}

      {/* MAIN */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-3">
        {/* KPIs */}
        <section className="shrink-0 grid grid-cols-5 gap-3">
          <KpiCard
            label="Rollos Producidos"
            value={rollosOK.toString()}
            state={rollosOK > 0 ? "ok" : "neutral"}
            icon={CheckCircle2}
            subtitle="OK"
          />
          <KpiCard
            label="No Conformes"
            value={rollosNC.toString()}
            state={rollosNC === 0 ? "ok" : "bad"}
            icon={AlertTriangle}
            subtitle={rollosNC === 0 ? "OK" : "REVISAR"}
          />
          <KpiCard
            label="Rollo Actual"
            value={current?.rollo ? String(current.rollo) : "-"}
            state={
              currentStatus === "bad"
                ? "bad"
                : currentStatus === "warn"
                  ? "warn"
                  : currentStatus === "ok"
                    ? "ok"
                    : "neutral"
            }
            icon={CircleDot}
            subtitle={labelLiberacion(currentStatus)}
          />
          <KpiCard
            label="Tiempo Sin Captura"
            value={lastCaptureMin === null ? "-" : String(lastCaptureMin)}
            unit="min"
            state={sinCapturaState}
            icon={Timer}
            subtitle={
              lastCaptureMin === null
                ? "—"
                : sinCapturaState === "ok"
                  ? "EN RANGO"
                  : sinCapturaState === "warn"
                    ? "ATENCIÓN"
                    : "CRÍTICO"
            }
          />
          <KpiCard
            label="Velocidad Máquina"
            value="-"
            unit="m/min"
            state="neutral"
            icon={Gauge}
            subtitle="SIN DATO"
          />
        </section>

        {/* ROLLO ACTUAL — variables críticas */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div
            className={`mb-2 flex items-center justify-between rounded-t-lg border-2 px-4 py-2 ${
              currentStatus === "bad"
                ? "border-rose-500 bg-rose-600 text-white"
                : currentStatus === "warn"
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-emerald-500 bg-emerald-600 text-white"
            }`}
          >
            <h2 className="text-sm font-black uppercase tracking-[0.2em]">
              Rollo Actual
              {current?.rollo && <span className="ml-3 font-mono">#{current.rollo}</span>}
            </h2>
            <span className="text-sm font-black uppercase tracking-wider">
              {labelLiberacion(currentStatus)}
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
            {CARD_KEYS.map((ck) => {
              const v = variables.find((x) => x.clave === ck);
              const value = mapMedActual.get(ck);
              return (
                <VarCard
                  key={ck}
                  ck={ck}
                  value={value === undefined ? null : value}
                  min={v?.min ?? 0}
                  max={v?.max ?? 0}
                  obj={v?.objetivo ?? 0}
                  hasSpec={!!v}
                />
              );
            })}
          </div>
        </section>

        {/* ALERTA CRÍTICA */}
        {alertaCritica && (
          <section className="shrink-0">
            <div
              className="flex items-center gap-4 rounded-xl border-2 border-rose-700 px-5 py-3 text-white shadow-lg"
              style={{ animation: "critFlash 1s ease-in-out infinite" }}
            >
              <AlertTriangle className="h-10 w-10" />
              <div className="flex-1">
                <div className="text-lg font-black uppercase tracking-widest">
                  Alerta Crítica
                </div>
                <div className="text-sm font-bold">
                  {ncConsecutivos} rollos consecutivos fuera de especificación · revisar ajustes
                  de máquina
                </div>
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-2 text-2xl">🚨</div>
            </div>
          </section>
        )}
        {!alertaCritica && advertencia && (
          <section className="shrink-0">
            <div className="flex items-center gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-2 text-amber-800">
              <AlertTriangle className="h-6 w-6" />
              <div className="text-sm font-black uppercase tracking-wider">
                Advertencia · 1 rollo fuera de especificación
              </div>
            </div>
          </section>
        )}

        {/* HISTORIAL ÚLTIMOS 5 */}
        <section className="shrink-0">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
              Últimos rollos producidos
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">
              últimos 5 · más recientes a la derecha
            </span>
          </div>
          {muestras.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white py-4 text-center text-xs font-semibold text-slate-400">
              Aún no hay capturas para esta máquina.
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, idx) => {
                const m = muestras[idx];
                if (!m) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="rounded-xl border-2 border-dashed border-slate-200 bg-white/50 px-3 py-2 text-center text-xs font-semibold text-slate-300"
                    >
                      —
                    </div>
                  );
                }
                const st = evalRollo(m);
                const hora = new Date(m.capturadoAt).toLocaleTimeString("es-MX", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const styles =
                  st === "ok"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : st === "warn"
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : st === "bad"
                        ? "border-rose-500 bg-rose-50 text-rose-800"
                        : "border-slate-300 bg-white text-slate-700";
                const Icon =
                  st === "ok"
                    ? CheckCircle2
                    : st === "warn"
                      ? AlertTriangle
                      : st === "bad"
                        ? AlertTriangle
                        : CircleDot;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col rounded-xl border-2 ${styles} px-3 py-2 shadow-sm`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-black uppercase">
                      <span>{hora}</span>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="mt-0.5 font-mono text-lg font-black tabular-nums">
                      ROLLO #{m.rollo}
                    </div>
                    <div className="text-[11px] font-black uppercase tracking-wider">
                      {labelLiberacion(st)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="shrink-0 border-t-2 border-slate-200 bg-white px-6 py-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            A Tissue System · datos en tiempo real desde la base de datos
          </div>
          <div>
            Actualización cada 30 s · {data?.maquina?.area || "Conversión Tissue"}
          </div>
        </div>
      </footer>
    </div>
  );
}
