// =====================================================================
// Exportación XLSX — Reporte de Turno
// Toda la información proviene del payload (BD productiva).
// =====================================================================
import type { CentroProduccionPayload, TablaRow } from "./produccion-centro.functions";
import { fechaHoraMX } from "./format";




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
function isJustificada(r: TablaRow) {
  return !!r.liberado_con_justificacion;
}
function isLiberada(r: TablaRow) {
  return !isJustificada(r) && (r.dictamen === "liberada" || r.estatus_liberacion === "L");
}
function isRechazada(r: TablaRow) {
  return r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
}
function estatusLabel(r: TablaRow): string {
  if (isJustificada(r)) return "Liberado c/justif";
  if (isLiberada(r)) return "Liberado";
  if (isRechazada(r)) return "No conforme";
  if (r.estatus_liberacion === "C" || r.dictamen === "concesion") return "Concesión";
  return r.dictamen ?? r.estatus_liberacion ?? r.estado ?? "Pendiente";
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


function buildFileName(base: string, ctx: ReporteTurnoCtx) {
  const safe = base.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  return `${safe}_${ctx.fecha}_t${ctx.turno}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
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
    { Indicador: "Generado", Valor: fechaHoraMX(new Date()) },
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
        "Fecha y hora": fechaHoraMX(row.capturado_at),
        "N° Rollo": row.numero_rollo ?? "—",
        Máquina: row.maquina ?? "—",
        Producto: row.producto ?? "—",
        "Peso (kg)": row.peso_kg ?? "—",
        "Estado / Dictamen": estatusLabel(row),
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
  const graficosWS = XLSX.utils.aoa_to_sheet([["Indicadores clave del turno"]]);
  XLSX.utils.sheet_add_json(graficosWS, indicadoresRows, { origin: "A2" });
  XLSX.utils.sheet_add_aoa(graficosWS, [["Distribución de producción (kg)"]], { origin: `A${indicadoresRows.length + 4}` });
  XLSX.utils.sheet_add_json(graficosWS, distribRows, { origin: `A${indicadoresRows.length + 5}` });
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
        "Fecha y hora": fechaHoraMX(row.capturado_at),
        "N° Rollo": row.numero_rollo ?? "—",
        Máquina: row.maquina ?? "—",
        Turno: TURNO_LABEL[row.turno] ?? row.turno,
        Producto: row.producto ?? "—",
        Capturista: row.analista ?? "—",
        "Estado/Dictamen": estatusLabel(row),
      }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trazaRows), "Trazabilidad");

  XLSX.writeFile(wb, `${buildFileName("reporte_de_turno", ctx)}.xlsx`);
}
