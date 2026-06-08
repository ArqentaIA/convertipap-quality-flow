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
  const kgLib = rows.filter(isLiberada).reduce((a, r) => a + (r.peso_kg ?? 0), 0);
  const kgNoLib = rows.filter(isRechazada).reduce((a, r) => a + (r.peso_kg ?? 0), 0);
  const maquinas = new Set(rows.map((r) => r.maquina).filter((v): v is string => !!v));
  const conformidadPct = totalRollos > 0 ? (conformes / totalRollos) * 100 : null;
  const noConformidadPct = totalRollos > 0 ? (noConformes / totalRollos) * 100 : null;
  const liberacionKgPct = kgTotal > 0 ? (kgLib / kgTotal) * 100 : null;
  const noLiberacionKgPct = kgTotal > 0 ? (kgNoLib / kgTotal) * 100 : null;
  return {
    totalRollos,
    kgTotal,
    kgLib,
    kgNoLib,
    conformes,
    noConformes,
    conformidadPct,
    noConformidadPct,
    liberacionKgPct,
    noLiberacionKgPct,
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

  // ─────────── Indicadores clave del turno (Bullet chart horizontal) ───────────
  if (y > pageH - 220) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 28, 56);
  doc.text("Indicadores clave del turno", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Cada barra muestra una métrica del turno en escala 0–100%.", M, y + 12);
  doc.text("Lectura: rojo = crítico (< 60%) · ámbar = aceptable (60–80%) · verde = óptimo (≥ 80%)", M, y + 22);
  y += 10;
  {
    const radarMetrics: { label: string; value: number | null }[] = [
      { label: "Conformidad", value: r.conformidadPct },
      { label: "Liberación (kg)", value: r.liberacionKgPct },
      { label: "No conformidad", value: r.noConformidadPct == null ? null : 100 - r.noConformidadPct },
      { label: "Máquinas activas", value: r.maquinasConProduccion > 0 ? Math.min(100, (r.maquinasConProduccion / Math.max(r.maquinasConProduccion, porMaq.length || 1)) * 100) : null },
    ];
    const startX = M + 100;
    const trackW = pageW - M - startX - 60;
    const rowH = 18;
    const top = y + 22;
    radarMetrics.forEach((m, i) => {
      const ry = top + i * rowH;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(40);
      doc.text(m.label, M, ry + 8);
      doc.setFillColor(254, 226, 226); doc.rect(startX, ry + 2, trackW * 0.60, 9, "F");
      doc.setFillColor(254, 243, 199); doc.rect(startX + trackW * 0.60, ry + 2, trackW * 0.20, 9, "F");
      doc.setFillColor(220, 252, 231); doc.rect(startX + trackW * 0.80, ry + 2, trackW * 0.20, 9, "F");
      doc.setDrawColor(220); doc.setLineWidth(0.4);
      doc.rect(startX, ry + 2, trackW, 9);
      doc.setDrawColor(120); doc.setLineWidth(0.6);
      doc.line(startX + trackW * 0.80, ry + 1, startX + trackW * 0.80, ry + 12);
      const v = m.value;
      if (v != null) {
        const pct = Math.max(0, Math.min(100, v));
        const w = (trackW * pct) / 100;
        const color: [number, number, number] = pct >= 80 ? [16, 122, 87] : pct >= 60 ? [202, 138, 4] : [185, 28, 28];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(startX, ry + 4.5, w, 4, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(color[0], color[1], color[2]);
        doc.text(`${pct.toFixed(1)}%`, startX + trackW + 6, ry + 8);
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(150);
        doc.text("—", startX + trackW + 6, ry + 8);
      }
    });
    y = top + radarMetrics.length * rowH + 12;
  }

  // ─────────── Distribución de producción del turno (Donut) ───────────
  if (y > pageH - 220) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 28, 56);
  doc.text("Distribución de producción del turno", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Proporción de Kg Liberados (calidad aprobada) vs Kg No Liberados (rechazados/retenidos) durante el turno.", M, y + 12);
  {
    type Slice = { label: string; value: number; color: [number, number, number] };
    const slices: Slice[] = [
      { label: "Kg Liberados", value: Math.max(0, r.kgLib), color: [16, 122, 87] },
      { label: "Kg No Liberados", value: Math.max(0, r.kgNoLib), color: [185, 28, 28] },
    ];
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;
    const chartTop = y + 22;
    const chartH = 160;
    const cx = M + 90;
    const cy = chartTop + chartH / 2;
    const rOuter = 62;
    const rInner = 36;
    doc.setFillColor(210, 215, 225);
    doc.circle(cx + 1.5, cy + 2.5, rOuter + 0.5, "F");
    const TAU = Math.PI * 2;
    const drawSlice = (a0: number, a1: number, color: [number, number, number]) => {
      const steps = Math.max(24, Math.ceil((a1 - a0) / (TAU / 180)));
      doc.setFillColor(color[0], color[1], color[2]);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const t = a0 + ((a1 - a0) * i) / steps;
        pts.push([cx + Math.cos(t) * rOuter, cy + Math.sin(t) * rOuter]);
      }
      for (let i = steps; i >= 0; i--) {
        const t = a0 + ((a1 - a0) * i) / steps;
        pts.push([cx + Math.cos(t) * rInner, cy + Math.sin(t) * rInner]);
      }
      for (let i = 1; i < pts.length - 1; i++) {
        doc.triangle(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], "F");
      }
    };
    let ang = -Math.PI / 2;
    const arcs: Array<{ mid: number; pct: number; s: Slice }> = [];
    slices.forEach((s) => {
      const frac = s.value / total;
      const a0 = ang;
      const a1 = ang + TAU * frac;
      drawSlice(a0, a1, s.color);
      arcs.push({ mid: (a0 + a1) / 2, pct: frac * 100, s });
      ang = a1;
    });
    doc.setDrawColor(255); doc.setLineWidth(1.2); doc.circle(cx, cy, rOuter, "S");
    doc.setDrawColor(235); doc.setLineWidth(0.6); doc.circle(cx, cy, rInner, "S");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text("Producción Turno", cx, cy - 6, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 28, 56);
    doc.text(fmt(Math.round(r.kgTotal)), cx, cy + 4, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140);
    doc.text("kg", cx, cy + 11, { align: "center" });
    arcs.forEach((a) => {
      if (a.pct < 3) return;
      const r1 = rOuter + 4;
      const r2 = rOuter + 14;
      const x1 = cx + Math.cos(a.mid) * r1;
      const y1 = cy + Math.sin(a.mid) * r1;
      const x2 = cx + Math.cos(a.mid) * r2;
      const y2 = cy + Math.sin(a.mid) * r2;
      doc.setDrawColor(a.s.color[0], a.s.color[1], a.s.color[2]); doc.setLineWidth(0.5);
      doc.line(x1, y1, x2, y2);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.setTextColor(a.s.color[0], a.s.color[1], a.s.color[2]);
      const align = Math.cos(a.mid) >= 0 ? "left" : "right";
      const tx = x2 + (Math.cos(a.mid) >= 0 ? 2 : -2);
      doc.text(`${a.pct.toFixed(1)}%`, tx, y2 + 2.5, { align });
    });
    const legX = cx + rOuter + 60;
    let legY = chartTop + 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40);
    doc.text("Desglose", legX, legY);
    legY += 10;
    slices.forEach((s) => {
      const pct = (s.value / total) * 100;
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.roundedRect(legX, legY - 5, 8, 8, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(40);
      doc.text(s.label, legX + 12, legY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
      doc.text(`${fmt(Math.round(s.value))} kg`, legX + 12, legY + 8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setTextColor(s.color[0], s.color[1], s.color[2]);
      doc.text(`${pct.toFixed(1)}%`, pageW - M - 4, legY + 4, { align: "right" });
      const trackW = pageW - M - legX - 14;
      doc.setFillColor(238, 240, 245);
      doc.roundedRect(legX, legY + 12, trackW, 3, 1, 1, "F");
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.roundedRect(legX, legY + 12, (trackW * pct) / 100, 3, 1, 1, "F");
      legY += 26;
    });
    y = chartTop + chartH + 14;
  }


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

  // Gráficos (datos listos para gráficar en Excel)
  const pct = (v: number | null) => v == null ? "—" : Math.round(v * 10) / 10;
  const indicadoresRows = [
    { Indicador: "Conformidad", "Valor %": pct(r.conformidadPct), Umbral: 80 },
    { Indicador: "Liberación (kg)", "Valor %": pct(r.liberacionKgPct), Umbral: 80 },
    { Indicador: "No conformidad", "Valor %": pct(r.noConformidadPct == null ? null : 100 - r.noConformidadPct), Umbral: 80 },
    { Indicador: "Máquinas activas", "Valor %": r.maquinasConProduccion, Umbral: "—" },
  ];
  const distribRows = [
    { Categoría: "Kg Liberados", Kg: Math.round(r.kgLib * 100) / 100, "% del total": r.kgTotal > 0 ? Math.round((r.kgLib / r.kgTotal) * 1000) / 10 : 0 },
    { Categoría: "Kg No Liberados", Kg: Math.round(r.kgNoLib * 100) / 100, "% del total": r.kgTotal > 0 ? Math.round((r.kgNoLib / r.kgTotal) * 1000) / 10 : 0 },
  ];
  const graficosWS = XLSX.utils.json_to_sheet(indicadoresRows, { origin: "A1" });
  XLSX.utils.sheet_add_aoa(graficosWS, [["Indicadores clave del turno"]], { origin: "A1" });
  XLSX.utils.sheet_add_json(graficosWS, indicadoresRows, { origin: "A2" });
  XLSX.utils.sheet_add_aoa(graficosWS, [[""], ["Distribución de producción (kg)"]], { origin: `A${indicadoresRows.length + 4}` });
  XLSX.utils.sheet_add_json(graficosWS, distribRows, { origin: `A${indicadoresRows.length + 6}` });
  XLSX.utils.book_append_sheet(wb, graficosWS, "Gráficos");



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
