import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ArrowRight, Factory, AlertTriangle, Gauge,
  Activity, Target, DollarSign, PackageX, TrendingDown,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { RangoSelector, MESES, rangoLabel, type Rango } from "@/components/qc/RangoSelector";
import { getDashboard } from "@/lib/dashboard.functions";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/")({ component: DashboardGate, ssr: false });

function mexicoMidnight(now: Date): Date {
  // Devuelve el instante UTC correspondiente a las 00:00 de la fecha actual en CDMX.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  // Offset de CDMX respecto a UTC en ms (negativo: CDMX va detrás)
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offset = asUtc - now.getTime();
  const midnightMx = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0);
  return new Date(midnightMx - offset);
}

function computeWindow(rango: Rango, mesesSel: number[]): { start: Date; end: Date } {
  const now = new Date();
  if (rango === "dia") {
    const s = mexicoMidnight(now);
    const e = new Date(s.getTime() + 24 * 3600_000);
    return { start: s, end: e };
  }
  if (rango === "semana") {
    const today = mexicoMidnight(now);
    const dow = new Date(today.getTime()).getUTCDay();
    const s = new Date(today);
    s.setUTCDate(s.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const e = new Date(s.getTime() + 7 * 24 * 3600_000);
    return { start: s, end: e };
  }
  if (rango === "mes") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: s, end: e };
  }
  // año / custom
  const sel = mesesSel.length ? mesesSel : MESES.map((_, i) => i);
  const minM = Math.min(...sel);
  const maxM = Math.max(...sel);
  const year = now.getFullYear();
  return {
    start: new Date(year, minM, 1),
    end: new Date(year, maxM + 1, 1),
  };
}

const dashboardQO = (rango: Rango, mesesSel: number[]) => {
  const { start, end } = computeWindow(rango, mesesSel);
  return queryOptions({
    queryKey: ["dashboard", rango, start.toISOString(), end.toISOString()],
    queryFn: () => getDashboard({ data: { rango, start: start.toISOString(), end: end.toISOString() } }),
  });
};

const COLORS_BASE = [
  "hsl(330, 75%, 55%)",
  "hsl(210, 75%, 50%)",
  "hsl(40, 90%, 55%)",
  "hsl(150, 55%, 45%)",
  "hsl(270, 60%, 55%)",
  "hsl(15, 80%, 55%)",
];
const PIE_COLORS = ["hsl(330,75%,55%)", "hsl(40,90%,55%)", "hsl(210,75%,50%)", "hsl(0,70%,55%)", "hsl(150,55%,45%)", "hsl(270,60%,55%)"];

