// =====================================================================
// Reporte de Producción — exportación a PDF y XLSX
// Datos provenientes exclusivamente de la BD (getProduccionCentro).
// Sin IA, sin simulaciones. Si no hay datos: "—" o "Sin datos disponibles".
// =====================================================================
import logoUrl from "@/assets/logo-convertipap.png";
import { formatCaptura } from "@/lib/format";
import type { CentroProduccionPayload, TablaRow } from "@/lib/produccion-centro.functions";

const DASH = "—";
const SIN_DATOS = "Sin datos disponibles";

export type ReporteProdFiltros = {
  turno?: string;
  maquina?: string;
  producto?: string;
  estado?: string;
};

export type ReporteProdContexto = {
  tipoReporte: string;
  periodoTexto: string;
  usuario: string;
  filtros: ReporteProdFiltros;
};

const fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const fmtKg = (n: number | null | undefined) => (n == null ? DASH : fmt.format(n));
const fmtPct = (n: number | null | undefined) => (n == null ? DASH : `${n.toFixed(1)}%`);
const fmtMoney = (n: number | null | undefined) => (n == null ? DASH : money.format(n));
const fmtDate = (iso: string | null | undefined) =>
  !iso ? DASH : new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

export function filtrarTabla(rows: TablaRow[], f: ReporteProdFiltros): TablaRow[] {
  return rows.filter((r) => {
    if (f.turno && r.turno !== f.turno) return false;
    if (f.maquina && r.maquina !== f.maquina) return false;
    if (f.producto && r.producto !== f.producto) return false;
    if (f.estado) {
      const lib = r.dictamen === "liberada" || r.estatus_liberacion === "L";
      const rech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
      const pend = !lib && !rech;
      if (f.estado === "liberado" && !lib) return false;
      if (f.estado === "rechazado" && !rech) return false;
      if (f.estado === "pendiente" && !pend) return false;
    }
    return true;
  });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
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

// ────────────────────────────── XLSX ──────────────────────────────
export async function exportProduccionXLSX(
  data: CentroProduccionPayload,
  ctx: ReporteProdContexto,
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const empty = [{ Estado: SIN_DATOS }];
  const tablaFiltrada = filtrarTabla(data.tabla, ctx.filtros);

  const filtrosTxt = [
    ctx.filtros.turno ? `Turno=${ctx.filtros.turno}` : null,
    ctx.filtros.maquina ? `Máquina=${ctx.filtros.maquina}` : null,
    ctx.filtros.producto ? `Producto=${ctx.filtros.producto}` : null,
    ctx.filtros.estado ? `Estado=${ctx.filtros.estado}` : null,
  ].filter(Boolean).join(" · ") || "—";

  const sheets: { name: string; rows: Record<string, unknown>[] }[] = [
    {
      name: "Resumen Ejecutivo",
      rows: [{
        "Tipo de Reporte": ctx.tipoReporte,
        "Periodo": ctx.periodoTexto,
        "Usuario": ctx.usuario,
        "Filtros": filtrosTxt,
        "Impresión": new Date().toLocaleString("es-MX"),
        "Rollos Producidos": data.kpis.rollosProducidos,
        "Kg Producidos": data.kpis.kgProducidos,
        "Meta (kg)": data.kpis.meta ?? DASH,
        "Cumplimiento %": data.kpis.cumplimientoPct ?? DASH,
        "OEE Global %": data.kpis.oeeGlobalPct,
        "Calidad Liberada %": data.kpis.calidadLiberadaPct,
        "Tiempo Muerto (min)": data.kpis.tiempoMuertoMin,
        "Producción Promedio": `${data.kpis.produccionPromedio.valor} ${data.kpis.produccionPromedio.unidad}`,
        "Última Captura": fmtDate(data.kpis.ultimaCapturaAt),
      }],
    },
    {
      name: "Último Rollo",
      rows: data.ultimoRollo ? [{
        "N° Captura": formatCaptura(data.ultimoRollo.secuencia_captura),
        "N° Rollo": data.ultimoRollo.numero_rollo,
        "Capturado": fmtDate(data.ultimoRollo.capturado_at),
        "Máquina": data.ultimoRollo.maquina ?? DASH,
        "Turno": data.ultimoRollo.turno,
        "Producto": data.ultimoRollo.producto ?? DASH,
        "Peso (kg)": data.ultimoRollo.peso_kg ?? DASH,
        "Estado": data.ultimoRollo.estado,
        "Dictamen": data.ultimoRollo.dictamen ?? DASH,
        "Analista": data.ultimoRollo.analista ?? DASH,
        "Semáforo": data.ultimoRollo.semaforo,
        "Peso anterior": data.ultimoRollo.comparativo?.peso_anterior ?? DASH,
        "Δ Peso (kg)": data.ultimoRollo.comparativo?.delta_peso_kg ?? DASH,
        "Δ Peso (%)": data.ultimoRollo.comparativo?.delta_peso_pct ?? DASH,
      }] : empty,
    },
    {
      name: "Producción en el Tiempo",
      rows: data.serieTiempo.length ? data.serieTiempo.map((b) => ({
        Periodo: b.label, "Kg": b.kg, "Rollos": b.rollos, "Meta": b.meta ?? DASH, "Acumulado": b.acumulado,
      })) : empty,
    },
    {
      name: "Por Máquina",
      rows: data.maquinas.length ? data.maquinas.map((m) => ({
        Código: m.codigo, Nombre: m.nombre, Estado: m.estado,
        "Kg": m.kg, "Rollos": m.rollos, "OEE %": m.oeePct,
        "Calidad %": m.calidadPct, "Operativo (min)": m.tiempoOperativoMin,
      })) : empty,
    },
    {
      name: "Por Turno",
      rows: data.turnos.length ? data.turnos.map((t) => ({
        Turno: t.turno, Rollos: t.rollos, Kg: t.kg, "Calidad %": t.calidadPct, "Eficiencia %": t.eficienciaPct,
      })) : empty,
    },
    {
      name: "Por Producto",
      rows: data.productos.length ? data.productos.map((p) => ({
        Producto: p.producto, Kg: p.kg, Rollos: p.rollos, "Participación %": p.participacionPct,
      })) : empty,
    },
    {
      name: "FOMs",
      rows: [{
        "Kg Liberados": data.foms.kgLiberados.total,
        "Kg Liberados %": data.foms.kgLiberados.pct,
        "Tendencia Liberados %": data.foms.kgLiberados.tendenciaPct,
        "Kg No Liberados": data.foms.kgNoLiberados.total,
        "Kg No Liberados %": data.foms.kgNoLiberados.pct,
        "Costo No Calidad (MXN)": data.foms.costoNoCalidad.total,
        "Costo (MXN/kg)": data.foms.costoNoCalidad.costoKg,
        "OEE Global %": data.foms.oeeGlobalPct,
        "Cumplimiento Meta %": data.foms.cumplimientoMetaPct ?? DASH,
      }],
    },
    {
      name: "Alertas",
      rows: data.alertas.length ? data.alertas.map((a) => ({
        Tipo: a.tipo, Título: a.titulo, Detalle: a.detalle, Cuándo: fmtDate(a.cuando),
      })) : empty,
    },
    {
      name: "Tabla Detallada",
      rows: tablaFiltrada.length ? tablaFiltrada.map((r) => ({
        "N° Captura": formatCaptura(r.secuencia_captura),
        "N° Rollo": r.numero_rollo,
        "Fecha/Hora": fmtDate(r.capturado_at),
        Máquina: r.maquina ?? DASH,
        Turno: r.turno,
        Producto: r.producto ?? DASH,
        "Peso (kg)": r.peso_kg ?? DASH,
        Estado: r.estado,
        Dictamen: r.dictamen ?? DASH,
        Analista: r.analista ?? DASH,
      })) : empty,
    },
  ];

  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `reporte_produccion_${stamp()}.xlsx`);
}

