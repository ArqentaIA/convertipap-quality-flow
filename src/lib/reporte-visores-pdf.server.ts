// =============================================================================
// Reporte de cierre de turno en PDF (server-only).
// Misma fuente de datos que el correo embebido y que el Excel: los objetos
// `resumen` y `detalles` construidos en reporte-visores.server.ts.
// READ ONLY: no consulta ni escribe base de datos.
// =============================================================================
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoDataUrl from "@/assets/logo-convertipap.png?inline";

export type PdfCelda = { v: string | number; ok: boolean };

export type PdfDetalle = {
  codigo: string;
  nombre: string;
  planta: string;
  turno?: string | null;
  head: string[];
  filas: PdfCelda[][];
  fuera: number;
};

export type PdfResumen = {
  codigo: string;
  nombre: string;
  planta: string;
  turno: string | null;
  producto: string;
  rollos: number;
  liberados: number;
  cumplimientoPct: number;
  cumplimientoVariablesPct: number;
};

const DARK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [91, 101, 115];
const CARD: [number, number, number] = [240, 244, 249];
const LINE: [number, number, number] = [215, 222, 232];
const BAR_A: [number, number, number] = [45, 138, 158];
const BAR_B: [number, number, number] = [27, 127, 94];
const FUERA_BG: [number, number, number] = [255, 243, 205];
const FUERA_TX: [number, number, number] = [179, 38, 30];

const AVISO =
  "AVISO DE CONFIDENCIALIDAD. Este documento contiene información operativa y de calidad propiedad de Convertipap, de carácter confidencial y de uso exclusivo del personal autorizado. Queda prohibida su divulgación, reproducción total o parcial, distribución o uso por cualquier medio sin autorización expresa de la Dirección General. El uso indebido de esta información es responsabilidad exclusiva de quien la ejecute.";

function fmtFecha(d: Date) {
  return d.toLocaleString("es-MX", { hour12: false, timeZone: "America/Mexico_City" });
}

