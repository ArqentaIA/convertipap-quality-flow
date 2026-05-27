import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ArrowRight, Factory, AlertTriangle, Gauge,
  TrendingUp, TrendingDown, Activity, Target,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { RangoSelector, MESES, rangoLabel, type Rango } from "@/components/qc/RangoSelector";

export const Route = createFileRoute("/")({ component: Dashboard });


const MAQUINAS = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;

type PuntoSerie = {
  label: string;
  cumplimiento: Record<string, number>;
  rollos: Record<string, number>;
  oee: Record<string, number>;
};

// Datos simulados por rango y máquina
const DATA: Record<"dia" | "semana" | "mes", PuntoSerie[]> = {
  dia: [
    { label: "00h", cumplimiento: { "MP-04": 88, "MP-05": 91, "MP-06": 84, "MP-07": 89 }, rollos: { "MP-04": 2, "MP-05": 3, "MP-06": 2, "MP-07": 2 }, oee: { "MP-04": 82, "MP-05": 88, "MP-06": 70, "MP-07": 84 } },
    { label: "04h", cumplimiento: { "MP-04": 90, "MP-05": 93, "MP-06": 80, "MP-07": 91 }, rollos: { "MP-04": 3, "MP-05": 3, "MP-06": 2, "MP-07": 3 }, oee: { "MP-04": 85, "MP-05": 90, "MP-06": 68, "MP-07": 86 } },
    { label: "08h", cumplimiento: { "MP-04": 92, "MP-05": 94, "MP-06": 78, "MP-07": 90 }, rollos: { "MP-04": 4, "MP-05": 4, "MP-06": 1, "MP-07": 3 }, oee: { "MP-04": 87, "MP-05": 91, "MP-06": 62, "MP-07": 85 } },
    { label: "12h", cumplimiento: { "MP-04": 89, "MP-05": 92, "MP-06": 82, "MP-07": 88 }, rollos: { "MP-04": 3, "MP-05": 4, "MP-06": 2, "MP-07": 3 }, oee: { "MP-04": 84, "MP-05": 89, "MP-06": 71, "MP-07": 83 } },
    { label: "16h", cumplimiento: { "MP-04": 91, "MP-05": 95, "MP-06": 85, "MP-07": 92 }, rollos: { "MP-04": 4, "MP-05": 5, "MP-06": 3, "MP-07": 4 }, oee: { "MP-04": 88, "MP-05": 93, "MP-06": 76, "MP-07": 87 } },
    { label: "20h", cumplimiento: { "MP-04": 93, "MP-05": 96, "MP-06": 87, "MP-07": 90 }, rollos: { "MP-04": 4, "MP-05": 5, "MP-06": 3, "MP-07": 3 }, oee: { "MP-04": 90, "MP-05": 94, "MP-06": 78, "MP-07": 86 } },
  ],
  semana: [
    { label: "Lun", cumplimiento: { "MP-04": 88, "MP-05": 91, "MP-06": 78, "MP-07": 87 }, rollos: { "MP-04": 18, "MP-05": 22, "MP-06": 12, "MP-07": 17 }, oee: { "MP-04": 84, "MP-05": 88, "MP-06": 68, "MP-07": 83 } },
    { label: "Mar", cumplimiento: { "MP-04": 90, "MP-05": 93, "MP-06": 80, "MP-07": 89 }, rollos: { "MP-04": 20, "MP-05": 24, "MP-06": 13, "MP-07": 18 }, oee: { "MP-04": 86, "MP-05": 90, "MP-06": 70, "MP-07": 85 } },
    { label: "Mié", cumplimiento: { "MP-04": 86, "MP-05": 89, "MP-06": 75, "MP-07": 88 }, rollos: { "MP-04": 17, "MP-05": 21, "MP-06": 11, "MP-07": 16 }, oee: { "MP-04": 82, "MP-05": 87, "MP-06": 65, "MP-07": 82 } },
    { label: "Jue", cumplimiento: { "MP-04": 92, "MP-05": 94, "MP-06": 82, "MP-07": 91 }, rollos: { "MP-04": 21, "MP-05": 25, "MP-06": 14, "MP-07": 19 }, oee: { "MP-04": 88, "MP-05": 91, "MP-06": 73, "MP-07": 86 } },
    { label: "Vie", cumplimiento: { "MP-04": 94, "MP-05": 96, "MP-06": 84, "MP-07": 92 }, rollos: { "MP-04": 22, "MP-05": 26, "MP-06": 15, "MP-07": 20 }, oee: { "MP-04": 90, "MP-05": 93, "MP-06": 76, "MP-07": 87 } },
    { label: "Sáb", cumplimiento: { "MP-04": 89, "MP-05": 92, "MP-06": 79, "MP-07": 88 }, rollos: { "MP-04": 19, "MP-05": 23, "MP-06": 13, "MP-07": 17 }, oee: { "MP-04": 85, "MP-05": 89, "MP-06": 69, "MP-07": 84 } },
    { label: "Dom", cumplimiento: { "MP-04": 91, "MP-05": 93, "MP-06": 81, "MP-07": 90 }, rollos: { "MP-04": 20, "MP-05": 24, "MP-06": 14, "MP-07": 18 }, oee: { "MP-04": 87, "MP-05": 90, "MP-06": 71, "MP-07": 85 } },
  ],
  mes: [
    { label: "S1", cumplimiento: { "MP-04": 89, "MP-05": 92, "MP-06": 79, "MP-07": 88 }, rollos: { "MP-04": 130, "MP-05": 158, "MP-06": 88, "MP-07": 122 }, oee: { "MP-04": 85, "MP-05": 89, "MP-06": 70, "MP-07": 84 } },
    { label: "S2", cumplimiento: { "MP-04": 91, "MP-05": 94, "MP-06": 81, "MP-07": 90 }, rollos: { "MP-04": 138, "MP-05": 165, "MP-06": 92, "MP-07": 128 }, oee: { "MP-04": 87, "MP-05": 91, "MP-06": 72, "MP-07": 86 } },
    { label: "S3", cumplimiento: { "MP-04": 88, "MP-05": 90, "MP-06": 77, "MP-07": 87 }, rollos: { "MP-04": 125, "MP-05": 152, "MP-06": 84, "MP-07": 118 }, oee: { "MP-04": 83, "MP-05": 87, "MP-06": 67, "MP-07": 82 } },
    { label: "S4", cumplimiento: { "MP-04": 93, "MP-05": 95, "MP-06": 83, "MP-07": 91 }, rollos: { "MP-04": 142, "MP-05": 170, "MP-06": 96, "MP-07": 132 }, oee: { "MP-04": 89, "MP-05": 92, "MP-06": 75, "MP-07": 87 } },
  ],
};