// ────────────────────────────── PDF ──────────────────────────────
type DocWithTable = { lastAutoTable: { finalY: number } };

export async function exportProduccionPDF(
  data: CentroProduccionPayload,
  ctx: ReporteProdContexto,
): Promise<void> {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const tablaFiltrada = filtrarTabla(data.tabla, ctx.filtros);

  // Encabezado
  const logoData = await urlToDataURL(logoUrl);
  if (logoData) {
    try { doc.addImage(logoData, "PNG", M, M, 90, 36); } catch { /* opcional */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 30);
  doc.text("REPORTE DE PRODUCCIÓN", pageW - M, M + 16, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Tipo: ${ctx.tipoReporte}`, pageW - M, M + 32, { align: "right" });
  doc.text(`Periodo: ${ctx.periodoTexto}`, pageW - M, M + 46, { align: "right" });
  doc.text(`Usuario: ${ctx.usuario}`, pageW - M, M + 60, { align: "right" });
  doc.text(`Impresión: ${new Date().toLocaleString("es-MX")}`, pageW - M, M + 74, { align: "right" });

  doc.setDrawColor(220);
  doc.line(M, M + 92, pageW - M, M + 92);

  // Filtros aplicados
  const filtrosTxt = [
    ctx.filtros.turno ? `Turno: ${ctx.filtros.turno}` : null,
    ctx.filtros.maquina ? `Máquina: ${ctx.filtros.maquina}` : null,
    ctx.filtros.producto ? `Producto: ${ctx.filtros.producto}` : null,
    ctx.filtros.estado ? `Estado: ${ctx.filtros.estado}` : null,
  ].filter(Boolean).join(" · ") || "Sin filtros adicionales";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(60, 80, 140);
  doc.text("Filtros aplicados:", M, M + 110);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(filtrosTxt, M + 100, M + 110);

  // Último Rollo Capturado
  let y = M + 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 30);
  doc.text("Último Rollo Capturado", M, y);
  if (data.ultimoRollo) {
    const u = data.ultimoRollo;
    autoTable(doc, {
      startY: y + 6,
      head: [["Campo", "Valor"]],
      body: [
        ["N° Captura", formatCaptura(u.secuencia_captura)],
        ["N° Rollo", u.numero_rollo],
        ["Máquina", u.maquina ?? DASH],
        ["Turno", u.turno],
        ["Producto", u.producto ?? DASH],
        ["Peso", u.peso_kg != null ? `${u.peso_kg} kg` : DASH],
        ["Estado", u.dictamen ?? u.estado],
        ["Analista", u.analista ?? DASH],
        ["Capturado", fmtDate(u.capturado_at)],
      ],
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16);
    y += 30;
  }

  // KPIs ejecutivos
  if (y > pageH - 200) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("KPIs Ejecutivos", M, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Indicador", "Valor"]],
    body: [
      ["Rollos producidos", String(data.kpis.rollosProducidos)],
      ["Kg producidos", fmtKg(data.kpis.kgProducidos)],
      ["Meta (kg)", data.kpis.meta != null ? fmtKg(data.kpis.meta) : DASH],
      ["Cumplimiento", fmtPct(data.kpis.cumplimientoPct)],
      ["OEE global", fmtPct(data.kpis.oeeGlobalPct)],
      ["Calidad liberada", fmtPct(data.kpis.calidadLiberadaPct)],
      ["Tiempo muerto (min)", String(data.kpis.tiempoMuertoMin)],
      ["Producción promedio", `${data.kpis.produccionPromedio.valor} ${data.kpis.produccionPromedio.unidad}`],
      ["Última captura", fmtDate(data.kpis.ultimaCapturaAt)],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
  });
  y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;

  // Producción en el tiempo
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Producción en el Tiempo", M, y);
  if (data.serieTiempo.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Periodo", "Kg", "Rollos", "Meta", "Acumulado"]],
      body: data.serieTiempo.map((b) => [b.label, fmtKg(b.kg), String(b.rollos), b.meta != null ? fmtKg(b.meta) : DASH, fmtKg(b.acumulado)]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16); y += 30;
  }

  // Por Máquina
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Producción por Máquina", M, y);
  if (data.maquinas.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Código", "Estado", "Kg", "Rollos", "OEE %", "Calidad %"]],
      body: data.maquinas.map((m) => [m.codigo, m.estado, fmtKg(m.kg), String(m.rollos), fmtPct(m.oeePct), fmtPct(m.calidadPct)]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16); y += 30;
  }

  // Por Turno
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Producción por Turno", M, y);
  if (data.turnos.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Turno", "Rollos", "Kg", "Calidad %", "Eficiencia %"]],
      body: data.turnos.map((t) => [t.turno, String(t.rollos), fmtKg(t.kg), fmtPct(t.calidadPct), fmtPct(t.eficienciaPct)]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16); y += 30;
  }

  // Por Producto
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Producción por Producto", M, y);
  if (data.productos.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Producto", "Kg", "Rollos", "Participación %"]],
      body: data.productos.map((p) => [p.producto, fmtKg(p.kg), String(p.rollos), fmtPct(p.participacionPct)]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16); y += 30;
  }

  // FOMs
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("FOMs (Features of Merit)", M, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["FOM", "Valor"]],
    body: [
      ["Costo No Calidad", fmtMoney(data.foms.costoNoCalidad.total)],
      ["Costo MXN / kg", fmtMoney(data.foms.costoNoCalidad.costoKg)],
      ["Kg Liberados", `${fmtKg(data.foms.kgLiberados.total)} (${fmtPct(data.foms.kgLiberados.pct)})`],
      ["Kg No Liberados", `${fmtKg(data.foms.kgNoLiberados.total)} (${fmtPct(data.foms.kgNoLiberados.pct)})`],
      ["OEE Global", fmtPct(data.foms.oeeGlobalPct)],
      ["Cumplimiento Meta", data.foms.cumplimientoMetaPct != null ? fmtPct(data.foms.cumplimientoMetaPct) : DASH],
    ],
    headStyles: { fillColor: [16, 122, 87], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
  });
  y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;

  // Alertas
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Alertas Automáticas", M, y);
  if (data.alertas.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Tipo", "Título", "Detalle", "Cuándo"]],
      body: data.alertas.map((a) => [a.tipo, a.titulo, a.detalle, fmtDate(a.cuando)]),
      headStyles: { fillColor: [185, 28, 28], textColor: 255 },
      styles: { fontSize: 8.5, cellPadding: 4 },
    });
    y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 14;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text("Sin alertas en el periodo.", M, y + 16); y += 30;
  }

  // Tabla detallada (limitada)
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text(`Tabla Detallada (${tablaFiltrada.length} registros)`, M, y);
  if (tablaFiltrada.length) {
    const head = [["N° Captura", "N° Rollo", "Fecha", "Máquina", "Turno", "Producto", "Peso (kg)", "Estado"]];
    const body = tablaFiltrada.slice(0, 100).map((r) => [
      formatCaptura(r.secuencia_captura),
      r.numero_rollo,
      fmtDate(r.capturado_at),
      r.maquina ?? DASH,
      r.turno,
      r.producto ?? DASH,
      r.peso_kg != null ? fmt2.format(r.peso_kg) : DASH,
      r.dictamen ?? r.estado,
    ]);
    autoTable(doc, {
      startY: y + 6, head, body,
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
    });
    if (tablaFiltrada.length > 100) {
      const y2 = (doc as unknown as DocWithTable).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Se muestran 100 de ${tablaFiltrada.length} registros. Use el archivo XLSX para el detalle completo.`, M, y2);
    }
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(130);
    doc.text(SIN_DATOS, M, y + 16);
  }

  // Pie con paginación
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.line(M, pageH - 36, pageW - M, pageH - 36);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(130);
    doc.text("ConvertiPap · Reporte de Producción · Documento confidencial", M, pageH - 22);
    doc.text(`Página ${i} de ${total}`, pageW - M, pageH - 22, { align: "right" });
  }

  doc.save(`reporte_produccion_${stamp()}.pdf`);
}
