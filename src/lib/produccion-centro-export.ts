// =====================================================================
// Reporte de Producción — exportación a XLSX
// Datos provenientes exclusivamente de la BD (getProduccionCentro).
// Sin IA, sin simulaciones. Si no hay datos: "—" o "Sin datos disponibles".
// =====================================================================
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
      const justif = !!r.liberado_con_justificacion;
      const lib = !justif && (r.dictamen === "liberada" || r.estatus_liberacion === "L");
      const rech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
      const pend = !lib && !rech && !justif;
      if (f.estado === "liberado" && !lib) return false;
      if (f.estado === "rechazado" && !rech) return false;
      if (f.estado === "pendiente" && !pend) return false;
      if (f.estado === "liberado_justif" && !justif) return false;
    }
    return true;
  });
}

export function hayFiltros(f: ReporteProdFiltros): boolean {
  return !!(f.turno || f.maquina || f.producto || f.estado);
}

/** Etiqueta humana del estatus oficial del rollo (regla de oro). */
export function rowEstatusLabel(r: TablaRow): string {
  if (r.liberado_con_justificacion) return "Liberado c/justif";
  if (r.dictamen === "liberada" || r.estatus_liberacion === "L") return "Liberado";
  if (r.dictamen === "rechazada" || r.estatus_liberacion === "NC") return "No conforme";
  if (r.estatus_liberacion === "C" || r.dictamen === "concesion") return "Concesión";
  return r.dictamen ?? r.estatus_liberacion ?? r.estado ?? "Pendiente";
}

export function metricsFromRows(rows: TablaRow[]) {
  let rollos = 0, kgTotal = 0, kgLib = 0, kgNoLib = 0, kgJustif = 0, lib = 0, rech = 0, justif = 0;
  for (const r of rows) {
    rollos++;
    const peso = r.peso_kg ?? 0;
    kgTotal += peso;
    const isJustif = !!r.liberado_con_justificacion;
    const isLib = !isJustif && (r.dictamen === "liberada" || r.estatus_liberacion === "L");
    const isRech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
    if (isJustif) { kgJustif += peso; justif++; }
    else if (isLib) { kgLib += peso; lib++; }
    else if (isRech) { kgNoLib += peso; rech++; }
  }
  const calidadPct = rollos > 0 ? ((lib + justif) / rollos) * 100 : null;
  const liberacionPct = kgTotal > 0 ? ((kgLib + kgJustif) / kgTotal) * 100 : null;
  return { rollos, kgTotal, kgLib, kgNoLib, kgJustif, lib, rech, justif, calidadPct, liberacionPct };
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
        "Estatus Oficial": rowEstatusLabel(r),
        Dictamen: r.dictamen ?? DASH,
        "Justificación de liberación": r.liberado_con_justificacion ? (r.liberacion_justificacion ?? DASH) : DASH,
        Analista: r.analista ?? DASH,
      })) : empty,
    },
  ];

  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }

  // ── Análisis Visual (barras de bloques unicode) ──────────────────
  const bar = (pct: number, width = 25) => {
    const v = Math.max(0, Math.min(100, pct));
    const filled = Math.round((v / 100) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  };
  const semaforo = (pct: number) => (pct < 60 ? "🔴 Crítico" : pct < 80 ? "🟡 Aceptable" : "🟢 Óptimo");
  const numOrZero = (v: number | typeof DASH): number => (typeof v === "number" ? v : 0);

  const radarVars = [
    { label: "Producción", v: numOrZero(data.kpis.cumplimientoPct ?? data.foms.cumplimientoMetaPct ?? DASH) },
    { label: "Calidad", v: numOrZero(data.kpis.calidadLiberadaPct) },
    { label: "OEE", v: numOrZero(data.kpis.oeeGlobalPct) },
    { label: "Liberación", v: numOrZero(data.foms.kgLiberados.pct) },
    { label: "Cumplimiento", v: numOrZero(data.foms.cumplimientoMetaPct ?? data.kpis.cumplimientoPct ?? DASH) },
    { label: "Disponibilidad", v: numOrZero(data.kpis.disponibilidadPct) },
  ];
  const kgLib = data.foms.kgLiberados.total;
  const kgNoLib = data.foms.kgNoLiberados.total;
  const kgTot = kgLib + kgNoLib;
  const pctLib = kgTot > 0 ? (kgLib / kgTot) * 100 : 0;
  const pctNoLib = kgTot > 0 ? (kgNoLib / kgTot) * 100 : 0;

  const maxMaqKg = Math.max(1, ...data.maquinas.map((m) => m.kg || 0));
  const maxProdKg = Math.max(1, ...data.productos.map((p) => p.kg || 0));

  const visual: Record<string, string | number>[] = [
    { Sección: "RADAR DE SALUD OPERATIVA", Métrica: "", Valor: "", Gráfico: "0% ─────────── 50% ─────────── 100%", Estado: "" },
    ...radarVars.map((m) => ({
      Sección: "", Métrica: m.label, Valor: `${m.v.toFixed(1)}%`, Gráfico: bar(m.v), Estado: semaforo(m.v),
    })),
    { Sección: "", Métrica: "", Valor: "", Gráfico: "Lectura: <60% crítico · 60-80% aceptable · ≥80% óptimo", Estado: "" },
    { Sección: "", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    { Sección: "DISTRIBUCIÓN DE PRODUCCIÓN", Métrica: "", Valor: `Total: ${Math.round(kgTot).toLocaleString("es-MX")} kg`, Gráfico: "", Estado: "" },
    { Sección: "", Métrica: "Kg Liberados",    Valor: `${pctLib.toFixed(1)}%`,   Gráfico: bar(pctLib),   Estado: `${Math.round(kgLib).toLocaleString("es-MX")} kg` },
    { Sección: "", Métrica: "Kg No Liberados", Valor: `${pctNoLib.toFixed(1)}%`, Gráfico: bar(pctNoLib), Estado: `${Math.round(kgNoLib).toLocaleString("es-MX")} kg` },
    { Sección: "", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    { Sección: "PRODUCCIÓN POR MÁQUINA (kg)", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    ...data.maquinas.slice(0, 15).map((m) => ({
      Sección: "",
      Métrica: `${m.codigo} ${m.nombre}`,
      Valor: `${Math.round(m.kg).toLocaleString("es-MX")} kg`,
      Gráfico: bar((m.kg / maxMaqKg) * 100),
      Estado: `${m.rollos} rollos · OEE ${m.oeePct.toFixed(0)}%`,
    })),
    { Sección: "", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    { Sección: "PARTICIPACIÓN POR PRODUCTO", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    ...data.productos.slice(0, 15).map((p) => ({
      Sección: "",
      Métrica: p.producto,
      Valor: `${p.participacionPct.toFixed(1)}%`,
      Gráfico: bar((p.kg / maxProdKg) * 100),
      Estado: `${Math.round(p.kg).toLocaleString("es-MX")} kg · ${p.rollos} rollos`,
    })),
  ];
  const wsVisual = XLSX.utils.json_to_sheet(visual);
  wsVisual["!cols"] = [{ wch: 32 }, { wch: 30 }, { wch: 16 }, { wch: 40 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsVisual, "Análisis Visual");

  XLSX.writeFile(wb, `reporte_produccion_${stamp()}.xlsx`);
}

