import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { FileBarChart2, Download, FileSpreadsheet, TrendingUp, TrendingDown, CalendarRange } from "lucide-react";
import logoUrl from "@/assets/logo-convertipap.png";
import { RangoSelector, MESES, rangoLabel, rangoToFreq, type Rango } from "@/components/qc/RangoSelector";
import { useLabFilter, LAB_LABEL } from "@/lib/lab";
import { getReportes } from "@/lib/reportes.functions";
import { useAuth } from "@/lib/auth";
import { getProduccionCentro } from "@/lib/produccion-centro.functions";
import { exportProduccionPDF, exportProduccionXLSX } from "@/lib/produccion-centro-export";
import { getReporteMensual } from "@/lib/reporte-mensual.functions";
import { exportReporteMensualPDF, exportReporteMensualXLSX } from "@/lib/reporte-mensual-export";


export const Route = createFileRoute("/reportes")({
  component: ReportesGate,
  ssr: false,
  errorComponent: ({ error }) => (
    <AppLayout title="Reportes e Indicadores">
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudieron cargar los reportes: {error.message}
      </div>
    </AppLayout>
  ),
});

function ReportesGate() {
  return (
    <SessionGate>
      <ReportesPage />
    </SessionGate>
  );
}

const META_EMPRESA = {
  empresa: "ConvertiPap S.A. de C.V.",
  planta: "Planta Tlaxcala",
  direccion: "Parque Industrial Xicohténcatl, Tlaxcala, México",
  responsable: "Ing. Jonatan Alberto Pelaez · Gerente de Calidad",
  operador: "Carlos Ramírez · Supervisor de turno",
  sistema: "ConvertiPap QMS · v1.0",
};

// Convierte (rango, mesesSel) a un par ISO start/end.
function computeWindow(rango: Rango, mesesSel: number[]): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (rango === "turno" || rango === "dia") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (rango === "semana") {
    start = new Date(now.getTime() - 7 * 86400000);
  } else if (rango === "mes") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (rango === "año") {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    // custom: del primer mes seleccionado al fin del último
    if (mesesSel.length === 0) {
      start = new Date(now.getFullYear(), 0, 1);
    } else {
      const sorted = [...mesesSel].sort((a, b) => a - b);
      start = new Date(now.getFullYear(), sorted[0], 1);
      const lastM = sorted[sorted.length - 1];
      end.setFullYear(now.getFullYear(), lastM + 1, 1);
      end.setHours(0, 0, 0, 0);
    }
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

const reportesQueryOptions = (start: string, end: string) =>
  queryOptions({
    queryKey: ["reportes", start, end],
    queryFn: () => getReportes({ data: { start, end } }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });


async function descargarXLSX(
  nombre: string,
  hojas: { sheet: string; rows: Record<string, string | number>[] }[],
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.rows);
    XLSX.utils.book_append_sheet(wb, ws, h.sheet.slice(0, 31));
  }
  XLSX.writeFile(wb, `${buildFileName(nombre)}.xlsx`);
}

