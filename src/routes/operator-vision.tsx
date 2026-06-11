import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import html2canvas from "html2canvas-pro";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Gauge,
  Maximize2,
  Timer,
} from "lucide-react";
import { getOperatorVisionData } from "@/lib/operator-vision.functions";
import { useOperatorVisionRealtime } from "@/hooks/use-operator-vision-realtime";
import logoConvertipap from "@/assets/logo-convertipap.png";

const MAQUINAS_VALIDAS = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;
type MaquinaValida = (typeof MAQUINAS_VALIDAS)[number];

export const Route = createFileRoute("/operator-vision")({
  head: () => ({
    meta: [
      { title: "Visión Operador · Convertipap" },
      { name: "description", content: "Pantalla industrial de monitoreo en tiempo real" },
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
  if (n === null || n === undefined || isNaN(n)) return "—";
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

// Categorías de variables — clasificación por clave conocida
type CategoriaKey = "calidad" | "dimensiones" | "mecanicas" | "produccion" | "otras";
const CATEGORIA_META: Record<CategoriaKey, { titulo: string; accent: string }> = {
  calidad: { titulo: "Calidad", accent: "border-sky-400 bg-sky-500" },
  dimensiones: { titulo: "Dimensiones", accent: "border-indigo-400 bg-indigo-500" },
  mecanicas: { titulo: "Propiedades Mecánicas", accent: "border-violet-400 bg-violet-500" },
  produccion: { titulo: "Producción", accent: "border-teal-400 bg-teal-500" },
  otras: { titulo: "Otras Variables", accent: "border-slate-400 bg-slate-500" },
};

const CATEGORIA_DE_CLAVE: Record<string, CategoriaKey> = {
  pesoBase: "calidad",
  calibre: "calidad",
  humedad: "calidad",
  blancuraR457: "calidad",
  blancuraA: "calidad",
  blancuraB: "calidad",
  anchoUtil: "dimensiones",
  diametro: "dimensiones",
  tensionSecaMD: "mecanicas",
  tensionSecaCD: "mecanicas",
  relacionMDCD: "mecanicas",
  elongacionMD: "mecanicas",
  peso: "produccion",
  uniones: "produccion",
};

const DIGITS_DE_CLAVE: Record<string, number> = {
  pesoBase: 2,
  calibre: 3,
  humedad: 2,
  blancuraR457: 2,
  blancuraA: 2,
  blancuraB: 2,
  anchoUtil: 0,
  diametro: 0,
  tensionSecaMD: 2,
  tensionSecaCD: 2,
  relacionMDCD: 2,
  elongacionMD: 2,
  peso: 2,
  uniones: 0,
};

function classifyVariable(clave: string): CategoriaKey {
  return CATEGORIA_DE_CLAVE[clave] ?? "otras";
}

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
    ok: "bg-white border-emerald-400",
    warn: "bg-amber-50 border-amber-400",
    bad: "bg-rose-50 border-rose-500 animate-pulse",
    neutral: "bg-white border-slate-300",
  };
  const valueColor: Record<typeof state, string> = {
    ok: "text-slate-900",
    warn: "text-amber-700",
    bad: "text-rose-700",
    neutral: "text-slate-900",
  };
  const sub: Record<typeof state, string> = {
    ok: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
    neutral: "text-slate-500",
  };
  return (
    <div
      className={`flex h-[140px] flex-col rounded-2xl border-[3px] ${palette[state]} px-4 py-2.5 shadow-sm`}
    >

      <div className="flex items-center justify-between">
        <span className="truncate text-[13px] font-black uppercase tracking-[0.15em] text-slate-500">
          {label}
        </span>
        <Icon className="h-6 w-6 shrink-0 opacity-60" />
      </div>
      <div className="flex flex-1 items-end gap-2 overflow-hidden">
        <span
          className={`font-mono text-[64px] font-black leading-none tabular-nums ${valueColor[state]} truncate`}
        >
          {value}
        </span>
        {unit && (
          <span className="pb-1 text-xl font-bold text-slate-500 shrink-0">{unit}</span>
        )}
      </div>
      {subtitle && (
        <div
          className={`mt-1 truncate text-[12px] font-black uppercase tracking-wider ${sub[state]}`}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ---------- Rollo actual destacado ----------
function RolloActualCard({
  rollo,
  status,
  producto,
  hora,
}: {
  rollo: string;
  status: VarStatus;
  producto: string;
  hora: string;
}) {
  const stateCfg: Record<VarStatus, { bg: string; border: string; chip: string; text: string }> = {
    ok: {
      bg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
      border: "border-emerald-300",
      chip: "bg-white/20 text-white",
      text: "text-white",
    },
    warn: {
      bg: "bg-gradient-to-br from-amber-400 to-amber-600",
      border: "border-amber-300",
      chip: "bg-white/20 text-white",
      text: "text-white",
    },
    bad: {
      bg: "bg-gradient-to-br from-rose-500 to-rose-700 animate-pulse",
      border: "border-rose-300",
      chip: "bg-white/20 text-white",
      text: "text-white",
    },
    none: {
      bg: "bg-gradient-to-br from-slate-500 to-slate-700",
      border: "border-slate-300",
      chip: "bg-white/20 text-white",
      text: "text-white",
    },
  };
  const c = stateCfg[status];
  return (
    <div
      className={`flex h-[140px] flex-col justify-between rounded-2xl border-[3px] ${c.border} ${c.bg} px-5 py-2.5 shadow-lg ${c.text}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-black uppercase tracking-[0.2em] opacity-90">
          Rollo Actual
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${c.chip}`}
        >
          {labelLiberacion(status)}
        </span>
      </div>
      <div className="font-mono text-[64px] font-black leading-none tabular-nums truncate">
        {rollo || "—"}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] font-bold uppercase tracking-wider opacity-90">
        <span className="truncate">{producto || "—"}</span>
        <span className="shrink-0 font-mono tabular-nums">{hora}</span>
      </div>
    </div>
  );
}

// ---------- Variable card con barra MIN-OBJ-MAX ----------
function VarCard({
  etiqueta,
  unidad,
  value,
  min,
  max,
  obj,
  digits,
  hasSpec,
}: {
  etiqueta: string;
  unidad: string;
  value: number | null;
  min: number;
  max: number;
  obj: number;
  digits: number;
  hasSpec: boolean;
}) {
  const st = hasSpec ? evaluate(value, min, max) : "none";

  const ring =
    st === "bad"
      ? "border-rose-500 bg-rose-50 ring-2 ring-rose-400/60"
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

  // Posición del valor en la barra (0-100%)
  let pos = 50;
  if (hasSpec && value !== null && !isNaN(value)) {
    const span = max - min;
    if (span > 0) {
      pos = Math.max(0, Math.min(100, ((value - min) / span) * 100));
    }
  }
  const objPos = (() => {
    if (!hasSpec) return 50;
    const span = max - min;
    if (span <= 0) return 50;
    return Math.max(0, Math.min(100, ((obj - min) / span) * 100));
  })();

  const markerColor =
    st === "bad" ? "bg-rose-600" : st === "warn" ? "bg-amber-500" : "bg-emerald-600";

  return (
    <div className={`flex h-full min-h-[150px] flex-col rounded-xl border-[3px] ${ring} p-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-black uppercase leading-tight tracking-wider text-slate-700 break-words">
          {etiqueta}
        </span>
        <span className={`shrink-0 text-[12px] font-black uppercase ${stateColor}`}>
          {stateLabel}
        </span>
      </div>

      <div className="flex flex-1 items-baseline justify-center gap-1 overflow-hidden py-1">
        <span className="font-mono text-[48px] font-black leading-none tabular-nums text-slate-900">
          {fmt(value, digits)}
        </span>
        <span className="text-base font-bold text-slate-500 shrink-0">{unidad}</span>
      </div>

      {hasSpec ? (
        <>
          <div className="relative mt-1 h-2 rounded-full bg-slate-200">
            <div
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-slate-500"
              style={{ left: `${objPos}%` }}
            />
            {value !== null && !isNaN(value) && (
              <div
                className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${markerColor}`}
                style={{ left: `${pos}%` }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-bold tabular-nums text-slate-500">
            <span>MIN {fmt(min, digits)}</span>
            <span className="text-emerald-700">OBJ {fmt(obj, digits)}</span>
            <span>MAX {fmt(max, digits)}</span>
          </div>
        </>
      ) : (
        <div className="mt-2 text-center text-[12px] font-semibold text-slate-400">
          Sin especificación
        </div>
      )}
    </div>
  );
}

function HeaderField({
  label,
  value,
  className,
  noTruncate = false,
}: {
  label: string;
  value: string;
  className?: string;
  noTruncate?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span
        className={cn(
          noTruncate ? "whitespace-nowrap" : "truncate",
          "text-[14px] font-bold",
          className ?? "text-slate-800",
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function OperatorVisionPage() {
  const { maquina } = Route.useSearch();
  const now = useTicker(1000);
  const screenRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const { data, error, dataUpdatedAt, isError } = useQuery({
    queryKey: ["operator-vision", maquina],
    queryFn: () => getOperatorVisionData({ data: { maquina } }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    gcTime: 0,
  });

  // Realtime: invalida la query en cuanto cambian muestras, mediciones,
  // estado de máquina u órdenes para esta máquina.
  const realtimeStatus = useOperatorVisionRealtime(maquina);


  const muestrasAll = data?.muestras ?? [];
  const current = muestrasAll[muestrasAll.length - 1];
  const orden = data?.orden;
  const variables = data?.variables ?? [];

  const mapMedActual = useMemo(() => {
    const m = new Map<string, number | null>();
    current?.mediciones.forEach((x: { clave: string; valor: number | null }) =>
      m.set(x.clave, x.valor),
    );
    return m;
  }, [current]);

  const mapSpecActual = useMemo(() => {
    const m = new Map<string, { min: number | null; obj: number | null; max: number | null }>();
    current?.mediciones.forEach((x: any) => {
      m.set(x.clave, { min: x.min ?? null, obj: x.obj ?? null, max: x.max ?? null });
    });
    return m;
  }, [current]);

  // Universo de variables a mostrar: union de spec activa + claves presentes en rollo actual
  const variablesParaMostrar = useMemo(() => {
    const map = new Map<
      string,
      { clave: string; etiqueta: string; unidad: string; min: number; obj: number; max: number; hasSpec: boolean }
    >();
    for (const v of variables) {
      map.set(v.clave, {
        clave: v.clave,
        etiqueta: v.etiqueta || v.clave,
        unidad: v.unidad || "",
        min: Number(v.min),
        obj: Number(v.objetivo),
        max: Number(v.max),
        hasSpec: true,
      });
    }
    current?.mediciones.forEach((m: any) => {
      if (map.has(m.clave)) return;
      const hasSpec = m.min !== null && m.max !== null && m.obj !== null;
      map.set(m.clave, {
        clave: m.clave,
        etiqueta: m.clave,
        unidad: "",
        min: Number(m.min ?? 0),
        obj: Number(m.obj ?? 0),
        max: Number(m.max ?? 0),
        hasSpec,
      });
    });
    return Array.from(map.values());
  }, [variables, current]);

  const variablesPorCategoria = useMemo(() => {
    const groups: Record<CategoriaKey, typeof variablesParaMostrar> = {
      calidad: [],
      dimensiones: [],
      mecanicas: [],
      produccion: [],
      otras: [],
    };
    for (const v of variablesParaMostrar) {
      groups[classifyVariable(v.clave)].push(v);
    }
    return groups;
  }, [variablesParaMostrar]);

  function evalRollo(m: typeof muestrasAll[number] | undefined): VarStatus {
    if (!m) return "none";
    const fromDict = statusFromLiberacion(m.estatus);
    if (fromDict === "ok" || fromDict === "bad") return fromDict;
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

  const rollosOK = muestrasAll.filter((m) => evalRollo(m) === "ok").length;
  const rollosNC = muestrasAll.filter((m) => evalRollo(m) === "bad").length;

  const lastCaptureMin = useMemo(() => {
    if (!current) return null;
    const diff = now.getTime() - new Date(current.capturadoAt).getTime();
    return Math.max(0, Math.floor(diff / 60_000));
  }, [now, current]);

  // Umbrales según spec: <5 verde, 5-15 amarillo, >15 rojo
  const sinCapturaState: "ok" | "warn" | "bad" | "neutral" =
    lastCaptureMin === null
      ? "neutral"
      : lastCaptureMin < 5
        ? "ok"
        : lastCaptureMin <= 15
          ? "warn"
          : "bad";

  const alertasCount = muestrasAll.slice(-10).filter((m) => {
    const s = evalRollo(m);
    return s === "warn" || s === "bad";
  }).length;

  const estadoMaquinaRaw = data?.estadoMaquina?.estado ?? null;
  const produciendo = estadoMaquinaRaw === "produciendo";
  const enParo = estadoMaquinaRaw === "paro";
  const enPreparacion = estadoMaquinaRaw === "preparacion" || estadoMaquinaRaw === "setup";

  const estadoCfg = enParo
    ? { dot: "bg-rose-500", label: "PARADA", chip: "bg-rose-50 border-rose-400 text-rose-700" }
    : produciendo
      ? { dot: "bg-emerald-500", label: "PRODUCIENDO", chip: "bg-emerald-50 border-emerald-400 text-emerald-700" }
      : enPreparacion
        ? { dot: "bg-orange-500", label: "PREPARACIÓN", chip: "bg-orange-50 border-orange-400 text-orange-700" }
        : { dot: "bg-amber-500", label: "ESPERANDO DATOS", chip: "bg-amber-50 border-amber-400 text-amber-800" };

  const fechaStr = now
    .toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" })
    .toUpperCase();
  const horaStr = now.toLocaleTimeString("es-MX", { hour12: false });

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  async function capturarPantalla() {
    if (capturing) return;
    setCapturing(true);
    try {
      const target = screenRef.current ?? document.documentElement;
      const canvas = await html2canvas(target, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const turno = orden?.turno || current?.turno || "T";
      const turnoStr = String(turno).startsWith("T") ? String(turno) : `T${turno}`;
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
      const fileName = `CONVERTIPAP_${maquina}_${turnoStr}_${ts}.png`;
      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) return resolve();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      });
      toast.success("Captura guardada correctamente", { duration: 3000 });
    } catch (error) {
      console.error("SCREENSHOT ERROR", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`No se pudo capturar la pantalla: ${msg}`, { duration: 5000 });
    } finally {
      setCapturing(false);
    }
  }


  // historial compacto: últimos 10, más reciente primero
  const historial = useMemo(() => {
    return [...muestrasAll]
      .slice(-10)
      .reverse()
      .map((m) => {
        const r457 = m.mediciones.find(
          (x: { clave: string; valor: number | null }) => x.clave === "blancuraR457",
        )?.valor;
        return {
          id: m.id,
          rollo: m.rollo,
          hora: new Date(m.capturadoAt).toLocaleTimeString("es-MX", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
          r457: r457 ?? null,
          status: evalRollo(m),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muestrasAll, variables]);


  // Hora del rollo actual
  const horaRolloActual = current
    ? new Date(current.capturadoAt).toLocaleTimeString("es-MX", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div
      ref={screenRef}
      className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 text-slate-900"
    >
      <style>{`
        @keyframes varPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.5);} 50% { box-shadow: 0 0 0 8px rgba(244,63,94,0);} }
      `}</style>

      {/* HEADER (compacto, ~20% más bajo) */}
      <header className="shrink-0 border-b-2 border-slate-200 bg-white">
        <div className="flex items-center gap-4 px-5 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                Visión Operador
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-base font-black text-white">
                  {maquina}
                </span>
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${estadoCfg.chip}`}>
                  <span className={`h-2 w-2 animate-pulse rounded-full ${estadoCfg.dot}`} />
                  {estadoCfg.label}
                </span>
              </div>
            </div>
          </div>


          {/* Campos contextuales */}
          <div className="ml-2 grid min-w-0 flex-1 grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.2fr)] gap-x-6">
            <HeaderField label="Producto" value={orden?.producto ?? ""} />
            <HeaderField
              label="Turno"
              value={orden?.turno ? `T${orden.turno}` : current?.turno ? `T${current.turno}` : ""}
            />
            <HeaderField label="Operador" value={current?.operador ?? ""} />
            <HeaderField label="Analista" value={current?.analista ?? ""} />
            <HeaderField
              label="Cumplimiento"
              value={data?.cumplimientoTurno?.texto ?? ""}
              noTruncate
              className={
                (data?.cumplimientoTurno?.pct ?? 0) >= 90
                  ? "text-green-600"
                  : (data?.cumplimientoTurno?.pct ?? 0) >= 70
                    ? "text-yellow-600"
                    : "text-red-600"
              }
            />
          </div>

          {/* Reloj */}
          <div className="text-right">
            <div className="font-mono text-2xl font-black leading-none tabular-nums text-slate-900">
              {horaStr}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {fechaStr}
            </div>
          </div>

          {/* Alertas */}
          <div className="relative flex flex-col items-center">
            <Bell
              className={`h-6 w-6 ${alertasCount > 0 ? "text-rose-600" : "text-slate-400"}`}
            />
            {alertasCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                {alertasCount}
              </span>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button
              onClick={capturarPantalla}
              disabled={capturing}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              title="Capturar pantalla"
            >
              <Camera className="h-4 w-4" />
              {capturing ? "Capturando…" : "Capturar Pantalla"}
            </button>
            <button
              onClick={goFullscreen}
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
              title="Pantalla completa"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-5 mt-2 rounded-lg border-2 border-rose-300 bg-rose-50 p-2 text-sm font-bold text-rose-700">
          Error al consultar datos: {(error as Error).message}
        </div>
      )}

      {/* CUERPO: sidebar historial + main */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SIDEBAR HISTORIAL DEL TURNO */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r-2 border-slate-200 bg-white">
          <div className="shrink-0 border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-[13px] font-black uppercase tracking-[0.22em] text-slate-600">
              Historial del Turno
            </h2>
            <div className="mt-1.5 grid grid-cols-[56px_1fr_52px_14px] items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>HORA</span>
              <span>ROLLO</span>
              <span className="text-right">R457</span>
              <span>·</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {historial.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm font-semibold text-slate-400">
                Aún no hay capturas para este turno.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {historial.map((h) => {
                  const dot =
                    h.status === "ok"
                      ? "bg-emerald-500"
                      : h.status === "warn"
                        ? "bg-amber-500"
                        : h.status === "bad"
                          ? "bg-rose-500"
                          : "bg-slate-400";
                  const txt =
                    h.status === "bad"
                      ? "text-rose-700"
                      : h.status === "warn"
                        ? "text-amber-700"
                        : "text-slate-800";
                  return (
                    <li
                      key={h.id}
                      className="grid grid-cols-[56px_1fr_52px_14px] items-center gap-2 px-3 py-2 font-mono text-[15px] tabular-nums leading-tight"
                    >
                      <span className="font-semibold text-slate-500">{h.hora}</span>
                      <span className={`truncate font-extrabold ${txt}`}>{h.rollo}</span>
                      <span className="text-right font-bold text-slate-700">
                        {h.r457 === null || h.r457 === undefined ? "—" : h.r457.toFixed(1)}
                      </span>
                      <span className={`h-3 w-3 shrink-0 justify-self-end rounded-full ${dot}`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Logo Convertipap al pie de la columna */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
            <img
              src={logoConvertipap}
              alt="Convertipap"
              className="mx-auto h-[68px] w-full object-contain"
            />
          </div>
        </aside>



        {/* MAIN */}
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          {/* KPIs */}
          <section className="shrink-0 grid grid-cols-5 gap-2.5">
            <KpiCard
              label="Rollos Producidos"
              value={rollosOK.toString()}
              state={rollosOK > 0 ? "ok" : "neutral"}
              icon={CheckCircle2}
              subtitle="EN ESPECIFICACIÓN"
            />
            <KpiCard
              label="No Conformes"
              value={rollosNC.toString()}
              state={rollosNC === 0 ? "ok" : "bad"}
              icon={AlertTriangle}
              subtitle={rollosNC === 0 ? "SIN INCIDENCIAS" : "REVISAR PROCESO"}
            />
            <RolloActualCard
              rollo={current?.rollo ? String(current.rollo) : "—"}
              status={currentStatus}
              producto={orden?.producto ?? ""}
              hora={horaRolloActual}
            />
            <KpiCard
              label="Tiempo Sin Captura"
              value={lastCaptureMin === null ? "—" : String(lastCaptureMin)}
              unit="min"
              state={sinCapturaState}
              icon={Timer}
              subtitle={
                lastCaptureMin === null
                  ? "SIN DATOS"
                  : sinCapturaState === "ok"
                    ? "EN RANGO"
                    : sinCapturaState === "warn"
                      ? "ATENCIÓN"
                      : "CRÍTICO"
              }
            />
            <KpiCard
              label="Velocidad Máquina"
              value="—"
              unit="m/min"
              state="neutral"
              icon={Gauge}
              subtitle="SIN DATO"
            />
          </section>

          {/* VARIABLES — grid único compacto, sin scroll */}
          <section className="min-h-0 flex-1 overflow-hidden">
            {variablesParaMostrar.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-400">
                No hay variables activas para mostrar.
              </div>
            ) : (
              <div
                className="grid h-full"
                style={{
                  gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
                  gridAutoRows: "minmax(0, 1fr)",
                  gap: "10px",
                }}
              >

                {variablesParaMostrar.map((v) => (
                  <VarCard
                    key={v.clave}
                    etiqueta={v.etiqueta}
                    unidad={v.unidad}
                    value={
                      mapMedActual.get(v.clave) === undefined
                        ? null
                        : (mapMedActual.get(v.clave) as number | null)
                    }
                    min={v.min}
                    max={v.max}
                    obj={v.obj}
                    digits={DIGITS_DE_CLAVE[v.clave] ?? 2}
                    hasSpec={
                      v.hasSpec ||
                      (mapSpecActual.get(v.clave)?.min !== null &&
                        mapSpecActual.get(v.clave)?.max !== null &&
                        mapSpecActual.get(v.clave)?.obj !== null)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* FOOTER */}
      <footer className="shrink-0 border-t-2 border-slate-200 bg-white px-5 py-1.5">
        <div className="flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isError ? "bg-rose-500" : "animate-pulse bg-emerald-500"}`}
              />
              A Tissue System · monitoreo en tiempo real
            </div>
            {/* Indicador Realtime */}
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 normal-case tracking-normal ${
                realtimeStatus === "live"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : realtimeStatus === "offline"
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-slate-50 text-slate-600"
              }`}
              title={
                realtimeStatus === "live"
                  ? "Recibiendo eventos en tiempo real"
                  : realtimeStatus === "offline"
                    ? "Sin canal Realtime · usando refresco cada 60 s"
                    : "Conectando al canal Realtime"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  realtimeStatus === "live"
                    ? "animate-pulse bg-emerald-500"
                    : realtimeStatus === "offline"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                }`}
              />
              {realtimeStatus === "live"
                ? "LIVE"
                : realtimeStatus === "offline"
                  ? "POLLING"
                  : "CONECTANDO"}
            </span>
          </div>
          {isError && (
            <div className="flex items-center gap-2 rounded-md border-2 border-rose-400 bg-rose-50 px-3 py-1 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              Datos no actualizados · verificar conexión
            </div>
          )}
          <div className="flex items-center gap-4">
            <span>
              Última actualización:{" "}
              <span className="font-mono normal-case tracking-normal text-slate-700">
                {dataUpdatedAt
                  ? new Date(dataUpdatedAt).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })
                  : "—"}
              </span>
            </span>
            <span>
              {realtimeStatus === "live" ? "Realtime activo" : "Refresco 60 s"} ·{" "}
              {data?.maquina?.area || "Conversión Tissue"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
