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
        "Total de Rollos": (data.maquinas?.reduce((s, m) => s + (m.rollos || 0), 0)) || data.kpis.rollosProducidos,
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
      rows: (() => {
        const filtrosActivos = hayFiltros(ctx.filtros);
        const mFilt = metricsFromRows(tablaFiltrada);
        const mTotal = metricsFromRows(data.tabla);
        const produccion = filtrosActivos
          ? (mTotal.kgTotal > 0 ? (mFilt.kgTotal / mTotal.kgTotal) * 100 : DASH)
          : (data.kpis.cumplimientoPct ?? data.foms.cumplimientoMetaPct ?? DASH);
        const calidad = filtrosActivos ? (mFilt.calidadPct ?? DASH) : data.kpis.calidadLiberadaPct;
        const liberacion = filtrosActivos ? (mFilt.liberacionPct ?? DASH) : data.foms.kgLiberados.pct;
        const cumplimiento = filtrosActivos ? DASH : (data.foms.cumplimientoMetaPct ?? data.kpis.cumplimientoPct ?? DASH);
        return [
          { Variable: filtrosActivos ? "Participación" : "Producción", "Valor %": produccion },
          { Variable: "Calidad", "Valor %": calidad },
          { Variable: "OEE", "Valor %": data.kpis.oeeGlobalPct },
          { Variable: "Liberación", "Valor %": liberacion },
          { Variable: "Cumplimiento", "Valor %": cumplimiento },
          { Variable: "Disponibilidad", "Valor %": data.kpis.disponibilidadPct },
        ];
      })(),
    },
    {
      name: "Waterfall Operativo",
      rows: (() => {
        const filtrosActivos = hayFiltros(ctx.filtros);
        const mFilt = metricsFromRows(tablaFiltrada);
        const kgTotal = filtrosActivos ? mFilt.kgTotal : data.kpis.kgProducidos;
        const kgNoLib = filtrosActivos ? mFilt.kgNoLib : data.foms.kgNoLiberados.total;
        const kgLib = filtrosActivos ? mFilt.kgLib : data.foms.kgLiberados.total;
        const base: Record<string, unknown>[] = [
          { Etapa: "Producción Total (kg)", Valor: kgTotal },
          { Etapa: "Kg No Liberados", Valor: -kgNoLib },
          { Etapa: "Kg Liberados", Valor: kgLib },
        ];
        if (!filtrosActivos && data.kpis.meta != null) {
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

  // ─────────── Distribución de Producción (Pie Chart Premium) ───────────
  if (y > pageH - 200) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
  doc.text(`Distribución de Producción${filtrosActivos ? " (filtrado)" : ""}`, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Gráfico circular premium · Kg Liberados vs Kg No Liberados", M, y + 12);
  {
    const kgTotal = filtrosActivos ? mFilt.kgTotal : data.kpis.kgProducidos;
    const kgNoLib = filtrosActivos ? mFilt.kgNoLib : data.foms.kgNoLiberados.total;
    const kgLib = filtrosActivos ? mFilt.kgLib : data.foms.kgLiberados.total;
    const meta = filtrosActivos ? null : data.kpis.meta;

    type Slice = { label: string; value: number; color: [number, number, number] };
    const slices: Slice[] = [
      { label: "Kg Liberados", value: Math.max(0, kgLib), color: [16, 122, 87] },
      { label: "Kg No Liberados", value: Math.max(0, kgNoLib), color: [185, 28, 28] },
    ];
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;

    const chartTop = y + 22;
    const chartH = 160;
    const cx = M + 90;
    const cy = chartTop + chartH / 2;
    const rOuter = 62;
    const rInner = 36;

    // Sombra suave bajo el donut
    doc.setFillColor(210, 215, 225);
    doc.circle(cx + 1.5, cy + 2.5, rOuter + 0.5, "F");

    // Helper: dibujar segmento (arco anular) aproximado por polígono
    const TAU = Math.PI * 2;
    const drawSlice = (a0: number, a1: number, color: [number, number, number]) => {
      const steps = Math.max(24, Math.ceil((a1 - a0) / (TAU / 180)));
      doc.setFillColor(color[0], color[1], color[2]);
      // construimos polígono: arco externo (a0→a1) + arco interno (a1→a0)
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const t = a0 + ((a1 - a0) * i) / steps;
        pts.push([cx + Math.cos(t) * rOuter, cy + Math.sin(t) * rOuter]);
      }
      for (let i = steps; i >= 0; i--) {
        const t = a0 + ((a1 - a0) * i) / steps;
        pts.push([cx + Math.cos(t) * rInner, cy + Math.sin(t) * rInner]);
      }
      // jsPDF triangles fan desde el primer punto
      for (let i = 1; i < pts.length - 1; i++) {
        doc.triangle(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], "F");
      }
    };

    // Dibujar slices
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

    // Anillo blanco separador exterior
    doc.setDrawColor(255); doc.setLineWidth(1.2);
    doc.circle(cx, cy, rOuter, "S");
    // Anillo interior elegante
    doc.setDrawColor(235); doc.setLineWidth(0.6);
    doc.circle(cx, cy, rInner, "S");

    // Centro: total
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text("Producción Total", cx, cy - 6, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 30);
    doc.text(`${fmt.format(Math.round(kgTotal))}`, cx, cy + 4, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140);
    doc.text("kg", cx, cy + 11, { align: "center" });

    // Etiquetas de porcentaje sobre cada slice (líneas guía)
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

    // ─── Leyenda premium a la derecha ───
    const legX = cx + rOuter + 60;
    let legY = chartTop + 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40);
    doc.text("Desglose", legX, legY);
    legY += 10;
    slices.forEach((s) => {
      const pct = (s.value / total) * 100;
      // chip de color
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.roundedRect(legX, legY - 5, 8, 8, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(40);
      doc.text(s.label, legX + 12, legY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
      doc.text(`${fmt.format(Math.round(s.value))} kg`, legX + 12, legY + 8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setTextColor(s.color[0], s.color[1], s.color[2]);
      doc.text(`${pct.toFixed(1)}%`, pageW - M - 4, legY + 4, { align: "right" });
      // mini barra de proporción
      const trackW = pageW - M - legX - 14;
      doc.setFillColor(238, 240, 245);
      doc.roundedRect(legX, legY + 12, trackW, 3, 1, 1, "F");
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.roundedRect(legX, legY + 12, (trackW * pct) / 100, 3, 1, 1, "F");
      legY += 26;
    });

    // KPI Meta (si aplica)
    if (meta != null) {
      const diff = kgTotal - meta;
      const okColor: [number, number, number] = diff >= 0 ? [16, 122, 87] : [185, 28, 28];
      legY += 4;
      doc.setDrawColor(225); doc.setLineWidth(0.4);
      doc.line(legX, legY, pageW - M, legY);
      legY += 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text("Meta", legX, legY);
      doc.text("Real", legX + 60, legY);
      doc.text("Δ vs Meta", pageW - M - 4, legY, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(40);
      doc.text(`${fmt.format(Math.round(meta))} kg`, legX, legY + 10);
      doc.text(`${fmt.format(Math.round(kgTotal))} kg`, legX + 60, legY + 10);
      doc.setTextColor(okColor[0], okColor[1], okColor[2]);
      doc.text(`${diff >= 0 ? "+" : "−"}${fmt.format(Math.abs(Math.round(diff)))} kg`, pageW - M - 4, legY + 10, { align: "right" });
    }

    y = chartTop + chartH + 14;
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
