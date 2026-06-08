// =====================================================================
// Exportación PDF / XLSX — Reporte de Turno
// Reutiliza estilo visual de Reporte de Producción / Reporte Mensual.
// Toda la información proviene del payload (BD productiva).
// =====================================================================
import logoUrl from "@/assets/logo-convertipap.png";
import type { CentroProduccionPayload, TablaRow } from "./produccion-centro.functions";

const EMPRESA = {
  nombre: "ConvertiPap S.A. de C.V.",
  planta: "Planta Tlaxcala",
  sistema: "ConvertiPap QMS · v1.0",
};

const fmt = (n: number) => n.toLocaleString("es-MX");
const fmtKg = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const TURNO_LABEL: Record<string, string> = {
  "1": "1er Turno",
  "2": "2do Turno",
  "3": "3er Turno",
};

export type ReporteTurnoCtx = {
  fecha: string;        // YYYY-MM-DD consultado
  turno: string;        // "1" | "2" | "3"
  usuario: string;
};

export type ReporteTurnoData = {
  rows: TablaRow[];     // tabla filtrada por fecha + turno
  ultimaActualizacion: string;
};

// ── Derivaciones (sin datos inventados) ────────────────────────────────
function isLiberada(r: TablaRow) {
  return r.dictamen === "liberada" || r.estatus_liberacion === "L";
}
function isRechazada(r: TablaRow) {
  return r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
}

export function buildResumen(rows: TablaRow[]) {
  const totalRollos = rows.length;
  const kgTotal = rows.reduce((a, r) => a + (r.peso_kg ?? 0), 0);
  const conformes = rows.filter(isLiberada).length;
  const noConformes = rows.filter(isRechazada).length;
  const maquinas = new Set(rows.map((r) => r.maquina).filter((v): v is string => !!v));
  const conformidadPct = totalRollos > 0 ? (conformes / totalRollos) * 100 : null;
  return {
    totalRollos,
    kgTotal,
    conformes,
    noConformes,
    conformidadPct,
    maquinasConProduccion: maquinas.size,
    registrosCapturados: totalRollos,
  };
}

export function buildPorMaquina(rows: TablaRow[]) {
  const map = new Map<string, { rollos: number; kg: number; nc: number; kgNC: number }>();
  for (const r of rows) {
    const key = r.maquina ?? "—";
    const cur = map.get(key) ?? { rollos: 0, kg: 0, nc: 0, kgNC: 0 };
    cur.rollos += 1;
    cur.kg += r.peso_kg ?? 0;
    if (isRechazada(r)) {
      cur.nc += 1;
      cur.kgNC += r.peso_kg ?? 0;
    }
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([maquina, v]) => ({
      maquina,
      rollos: v.rollos,
      kg: v.kg,
      noConformes: v.nc,
      kgAfectados: v.kgNC,
      noConformidadPct: v.rollos > 0 ? (v.nc / v.rollos) * 100 : 0,
    }))
    .sort((a, b) => a.maquina.localeCompare(b.maquina));
}