function buildFileName(nombre: string) {
  const safe = nombre.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hora = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${safe}_${fecha}_${hora}`;
}

async function urlToDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function descargarPDF(
  nombre: string,
  freq: string,
  hojas: { sheet: string; rows: Record<string, string | number>[] }[],
) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  const logoData = await urlToDataURL(logoUrl);
  if (logoData) {
    try { doc.addImage(logoData, "PNG", M, M, 90, 36); } catch { /* logo opcional */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 30);
  doc.text(META_EMPRESA.empresa, pageW - M, M + 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(META_EMPRESA.planta, pageW - M, M + 28, { align: "right" });
  doc.text(META_EMPRESA.direccion, pageW - M, M + 40, { align: "right" });

  doc.setDrawColor(220);
  doc.setLineWidth(0.6);
  doc.line(M, M + 56, pageW - M, M + 56);

  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(nombre, M, M + 84);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const fechaGen = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
  doc.text(`Reporte ${freq.toLowerCase()} · Generado: ${fechaGen}`, M, M + 100);

  autoTable(doc, {
    startY: M + 120,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4, textColor: [40, 40, 50] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [90, 90, 110], cellWidth: 110 },
      1: { cellWidth: (pageW - M * 2) / 2 - 110 },
      2: { fontStyle: "bold", textColor: [90, 90, 110], cellWidth: 110 },
      3: { cellWidth: (pageW - M * 2) / 2 - 110 },
    },
    body: [
      ["Responsable", META_EMPRESA.responsable, "Operador", META_EMPRESA.operador],
      ["Planta", META_EMPRESA.planta, "Sistema origen", META_EMPRESA.sistema],
      ["Frecuencia", freq, "Folio", `RPT-${Date.now().toString().slice(-8)}`],
    ],
  });

  const lastY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFillColor(245, 247, 251);
  doc.rect(M, lastY1 + 16, pageW - M * 2, 60, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(60, 80, 140);
  doc.text("Resumen ejecutivo", M + 12, lastY1 + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  const resumen = doc.splitTextToSize(
    `Este reporte presenta los indicadores clave de "${nombre}" para la ${META_EMPRESA.planta}. ` +
      `Los datos provienen del sistema ${META_EMPRESA.sistema} y han sido validados por el área de calidad. ` +
      `Use el archivo XLSX adjunto para análisis detallado en base de datos.`,
    pageW - M * 2 - 24,
  );
  doc.text(resumen, M + 12, lastY1 + 48);

  let cursorY = lastY1 + 96;
  for (const h of hojas) {
    if (cursorY > pageH - 120) { doc.addPage(); cursorY = M; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 30);
    doc.text(h.sheet, M, cursorY);

    const cols = h.rows.length ? Object.keys(h.rows[0]) : ["—"];
    const head = [cols.map((c) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()))];
    const body = h.rows.map((row) => cols.map((c) => String(row[c] ?? "")));

    autoTable(doc, {
      startY: cursorY + 8,
      head,
      body: body.length ? body : [["Sin datos"]],
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [60, 80, 140], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      margin: { left: M, right: M },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.line(M, pageH - 40, pageW - M, pageH - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${META_EMPRESA.empresa} · Documento confidencial`, M, pageH - 24);
    doc.text(`Página ${i} de ${total}`, pageW - M, pageH - 24, { align: "right" });
  }

  doc.save(`${buildFileName(nombre)}.pdf`);
}

const REPORTES: { nombre: string; xlsxOnly?: boolean; xlsxDataset?: string; descripcion: string }[] = [
  { nombre: "Detalle de no conformidades", descripcion: "PDF ejecutivo + XLSX para BD" },
  { nombre: "Tendencia de variables críticas", descripcion: "PDF ejecutivo + XLSX para BD" },
  { nombre: "Costo de No Calidad", xlsxDataset: "Costo de No Calidad (detalle)", descripcion: "PDF con detalle general · XLSX con 14 variables + personal" },
  { nombre: "Reporte General", xlsxOnly: true, descripcion: "Todos los rollos producidos del periodo con sus 14 variables (solo XLSX)" },
];

