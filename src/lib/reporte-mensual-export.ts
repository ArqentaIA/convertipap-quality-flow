// =====================================================================
// Exportación PDF / XLSX — Reporte Mensual / Anual
// Estilo industrial premium, alineado con identidad Convertipap.
// =====================================================================
import logoUrl from "@/assets/logo-convertipap.png";
import type { ReporteMensualPayload } from "./reporte-mensual.functions";

const EMPRESA = {
  nombre: "ConvertiPap S.A. de C.V.",
  planta: "Planta Tlaxcala",
  sistema: "ConvertiPap QMS · v1.0",
};

const fmt = (n: number) => n.toLocaleString("es-MX");
const fmtKg = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

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

function buildFileName(base: string) {
  const safe = base.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${safe}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export type ExportCtx = {
  usuario: string;
};

export async function exportReporteMensualPDF(
  payload: ReporteMensualPayload,
  ctx: ExportCtx,
) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const titulo = payload.modo === "anual" ? "REPORTE ANUAL" : "REPORTE MENSUAL";
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 36;

  // ── Encabezado ejecutivo ─────────────────────────────────────────────
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

  // banda título
  doc.setFillColor(20, 28, 56);
  doc.rect(M, M + 56, pageW - M * 2, 36, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titulo, M + 14, M + 80);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payload.periodoTexto, pageW - M - 14, M + 80, { align: "right" });

  // Meta tabla
  const fechaGen = new Date(payload.generadoEn).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
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
      ["Tipo", titulo, "Periodo", payload.periodoTexto],
      ["Generado", fechaGen, "Usuario", ctx.usuario || "—"],
      ["Planta", EMPRESA.planta, "Sistema", EMPRESA.sistema],
    ],
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ── Resumen ejecutivo (KPIs en tarjetas) ─────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  doc.text("Resumen ejecutivo", M, y);
  y += 8;

  const r = payload.resumen;
  const kpis = [
    { label: "Rollos producidos", value: fmt(r.rollosTotal) },
    { label: "Kg producidos", value: fmtKg(r.kgTotal) },
    { label: "Conformes", value: fmt(r.conformes) },
    { label: "No conformes", value: fmt(r.noConformes) },
    { label: "Conformidad", value: fmtPct(r.conformidadPct) },
  ];
  const cardW = (pageW - M * 2 - 4 * 8) / 5;
  const cardH = 52;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + 8);
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(220, 226, 236);
    doc.roundedRect(x, y, cardW, cardH, 4, 4, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(k.label.toUpperCase(), x + 8, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20, 28, 56);
    doc.text(k.value, x + 8, y + 36);
  });
  y += cardH + 18;

  // ── Producción acumulada ─────────────────────────────────────────────
  if (y > pageH - 200) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  const tProdTitle = payload.modo === "anual"
    ? "Producción acumulada por mes"
    : "Producción acumulada por día";
  doc.text(tProdTitle, M, y);
  y += 4;

  if (payload.modo === "anual") {
    autoTable(doc, {
      startY: y + 4,
      head: [["Mes", "Rollos", "Kg producidos", "Conformes", "No conformes", "% Conformidad"]],
      body: payload.buckets.map((b) => [
        b.label,
        b.rollos === 0 ? "—" : fmt(b.rollos),
        b.kg === 0 ? "—" : fmtKg(b.kg),
        b.rollos === 0 ? "—" : fmt(b.conformes),
        b.rollos === 0 ? "—" : fmt(b.noConformes),
        fmtPct(b.conformidadPct),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [20, 28, 56], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" },
        3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
      },
      margin: { left: M, right: M },
    });
  } else {
    // mensual: agregado por día (suma de máquinas)
    const porDia = new Map<string, { rollos: number; kg: number; conf: number; nc: number; pend: number }>();
    for (const b of payload.buckets) {
      const cur = porDia.get(b.label) ?? { rollos: 0, kg: 0, conf: 0, nc: 0, pend: 0 };
      cur.rollos += b.rollos;
      cur.kg += b.kg;
      cur.conf += b.conformes;
      cur.nc += b.noConformes;
      cur.pend += b.pendientes;
      porDia.set(b.label, cur);
    }
    autoTable(doc, {
      startY: y + 4,
      head: [["Día", "Rollos", "Kg producidos", "Conformes", "No conformes", "% Conformidad"]],
      body: Array.from(porDia.entries()).map(([dia, v]) => [
        dia,
        v.rollos === 0 ? "—" : fmt(v.rollos),
        v.kg === 0 ? "—" : fmtKg(v.kg),
        v.rollos === 0 ? "—" : fmt(v.conf),
        v.rollos === 0 ? "—" : fmt(v.nc),
        v.rollos === 0 ? "—" : `${((v.conf / v.rollos) * 100).toFixed(1)}%`,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [20, 28, 56], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" },
        3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
      },
      margin: { left: M, right: M },
    });
  }
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // ── Apartado crítico: ROLLOS NO CONFORMES POR MÁQUINA ────────────────
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFillColor(180, 30, 40);
  doc.rect(M, y, pageW - M * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255);
  doc.text("ROLLOS NO CONFORMES POR MÁQUINA", M + 10, y + 15);
  y += 22;

  autoTable(doc, {
    startY: y,
    head: [["#", "Máquina", "Rollos producidos", "No conformes", "% No conformidad", "Kg afectados"]],
    body: payload.ncPorMaquina.length === 0
      ? [["—", "—", "—", "—", "—", "—"]]
      : payload.ncPorMaquina.map((r, i) => [
          String(i + 1),
          r.maquina,
          fmt(r.rollos),
          fmt(r.noConformes),
          `${r.noConformidadPct.toFixed(1)}%`,
          fmtKg(r.kgAfectados),
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

  // ── Tabla consolidada ────────────────────────────────────────────────
  if (y > pageH - 160) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 56);
  doc.text("Tabla consolidada", M, y);

  if (payload.modo === "anual") {
    autoTable(doc, {
      startY: y + 6,
      head: [["Mes", "Rollos producidos", "Kg producidos", "Conformes", "No conformes", "% Conformidad"]],
      body: payload.buckets.map((b) => [
        b.label,
        b.rollos === 0 ? "—" : fmt(b.rollos),
        b.kg === 0 ? "—" : fmtKg(b.kg),
        b.rollos === 0 ? "—" : fmt(b.conformes),
        b.rollos === 0 ? "—" : fmt(b.noConformes),
        fmtPct(b.conformidadPct),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [20, 28, 56], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: M, right: M },
    });
  } else {
    autoTable(doc, {
      startY: y + 6,
      head: [["Fecha", "Máquina", "Rollos", "Kg producidos", "Conformes", "No conformes", "% Conformidad"]],
      body: payload.buckets
        .filter((b) => b.rollos > 0)
        .map((b) => [
          `${payload.year}-${String(payload.month).padStart(2, "0")}-${b.label}`,
          b.maquina ?? "—",
          fmt(b.rollos),
          fmtKg(b.kg),
          fmt(b.conformes),
          fmt(b.noConformes),
          fmtPct(b.conformidadPct),
        ]),
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [20, 28, 56], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
      margin: { left: M, right: M },
    });
  }

  // ── Trazabilidad (página dedicada) ───────────────────────────────────
  if (payload.trazabilidad.length > 0) {
    doc.addPage();
    let ty = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 28, 56);
    doc.text("Trazabilidad — Registros base", M, ty);
    ty += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text("Detalle individual de los rollos que componen los totales de este reporte.", M, ty + 8);

    autoTable(doc, {
      startY: ty + 18,
      head: [["Fecha", "N° Rollo", "Máquina", "Turno", "Producto", "Capturista", "Estado", "Dictamen", "Folio"]],
      body: payload.trazabilidad.map((t) => [
        new Date(t.fecha).toLocaleString("es-MX"),
        t.numero_rollo,
        t.maquina ?? "—",
        t.turno,
        t.producto ?? "—",
        t.capturista ?? "—",
        t.estado,
        t.dictamen ?? "—",
        t.folio,
      ]),
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [20, 28, 56], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      margin: { left: M, right: M },
    });
  }

  // ── Pie de página ────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.line(M, pageH - 32, pageW - M, pageH - 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${EMPRESA.nombre} · ${titulo} · ${payload.periodoTexto}`, M, pageH - 18);
    doc.text(`Página ${i} de ${total}`, pageW - M, pageH - 18, { align: "right" });
  }

  const baseName = payload.modo === "anual" ? `reporte_anual_${payload.year}` : `reporte_mensual_${payload.year}_${String(payload.month).padStart(2, "0")}`;
  doc.save(`${buildFileName(baseName)}.pdf`);
}

export async function exportReporteMensualXLSX(
  payload: ReporteMensualPayload,
  ctx: ExportCtx,
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const resumen: Record<string, string | number>[] = [
    { Campo: "Tipo de reporte", Valor: payload.modo === "anual" ? "REPORTE ANUAL" : "REPORTE MENSUAL" },
    { Campo: "Periodo", Valor: payload.periodoTexto },
    { Campo: "Generado", Valor: new Date(payload.generadoEn).toLocaleString("es-MX") },
    { Campo: "Usuario", Valor: ctx.usuario || "—" },
    { Campo: "Rollos producidos", Valor: payload.resumen.rollosTotal },
    { Campo: "Kg producidos", Valor: payload.resumen.kgTotal },
    { Campo: "Conformes", Valor: payload.resumen.conformes },
    { Campo: "No conformes", Valor: payload.resumen.noConformes },
    { Campo: "Pendientes", Valor: payload.resumen.pendientes },
    { Campo: "% Conformidad", Valor: payload.resumen.conformidadPct == null ? "—" : `${payload.resumen.conformidadPct}%` },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

  if (payload.modo === "anual") {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(payload.buckets.map((b) => ({
        Mes: b.label,
        Rollos: b.rollos,
        "Kg producidos": b.kg,
        Conformes: b.conformes,
        "No conformes": b.noConformes,
        "% Conformidad": b.conformidadPct == null ? "—" : b.conformidadPct,
      }))),
      "Consolidado por mes",
    );
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(payload.buckets.map((b) => ({
        Fecha: `${payload.year}-${String(payload.month).padStart(2, "0")}-${b.label}`,
        Máquina: b.maquina ?? "—",
        Rollos: b.rollos,
        "Kg producidos": b.kg,
        Conformes: b.conformes,
        "No conformes": b.noConformes,
        "% Conformidad": b.conformidadPct == null ? "—" : b.conformidadPct,
      }))),
      "Consolidado día x máquina",
    );
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(payload.ncPorMaquina.map((r, i) => ({
      "#": i + 1,
      Máquina: r.maquina,
      Rollos: r.rollos,
      "No conformes": r.noConformes,
      "% No conformidad": r.noConformidadPct,
      "Kg afectados": r.kgAfectados,
    }))),
    "NC por máquina",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(payload.trazabilidad.map((t) => ({
      Fecha: new Date(t.fecha).toLocaleString("es-MX"),
      "N° Rollo": t.numero_rollo,
      Máquina: t.maquina ?? "—",
      Turno: t.turno,
      Producto: t.producto ?? "—",
      Capturista: t.capturista ?? "—",
      Estado: t.estado,
      Dictamen: t.dictamen ?? "—",
      Folio: t.folio,
    }))),
    "Trazabilidad",
  );

  const baseName = payload.modo === "anual" ? `reporte_anual_${payload.year}` : `reporte_mensual_${payload.year}_${String(payload.month).padStart(2, "0")}`;
  XLSX.writeFile(wb, `${buildFileName(baseName)}.xlsx`);
}