// Datos simulados por mes del año (12 puntos)
const DATA_AÑO: PuntoSerie[] = MESES.map((m, i) => {
  // pequeña variación determinista por mes para que se vea natural
  const base = 85 + ((i * 7) % 9);
  const oeeBase = 80 + ((i * 5) % 10);
  const rollosBase = 520 + ((i * 37) % 180);
  return {
    label: m,
    cumplimiento: {
      "MP-04": base + 2,
      "MP-05": base + 4,
      "MP-06": base - 6,
      "MP-07": base + 1,
    },
    rollos: {
      "MP-04": rollosBase,
      "MP-05": rollosBase + 90,
      "MP-06": Math.round(rollosBase * 0.65),
      "MP-07": rollosBase - 20,
    },
    oee: {
      "MP-04": oeeBase + 3,
      "MP-05": oeeBase + 6,
      "MP-06": oeeBase - 8,
      "MP-07": oeeBase + 2,
    },
  };
});

const NO_CONFORMIDADES = [
  { name: "Humedad", value: 18 },
  { name: "Peso base", value: 12 },
  { name: "Tensión MD", value: 9 },
  { name: "Blancura", value: 5 },
];

const COLORS_MAQ: Record<string, string> = {
  "MP-04": "hsl(330, 75%, 55%)",
  "MP-05": "hsl(210, 75%, 50%)",
  "MP-06": "hsl(40, 90%, 55%)",
  "MP-07": "hsl(150, 55%, 45%)",
};