function ReportesPage() {
  const auth = useAuth();
  const [rango, setRango] = useState<Rango>("semana");
  const [mesesSel, setMesesSel] = useState<number[]>(MESES.map((_, i) => i));
  const periodo = rangoLabel(rango, mesesSel);
  const freq = rangoToFreq(rango);
  const labFilter = useLabFilter();
  const { start, end } = useMemo(() => computeWindow(rango, mesesSel), [rango, mesesSel]);

  const reportesQuery = useQuery({
    ...reportesQueryOptions(start, end),
    enabled: !!auth.session?.access_token,
    retry: false,
  });
  const payload = reportesQuery.data;

  // Filtrado por laboratorio
  const datasetsFiltrados = useMemo(() => {
    const out: Record<string, { sheet: string; rows: Record<string, string | number>[] }[]> = {};
    for (const [nombre, hojas] of Object.entries(payload?.datasets ?? {})) {
      out[nombre] = hojas.map((h) => ({
        ...h,
        rows: h.rows.filter((row) => {
          const maq = typeof row.maquina === "string" ? row.maquina : null;
          if (!maq) return true;
          return labFilter.isMachineAllowed(maq);
        }),
      }));
    }
    return out;
  }, [payload, labFilter]);

  const plantasPerf = useMemo(
    () => payload?.desempenoPlanta ?? [],
    [payload],
  );

  if (reportesQuery.error) {
    return (
      <AppLayout title="Reportes e Indicadores">
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudieron cargar los reportes: {reportesQuery.error.message}
        </div>
      </AppLayout>
    );
  }

  if (reportesQuery.isLoading || !payload) {
    return (
      <AppLayout title="Reportes e Indicadores">
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">Cargando reportes…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Reportes e Indicadores">
      <div className="space-y-6">
        {labFilter.lab && (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-xs text-primary">
            Mostrando solo datos de <strong>{LAB_LABEL[labFilter.lab]}</strong>
            {labFilter.allowedMachineCodes && ` (${labFilter.allowedMachineCodes.join(", ")})`}.
          </div>
        )}

        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Periodo de análisis</div>
              <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <CalendarRange className="h-4 w-4 text-primary" />
                <span className="font-semibold">{periodo}</span>
                <span className="text-muted-foreground">· {freq}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Todos los reportes se generarán para el periodo seleccionado.
              </p>
            </div>
            <RangoSelector
              rango={rango}
              setRango={setRango}
              mesesSel={mesesSel}
              setMesesSel={setMesesSel}
              includeTurno
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 p-5">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold text-primary">Desempeño por planta · {periodo}</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3 text-right">Cumplimiento</th>
                <th className="px-4 py-3 text-right">Rollos producidos</th>
                <th className="px-4 py-3 text-right">No conformes</th>
                <th className="px-4 py-3 text-right">Δ vs periodo anterior</th>
              </tr>
            </thead>
            <tbody>
              {plantasPerf.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-xs text-muted-foreground" colSpan={5}>
                    Sin datos en el periodo seleccionado.
                  </td>
                </tr>
              ) : plantasPerf.map((p) => (
                <tr key={p.planta} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{p.planta}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.cumpl}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.rollos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.nc}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.delta >= 0 ? "text-success" : "text-destructive"}`}>
                    <span className="inline-flex items-center gap-1">
                      {p.delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {p.delta > 0 ? "+" : ""}{p.delta}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ReporteProduccionItem
          start={start}
          end={end}
          freq={freq}
          periodo={periodo}
          usuario={auth.profile?.nombre ?? auth.user?.email ?? "—"}
          enabled={!!auth.session?.access_token}
          rango={rango}
          setRango={setRango}
          mesesSel={mesesSel}
          setMesesSel={setMesesSel}
        />

        <ReporteMensualItem
          usuario={auth.profile?.nombre ?? auth.user?.email ?? "—"}
          enabled={!!auth.session?.access_token}
        />



        <div className="rounded-xl border border-border bg-card shadow-sm">

          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Reportes disponibles</h3>
              <p className="text-[11px] text-muted-foreground">Generación: {freq} · {periodo}</p>
            </div>
            <FileBarChart2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="divide-y divide-border">
            {REPORTES.map((rep) => {
              const nombre = rep.nombre;
              const titulo = `${nombre} · ${periodo}`;
              const fetchFresh = async () => {
                // Siempre consultar en tiempo real desde la BD al descargar,
                // ignorando cualquier caché previo de React Query.
                const fresh = await getReportes({ data: { start, end } });
                const out: Record<string, { sheet: string; rows: Record<string, string | number>[] }[]> = {};
                for (const [n, hojas] of Object.entries(fresh.datasets ?? {})) {
                  out[n] = hojas.map((h) => ({
                    ...h,
                    rows: h.rows.filter((row) => {
                      const maq = typeof row.maquina === "string" ? row.maquina : null;
                      if (!maq) return true;
                      return labFilter.isMachineAllowed(maq);
                    }),
                  }));
                }
                return out;
              };
              return (
                <li key={nombre} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{nombre}</div>
                    <div className="text-[11px] text-muted-foreground">{rep.descripcion}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!rep.xlsxOnly && (
                      <button
                        onClick={async () => {
                          const fresh = await fetchFresh();
                          const hojasPdf = fresh[nombre] ?? [{ sheet: "Datos", rows: [] }];
                          await descargarPDF(titulo, `${freq} · ${periodo}`, hojasPdf);
                          reportesQuery.refetch();
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                        title="Descargar reporte ejecutivo en PDF (datos en tiempo real)"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const fresh = await fetchFresh();
                        const hojasXlsx = rep.xlsxDataset
                          ? (fresh[rep.xlsxDataset] ?? fresh[nombre] ?? [{ sheet: "Datos", rows: [] }])
                          : (fresh[nombre] ?? [{ sheet: "Datos", rows: [] }]);
                        await descargarXLSX(nombre, hojasXlsx);
                        reportesQuery.refetch();
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
                      title="Descargar archivo XLSX para manejo de BD (datos en tiempo real)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX (BD)
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────
// Reporte de Producción — generador de PDF/XLSX con filtros propios
// ─────────────────────────────────────────────────────────────────
function ReporteProduccionItem(props: {

  start: string;
  end: string;
  freq: string;
  periodo: string;
  usuario: string;
  enabled: boolean;
  rango: Rango;
  setRango: (r: Rango) => void;
  mesesSel: number[];
  setMesesSel: (m: number[]) => void;
}) {
  const { start, end, freq, periodo, usuario, enabled, rango, setRango, mesesSel, setMesesSel } = props;
  const [turno, setTurno] = useState("");
  const [maquina, setMaquina] = useState("");
  const [producto, setProducto] = useState("");
  const [estado, setEstado] = useState("");
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carga datos para poblar filtros (máquinas, productos, turnos) y exportar.
  // Determinar rango a partir de freq textual del periodo seleccionado arriba.
  const rangoCentro = useMemo<"dia" | "semana" | "mes" | "año" | "custom">(() => {
    const f = freq.toLowerCase();
    if (f.includes("diari")) return "dia";
    if (f.includes("seman")) return "semana";
    if (f.includes("mensu")) return "mes";
    if (f.includes("anual")) return "año";
    return "custom";
  }, [freq]);

  const dataQuery = useQuery({
    queryKey: ["reporte-produccion", start, end, rangoCentro],
    queryFn: () => getProduccionCentro({ data: { rango: rangoCentro, start, end } }),
    enabled,
    staleTime: 30_000,
  });

  const data = dataQuery.data;
  const turnos = useMemo(() => Array.from(new Set((data?.tabla ?? []).map((r) => r.turno))).filter(Boolean), [data]);
  const maquinas = useMemo(() => Array.from(new Set((data?.tabla ?? []).map((r) => r.maquina).filter((v): v is string => !!v))), [data]);
  const productos = useMemo(() => Array.from(new Set((data?.tabla ?? []).map((r) => r.producto).filter((v): v is string => !!v))), [data]);

  const ctx = useMemo(
    () => ({
      tipoReporte: freq,
      periodoTexto: periodo,
      usuario,
      filtros: { turno: turno || undefined, maquina: maquina || undefined, producto: producto || undefined, estado: estado || undefined },
    }),
    [freq, periodo, usuario, turno, maquina, producto, estado],
  );

  const handle = async (kind: "pdf" | "xlsx") => {
    if (!data) return;
    setBusy(kind); setError(null);
    try {
      if (kind === "pdf") await exportProduccionPDF(data, ctx);
      else await exportProduccionXLSX(data, ctx);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-transparent p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">

      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agrupar reporte por</label>
        <RangoSelector
          rango={rango}
          setRango={setRango}
          mesesSel={mesesSel}
          setMesesSel={setMesesSel}
          includeTurno
        />
      </div>
          <div>
            <div className="text-sm font-bold text-foreground">Reporte de Producción</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Genera reporte ejecutivo (PDF) o detallado (XLSX) del periodo seleccionado, con filtros por turno, máquina, producto y estado de calidad.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Periodo: <span className="font-medium">{periodo}</span> · {freq}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <FilterSelect label="Turno" value={turno} onChange={setTurno} options={turnos} />
        <FilterSelect label="Máquina" value={maquina} onChange={setMaquina} options={maquinas} />
        <FilterSelect label="Producto" value={producto} onChange={setProducto} options={productos} />
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Estado calidad</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Todos</option>
            <option value="liberado">Liberado</option>
            <option value="pendiente">Pendiente</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          {dataQuery.isLoading
            ? "Cargando datos…"
            : data
              ? `${data.tabla.length} registros disponibles · Última actualización: ${new Date(data.ultimaActualizacion).toLocaleString("es-MX")}`
              : "Sin datos disponibles"}
          {error && <span className="ml-2 text-destructive">· {error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handle("pdf")}
            disabled={!data || busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            title="Descargar reporte ejecutivo PDF"
          >
            <Download className="h-3.5 w-3.5" /> {busy === "pdf" ? "Generando…" : "PDF"}
          </button>
          <button
            onClick={() => handle("xlsx")}
            disabled={!data || busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
            title="Descargar XLSX detallado"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> {busy === "xlsx" ? "Generando…" : "XLSX (BD)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect(p: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{p.label}</label>
      <select
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        <option value="">Todos</option>
        {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}



// ─────────────────────────────────────────────────────────────────
// Reporte Mensual / Anual — generador de PDF/XLSX (filtros propios)
// ─────────────────────────────────────────────────────────────────
const MESES_RM = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function ReporteMensualItem({ usuario, enabled }: { usuario: string; enabled: boolean }) {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number | "">("");
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modo: "anual" | "mensual" = month === "" ? "anual" : "mensual";
  const titulo = "Reporte Mensual";
  const periodoTexto = modo === "anual" ? `Año ${year}` : `${MESES_RM[(month as number) - 1]} ${year}`;

  const query = useQuery({
    queryKey: ["reporte-mensual", year, month],
    queryFn: () => getReporteMensual({ data: { year, month: month === "" ? null : (month as number) } }),
    enabled,
    staleTime: 30_000,
  });
  const data = query.data;

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear() + 1; y >= 2020; y--) arr.push(y);
    return arr;
  }, [now]);

  const handle = async (kind: "pdf" | "xlsx") => {
    if (!data) return;
    setBusy(kind); setError(null);
    try {
      if (kind === "pdf") await exportReporteMensualPDF(data, { usuario });
      else await exportReporteMensualXLSX(data, { usuario });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-transparent p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Año / Mes</label>
            <div className="flex items-center gap-2">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="">— Todos (Anual)</option>
                {MESES_RM.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">{titulo}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Consolidado de producción y conformidad por {modo === "anual" ? "mes" : "día y máquina"}, con ranking de no conformes y trazabilidad por rollo.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Periodo: <span className="font-medium">{periodoTexto}</span> · Regla: último día del mes solo Primer Turno.
            </p>
          </div>
        </div>
      </div>

      {data && <ReporteMensualVisuales data={data} />}


      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          {query.isLoading
            ? "Cargando datos…"
            : data
              ? `${data.resumen.rollosTotal.toLocaleString("es-MX")} rollos · ${data.trazabilidad.length} registros trazables`
              : "Sin datos disponibles"}
          {error && <span className="ml-2 text-destructive">· {error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handle("pdf")}
            disabled={!data || busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            title="Descargar reporte ejecutivo PDF"
          >
            <Download className="h-3.5 w-3.5" /> {busy === "pdf" ? "Generando…" : "PDF"}
          </button>
          <button
            onClick={() => handle("xlsx")}
            disabled={!data || busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
            title="Descargar XLSX detallado con trazabilidad"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> {busy === "xlsx" ? "Generando…" : "XLSX (BD)"}
          </button>
        </div>
      </div>
    </div>
  );
}
