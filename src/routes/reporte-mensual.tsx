import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { FileSpreadsheet, CalendarRange, AlertTriangle, Eye, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getReporteMensual, type ReporteMensualPayload } from "@/lib/reporte-mensual.functions";
import { exportReporteMensualXLSX } from "@/lib/reporte-mensual-export";

export const Route = createFileRoute("/reporte-mensual")({
  component: Gate,
  ssr: false,
  errorComponent: ({ error }) => (
    <AppLayout title="Reporte Mensual">
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    </AppLayout>
  ),
});

function Gate() {
  return (
    <SessionGate>
      <ReporteMensualPage />
    </SessionGate>
  );
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const fmt = (n: number) => n.toLocaleString("es-MX");
const fmtKg = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

function ReporteMensualPage() {
  const auth = useAuth();
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number | "">("");
  const [busy, setBusy] = useState<"xlsx" | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  const modo: "anual" | "mensual" = month === "" ? "anual" : "mensual";
  const titulo = modo === "anual" ? "REPORTE ANUAL" : "REPORTE MENSUAL";
  const periodoTexto = modo === "anual" ? `Año ${year}` : `${MESES[(month as number) - 1]} ${year}`;

  const query = useQuery({
    queryKey: ["reporte-mensual", year, month],
    queryFn: () => getReporteMensual({ data: { year, month: month === "" ? null : (month as number) } }),
    enabled: !!auth.session?.access_token,
    staleTime: 0,
  });

  const data: ReporteMensualPayload | undefined = query.data;
  const usuario = auth.profile?.nombre ?? auth.user?.email ?? "—";

  const handleExport = async () => {
    if (!data) return;
    setBusy("xlsx");
    try {
      await exportReporteMensualXLSX(data, { usuario });
    } finally {
      setBusy(null);
    }
  };

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear() + 1; y >= 2020; y--) arr.push(y);
    return arr;
  }, [now]);

  return (
    <AppLayout title="Reporte Mensual">
      <div className="space-y-6">
        {/* Encabezado ejecutivo */}
        <div className="rounded-2xl border border-border bg-gradient-to-r from-[#141c38] via-[#1c2a55] to-[#243673] p-6 text-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                ConvertiPap · Producción
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{titulo}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-white/80">
                <CalendarRange className="h-4 w-4" />
                <span className="font-medium">{periodoTexto}</span>
                <span className="text-white/60">·</span>
                <span className="text-white/70">Generado por {usuario}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Año</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur"
                >
                  {yearOptions.map((y) => <option key={y} value={y} className="text-foreground">{y}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Mes</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur"
                >
                  <option value="" className="text-foreground">— Todos (Anual)</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1} className="text-foreground">{m}</option>)}
                </select>
              </div>
              <button
                onClick={handleExport}
                disabled={!data || busy !== null}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/30 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> {busy === "xlsx" ? "Generando…" : "XLSX"}
              </button>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/60">
            Regla: el último día de cada mes se contabiliza únicamente el Primer Turno. El resto de los días incluye todos los turnos.
            Los datos provienen directamente de la base de datos productiva.
          </p>
        </div>

        {query.isLoading || !data ? (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Cargando datos reales desde la base de datos…
          </div>
        ) : (
          <>
            {/* Resumen ejecutivo */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumen ejecutivo</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi label="Rollos producidos" value={fmt(data.resumen.rollosTotal)} />
                <Kpi label="Kg producidos" value={fmtKg(data.resumen.kgTotal)} />
                <Kpi label="Conformes" value={fmt(data.resumen.conformes)} tone="success" />
                <Kpi label="No conformes" value={fmt(data.resumen.noConformes)} tone="danger" />
                <Kpi label="% Conformidad" value={fmtPct(data.resumen.conformidadPct)} tone="primary" />
              </div>
            </section>

            {/* Producción acumulada */}
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-3">
                <h3 className="text-sm font-semibold text-primary">
                  {data.modo === "anual" ? "Producción acumulada por mes" : "Producción acumulada por día"}
                </h3>
                <span className="text-[11px] text-muted-foreground">Origen: muestras_calidad + mediciones_calidad</span>
              </div>
              <ProduccionTable data={data} />
            </section>

            {/* No conformes por máquina */}
            <section className="rounded-xl border-2 border-destructive/40 bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-3">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-destructive">
                  Rollos no conformes por máquina
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 w-10 text-center">#</th>
                    <th className="px-4 py-2">Máquina</th>
                    <th className="px-4 py-2 text-right">Rollos producidos</th>
                    <th className="px-4 py-2 text-right">No conformes</th>
                    <th className="px-4 py-2 text-right">% No conformidad</th>
                    <th className="px-4 py-2 text-right">Kg afectados</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ncPorMaquina.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">—</td></tr>
                  ) : data.ncPorMaquina.map((r, i) => (
                    <tr key={r.maquina} className="border-t border-border">
                      <td className="px-4 py-2 text-center font-semibold">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{r.maquina}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.rollos)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-destructive">{fmt(r.noConformes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.noConformidadPct.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtKg(r.kgAfectados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Tabla consolidada */}
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="text-sm font-semibold text-foreground">Tabla consolidada</h3>
                <button
                  onClick={() => setShowTrace(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Eye className="h-3.5 w-3.5" /> Ver trazabilidad ({data.trazabilidad.length})
                </button>
              </div>
              <ConsolidadoTable data={data} />
            </section>
          </>
        )}
      </div>

      {showTrace && data && (
        <TrazabilidadDrawer payload={data} onClose={() => setShowTrace(false)} />
      )}
    </AppLayout>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "primary" }) {
  const toneClass =
    tone === "success" ? "text-success"
    : tone === "danger" ? "text-destructive"
    : tone === "primary" ? "text-primary"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function ProduccionTable({ data }: { data: ReporteMensualPayload }) {
  if (data.modo === "anual") {
    return (
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Mes</th>
            <th className="px-4 py-2 text-right">Rollos</th>
            <th className="px-4 py-2 text-right">Kg producidos</th>
            <th className="px-4 py-2 text-right">Conformes</th>
            <th className="px-4 py-2 text-right">No conformes</th>
            <th className="px-4 py-2 text-right">% Conformidad</th>
          </tr>
        </thead>
        <tbody>
          {data.buckets.map((b) => (
            <tr key={b.label} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{b.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.rollos)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.kg === 0 ? "—" : fmtKg(b.kg)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.conformes)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.noConformes)}</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtPct(b.conformidadPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  // mensual: día x máquina
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-4 py-2">Día</th>
          <th className="px-4 py-2">Máquina</th>
          <th className="px-4 py-2 text-right">Rollos</th>
          <th className="px-4 py-2 text-right">Kg producidos</th>
          <th className="px-4 py-2 text-right">Conformes</th>
          <th className="px-4 py-2 text-right">No conformes</th>
          <th className="px-4 py-2 text-right">% Conformidad</th>
        </tr>
      </thead>
      <tbody>
        {data.buckets.filter((b) => b.rollos > 0).length === 0 ? (
          <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">Sin registros en el mes seleccionado.</td></tr>
        ) : data.buckets.filter((b) => b.rollos > 0).map((b, idx) => (
          <tr key={`${b.label}-${b.maquina}-${idx}`} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{`${data.year}-${String(data.month).padStart(2, "0")}-${b.label}`}</td>
            <td className="px-4 py-2">{dash(b.maquina)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(b.rollos)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmtKg(b.kg)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(b.conformes)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(b.noConformes)}</td>
            <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtPct(b.conformidadPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConsolidadoTable({ data }: { data: ReporteMensualPayload }) {
  if (data.modo === "anual") {
    return (
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Mes</th>
            <th className="px-4 py-2 text-right">Rollos producidos</th>
            <th className="px-4 py-2 text-right">Kg producidos</th>
            <th className="px-4 py-2 text-right">Conformes</th>
            <th className="px-4 py-2 text-right">No conformes</th>
            <th className="px-4 py-2 text-right">% Conformidad</th>
          </tr>
        </thead>
        <tbody>
          {data.buckets.map((b) => (
            <tr key={b.label} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{b.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.rollos)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.kg === 0 ? "—" : fmtKg(b.kg)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.conformes)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.rollos === 0 ? "—" : fmt(b.noConformes)}</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtPct(b.conformidadPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <ProduccionTable data={data} />;
}

function TrazabilidadDrawer({ payload, onClose }: { payload: ReporteMensualPayload; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-5xl overflow-hidden bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Trazabilidad — Registros base</h3>
            <p className="text-[11px] text-muted-foreground">
              {payload.trazabilidad.length} registros · {payload.periodoTexto}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent" title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100vh-56px)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">N° Rollo</th>
                <th className="px-3 py-2">Máquina</th>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Capturista</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Dictamen</th>
                <th className="px-3 py-2">Folio</th>
              </tr>
            </thead>
            <tbody>
              {payload.trazabilidad.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">—</td></tr>
              ) : payload.trazabilidad.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(t.fecha).toLocaleString("es-MX")}</td>
                  <td className="px-3 py-1.5 font-mono">{t.numero_rollo}</td>
                  <td className="px-3 py-1.5">{dash(t.maquina)}</td>
                  <td className="px-3 py-1.5 text-center">{t.turno}</td>
                  <td className="px-3 py-1.5">{dash(t.producto)}</td>
                  <td className="px-3 py-1.5">{dash(t.capturista)}</td>
                  <td className="px-3 py-1.5">{t.estado}</td>
                  <td className="px-3 py-1.5">{dash(t.dictamen)}</td>
                  <td className="px-3 py-1.5 font-mono">{t.folio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
