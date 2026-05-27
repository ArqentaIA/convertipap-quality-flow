import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { FileBarChart2, Download, FileSpreadsheet, TrendingUp, TrendingDown } from "lucide-react";
import logoUrl from "@/assets/logo-convertipap.png";

export const Route = createFileRoute("/reportes")({ component: ReportesPage });

// Metadatos ejecutivos comunes a todos los reportes
const META_EMPRESA = {
  empresa: "ConvertiPap S.A. de C.V.",
  planta: "Planta Tlaxcala",
  direccion: "Parque Industrial Xicohténcatl, Tlaxcala, México",
  responsable: "Ing. Laura Méndez · Gerente de Calidad",
  operador: "Carlos Ramírez · Supervisor de turno",
  sistema: "ConvertiPap QMS · v1.0",
};


// Datasets simulados por reporte (estructura tipo BD, listos para exportar a XLSX)
const DATASETS: Record<string, { sheet: string; rows: Record<string, string | number>[] }[]> = {
  "Cumplimiento Semanal": [
    {
      sheet: "Cumplimiento",
      rows: [
        { semana: "S1", planta: "Tlaxcala", maquina: "MP-04", cumplimiento_pct: 89, meta_pct: 90 },
        { semana: "S1", planta: "Tlaxcala", maquina: "MP-05", cumplimiento_pct: 92, meta_pct: 90 },
        { semana: "S1", planta: "Tlaxcala", maquina: "MP-06", cumplimiento_pct: 79, meta_pct: 90 },
        { semana: "S1", planta: "Tlaxcala", maquina: "MP-07", cumplimiento_pct: 88, meta_pct: 90 },
        { semana: "S2", planta: "Tlaxcala", maquina: "MP-04", cumplimiento_pct: 91, meta_pct: 90 },
        { semana: "S2", planta: "Tlaxcala", maquina: "MP-05", cumplimiento_pct: 94, meta_pct: 90 },
        { semana: "S2", planta: "Tlaxcala", maquina: "MP-06", cumplimiento_pct: 81, meta_pct: 90 },
        { semana: "S2", planta: "Tlaxcala", maquina: "MP-07", cumplimiento_pct: 90, meta_pct: 90 },
      ],
    },
  ],
  "Detalle de no conformidades": [
    {
      sheet: "No conformidades",
      rows: [
        { id: "NC-0001", fecha: "2026-05-20", maquina: "MP-04", variable: "Humedad", valor: 7.8, limite_sup: 7.0, severidad: "Media" },
        { id: "NC-0002", fecha: "2026-05-21", maquina: "MP-06", variable: "Peso base", valor: 18.2, limite_inf: 19.0, severidad: "Alta" },
        { id: "NC-0003", fecha: "2026-05-22", maquina: "MP-05", variable: "Tensión MD", valor: 1.9, limite_inf: 2.2, severidad: "Alta" },
        { id: "NC-0004", fecha: "2026-05-23", maquina: "MP-07", variable: "Blancura R457", valor: 82.1, limite_inf: 84.0, severidad: "Baja" },
      ],
    },
  ],
  "Tendencia de variables críticas": [
    {
      sheet: "Tendencia",
      rows: [
        { mes: "Ene", variable: "Humedad", promedio: 6.4, desviacion: 0.31, fuera_spec_pct: 4.2 },
        { mes: "Feb", variable: "Humedad", promedio: 6.6, desviacion: 0.28, fuera_spec_pct: 3.8 },
        { mes: "Mar", variable: "Peso base", promedio: 19.4, desviacion: 0.42, fuera_spec_pct: 5.1 },
        { mes: "Abr", variable: "Tensión MD", promedio: 2.4, desviacion: 0.18, fuera_spec_pct: 2.7 },
      ],
    },
  ],
  "OEE por máquina y turno": [
    {
      sheet: "OEE",
      rows: [
        { fecha: "2026-05-25", maquina: "MP-04", turno: "A", disponibilidad: 0.92, desempeno: 0.95, calidad: 0.98, oee: 0.857 },
        { fecha: "2026-05-25", maquina: "MP-04", turno: "B", disponibilidad: 0.88, desempeno: 0.93, calidad: 0.97, oee: 0.793 },
        { fecha: "2026-05-25", maquina: "MP-05", turno: "A", disponibilidad: 0.94, desempeno: 0.96, calidad: 0.99, oee: 0.894 },
        { fecha: "2026-05-25", maquina: "MP-06", turno: "A", disponibilidad: 0.80, desempeno: 0.87, calidad: 0.95, oee: 0.661 },
        { fecha: "2026-05-25", maquina: "MP-07", turno: "A", disponibilidad: 0.90, desempeno: 0.94, calidad: 0.97, oee: 0.820 },
      ],
    },
  ],
  "Reporte ejecutivo de calidad": [
    {
      sheet: "KPIs",
      rows: [
        { kpi: "Cumplimiento promedio", valor: 92.4, unidad: "%", periodo: "Mayo 2026" },
        { kpi: "OEE promedio", valor: 84.1, unidad: "%", periodo: "Mayo 2026" },
        { kpi: "Rollos producidos", valor: 1720, unidad: "rollos", periodo: "Mayo 2026" },
        { kpi: "No conformidades", valor: 44, unidad: "incidencias", periodo: "Mayo 2026" },
      ],
    },
    {
      sheet: "Resumen por planta",
      rows: [
        { planta: "Tlaxcala", cumplimiento_pct: 92.4, rollos: 412, no_conformes: 6, delta_pct: 1.8 },
      ],
    },
  ],
};