/** Construye el PDF ejecutivo del cierre de turno. Devuelve bytes del archivo. */
export function construirPdfVisores(
  resumen: PdfResumen[],
  detalles: PdfDetalle[],
  generado: Date,
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  const totalRollos = resumen.reduce((a, r) => a + r.rollos, 0);
  const totalLib = resumen.reduce((a, r) => a + r.liberados, 0);
  const libPct = totalRollos > 0 ? Math.round((totalLib / totalRollos) * 1000) / 10 : 0;
  const promVars =
    resumen.length > 0
      ? Math.round((resumen.reduce((a, r) => a + r.cumplimientoVariablesPct, 0) / resumen.length) * 10) / 10
      : 0;
  const ranking = [...resumen].sort((a, b) => b.cumplimientoVariablesPct - a.cumplimientoVariablesPct);
  const mejor = ranking[0];
  const peor = ranking[ranking.length - 1];
  const plantas = [...new Set(resumen.map((r) => r.planta).filter(Boolean))].join(" · ") || "—";
  const turnos = [...new Set(resumen.map((r) => r.turno).filter(Boolean))].join(" · ") || "—";
  const totalFuera = detalles.reduce((a, d) => a + d.fuera, 0);

  // ------------------------------------------------------------- Encabezado
  function encabezado(titulo: string) {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, W, 24, "F");
    try {
      doc.addImage(String(logoDataUrl), "PNG", M, 4.5, 34, 15);
    } catch {
      /* el logotipo es decorativo */
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(titulo, M + 40, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(
      `Planta: ${plantas}   |   Turno: ${turnos}   |   Generado: ${fmtFecha(generado)} (hora planta)`,
      M + 40,
      17.5,
    );
    doc.setTextColor(0, 0, 0);
  }

  encabezado("REPORTE DE CIERRE DE TURNO · VISORES");

  // ------------------------------------------------------------- KPIs
  const kpis: Array<[string, string]> = [
    ["ROLLOS CAPTURADOS", String(totalRollos)],
    ["ROLLOS LIBERADOS", String(totalLib)],
    ["LIBERACIÓN", `${libPct}%`],
    ["PROM. VARIABLES", `${promVars}%`],
    ["VALORES FUERA DE RANGO", String(totalFuera)],
  ];
  const gap = 4;
  const cw = (W - M * 2 - gap * (kpis.length - 1)) / kpis.length;
  let y = 30;
  kpis.forEach(([label, valor], i) => {
    const x = M + i * (cw + gap);
    doc.setFillColor(...CARD);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, y, cw, 20, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, x + cw / 2, y + 6, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text(valor, x + cw / 2, y + 15.5, { align: "center" });
  });
  y += 25;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BAR_B);
  doc.text(`MEJOR DESEMPEÑO: ${mejor ? `${mejor.codigo} · ${mejor.cumplimientoVariablesPct}%` : "—"}`, M, y);
  doc.setTextColor(...FUERA_TX);
  doc.text(
    `ATENCIÓN PRIORITARIA: ${peor ? `${peor.codigo} · ${peor.cumplimientoVariablesPct}%` : "—"}`,
    W / 2,
    y,
  );
  doc.setTextColor(0, 0, 0);
  y += 6;

  // ------------------------------------------------------------- Gráfica
  const chartH = 52;
  doc.setFillColor(...DARK);
  doc.rect(M, y, W - M * 2, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("VOLUMEN VS CUMPLIMIENTO POR MÁQUINA", W / 2, y + 4.8, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 7;

  dibujarGrafica(doc, M, y, W - M * 2, chartH, resumen);
  y += chartH + 6;

  // ------------------------------------------------------------- Resumen
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Máquina", "Nombre", "Planta", "Turno", "Producto", "Rollos", "Liberados", "Cumpl. oficial %", "Cumpl. variables %"]],
    body: resumen.map((r) => [
      r.codigo,
      r.nombre || "—",
      r.planta || "—",
      r.turno ?? "—",
      r.producto,
      r.rollos,
      r.liberados,
      `${r.cumplimientoPct}%`,
      `${r.cumplimientoVariablesPct}%`,
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.1, halign: "center" },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 7.5, halign: "center" },
    columnStyles: { 1: { halign: "left" }, 4: { halign: "left" } },
    theme: "grid",
  });

  // ------------------------------------------------ Detalle por máquina
  for (const d of detalles) {
    doc.addPage();
    encabezado(`DETALLE POR MÁQUINA · ${d.codigo}`);
    let yy = 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(`${d.codigo}${d.nombre ? ` · ${d.nombre}` : ""}${d.planta ? ` · ${d.planta}` : ""}`, M, yy);
    doc.setTextColor(0, 0, 0);
    yy += 5;

    const cols = d.head.length;
    const fuentes = cols > 18 ? 5.5 : cols > 14 ? 6.2 : 7;
    autoTable(doc, {
      startY: yy,
      margin: { left: M, right: M, top: 28 },
      head: [d.head],
      body:
        d.filas.length === 0
          ? [[{ content: "Sin rollos capturados en el turno vigente", colSpan: cols, styles: { halign: "center" as const } }]]
          : d.filas.map((f) => f.map((c) => String(c.v))),
      styles: { font: "helvetica", fontSize: fuentes, cellPadding: 1.2, lineColor: LINE, lineWidth: 0.1, halign: "center", overflow: "linebreak" },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: fuentes - 0.3, halign: "center" },
      theme: "grid",
      didParseCell: (data) => {
        if (data.section !== "body" || d.filas.length === 0) return;
        const celda = d.filas[data.row.index]?.[data.column.index];
        if (celda && !celda.ok) {
          data.cell.styles.fillColor = FUERA_BG;
          data.cell.styles.textColor = FUERA_TX;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yy;
    if (d.filas.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...FUERA_TX);
      doc.text(
        `Celdas resaltadas = valor fuera del rango mín/máx de especificación (${d.fuera} en el turno).`,
        M,
        after + 5,
      );
      doc.setTextColor(0, 0, 0);
    }
  }

  // ------------------------------------------------------------- Pie
  const total = doc.getNumberOfPages();
  const H = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(AVISO, W - M * 2 - 24), M, H - 10.5);
    doc.setFontSize(7);
    doc.text(`${p} / ${total}`, W - M, H - 5, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("arraybuffer");
}

/** Gráfica de barras: volumen capturado y cumplimiento de variables por máquina. */
function dibujarGrafica(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  resumen: PdfResumen[],
) {
  doc.setDrawColor(...LINE);
  doc.setFillColor(252, 253, 255);
  doc.rect(x, y, w, h, "FD");
  if (resumen.length === 0) return;

  const padL = 14;
  const padB = 10;
  const padT = 9;
  const baseY = y + h - padB;
  const alto = h - padB - padT;
  const ancho = (w - padL - 6) / resumen.length;
  const maxRollos = Math.max(1, ...resumen.map((r) => r.rollos));

  // Leyenda
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setFillColor(...BAR_A);
  doc.rect(x + padL, y + 3, 3, 3, "F");
  doc.setTextColor(...MUTED);
  doc.text("Rollos capturados", x + padL + 4.5, y + 5.6);
  doc.setFillColor(...BAR_B);
  doc.rect(x + padL + 42, y + 3, 3, 3, "F");
  doc.text("Cumplimiento de variables %", x + padL + 46.5, y + 5.6);

  // Eje
  doc.setDrawColor(...LINE);
  doc.line(x + padL - 2, baseY, x + w - 4, baseY);

  resumen.forEach((r, i) => {
    const cx = x + padL + i * ancho;
    const bw = Math.min(11, ancho / 3);
    const hA = (r.rollos / maxRollos) * alto;
    const hB = (Math.min(100, r.cumplimientoVariablesPct) / 100) * alto;

    doc.setFillColor(...BAR_A);
    doc.rect(cx + ancho / 2 - bw - 1, baseY - hA, bw, hA, "F");
    doc.setFillColor(...BAR_B);
    doc.rect(cx + ancho / 2 + 1, baseY - hB, bw, hB, "F");

    doc.setFontSize(6);
    doc.setTextColor(...BAR_A);
    doc.text(String(r.rollos), cx + ancho / 2 - bw / 2 - 1, baseY - hA - 1.5, { align: "center" });
    doc.setTextColor(...BAR_B);
    doc.text(`${r.cumplimientoVariablesPct}%`, cx + ancho / 2 + 1 + bw / 2, baseY - hB - 1.5, { align: "center" });

    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(r.codigo, cx + ancho / 2, baseY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(0, 0, 0);
}
