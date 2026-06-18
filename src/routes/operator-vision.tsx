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
  Images,
  Maximize2,
  Timer,
  Weight,
} from "lucide-react";
import { getOperatorVisionData } from "@/lib/operator-vision.functions";
import { getTurnosConfig } from "@/lib/settings.functions";
import { useOperatorVisionRealtime } from "@/hooks/use-operator-vision-realtime";
import logoConvertipap from "@/assets/logo-convertipap.png";

// Convierte "HH:MM" en minutos desde 00:00 (hora local).
function hhmmToMin(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (isNaN(h) || isNaN(min)) return null;
  return h * 60 + min;
}

// Determina el turno actual ("1" | "2" | "3") según hora local y los rangos
// configurados en app_settings. Acepta turnos que cruzan medianoche (fin < inicio).
function computeTurnoActual(
  now: Date,
  s?: {
    turno1_inicio: string; turno1_fin: string;
    turno2_inicio: string; turno2_fin: string;
    turno3_inicio: string; turno3_fin: string;
  } | null,
): string | null {
  const ranges: Array<{ id: string; ini: string; fin: string }> = s
    ? [
        { id: "1", ini: s.turno1_inicio, fin: s.turno1_fin },
        { id: "2", ini: s.turno2_inicio, fin: s.turno2_fin },
        { id: "3", ini: s.turno3_inicio, fin: s.turno3_fin },
      ]
    : [
        { id: "1", ini: "07:00", fin: "15:00" },
        { id: "2", ini: "15:00", fin: "23:00" },
        { id: "3", ini: "23:00", fin: "07:00" },
      ];
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const r of ranges) {
    const ini = hhmmToMin(r.ini);
    const fin = hhmmToMin(r.fin);
    if (ini === null || fin === null) continue;
    const inRange = ini <= fin
      ? cur >= ini && cur < fin
      : cur >= ini || cur < fin; // cruza medianoche
    if (inRange) return r.id;
  }
  return null;
}

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

// Regla de oro: Tensión Seca MD/CD NO tienen tope superior crítico —
// rebasar el MAX no degrada calidad; sólo el mínimo es vinculante.
function esSinTopeSuperior(clave?: string): boolean {
  return clave === "tensionMD" || clave === "tensionCD";
}

