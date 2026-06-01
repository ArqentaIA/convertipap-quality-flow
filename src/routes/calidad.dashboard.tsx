import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ArrowLeft, TrendingUp, TrendingDown, CheckCircle2, XCircle, ShieldAlert,
  Clock, AlertTriangle, ExternalLink, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
  CartesianGrid, Cell,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useQcMock, calcularSla } from "@/lib/qc-mock/store";
import type { MuestraCalidad, MedicionCalidad, AjusteCalidad } from "@/lib/qc-mock/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calidad/dashboard")({
  component: DashboardPage,
});

const ROLES_DASHBOARD = ["calidad", "gerente_general", "direccion", "administrador"];

function pct(n: number, d: number) {
  if (d === 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function DashboardPage() {
  const auth = useAuth();
  const muestras = useQcMock((s) => s.muestras);
  const mediciones = useQcMock((s) => s.mediciones);
  const ajustes = useQcMock((s) => s.ajustes);

  const puedeVer = auth.roles.some((r) => ROLES_DASHBOARD.includes(r));

  // --- KPIs primarios -----------------------------------------------------
  const stats = useMemo(() => {
    const dictaminadas = muestras.filter((m) => m.dictamen !== null);
    const liberadas = dictaminadas.filter((m) => m.dictamen === "liberada").length;
    const rechazadas = dictaminadas.filter((m) => m.dictamen === "rechazada").length;
    const concesion = dictaminadas.filter((m) => m.dictamen === "concesion").length;
    const pendientes = muestras.filter((m) => m.estado === "pendiente_revision").length;
    const enAjuste = muestras.filter((m) => m.estado === "en_ajuste" || m.estado === "reproceso").length;
    return {
      total: muestras.length,
      dictaminadas: dictaminadas.length,
      liberadas, rechazadas, concesion, pendientes, enAjuste,
      conformidadPct: pct(liberadas, dictaminadas.length),
      rechazoPct: pct(rechazadas, dictaminadas.length),
      concesionPct: pct(concesion, dictaminadas.length),
    };
  }, [muestras]);

  // --- SLA ajustes --------------------------------------------------------
  const slaStats = useMemo(() => {
    const abiertos = ajustes.filter((a) => a.estado_flujo !== "cerrado");
    let verde = 0, amarillo = 0, rojo = 0;
    abiertos.forEach((a) => {
      const s = calcularSla(a).estado;
      if (s === "verde") verde++;
      else if (s === "amarillo") amarillo++;
      else if (s === "rojo") rojo++;
    });
    const cerrados = ajustes.filter((a) => a.estado_flujo === "cerrado");
    const cumplidos = cerrados.filter((a) => calcularSla(a).estado === "cumplido").length;
    return {
      abiertos: abiertos.length, verde, amarillo, rojo,
      cerrados: cerrados.length,
      cumplimientoPct: pct(cumplidos, cerrados.length),
    };
  }, [ajustes]);

  // --- Tendencia diaria (últimos 30 días) --------------------------------
  const tendencia = useMemo(() => {
    const map = new Map<string, { fecha: string; total: number; liberadas: number; conformidad: number }>();
    const hoy = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { fecha: k.slice(5), total: 0, liberadas: 0, conformidad: 0 });
    }
    muestras.forEach((m) => {
      if (m.dictamen === null) return;
      const k = dayKey(m.capturado_at);
      const row = map.get(k);
      if (!row) return;
      row.total++;
      if (m.dictamen === "liberada") row.liberadas++;
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      conformidad: r.total === 0 ? null : Math.round((r.liberadas / r.total) * 1000) / 10,
    }));
  }, [muestras]);

  // --- Pareto de no conformidades por variable ---------------------------
  const pareto = useMemo(() => {
    const counts = new Map<string, number>();
    mediciones.forEach((m) => {
      if (m.estado === "no_conforme" || m.estado === "fuera_rango_critico") {
        counts.set(m.variable_clave, (counts.get(m.variable_clave) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([variable, n]) => ({ variable, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
  }, [mediciones]);

  // --- Heatmap pendientes por máquina × turno ----------------------------
  const heatmap = useMemo(() => {
    const turnos = ["A", "B", "C"];
    const maquinas = Array.from(new Set(muestras.map((m) => m.maquina_id))).sort();
    const data: Record<string, Record<string, number>> = {};
    maquinas.forEach((mq) => {
      data[mq] = { A: 0, B: 0, C: 0 };
    });
    muestras
      .filter((m) => m.estado === "pendiente_revision")
      .forEach((m) => {
        if (data[m.maquina_id]) data[m.maquina_id][m.turno] = (data[m.maquina_id][m.turno] ?? 0) + 1;
      });
    const max = Math.max(1, ...maquinas.flatMap((mq) => turnos.map((t) => data[mq][t] ?? 0)));
    return { maquinas, turnos, data, max };
  }, [muestras]);

  // --- Listas de acción ---------------------------------------------------
  const muestrasAntiguas = useMemo(() => {
    return muestras
      .filter((m) => m.estado === "pendiente_revision")
      .sort((a, b) => a.capturado_at.localeCompare(b.capturado_at))
      .slice(0, 5);
  }, [muestras]);

  const ajustesVencidos = useMemo(() => {
    return ajustes
      .filter((a) => a.estado_flujo !== "cerrado")
      .map((a) => ({ a, sla: calcularSla(a) }))
      .filter((x) => x.sla.estado === "rojo" || x.sla.estado === "amarillo")
      .sort((x, y) => x.sla.restantesHoras - y.sla.restantesHoras)
      .slice(0, 5);
  }, [ajustes]);

  if (!puedeVer) {
    return (
      <AppLayout title="Dashboard de Calidad">
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Sin acceso</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Este dashboard está restringido a Calidad, Gerencia General, Dirección y Administrador.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard de Calidad">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/control-calidad">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Volver
              </Button>
            </Link>
            <div>
              <h2 className="text-xl font-semibold">Vista ejecutiva — Control de Calidad</h2>
              <p className="text-sm text-muted-foreground">
                Indicadores en tiempo real (modo prototipo · datos mock)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/calidad/revision">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Bandeja de revisión
              </Button>
            </Link>
            <Link to="/calidad/ajustes">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Ajustes
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs primarios */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Conformidad global"
            value={`${stats.conformidadPct}%`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            sub={`${stats.liberadas} liberadas de ${stats.dictaminadas} dictaminadas`}
            tone="success"
          />
          <KpiCard
            label="Rechazo"
            value={`${stats.rechazoPct}%`}
            icon={<XCircle className="h-5 w-5" />}
            sub={`${stats.rechazadas} muestras rechazadas`}
            tone="danger"
          />
          <KpiCard
            label="Concesión"
            value={`${stats.concesionPct}%`}
            icon={<ShieldAlert className="h-5 w-5" />}
            sub={`${stats.concesion} liberadas con concesión`}
            tone="warning"
          />
          <KpiCard
            label="Pendientes / En ajuste"
            value={`${stats.pendientes} / ${stats.enAjuste}`}
            icon={<Clock className="h-5 w-5" />}
            sub={`${stats.total} muestras totales`}
            tone="info"
          />
        </div>

        {/* SLA ajustes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Salud de SLA de ajustes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <SlaPill label="Abiertos" value={slaStats.abiertos} tone="info" />
              <SlaPill label="En tiempo" value={slaStats.verde} tone="success" />
              <SlaPill label="Próximos a vencer" value={slaStats.amarillo} tone="warning" />
              <SlaPill label="Vencidos" value={slaStats.rojo} tone="danger" />
              <SlaPill
                label="Cumplimiento cerrados"
                value={`${slaStats.cumplimientoPct}%`}
                tone="success"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tendencia + Pareto */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Conformidad diaria (últimos 30 días)
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip
                    formatter={(v: number | null) => (v == null ? "Sin datos" : `${v}%`)}
                    labelFormatter={(l) => `Día ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="conformidad"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Pareto de no conformidades por variable
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 260 }}>
              {pareto.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin mediciones no conformes registradas.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pareto} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="variable" type="category" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="n" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Heatmap + listas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pendientes por máquina × turno</CardTitle>
            </CardHeader>
            <CardContent>
              {heatmap.maquinas.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Sin datos.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2">Máquina</th>
                        {heatmap.turnos.map((t) => (
                          <th key={t} className="px-2 py-1 text-center">Turno {t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmap.maquinas.map((mq) => (
                        <tr key={mq} className="border-t border-border">
                          <td className="py-1.5 pr-2 font-medium">{mq}</td>
                          {heatmap.turnos.map((t) => {
                            const v = heatmap.data[mq][t] ?? 0;
                            const intensity = v === 0 ? 0 : v / heatmap.max;
                            return (
                              <td key={t} className="px-1 py-1 text-center">
                                <div
                                  className="mx-auto flex h-9 w-12 items-center justify-center rounded text-sm font-semibold"
                                  style={{
                                    backgroundColor:
                                      v === 0
                                        ? "hsl(var(--muted))"
                                        : `color-mix(in oklab, hsl(var(--destructive)) ${Math.round(
                                            intensity * 70 + 15,
                                          )}%, transparent)`,
                                    color: v === 0 ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                                  }}
                                >
                                  {v}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Muestras pendientes más antiguas</CardTitle>
              <Link to="/calidad/revision" className="text-xs text-primary hover:underline">Ver todas</Link>
            </CardHeader>
            <CardContent>
              {muestrasAntiguas.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Sin muestras pendientes.</div>
              ) : (
                <ul className="space-y-2">
                  {muestrasAntiguas.map((m) => (
                    <PendingRow key={m.id} muestra={m} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Ajustes vencidos / próximos</CardTitle>
              <Link to="/calidad/ajustes" className="text-xs text-primary hover:underline">Ver todos</Link>
            </CardHeader>
            <CardContent>
              {ajustesVencidos.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Todos los ajustes en tiempo.</div>
              ) : (
                <ul className="space-y-2">
                  {ajustesVencidos.map(({ a, sla }) => (
                    <li key={a.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.tipo_ajuste.replace(/_/g, " ")}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Máq. {a.maquina_id} · {a.motivo.slice(0, 40)}
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          "shrink-0",
                          sla.estado === "rojo" && "bg-destructive text-destructive-foreground",
                          sla.estado === "amarillo" && "bg-amber-500 text-white",
                        )}
                      >
                        {sla.restantesHoras < 0
                          ? `${Math.abs(Math.round(sla.restantesHoras))}h vencido`
                          : `${Math.round(sla.restantesHoras)}h rest.`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

// --- Subcomponentes -------------------------------------------------------

type Tone = "success" | "danger" | "warning" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  info: "bg-primary/10 text-primary border-primary/30",
};

function KpiCard({
  label, value, sub, icon, tone,
}: {
  label: string; value: string; sub?: string; icon: React.ReactNode; tone: Tone;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          </div>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-md border", TONE_CLASSES[tone])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SlaPill({ label, value, tone }: { label: string; value: string | number; tone: Tone }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", TONE_CLASSES[tone])}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function PendingRow({ muestra }: { muestra: MuestraCalidad }) {
  const horas = Math.max(0, (Date.now() - new Date(muestra.capturado_at).getTime()) / 36e5);
  return (
    <li className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium truncate">
          Muestra #{muestra.id.slice(-6)} · Máq. {muestra.maquina_id}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          Turno {muestra.turno} · Rollo {muestra.numero_rollo ?? "—"}
        </div>
      </div>
      <Badge variant="outline" className={cn("shrink-0", horas > 4 && "border-amber-500 text-amber-700")}>
        {horas < 1 ? `${Math.round(horas * 60)} min` : `${Math.round(horas)} h`}
      </Badge>
    </li>
  );
}