export function filterCentroByTurnoFecha(
  payload: CentroProduccionPayload,
  fecha: string,
  turno: string,
): ReporteTurnoData {
  const dayStart = new Date(`${fecha}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const rows = payload.tabla.filter((r) => {
    if (r.turno !== turno) return false;
    const t = new Date(r.capturado_at).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });
  return { rows, ultimaActualizacion: payload.ultimaActualizacion };
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

function buildFileName(base: string, ctx: ReporteTurnoCtx) {
  const safe = base.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  return `${safe}_${ctx.fecha}_t${ctx.turno}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── PDF ────────────────────────────────────────────────────────────────
export async function exportReporteTurnoPDF(
  data: ReporteTurnoData,
  ctx: ReporteTurnoCtx,
) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 36;

  // Header
  const logoData = await urlToDataURL(logoUrl);
  if (logoData) {
    try { doc.addImage(logoData, "PNG", M, M, 92, 36); } catch { /* logo opcional */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 28, 56);
  doc.text(EMPRESA.nombre, pageW - M, M + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(EMPRESA.planta, pageW - M, M + 28, { align: "right" });
  doc.text(EMPRESA.sistema, pageW - M, M + 40, { align: "right" });

  // Banda título
  doc.setFillColor(20, 28, 56);
  doc.rect(M, M + 56, pageW - M * 2, 36, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("REPORTE DE TURNO", M + 14, M + 80);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `${ctx.fecha} · ${TURNO_LABEL[ctx.turno] ?? `Turno ${ctx.turno}`}`,
    pageW - M - 14,
    M + 80,
    { align: "right" },
  );

  const fechaGen = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
  autoTable(doc, {
    startY: M + 104,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3, textColor: [40, 40, 50] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [90, 90, 110], cellWidth: 110 },
      1: { cellWidth: (pageW - M * 2) / 2 - 110 },
      2: { fontStyle: "bold", textColor: [90, 90, 110], cellWidth: 110 },
      3: { cellWidth: (pageW - M * 2) / 2 - 110 },
    },
    body: [
      ["Fecha consultada", ctx.fecha, "Turno", TURNO_LABEL[ctx.turno] ?? `Turno ${ctx.turno}`],
      ["Generado", fechaGen, "Usuario", ctx.usuario || "—"],
      ["Planta", EMPRESA.planta, "Sistema", EMPRESA.sistema],
    ],
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Resumen ejecutivo
  const r = buildResumen(data.rows);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  doc.text("Resumen ejecutivo", M, y);
  y += 8;

  const kpis = [
    { label: "Rollos producidos", value: fmt(r.totalRollos) },
    { label: "Kg producidos", value: r.kgTotal > 0 ? fmtKg(r.kgTotal) : "—" },
    { label: "Conformes", value: fmt(r.conformes) },
    { label: "No conformes", value: fmt(r.noConformes) },
    { label: "Conformidad", value: fmtPct(r.conformidadPct) },
    { label: "Máquinas", value: fmt(r.maquinasConProduccion) },
    { label: "Registros", value: fmt(r.registrosCapturados) },
  ];
  const gap = 6;
  const cardW = (pageW - M * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 52;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(220, 226, 236);
    doc.roundedRect(x, y, cardW, cardH, 4, 4, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(k.label.toUpperCase(), x + 6, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 28, 56);
    doc.text(k.value, x + 6, y + 36);
  });
  y += cardH + 18;

  // Producción por máquina
  const porMaq = buildPorMaquina(data.rows);
  if (y > pageH - 200) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  doc.text("Producción por máquina", M, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [["Máquina", "Rollos", "Kg producidos"]],
    body: porMaq.length === 0
      ? [["—", "—", "—"]]
      : porMaq.map((m) => [m.maquina, fmt(m.rollos), m.kg > 0 ? fmtKg(m.kg) : "—"]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [20, 28, 56], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 253] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Sección crítica — Rollos no conformes por máquina
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFillColor(180, 30, 40);
  doc.rect(M, y, pageW - M * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255);
  doc.text("ROLLOS NO CONFORMES POR MÁQUINA", M + 10, y + 15);
  y += 22;

  const ranking = [...porMaq].sort((a, b) => b.noConformes - a.noConformes || b.noConformidadPct - a.noConformidadPct);
  autoTable(doc, {
    startY: y,
    head: [["#", "Máquina", "Rollos producidos", "No conformes", "% No conformidad", "Kg afectados"]],
    body: ranking.length === 0 || ranking.every((m) => m.noConformes === 0)
      ? [["—", "—", "—", "—", "—", "—"]]
      : ranking.map((m, i) => [
          String(i + 1),
          m.maquina,
          fmt(m.rollos),
          fmt(m.noConformes),
          `${m.noConformidadPct.toFixed(1)}%`,
          m.kgAfectados > 0 ? fmtKg(m.kgAfectados) : "—",
        ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [120, 20, 28], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [253, 245, 246] },
    columnStyles: {
      0: { halign: "center", cellWidth: 28 },
      2: { halign: "right" }, 3: { halign: "right" },
      4: { halign: "right" }, 5: { halign: "right" },
    },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Tabla consolidada del turno
  if (y > pageH - 160) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  doc.text("Tabla consolidada del turno", M, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [[
      "N° Captura", "Fecha y hora", "N° Rollo", "Máquina",
      "Producto", "Peso (kg)", "Estado / Dictamen", "Capturista",
    ]],
    body: data.rows.length === 0
      ? [["—", "—", "—", "—", "—", "—", "—", "—"]]
      : data.rows.map((row) => [
          dash(row.secuencia_captura),
          new Date(row.capturado_at).toLocaleString("es-MX"),
          dash(row.numero_rollo),
          dash(row.maquina),
          dash(row.producto),
          row.peso_kg != null ? fmtKg(row.peso_kg) : "—",
          row.dictamen ?? row.estatus_liberacion ?? row.estado ?? "—",
          dash(row.analista),
        ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [20, 28, 56], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 253] },
    columnStyles: { 0: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // Footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.line(M, pageH - 40, pageW - M, pageH - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${EMPRESA.nombre} · Documento confidencial`, M, pageH - 24);
    doc.text(`Página ${i} de ${total}`, pageW - M, pageH - 24, { align: "right" });
  }

  doc.save(`${buildFileName("reporte_de_turno", ctx)}.pdf`);
}

// ── XLSX ───────────────────────────────────────────────────────────────
export async function exportReporteTurnoXLSX(
  data: ReporteTurnoData,
  ctx: ReporteTurnoCtx,
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const r = buildResumen(data.rows);
  const porMaq = buildPorMaquina(data.rows);

  const resumenRows = [
    { Indicador: "Fecha", Valor: ctx.fecha },
    { Indicador: "Turno", Valor: TURNO_LABEL[ctx.turno] ?? `Turno ${ctx.turno}` },
    { Indicador: "Usuario", Valor: ctx.usuario || "—" },
    { Indicador: "Generado", Valor: new Date().toLocaleString("es-MX") },
    { Indicador: "Rollos producidos", Valor: r.totalRollos },
    { Indicador: "Kg producidos", Valor: Math.round(r.kgTotal * 100) / 100 },
    { Indicador: "Rollos conformes", Valor: r.conformes },
    { Indicador: "Rollos no conformes", Valor: r.noConformes },
    { Indicador: "% Conformidad", Valor: r.conformidadPct == null ? "—" : `${r.conformidadPct.toFixed(1)}%` },
    { Indicador: "Máquinas con producción", Valor: r.maquinasConProduccion },
    { Indicador: "Registros capturados", Valor: r.registrosCapturados },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), "Resumen");

  const maqRows = porMaq.length === 0
    ? [{ Máquina: "—", Rollos: "—", Kg: "—" }]
    : porMaq.map((m) => ({
        Máquina: m.maquina,
        Rollos: m.rollos,
        Kg: Math.round(m.kg * 100) / 100,
      }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maqRows), "Producción x Máquina");

  const ranking = [...porMaq].sort((a, b) => b.noConformes - a.noConformes || b.noConformidadPct - a.noConformidadPct);
  const ncRows = ranking.length === 0
    ? [{ "#": "—", Máquina: "—", "Rollos producidos": "—", "No conformes": "—", "% No conformidad": "—", "Kg afectados": "—" }]
    : ranking.map((m, i) => ({
        "#": i + 1,
        Máquina: m.maquina,
        "Rollos producidos": m.rollos,
        "No conformes": m.noConformes,
        "% No conformidad": `${m.noConformidadPct.toFixed(1)}%`,
        "Kg afectados": Math.round(m.kgAfectados * 100) / 100,
      }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ncRows), "NC por Máquina");

  const tablaRows = data.rows.length === 0
    ? [{
        "N° Captura": "—", "Fecha y hora": "—", "N° Rollo": "—", Máquina: "—",
        Producto: "—", "Peso (kg)": "—", "Estado / Dictamen": "—", Capturista: "—",
      }]
    : data.rows.map((row) => ({
        "N° Captura": row.secuencia_captura ?? "—",
        "Fecha y hora": new Date(row.capturado_at).toLocaleString("es-MX"),
        "N° Rollo": row.numero_rollo ?? "—",
        Máquina: row.maquina ?? "—",
        Producto: row.producto ?? "—",
        "Peso (kg)": row.peso_kg ?? "—",
        "Estado / Dictamen": row.dictamen ?? row.estatus_liberacion ?? row.estado ?? "—",
        Capturista: row.analista ?? "—",
      }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tablaRows), "Tabla del Turno");

  // Trazabilidad
  const trazaRows = data.rows.length === 0
    ? [{
        "ID interno": "—", "N° Captura": "—", "Fecha y hora": "—",
        "N° Rollo": "—", Máquina: "—", Turno: "—", Producto: "—",
        Capturista: "—", "Estado/Dictamen": "—",
      }]
    : data.rows.map((row) => ({
        "ID interno": row.id,
        "N° Captura": row.secuencia_captura ?? "—",
        "Fecha y hora": new Date(row.capturado_at).toLocaleString("es-MX"),
        "N° Rollo": row.numero_rollo ?? "—",
        Máquina: row.maquina ?? "—",
        Turno: TURNO_LABEL[row.turno] ?? row.turno,
        Producto: row.producto ?? "—",
        Capturista: row.analista ?? "—",
        "Estado/Dictamen": row.dictamen ?? row.estatus_liberacion ?? row.estado ?? "—",
      }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trazaRows), "Trazabilidad");

  XLSX.writeFile(wb, `${buildFileName("reporte_de_turno", ctx)}.xlsx`);
}