function DashboardGate() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.isAuthenticated) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    // Capturistas (sin rol superior) van directo a captura
    const isOnlyCapturista =
      auth.hasRole("capturista") &&
      !auth.hasRole("administrador") &&
      !auth.hasRole("gerente_general") &&
      !auth.hasRole("direccion") &&
      !auth.hasRole("calidad");
    if (isOnlyCapturista) {
      void navigate({ to: "/calidad/captura", replace: true });
    }
  }, [auth, navigate]);
  if (auth.loading || !auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Cargando…</div>
      </div>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const [rango, setRango] = useState<Rango>("dia");
  const [mesesSel, setMesesSel] = useState<number[]>(MESES.map((_, i) => i));
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery({
    ...dashboardQO(rango, mesesSel),
    refetchInterval: 30_000,
  });
  const { serie, maquinas, noConformidades, costoNoCalidad } = data;

  // Realtime: invalida el dashboard al cambiar muestras/mediciones
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-qc-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "muestras_calidad" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mediciones_calidad" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);


  const colorsByMaq = useMemo(() => {
    const map: Record<string, string> = {};
    maquinas.forEach((m, i) => { map[m] = COLORS_BASE[i % COLORS_BASE.length]; });
    return map;
  }, [maquinas]);

  const cumplimientoData = serie.map((d) => ({ label: d.label, ...d.cumplimiento }));
  const rollosData = serie.map((d) => ({ label: d.label, ...d.rollos }));

  const promedios = useMemo(() => {
    return maquinas.map((m) => {
      const n = Math.max(serie.length, 1);
      const c = serie.reduce((a, d) => a + (d.cumplimiento[m] ?? 0), 0) / n;
      const r = serie.reduce((a, d) => a + (d.rollos[m] ?? 0), 0);
      const o = serie.reduce((a, d) => a + (d.oee[m] ?? 0), 0) / n;
      return { maquina: m, cumplimiento: +c.toFixed(1), rollos: r, oee: +o.toFixed(1) };
    });
  }, [serie, maquinas]);

  const totalRollos = promedios.reduce((a, p) => a + p.rollos, 0);
  const promCumpl = promedios.length ? +(promedios.reduce((a, p) => a + p.cumplimiento, 0) / promedios.length).toFixed(1) : 0;
  const promOEE = promedios.length ? +(promedios.reduce((a, p) => a + p.oee, 0) / promedios.length).toFixed(1) : 0;
  const totalNC = noConformidades.reduce((a, n) => a + n.value, 0);

  return (
    <AppLayout title="Dashboard · Calidad y Producción">
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/30 via-primary/15 to-primary/5 p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Centro de Control de Calidad Operativa</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {maquinas.length} máquina(s) monitoreada(s) · Datos en tiempo real
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <RangoSelector rango={rango} setRango={setRango} mesesSel={mesesSel} setMesesSel={setMesesSel} />
              <Link
                to="/calidad/captura"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Nuevo registro <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card title="Cumplimiento por máquina" subtitle={`Tendencia · ${rangoLabel(rango, mesesSel)} · meta 90%`}>
            <div className="h-72">
              {maquinas.length === 0 || serie.length === 0 ? (
                <EmptyChart message="Sin datos en el periodo seleccionado" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumplimientoData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {maquinas.map((m) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={colorsByMaq[m]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Rollos producidos por máquina" subtitle={rangoLabel(rango, mesesSel)}>
            <div className="h-72">
              {maquinas.length === 0 || serie.length === 0 ? (
                <EmptyChart message="Sin producción registrada en el periodo" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rollosData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                      formatter={(v: number, name: string) => [`${v} rollos`, name]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {maquinas.map((m) => (
                      <Bar key={m} dataKey={m} fill={colorsByMaq[m]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card title="Costo de No Calidad" subtitle={`MXN · ${rangoLabel(rango, mesesSel)}`}>
            <div className="flex h-72 flex-col justify-between gap-3">
              <div className="rounded-xl border border-destructive/30 bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-destructive">
                  <DollarSign className="h-3.5 w-3.5" /> Costo total
                </div>
                <div className="mt-1 text-3xl font-bold text-foreground tabular-nums">
                  {costoNoCalidad.costoTotal.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {costoNoCalidad.kgNoLiberados.toLocaleString("es-MX", { maximumFractionDigits: 1 })} kg no liberados · {costoNoCalidad.costoKg.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}/kg
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <TrendingDown className="h-3 w-3" /> Costo promedio
                  </div>
                  <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
                    {costoNoCalidad.costoPromedio.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">por rollo no liberado</div>
                </div>
                <div className="rounded-lg border border-border bg-card/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <PackageX className="h-3 w-3" /> Rollos
                  </div>
                  <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
                    {costoNoCalidad.rollosNoLiberados}
                  </div>
                  <div className="text-[10px] text-muted-foreground">no liberados en el periodo</div>
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Cálculo: Σ (peso real de cada rollo no liberado × costo configurado por kg). Sin peso estándar.
              </p>
            </div>
          </Card>
        </div>

        {promedios.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Resumen por máquina</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {promedios.map((p) => (
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${colorsByMaq[p.maquina]}1f`, color: colorsByMaq[p.maquina] }}>
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
                      style={{ width: `${Math.min(100, p.cumplimiento)}%`, background: colorsByMaq[p.maquina] }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi icon={Target} label="Cumplimiento prom." value={`${promCumpl}%`} tone="primary" />
          <Kpi icon={Activity} label="OEE promedio" value={`${promOEE}%`} tone="success" />
          <Kpi icon={Factory} label="Rollos producidos" value={String(totalRollos)} tone="primary" />
          <Kpi icon={AlertTriangle} label="No conformidades" value={String(totalNC)} tone="warning" />
        </div>
      </div>
    </AppLayout>
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

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: string; tone: "primary" | "success" | "warning" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
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
