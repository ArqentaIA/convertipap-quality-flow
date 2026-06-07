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

export function hayFiltros(f: ReporteProdFiltros): boolean {
  return !!(f.turno || f.maquina || f.producto || f.estado);
}

export function metricsFromRows(rows: TablaRow[]) {
  let rollos = 0, kgTotal = 0, kgLib = 0, kgNoLib = 0, lib = 0, rech = 0;
  for (const r of rows) {
    rollos++;
    const peso = r.peso_kg ?? 0;
    kgTotal += peso;
    const isLib = r.dictamen === "liberada" || r.estatus_liberacion === "L";
    const isRech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
    if (isLib) { kgLib += peso; lib++; }
    else if (isRech) { kgNoLib += peso; rech++; }
  }
  const calidadPct = rollos > 0 ? (lib / rollos) * 100 : null;
  const liberacionPct = kgTotal > 0 ? (kgLib / kgTotal) * 100 : null;
  return { rollos, kgTotal, kgLib, kgNoLib, lib, rech, calidadPct, liberacionPct };
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
      name: "Radar Salud Operativa",
      rows: [
        { Variable: "Producción", "Valor %": data.kpis.cumplimientoPct ?? data.foms.cumplimientoMetaPct ?? DASH },
        { Variable: "Calidad", "Valor %": data.kpis.calidadLiberadaPct },
        { Variable: "OEE", "Valor %": data.kpis.oeeGlobalPct },
        { Variable: "Liberación", "Valor %": data.foms.kgLiberados.pct },
        { Variable: "Cumplimiento", "Valor %": data.foms.cumplimientoMetaPct ?? data.kpis.cumplimientoPct ?? DASH },
        { Variable: "Disponibilidad", "Valor %": data.kpis.disponibilidadPct },
      ],
    },
    {
      name: "Waterfall Operativo",
      rows: (() => {
        const base: Record<string, unknown>[] = [
          { Etapa: "Producción Total (kg)", Valor: data.kpis.kgProducidos },
          { Etapa: "Kg No Liberados", Valor: -data.foms.kgNoLiberados.total },
          { Etapa: "Kg Liberados", Valor: data.foms.kgLiberados.total },
        ];
        if (data.kpis.meta != null) {
          base.push({ Etapa: "Meta (kg)", Valor: data.kpis.meta });
          base.push({ Etapa: "Producción Real (kg)", Valor: data.kpis.kgProducidos });
          base.push({ Etapa: "Diferencia (kg)", Valor: data.kpis.kgProducidos - data.kpis.meta });
        }
        return base;
      })(),
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
        "Blancura R457 (%)": r.blancura_r457 ?? DASH,
        "a*": r.blancura_a ?? DASH,
        "b*": r.blancura_b ?? DASH,
        "Ancho útil (cm)": r.ancho_util ?? DASH,
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

  // ─────────── Salud Operativa (Bullet chart horizontal) ───────────
  if (y > pageH - 240) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Radar de Salud Operativa", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  const filtrosActivos = hayFiltros(ctx.filtros);
  const mFilt = metricsFromRows(tablaFiltrada);
  const mTotal = metricsFromRows(data.tabla);
  doc.text(
    `Escala 0–100% · Zonas: crítico < 60 · aceptable 60–80 · óptimo ≥ 80${filtrosActivos ? "  ·  Métricas ajustadas a filtros" : ""}`,
    M,
    y + 12,
  );
  {
    const produccionFilt = filtrosActivos
      ? (mTotal.kgTotal > 0 ? (mFilt.kgTotal / mTotal.kgTotal) * 100 : null)
      : (data.kpis.cumplimientoPct ?? data.foms.cumplimientoMetaPct ?? (data.kpis.rollosProducidos > 0 ? Math.min(100, Math.round(data.foms.kgLiberados.pct + data.foms.kgNoLiberados.pct)) : null));
    const calidadFilt = filtrosActivos ? mFilt.calidadPct : data.kpis.calidadLiberadaPct;
    const liberacionFilt = filtrosActivos ? mFilt.liberacionPct : data.foms.kgLiberados.pct;
    const cumplimientoFilt = filtrosActivos ? null : (data.foms.cumplimientoMetaPct ?? data.kpis.cumplimientoPct);
    const radarMetrics: { label: string; value: number | null }[] = [
      { label: filtrosActivos ? "Participación" : "Producción", value: produccionFilt },
      { label: "Calidad", value: calidadFilt },
      { label: "OEE", value: data.kpis.oeeGlobalPct },
      { label: "Liberación", value: liberacionFilt },
      { label: "Cumplimiento", value: cumplimientoFilt },
      { label: "Disponibilidad", value: data.kpis.disponibilidadPct },
    ];
    const startX = M + 90;
    const trackW = pageW - M - startX - 60;
    const rowH = 16;
    const top = y + 22;
    radarMetrics.forEach((m, i) => {
      const ry = top + i * rowH;
      // etiqueta
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(40);
      doc.text(m.label, M, ry + 8);
      // zonas (rojo / ámbar / verde claros)
      doc.setFillColor(254, 226, 226); // rojo claro
      doc.rect(startX, ry + 2, trackW * 0.60, 9, "F");
      doc.setFillColor(254, 243, 199); // ámbar claro
      doc.rect(startX + trackW * 0.60, ry + 2, trackW * 0.20, 9, "F");
      doc.setFillColor(220, 252, 231); // verde claro
      doc.rect(startX + trackW * 0.80, ry + 2, trackW * 0.20, 9, "F");
      // contorno
      doc.setDrawColor(220); doc.setLineWidth(0.4);
      doc.rect(startX, ry + 2, trackW, 9);
      // marca de referencia 80%
      doc.setDrawColor(120); doc.setLineWidth(0.6);
      doc.line(startX + trackW * 0.80, ry + 1, startX + trackW * 0.80, ry + 12);
      // barra de valor
      const v = m.value;
      if (v != null) {
        const pct = Math.max(0, Math.min(100, v));
        const w = (trackW * pct) / 100;
        const color: [number, number, number] = pct >= 80 ? [16, 122, 87] : pct >= 60 ? [202, 138, 4] : [185, 28, 28];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(startX, ry + 4.5, w, 4, "F");
        // valor numérico
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(color[0], color[1], color[2]);
        doc.text(`${pct.toFixed(1)}%`, startX + trackW + 6, ry + 8);
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(150);
        doc.text(DASH, startX + trackW + 6, ry + 8);
      }
    });
    y = top + radarMetrics.length * rowH + 8;
  }

  // ─────────── Waterfall de Impacto Operativo ───────────
  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text("Waterfall de Impacto Operativo", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Flujo acumulado de kg con conectores escalonados", M, y + 12);
  {
    const kgTotal = data.kpis.kgProducidos;
    const kgNoLib = data.foms.kgNoLiberados.total;
    const kgLib = data.foms.kgLiberados.total;
    const meta = data.kpis.meta;
    type Bar = { label: string; value: number; color: [number, number, number]; kind: "total" | "delta" };
    const bars: Bar[] = [
      { label: "Producción\nTotal", value: kgTotal, color: [37, 99, 235], kind: "total" },
      { label: "Kg No\nLiberados", value: -kgNoLib, color: [185, 28, 28], kind: "delta" },
      { label: "Kg\nLiberados", value: kgLib, color: [16, 122, 87], kind: "total" },
    ];
    if (meta != null) {
      bars.push({ label: "Meta", value: meta, color: [100, 116, 139], kind: "total" });
      bars.push({ label: "Producción\nReal", value: kgTotal, color: [37, 99, 235], kind: "total" });
      const diff = kgTotal - meta;
      bars.push({ label: "Diferencia", value: diff, color: diff >= 0 ? [16, 122, 87] : [185, 28, 28], kind: "delta" });
    }
    // Cálculo de bases acumuladas (waterfall real)
    let acc = 0;
    const layout = bars.map((b) => {
      if (b.kind === "total") { acc = b.value; return { base: 0, top: b.value, ...b }; }
      const newAcc = acc + b.value;
      const top = Math.max(acc, newAcc);
      const base = Math.min(acc, newAcc);
      acc = newAcc;
      return { base, top, ...b };
    });
    const chartX = M;
    const chartY = y + 22;
    const chartW = pageW - 2 * M;
    const chartH = 130;
    const maxV = Math.max(1, ...layout.map((l) => l.top), kgTotal);
    const minV = Math.min(0, ...layout.map((l) => l.base));
    const range = maxV - minV || 1;
    const barW = (chartW - 20) / bars.length - 14;
    const innerH = chartH - 40;
    const baseY = chartY + chartH - 24;
    const yFor = (v: number) => baseY - ((v - minV) / range) * innerH;
    // ejes y gridlines
    doc.setDrawColor(230); doc.setLineWidth(0.3);
    for (let g = 0; g <= 4; g++) {
      const gy = chartY + (innerH * g) / 4;
      doc.line(chartX, gy, chartX + chartW, gy);
    }
    doc.setDrawColor(150); doc.setLineWidth(0.6);
    doc.line(chartX, yFor(0), chartX + chartW, yFor(0));
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(110);
    for (let g = 0; g <= 4; g++) {
      const val = maxV - ((maxV - minV) * g) / 4;
      doc.text(`${fmt.format(Math.round(val))}`, chartX - 2, chartY + (innerH * g) / 4 + 2, { align: "right" });
    }
    // barras con conectores
    layout.forEach((l, i) => {
      const x = chartX + 16 + i * (barW + 14);
      const yTop = yFor(l.top);
      const h = Math.max(1, yFor(l.base) - yFor(l.top));
      // barra
      doc.setFillColor(l.color[0], l.color[1], l.color[2]);
      doc.rect(x, yTop, barW, h, "F");

      // barra
      doc.setFillColor(l.color[0], l.color[1], l.color[2]);
      doc.rect(x, yTop, barW, h, "F");
      // borde superior brillante
      doc.setDrawColor(255); doc.setLineWidth(0.6);
      doc.line(x, yTop + 0.4, x + barW, yTop + 0.4);
      // conector escalonado al siguiente
      if (i < layout.length - 1) {
        const next = layout[i + 1];
        const yEnd = next.kind === "total" ? yFor(next.top) : yFor(acc - (i + 1 === layout.length - 1 && layout[i + 1].kind === "delta" ? 0 : 0));
        const yLink = l.kind === "delta" ? yFor(l.base + l.value > 0 ? l.top : l.base) : yFor(l.value);
        doc.setDrawColor(160); doc.setLineWidth(0.5);
        // línea punteada
        const xs = x + barW;
        const xe = x + barW + 14;
        const dy = yLink;
        const step = 3;
        for (let xx = xs; xx < xe; xx += step) doc.line(xx, dy, Math.min(xx + 1.5, xe), dy);
        void yEnd;
      }
      // valor encima
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(l.color[0], l.color[1], l.color[2]);
      const valTxt = `${l.value < 0 ? "−" : ""}${fmt.format(Math.abs(l.value))} kg`;
      doc.text(valTxt, x + barW / 2, yTop - 4, { align: "center" });
      // etiqueta debajo
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(60);
      const lines = l.label.split("\n");
      lines.forEach((ln, j) => doc.text(ln, x + barW / 2, baseY + 12 + j * 8, { align: "center" }));
    });
    y = chartY + chartH + 18;
  }


  if (y > pageH - 180) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text(`Tabla Detallada (${tablaFiltrada.length} registros)`, M, y);
  if (tablaFiltrada.length) {
    const head = [["N° Captura", "N° Rollo", "Fecha", "Máquina", "Turno", "Producto", "Peso (kg)", "R457 (%)", "a*", "b*", "Ancho (cm)", "Estado"]];
    const body = tablaFiltrada.map((r) => [
      formatCaptura(r.secuencia_captura),
      r.numero_rollo,
      fmtDate(r.capturado_at),
      r.maquina ?? DASH,
      r.turno,
      r.producto ?? DASH,
      r.peso_kg != null ? fmt2.format(r.peso_kg) : DASH,
      r.blancura_r457 != null ? fmt2.format(r.blancura_r457) : DASH,
      r.blancura_a != null ? fmt2.format(r.blancura_a) : DASH,
      r.blancura_b != null ? fmt2.format(r.blancura_b) : DASH,
      r.ancho_util != null ? fmt2.format(r.ancho_util) : DASH,
      r.dictamen ?? r.estado,
    ]);
    autoTable(doc, {
      startY: y + 6, head, body,
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 7, cellPadding: 2 },
    });
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