const PIE_COLORS = ["hsl(330,75%,55%)", "hsl(40,90%,55%)", "hsl(210,75%,50%)", "hsl(0,70%,55%)"];


function Dashboard() {
  const [rango, setRango] = useState<Rango>("dia");
  // meses seleccionados para los modos "año" y "custom" (0..11)
  const [mesesSel, setMesesSel] = useState<number[]>(MESES.map((_, i) => i));

  const serie: PuntoSerie[] = useMemo(() => {
    if (rango === "dia" || rango === "semana" || rango === "mes") {
      return DATA[rango];
    }
    // año / custom -> filtramos los meses seleccionados
    const sel = mesesSel.length ? mesesSel : MESES.map((_, i) => i);
    return DATA_AÑO.filter((_, i) => sel.includes(i));
  }, [rango, mesesSel]);

  // Datos derivados
  const cumplimientoData = serie.map(d => ({ label: d.label, ...d.cumplimiento }));
  const rollosData = serie.map(d => ({ label: d.label, ...d.rollos }));

  const promedios = useMemo(() => {
    return MAQUINAS.map(m => {
      const n = Math.max(serie.length, 1);
      const c = serie.reduce((a, d) => a + d.cumplimiento[m], 0) / n;
      const r = serie.reduce((a, d) => a + d.rollos[m], 0);
      const o = serie.reduce((a, d) => a + d.oee[m], 0) / n;
      return { maquina: m, cumplimiento: +c.toFixed(1), rollos: r, oee: +o.toFixed(1) };
    });
  }, [serie]);

  const totalRollos = promedios.reduce((a, p) => a + p.rollos, 0);
  const promCumpl = +(promedios.reduce((a, p) => a + p.cumplimiento, 0) / promedios.length).toFixed(1);
  const promOEE = +(promedios.reduce((a, p) => a + p.oee, 0) / promedios.length).toFixed(1);
  const totalNC = NO_CONFORMIDADES.reduce((a, n) => a + n.value, 0);

  return (
    <AppLayout title="Dashboard · Calidad y Producción">
      <div className="space-y-6">
        {/* Hero + selector de rango */}
        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/30 via-primary/15 to-primary/5 p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Centro de Control de Calidad Operativa</div>
              
              <p className="mt-1 text-sm text-muted-foreground">
                Planta Tlaxcala · 4 máquinas monitoreadas · Última sincronización hace 2 min.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <RangoSelector
                rango={rango}
                setRango={setRango}
                mesesSel={mesesSel}
                setMesesSel={setMesesSel}
              />
              <Link
                to="/control-calidad"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Nuevo registro <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>


        {/* Tendencia cumplimiento por máquina */}
        <div className="grid grid-cols-1 gap-6">
          <Card title="Cumplimiento por máquina" subtitle={`Tendencia · ${rangoLabel(rango, mesesSel)} · meta 90%`}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumplimientoData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {MAQUINAS.map(m => (
                    <Line key={m} type="monotone" dataKey={m} stroke={COLORS_MAQ[m]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>


        {/* Rollos por máquina + NC */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Rollos producidos por máquina" subtitle={rangoLabel(rango, mesesSel)}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rollosData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: number, name: string) => [`${v} rollos`, name]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {MAQUINAS.map(m => (
                    <Bar key={m} dataKey={m} fill={COLORS_MAQ[m]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="No conformidades" subtitle="Distribución por variable">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={NO_CONFORMIDADES} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {NO_CONFORMIDADES.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Tarjetas por máquina */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Resumen por máquina</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {promedios.map(p => (
              <Link
                key={p.maquina}
                to="/historial/$maquina"
                params={{ maquina: p.maquina }}
                className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Máquina</div>
                    <div className="text-lg font-bold text-foreground">{p.maquina}</div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${COLORS_MAQ[p.maquina]}1f`, color: COLORS_MAQ[p.maquina] }}>
                    <Gauge className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Cumpl." value={`${p.cumplimiento}%`} ok={p.cumplimiento >= 90} />
                  <Mini label="OEE" value={`${p.oee}%`} ok={p.oee >= 85} />
                  <Mini label="Rollos" value={String(p.rollos)} ok />
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${p.cumplimiento}%`, background: COLORS_MAQ[p.maquina] }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* KPIs (parte inferior) */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi icon={Target} label="Cumplimiento prom." value={`${promCumpl}%`} delta={2.3} tone="primary" />
          <Kpi icon={Activity} label="OEE promedio" value={`${promOEE}%`} delta={1.1} tone="success" />
          <Kpi icon={Factory} label="Rollos producidos" value={String(totalRollos)} delta={4.8} tone="primary" />
          <Kpi icon={AlertTriangle} label="No conformidades" value={String(totalNC)} delta={-1.6} tone="warning" />
        </div>
      </div>
    </AppLayout>
  );
}


function rangoLabel(r: Rango, mesesSel: number[]) {
  if (r === "dia") return "Hoy";
  if (r === "semana") return "Últimos 7 días";
  if (r === "mes") return "Mes en curso";
  if (r === "año") return `Año en curso (${new Date().getFullYear()})`;
  // custom
  if (mesesSel.length === 0) return "Sin meses seleccionados";
  if (mesesSel.length === 12) return "Todo el año";
  if (mesesSel.length <= 3) return mesesSel.map(i => MESES[i]).join(", ");
  return `${mesesSel.length} meses seleccionados`;
}

function RangoSelector({
  rango,
  setRango,
  mesesSel,
  setMesesSel,
}: {
  rango: Rango;
  setRango: (r: Rango) => void;
  mesesSel: number[];
  setMesesSel: (m: number[]) => void;
}) {
  const opts: { v: Rango; label: string }[] = [
    { v: "dia", label: "Día" },
    { v: "semana", label: "Semana" },
    { v: "mes", label: "Mes" },
    { v: "año", label: "Año" },
  ];

  const toggleMes = (i: number) => {
    if (mesesSel.includes(i)) setMesesSel(mesesSel.filter(x => x !== i));
    else setMesesSel([...mesesSel, i].sort((a, b) => a - b));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
        {opts.map(o => (
          <button
            key={o.v}
            onClick={() => {
              setRango(o.v);
              if (o.v === "año") setMesesSel(MESES.map((_, i) => i));
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              rango === o.v ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRango("custom")}
            className={`h-[34px] text-xs font-semibold ${rango === "custom" ? "border-primary text-primary" : ""}`}
          >
            Meses
            {rango === "custom" && mesesSel.length < 12 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                {mesesSel.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Selecciona meses</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setMesesSel(MESES.map((_, i) => i));
                  setRango("custom");
                }}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Todos
              </button>
              <span className="text-[10px] text-muted-foreground">·</span>
              <button
                onClick={() => {
                  setMesesSel([]);
                  setRango("custom");
                }}
                className="text-[10px] font-semibold text-muted-foreground hover:underline"
              >
                Ninguno
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((m, i) => {
              const active = mesesSel.includes(i);
              return (
                <button
                  key={m}
                  onClick={() => {
                    toggleMes(i);
                    setRango("custom");
                  }}
                  className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {m}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, delta, tone }: { icon: any; label: string; value: string; delta: number; tone: "primary" | "success" | "warning" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-foreground",
  };
  const up = delta >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "text-success" : "text-destructive"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {up ? "+" : ""}{delta}%
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function Mini({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${ok ? "text-foreground" : "text-warning"}`}>{value}</div>
    </div>
  );
}