async function descargarXLSX(nombre: string) {
  const XLSX = await import("xlsx");
  const hojas = DATASETS[nombre] ?? [
    { sheet: "Datos", rows: [{ aviso: "Sin datos disponibles para este reporte" }] },
  ];
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.rows);
    XLSX.utils.book_append_sheet(wb, ws, h.sheet.slice(0, 31));
  }
  const fecha = new Date().toISOString().slice(0, 10);
  const safe = nombre.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  XLSX.writeFile(wb, `${safe}_${fecha}.xlsx`);
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

async function descargarPDF(nombre: string, freq: string) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  // Encabezado con logotipo
  const logoData = await urlToDataURL(logoUrl);
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", M, M, 90, 36);
    } catch {
      /* logo opcional */
    }
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

  // Título del reporte
  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(nombre, M, M + 84);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const fechaGen = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
  doc.text(`Reporte ${freq.toLowerCase()} · Generado: ${fechaGen}`, M, M + 100);

  // Bloque de metadatos
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

  // Resumen ejecutivo
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

  // Datos
  const hojas = DATASETS[nombre] ?? [{ sheet: "Datos", rows: [] }];
  let cursorY = lastY1 + 96;

  for (const h of hojas) {
    if (cursorY > pageH - 120) {
      doc.addPage();
      cursorY = M;
    }
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

  // Pie de página
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

  const safe = nombre.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`${safe}_${fecha}.pdf`);
}

const TENDENCIA = [
  { dia: "Lun", cumpl: 88 },
  { dia: "Mar", cumpl: 91 },
  { dia: "Mié", cumpl: 86 },
  { dia: "Jue", cumpl: 93 },
  { dia: "Vie", cumpl: 95 },
  { dia: "Sáb", cumpl: 89 },
  { dia: "Dom", cumpl: 92 },
];

const PLANTAS_PERF = [
  { planta: "Tlaxcala", cumpl: 92.4, rollos: 412, nc: 6, delta: 1.8 },
];

const VARIABLES_TOP = [
  { v: "Humedad", incidencias: 18, impacto: "Media" },
  { v: "Peso base", incidencias: 12, impacto: "Alta" },
  { v: "Tensión MD", incidencias: 9, impacto: "Alta" },
  { v: "Blancura R457", incidencias: 5, impacto: "Baja" },
];

const REPORTES = [
  { nombre: "Cumplimiento Semanal", freq: "Semanal", formato: "PDF" },
  { nombre: "Detalle de no conformidades", freq: "Diario", formato: "Excel" },
  { nombre: "Tendencia de variables críticas", freq: "Mensual", formato: "PDF" },
  { nombre: "OEE por máquina y turno", freq: "Semanal", formato: "Excel" },
  { nombre: "Reporte ejecutivo de calidad", freq: "Mensual", formato: "PDF" },
];

function ReportesPage() {
  const max = Math.max(...TENDENCIA.map(t => t.cumpl));
  return (
    <AppLayout title="Reportes e Indicadores">
      <div className="space-y-6">

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 p-5">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold text-primary">Desempeño por planta</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3 text-right">Cumplimiento</th>
                <th className="px-4 py-3 text-right">Rollos producidos</th>
                <th className="px-4 py-3 text-right">No conformes</th>
                <th className="px-4 py-3 text-right">Δ vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {PLANTAS_PERF.map((p) => (
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

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h3 className="text-sm font-semibold text-foreground">Reportes disponibles</h3>
            <FileBarChart2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="divide-y divide-border">
            {REPORTES.map((r) => (
              <li key={r.nombre} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{r.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">Frecuencia: {r.freq} · {r.formato}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => descargarPDF(r.nombre, r.freq)}
                    className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    title="Descargar reporte ejecutivo en PDF"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar
                  </button>
                  <button
                    onClick={() => descargarXLSX(r.nombre)}
                    className="inline-flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
                    title="Descargar archivo XLSX para manejo de BD"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX (BD)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