function evaluate(
  value: number | null,
  min: number,
  max: number,
  clave?: string,
): VarStatus {
  if (value === null || isNaN(value)) return "none";
  const sinTope = esSinTopeSuperior(clave);
  if (value < min) return "bad";
  if (!sinTope && value > max) return "bad";
  const range = max - min;
  if (range <= 0) return "ok";
  const margin = range * 0.1;
  if (value < min + margin) return "warn";
  if (!sinTope && value > max - margin) return "warn";
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
  tensionMD: "mecanicas",
  tensionCD: "mecanicas",
  relMDCD: "mecanicas",
  elongMD: "mecanicas",
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
  tensionMD: 2,
  tensionCD: 2,
  relMDCD: 2,
  elongMD: 2,
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
      className={`flex h-full min-h-[110px] flex-col rounded-2xl border-[3px] ${palette[state]} px-3 py-1.5 shadow-sm`}
    >

      <div className="flex items-center justify-between">
        <span className="truncate text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
          {label}
        </span>
        <Icon className="h-4 w-4 shrink-0 opacity-60" />
      </div>
      <div className="flex flex-1 items-center justify-center gap-1.5 overflow-hidden">
        <span
          className={`font-mono text-[40px] font-black leading-none tabular-nums ${valueColor[state]} truncate`}
        >
          {value}
        </span>
        {unit && (
          <span className="pb-0.5 text-sm font-bold text-slate-500 shrink-0">{unit}</span>
        )}
      </div>
      {subtitle && (
        <div
          className={`mt-0.5 truncate text-[10px] font-black uppercase tracking-wider ${sub[state]}`}
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
  hallazgo,
  hallazgoCritico,
}: {
  rollo: string;
  status: VarStatus;
  producto: string;
  hora: string;
  hallazgo: string | null;
  hallazgoCritico: boolean;
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
      className={`flex h-full min-h-[110px] flex-col justify-between rounded-2xl border-[3px] ${c.border} ${c.bg} px-3 py-1.5 shadow-lg ${c.text}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.15em] opacity-90">
          Rollo Actual
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${c.chip}`}
        >
          {labelLiberacion(status)}
        </span>
      </div>
      <div className="font-mono text-[34px] font-black leading-none tabular-nums truncate">
        {rollo || "—"}
      </div>
      {hallazgo && (
        <div
          className={
            hallazgoCritico
              ? "truncate rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"
              : "truncate text-[10px] font-bold uppercase tracking-wider opacity-90"
          }
          title={hallazgo}
        >
          {hallazgo}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider opacity-90">
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
  isCritical = false,
  clave,
}: {
  etiqueta: string;
  unidad: string;
  value: number | null;
  min: number;
  max: number;
  obj: number;
  digits: number;
  hasSpec: boolean;
  isCritical?: boolean;
  clave?: string;
}) {
  const st = hasSpec ? evaluate(value, min, max, clave) : "none";

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

  const borderWidth = isCritical ? "border-[6px]" : "border-[3px]";
  const criticalRing = isCritical
    ? st === "bad"
      ? "ring-4 ring-rose-500/70"
      : "ring-2 ring-cyan-500/60"
    : "";

  return (
    <div className={`flex h-full min-h-[110px] flex-col rounded-xl ${borderWidth} ${ring} ${criticalRing} p-1.5`}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-black uppercase leading-tight tracking-wider text-slate-700 break-words">
          {etiqueta}
        </span>
        <span className={`shrink-0 text-[10px] font-black uppercase ${stateColor}`}>
          {stateLabel}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1 overflow-hidden py-0.5">
        <span className="font-mono text-[32px] font-black leading-none tabular-nums text-slate-900">
          {fmt(value, digits)}
        </span>
        <span className="text-[11px] font-bold text-slate-500 shrink-0">{unidad}</span>
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
          <div className="mt-0.5 flex justify-between text-[9px] font-bold tabular-nums text-slate-500">
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
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span
        className={cn(
          noTruncate ? "whitespace-nowrap" : "truncate",
          "text-[15px] font-bold",
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

  // Config de turnos (para derivar el turno real por hora del sistema).
  const { data: appSettings } = useQuery({
    queryKey: ["app-settings-turnos"],
    queryFn: () => getTurnosConfig(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });



  const muestrasAll = data?.muestras ?? [];
  const current = muestrasAll[muestrasAll.length - 1];
  const orden = data?.orden;

  // Turno actual derivado de la hora del sistema y los horarios configurados.
  // Es la fuente de verdad de la UI; el turno de la orden puede quedar obsoleto
  // si la orden se abrió en un turno anterior y sigue corriendo.
  const turnoActual = useMemo(
    () => computeTurnoActual(now, appSettings ?? null),
    [now, appSettings],
  );
  const turnoDisplay = turnoActual ?? (orden?.turno ? String(orden.turno) : current?.turno ? String(current.turno) : "");
  const turnoLabel = turnoDisplay ? (turnoDisplay.startsWith("T") ? turnoDisplay : `T${turnoDisplay}`) : "";
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
    // Regla de oro: evaluar las 3 variables críticas (Peso Base, Tensión MD/CD)
    // de forma estricta y simétrica sobre las mediciones de la muestra.
    const criticasKeys = new Set(["pesoBase", "tensionMD", "tensionCD"]);
    let forzarNC = false;
    for (const med of m.mediciones as Array<{ clave: string; valor: number | null; min: number | null; max: number | null }>) {
      if (!criticasKeys.has(med.clave)) continue;
      if (med.valor === null || !Number.isFinite(Number(med.valor))) continue;
      const v = Number(med.valor);
      if (Number.isFinite(Number(med.max)) && v > Number(med.max)) { forzarNC = true; break; }
      if (Number.isFinite(Number(med.min)) && v < Number(med.min)) { forzarNC = true; break; }
    }
    // Si fue liberado con justificación → amarillo siempre (trazabilidad).
    if ((m as any).liberadoConJustificacion) return "warn";
    if (forzarNC) return "bad";
    // Cae al estatus formal si está disponible, o evalúa por variables.
    const fromDict = statusFromLiberacion(m.estatus);
    if (fromDict === "bad") return "bad";
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

  // Cumplimiento técnico del turno: rollos en especificación / capturados
  // (misma lógica que los puntos del historial; no depende de la liberación formal de Calidad).
  const cumplimiento = useMemo(() => {
    const capturados = muestrasAll.length;
    const enSpec = rollosOK;
    const pct = capturados > 0 ? Number(((enSpec / capturados) * 100).toFixed(1)) : 0;
    return {
      enSpec,
      capturados,
      pct,
      texto: `${enSpec} en spec de ${capturados} capturados (${pct}%)`,
    };
  }, [muestrasAll.length, rollosOK]);

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
      const turnoStr = turnoLabel || "T";
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


  // Historial SCADA: TODOS los rollos del turno, más reciente primero,
  // con todas las variables técnicas evaluadas contra spec.
  const historial = useMemo(() => {
    return [...muestrasAll]
      .reverse()
      .map((m) => {
        const vars = variablesParaMostrar.map((v) => {
          const med = m.mediciones.find(
            (x: { clave: string; valor: number | null }) => x.clave === v.clave,
          );
          const valor = med?.valor ?? null;
          const status: VarStatus =
            valor === null || !v.hasSpec ? "none" : evaluate(Number(valor), v.min, v.max);
          return {
            clave: v.clave,
            etiqueta: v.etiqueta,
            unidad: v.unidad,
            valor,
            status,
          };
        });
        return {
          id: m.id,
          rollo: m.rollo,
          hora: new Date(m.capturadoAt).toLocaleTimeString("es-MX", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: evalRollo(m),
          vars,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muestrasAll, variables, variablesParaMostrar]);





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
        <div className="flex items-center gap-4 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-black uppercase tracking-[0.2em] text-slate-500">
                Visión Operador
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-lg font-black text-white">
                  {maquina}
                </span>
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-black uppercase tracking-wider ${estadoCfg.chip}`}>
                  <span className={`h-2 w-2 animate-pulse rounded-full ${estadoCfg.dot}`} />
                  {estadoCfg.label}
                </span>
              </div>
            </div>
          </div>


          {/* Campos contextuales */}
          <div className="ml-2 grid min-w-0 flex-1 grid-cols-4 gap-x-6">
            <HeaderField label="Turno" value={turnoLabel} />
            <HeaderField label="Operador" value={current?.operador ?? ""} />
            <HeaderField label="Analista" value={current?.analista ?? ""} />
            <HeaderField label="Producto" value={orden?.producto ?? ""} noTruncate />
          </div>

          {/* Reloj */}
          <div className="text-right">
            <div className="font-mono text-3xl font-black leading-none tabular-nums text-slate-900">
              {horaStr}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {fechaStr}
            </div>
          </div>


          {/* Alertas */}
          <div className="relative flex flex-col items-center">
            <Bell
              className={`h-7 w-7 ${alertasCount > 0 ? "text-rose-600" : "text-slate-400"}`}
            />
            {alertasCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-black text-white">
                {alertasCount}
              </span>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button
              onClick={capturarPantalla}
              disabled={capturing}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              title="Capturar pantalla"
            >
              <Camera className="h-5 w-5" />
              {capturing ? "Capturando…" : "Capturar Pantalla"}
            </button>
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

      {error && (
        <div className="mx-5 mt-2 rounded-lg border-2 border-rose-300 bg-rose-50 p-2 text-sm font-bold text-rose-700">
          Error al consultar datos: {(error as Error).message}
        </div>
      )}

      {/* CUERPO: main (último rollo + KPIs + historial tabla) + sidebar derecho */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* MAIN */}
        <main className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
          {/* CUADRÍCULA UNIFICADA — 16 tarjetas en orden fijo */}
          <section className="shrink-0">
            {(() => {
              const ORDER: Array<string> = [
                "calibre",
                "blancuraR457",
                "blancuraA",
                "blancuraB",
                "tensionMD",
                "tensionCD",
                "relMDCD",
                "elongMD",
                "humedad",
                "pesoBase",
                "anchoUtil",
                "diametro",
              ];
              const varByKey = new Map(variablesParaMostrar.map((v) => [v.clave, v]));
              return (
                <div
                  className="grid grid-cols-8 gap-2 [grid-auto-rows:135px] xl:[grid-auto-rows:150px] 2xl:[grid-auto-rows:160px]"
                >
                  {/* 1. Rollo Actual */}
                  <RolloActualCard
                    rollo={current?.rollo ? String(current.rollo) : "—"}
                    status={currentStatus}
                    producto={orden?.producto ?? ""}
                    hora={horaRolloActual}
                    hallazgo={(() => {
                      const partes = [
                        (current as { defectoVisualConversion?: string | null } | undefined)
                          ?.defectoVisualConversion,
                        (current as { variableTecnicaDimensional?: string | null } | undefined)
                          ?.variableTecnicaDimensional,
                        (current as { criterioDefecto?: string | null } | undefined)
                          ?.criterioDefecto,
                      ].filter((x): x is string => !!x && x.trim().length > 0);
                      return partes.length > 0 ? partes.join(" | ") : null;
                    })()}
                    hallazgoCritico={
                      ((current as { criterioDefecto?: string | null } | undefined)
                        ?.criterioDefecto ?? "")
                        .toUpperCase() === "CRÍTICO"
                    }
                  />

                  {/* 2-13. Variables */}
                  {ORDER.map((k) => {
                    const v = varByKey.get(k);
                    if (!v) {
                      return (
                        <div
                          key={k}
                          className="flex h-full items-center justify-center rounded-2xl border-[3px] border-dashed border-slate-300 bg-white text-[10px] font-semibold text-slate-400"
                        >
                          {k}
                        </div>
                      );
                    }
                    return (
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
                        isCritical={k === "pesoBase" || k === "tensionMD" || k === "tensionCD"}
                        clave={v.clave}
                      />
                    );
                  })}

                  {/* 14. Rollos Producidos */}
                  <KpiCard
                    label="Rollos Producidos"
                    value={muestrasAll.length.toString()}
                    state={rollosOK > 0 ? "ok" : "neutral"}
                    icon={CheckCircle2}
                    subtitle="EN ESPECIFICACIÓN"
                  />

                  {/* 15. No Conformes */}
                  <KpiCard
                    label="No Conformes"
                    value={rollosNC.toString()}
                    state={rollosNC === 0 ? "ok" : "bad"}
                    icon={AlertTriangle}
                    subtitle={rollosNC === 0 ? "SIN INCIDENCIAS" : "REVISAR PROCESO"}
                  />

                  {/* 16. Tiempo Sin Captura */}
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
                </div>
              );
            })()}
          </section>




          {/* HISTORIAL DE ROLLOS DEL TURNO — tabla SCADA */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b-2 border-slate-700 bg-slate-700 px-3 py-1.5">
              <h2 className="text-[12px] font-black uppercase tracking-[0.22em] text-white">
                Historial de Rollos del Turno{turnoLabel ? ` (${turnoLabel})` : ""}
              </h2>
              <span className="font-mono text-[11px] font-bold text-slate-300">
                {historial.length} rollos
              </span>
            </div>
            {(() => {
              const COLS = [
                { key: "calibre", label: "Calibre", unit: "mm", digits: 3 },
                { key: "blancuraR457", label: "Blanc. R457", unit: "%", digits: 2 },
                { key: "blancuraA", label: "Blanc. A*", unit: "", digits: 2 },
                { key: "blancuraB", label: "Blanc. B*", unit: "", digits: 2 },
                { key: "tensionMD", label: "T. Seca MD", unit: "g/in", digits: 2 },
                { key: "tensionCD", label: "T. Seca CD", unit: "g/in", digits: 2 },
                { key: "relMDCD", label: "Rel MD/CD", unit: "", digits: 2 },
                { key: "elongMD", label: "Elong MD", unit: "%", digits: 2 },
                { key: "humedad", label: "Humedad", unit: "%", digits: 2 },
                { key: "pesoBase", label: "Peso Base", unit: "g/m²", digits: 2 },
                { key: "anchoUtil", label: "Ancho Útil", unit: "cm", digits: 0 },
                { key: "diametro", label: "Diámetro", unit: "u", digits: 0 },
              ] as const;
              const filas = historial.length;
              const fz =
                filas <= 8 ? 12 : filas <= 14 ? 11 : filas <= 20 ? 10 : 9;
              const hz =
                filas <= 8 ? 10 : 9;
              const cellPad =
                filas <= 8 ? "px-1.5 py-1.5" : filas <= 14 ? "px-1.5 py-1" : "px-1 py-0.5";
              const stColor = (s: VarStatus) =>
                s === "bad"
                  ? "text-rose-700 font-extrabold"
                  : s === "warn"
                    ? "text-amber-700 font-bold"
                    : s === "ok"
                      ? "text-slate-900"
                      : "text-slate-400";
              // Altura aprox. de fila para limitar a ~15 visibles antes de scroll
              const rowH = filas <= 8 ? 32 : filas <= 14 ? 28 : 24;
              const headerH = 30;
              const summaryH = 30;
              const maxBodyH = headerH + rowH * 15 + summaryH;
              return (
                <div
                  className={historial.length === 0 ? "flex flex-1 items-center justify-center" : "overflow-auto"}
                  style={filas > 15 ? { maxHeight: `${maxBodyH}px` } : undefined}
                >

                  {historial.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <Images className="h-5 w-5" style={{ color: "#5B6472" }} />
                      <span className="text-[15px] font-medium" style={{ color: "#5B6472" }}>
                        No se han registrado capturas para este turno.
                      </span>
                    </div>
                  ) : (
                    <table className="w-full border-collapse font-mono tabular-nums">
                      <thead className="sticky top-0 z-10 bg-slate-100">
                        <tr className="border-b-2 border-slate-300">
                          <th
                            className={`${cellPad} text-left font-black uppercase tracking-wider text-slate-600`}
                            style={{ fontSize: `${hz}px` }}
                          >
                            #
                          </th>
                          <th
                            className={`${cellPad} text-left font-black uppercase tracking-wider text-slate-600`}
                            style={{ fontSize: `${hz}px` }}
                          >
                            Hora
                          </th>
                          <th
                            className={`${cellPad} text-left font-black uppercase tracking-wider text-slate-600`}
                            style={{ fontSize: `${hz}px` }}
                          >
                            Rollo
                          </th>
                          {COLS.map((c) => {
                            const isCrit =
                              c.key === "pesoBase" ||
                              c.key === "tensionMD" ||
                              c.key === "tensionCD";
                            return (
                              <th
                                key={c.key}
                                className={cn(
                                  `${cellPad} text-right font-black uppercase tracking-wider whitespace-nowrap`,
                                  isCrit
                                    ? "relative z-[1] bg-white text-slate-800 shadow-[0_0_0_2px_#ffffff,0_0_14px_4px_rgba(255,255,255,0.95)]"
                                    : "text-slate-600",
                                )}
                                style={{ fontSize: `${hz}px` }}
                              >
                                {c.label}
                                {c.unit && (
                                  <span className={cn("ml-0.5 font-semibold normal-case", isCrit ? "text-slate-500" : "text-slate-400")}>
                                    ({c.unit})
                                  </span>
                                )}
                              </th>
                            );
                          })}
                          <th
                            className={`${cellPad} text-right font-black uppercase tracking-wider text-slate-600 whitespace-nowrap`}
                            style={{ fontSize: `${hz}px` }}
                          >
                            Peso
                            <span className="ml-0.5 font-semibold text-slate-400 normal-case">
                              (kg)
                            </span>
                          </th>
                          <th
                            className={`${cellPad} text-center font-black uppercase tracking-wider text-slate-600`}
                            style={{ fontSize: `${hz}px` }}
                          >
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((h, idx) => {
                          const dot =
                            h.status === "ok"
                              ? "bg-emerald-500"
                              : h.status === "warn"
                                ? "bg-amber-500"
                                : h.status === "bad"
                                  ? "bg-rose-500"
                                  : "bg-slate-400";
                          const varByKey = new Map(h.vars.map((v) => [v.clave, v]));
                          return (
                            <tr
                              key={h.id}
                              className={cn(
                                "border-b border-slate-100",
                                h.status === "bad" && "bg-rose-50/60",
                                h.status === "warn" && "bg-amber-50/40",
                                idx === 0 && "ring-1 ring-inset ring-sky-300/60",
                              )}
                            >
                              <td
                                className={`${cellPad} text-left font-bold text-slate-400`}
                                style={{ fontSize: `${fz - 1}px` }}
                              >
                                {idx + 1}
                              </td>
                              <td
                                className={`${cellPad} text-left font-semibold text-slate-500`}
                                style={{ fontSize: `${fz - 1}px` }}
                              >
                                {h.hora}
                              </td>
                              <td
                                className={`${cellPad} text-left font-extrabold text-slate-900 whitespace-nowrap`}
                                style={{ fontSize: `${fz + 1}px` }}
                              >
                                {h.rollo}
                              </td>
                              {COLS.map((c) => {
                                const v = varByKey.get(c.key);
                                const val = v?.valor;
                                const isCrit =
                                  c.key === "pesoBase" ||
                                  c.key === "tensionMD" ||
                                  c.key === "tensionCD";
                                return (
                                  <td
                                    key={c.key}
                                    className={cn(
                                      `${cellPad} text-right whitespace-nowrap ${stColor((v?.status ?? "none") as VarStatus)}`,
                                      isCrit && "relative z-[1] bg-white shadow-[0_0_0_2px_#ffffff,0_0_14px_4px_rgba(255,255,255,0.95)]",
                                    )}
                                    style={{ fontSize: `${fz}px` }}
                                  >
                                    {val === null || val === undefined
                                      ? "—"
                                      : Number(val).toFixed(c.digits)}
                                  </td>
                                );
                              })}
                              {(() => {
                                const v = varByKey.get("peso");
                                const val = v?.valor;
                                return (
                                  <td
                                    className={`${cellPad} text-right whitespace-nowrap ${stColor((v?.status ?? "none") as VarStatus)}`}
                                    style={{ fontSize: `${fz}px` }}
                                  >
                                    {val === null || val === undefined
                                      ? "—"
                                      : Number(val).toFixed(2)}
                                  </td>
                                );
                              })()}
                              <td className={`${cellPad} text-center`}>
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${dot}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {historial.length > 0 && (() => {
                          const avg = (key: string, digits: number) => {
                            const nums = historial
                              .map((h) => h.vars.find((v) => v.clave === key)?.valor)
                              .filter((x): x is number => x !== null && x !== undefined && !Number.isNaN(Number(x)))
                              .map(Number);
                            if (nums.length === 0) return "—";
                            return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(digits);
                          };
                          return (
                            <tr className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-200/95 font-bold backdrop-blur-sm">
                              <td className={`${cellPad} text-left text-slate-700`} style={{ fontSize: `${fz - 1}px` }}>
                                Σ
                              </td>
                              <td
                                className={`${cellPad} text-left uppercase tracking-wider text-slate-700 whitespace-nowrap`}
                                style={{ fontSize: `${fz - 1}px` }}
                                colSpan={2}
                              >
                                Promedio / Total Turno ({historial.length})
                              </td>
                              {COLS.map((c) => {
                                const isCrit =
                                  c.key === "pesoBase" ||
                                  c.key === "tensionMD" ||
                                  c.key === "tensionCD";
                                return (
                                  <td
                                    key={c.key}
                                    className={cn(
                                      `${cellPad} text-right whitespace-nowrap text-slate-800`,
                                      isCrit && "relative z-[1] bg-white shadow-[0_0_0_2px_#ffffff,0_0_14px_4px_rgba(255,255,255,0.95)]",
                                    )}
                                    style={{ fontSize: `${fz}px` }}
                                  >
                                    {avg(c.key, c.digits)}
                                  </td>
                                );
                              })}
                              <td
                                className={`${cellPad} text-right whitespace-nowrap text-slate-800`}
                                style={{ fontSize: `${fz}px` }}
                              >
                                {(() => {
                                  const nums = historial
                                    .map((h) => h.vars.find((v) => v.clave === "peso")?.valor)
                                    .filter((x): x is number => x !== null && x !== undefined && !Number.isNaN(Number(x)))
                                    .map(Number);
                                  return nums.length === 0 ? "—" : nums.reduce((a, b) => a + b, 0).toFixed(2);
                                })()}
                              </td>
                              <td className={`${cellPad} text-center text-slate-700`} style={{ fontSize: `${fz - 1}px` }}>
                                {historial.length}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </section>
        </main>

        {/* SIDEBAR DERECHO: variables secundarias + logo Convertipap */}
        <aside className="flex w-[260px] shrink-0 flex-col border-l-2 border-slate-200 bg-white">
          <div className="shrink-0 border-b-2 border-slate-700 bg-slate-50 px-3 py-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-700">
              Último Rollo Capturado
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2">
            {(() => {
              const SIDE_ORDER = ["uniones"];
              const sideVars = SIDE_ORDER.map((k) =>
                variablesParaMostrar.find((v) => v.clave === k),
              ).filter(Boolean) as typeof variablesParaMostrar;
              return (
                <>
                  <KpiCard
                    label="Cumplimiento"
                    value={`${cumplimiento.pct}`}
                    unit="%"
                    state={
                      cumplimiento.capturados === 0
                        ? "neutral"
                        : cumplimiento.pct >= 90
                          ? "ok"
                          : cumplimiento.pct >= 70
                            ? "warn"
                            : "bad"
                    }
                    icon={Gauge}
                    subtitle={`${cumplimiento.enSpec} EN SPEC DE ${cumplimiento.capturados}`}
                  />



                  {(() => {
                    const vm = (current as any)?.velocidadMaquina;
                    const hasVm = vm !== null && vm !== undefined && Number.isFinite(Number(vm));
                    return (
                      <KpiCard
                        label="Velocidad Máquina"
                        value={hasVm ? Number(vm).toFixed(0) : "—"}
                        unit={hasVm ? "m/min" : undefined}
                        state={hasVm ? "ok" : "neutral"}
                        icon={Gauge}
                        subtitle={hasVm ? undefined : "SIN DATO"}
                      />
                    );
                  })()}
                  {(() => {
                    const ve = (current as any)?.velocidadEnrollador;
                    const hasVe = ve !== null && ve !== undefined && Number.isFinite(Number(ve));
                    return (
                      <KpiCard
                        label="Velocidad Enrollador"
                        value={hasVe ? Number(ve).toFixed(0) : "—"}
                        unit={hasVe ? "m/min" : undefined}
                        state={hasVe ? "ok" : "neutral"}
                        icon={Gauge}
                        subtitle={hasVe ? undefined : "SIN DATO"}
                      />
                    );
                  })()}
                  {(() => {
                    const cp = (current as any)?.crepadoPct;
                    const hasCp = cp !== null && cp !== undefined && Number.isFinite(Number(cp));
                    return (
                      <KpiCard
                        label="% Crepado"
                        value={hasCp ? Number(cp).toFixed(2) : "—"}
                        unit={hasCp ? "%" : undefined}
                        state={hasCp ? "ok" : "neutral"}
                        icon={Gauge}
                        subtitle={hasCp ? undefined : "SIN DATO"}
                      />
                    );
                  })()}
                  {(() => {
                    const peso = mapMedActual.get("peso");
                    const hasPeso = peso !== null && peso !== undefined && Number.isFinite(Number(peso));
                    return (
                      <KpiCard
                        label="Peso"
                        value={hasPeso ? Number(peso).toFixed(2) : "—"}
                        unit={hasPeso ? "kg" : undefined}
                        state={hasPeso ? "ok" : "neutral"}
                        icon={Weight}
                        subtitle={hasPeso ? undefined : "SIN DATO"}
                      />
                    );
                  })()}
                  {(() => {
                    // Total acumulado de "uniones" en TODOS los rollos del
                    // turno actual (la query del servidor ya filtra por
                    // máquina + turno vigente + día). No promedio, no último
                    // valor: suma estricta.
                    let total = 0;
                    let hasAny = false;
                    for (const m of muestrasAll) {
                      const med = m.mediciones.find(
                        (x: { clave: string; valor: number | null }) => x.clave === "uniones",
                      );
                      if (med && med.valor !== null && med.valor !== undefined && Number.isFinite(Number(med.valor))) {
                        total += Number(med.valor);
                        hasAny = true;
                      }
                    }
                    void sideVars; // mantener referencia (uniones se renderiza aquí)
                    return (
                      <KpiCard
                        label="Uniones"
                        value={hasAny ? String(Math.round(total)) : "0"}
                        unit="u"
                        state="neutral"
                        icon={Gauge}
                        subtitle={`ACUMULADO TURNO · ${muestrasAll.length} ROLLOS`}
                      />
                    );
                  })()}
                </>
              );
            })()}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">
            <img
              src={logoConvertipap}
              alt="Convertipap"
              className="mx-auto h-[56px] w-full object-contain"
            />
          </div>
        </aside>
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
