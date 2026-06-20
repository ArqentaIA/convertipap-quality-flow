// =====================================================================
// Exportación XLSX — Reporte Mensual / Anual
// =====================================================================
import type { ReporteMensualPayload } from "./reporte-mensual.functions";

function buildFileName(base: string) {
  const safe = base.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${safe}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export type ExportCtx = {
  usuario: string;
};




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

  // ── Análisis Visual (barras de bloques unicode) ──────────────────
  const r = payload.resumen;
  const totEval = r.conformes + r.noConformes;
  const calidadPct = totEval > 0 ? (r.conformes / totEval) * 100 : 0;
  const liberacionPct = r.rollosTotal > 0 ? (r.conformes / r.rollosTotal) * 100 : 0;
  const resolucionPct = r.rollosTotal > 0 ? ((r.rollosTotal - r.pendientes) / r.rollosTotal) * 100 : 0;
  const produccionPct = r.rollosTotal > 0 ? 100 : 0;
  const oeePct = (calidadPct + liberacionPct + resolucionPct) / 3;
  const bar = (pct: number, width = 25) => {
    const v = Math.max(0, Math.min(100, pct));
    const filled = Math.round((v / 100) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  };
  const semaforo = (pct: number) => (pct < 60 ? "🔴 Crítico" : pct < 80 ? "🟡 Aceptable" : "🟢 Óptimo");
  const kgNC = payload.ncPorMaquina.reduce((a, b) => a + (b.kgAfectados || 0), 0);
  const kgLib = Math.max(0, r.kgTotal - kgNC);
  const pctLib = r.kgTotal > 0 ? (kgLib / r.kgTotal) * 100 : 0;
  const pctNC = r.kgTotal > 0 ? (kgNC / r.kgTotal) * 100 : 0;

  const visual: Record<string, string | number>[] = [
    { Sección: "RADAR DE SALUD OPERATIVA", Métrica: "", Valor: "", Gráfico: "0% ─────────── 50% ─────────── 100%", Estado: "" },
    { Sección: "", Métrica: "Producción",   Valor: `${produccionPct.toFixed(1)}%`, Gráfico: bar(produccionPct), Estado: semaforo(produccionPct) },
    { Sección: "", Métrica: "Calidad",      Valor: `${calidadPct.toFixed(1)}%`,    Gráfico: bar(calidadPct),    Estado: semaforo(calidadPct) },
    { Sección: "", Métrica: "OEE (proxy)",  Valor: `${oeePct.toFixed(1)}%`,        Gráfico: bar(oeePct),        Estado: semaforo(oeePct) },
    { Sección: "", Métrica: "Liberación",   Valor: `${liberacionPct.toFixed(1)}%`, Gráfico: bar(liberacionPct), Estado: semaforo(liberacionPct) },
    { Sección: "", Métrica: "Cumplimiento", Valor: `${resolucionPct.toFixed(1)}%`, Gráfico: bar(resolucionPct), Estado: semaforo(resolucionPct) },
    { Sección: "", Métrica: "Disponibilidad",Valor: `${produccionPct.toFixed(1)}%`,Gráfico: bar(produccionPct), Estado: semaforo(produccionPct) },
    { Sección: "", Métrica: "", Valor: "", Gráfico: "Lectura: <60% crítico · 60-80% aceptable · ≥80% óptimo · marca = meta 80%", Estado: "" },
    { Sección: "", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    { Sección: "DISTRIBUCIÓN DE PRODUCCIÓN", Métrica: "", Valor: `Total: ${Math.round(r.kgTotal).toLocaleString("es-MX")} kg`, Gráfico: "", Estado: "" },
    { Sección: "", Métrica: "Kg Liberados",    Valor: `${pctLib.toFixed(1)}%`, Gráfico: bar(pctLib),  Estado: `${Math.round(kgLib).toLocaleString("es-MX")} kg` },
    { Sección: "", Métrica: "Kg No Liberados", Valor: `${pctNC.toFixed(1)}%`,  Gráfico: bar(pctNC),   Estado: `${Math.round(kgNC).toLocaleString("es-MX")} kg` },
    { Sección: "", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    { Sección: "TOP NO CONFORMIDAD POR MÁQUINA", Métrica: "", Valor: "", Gráfico: "", Estado: "" },
    ...payload.ncPorMaquina.slice(0, 10).map((m, i) => ({
      Sección: "",
      Métrica: `${i + 1}. ${m.maquina}`,
      Valor: `${m.noConformidadPct.toFixed(1)}%`,
      Gráfico: bar(m.noConformidadPct),
      Estado: `${m.noConformes} NC · ${Math.round(m.kgAfectados).toLocaleString("es-MX")} kg`,
    })),
  ];
  const wsVisual = XLSX.utils.json_to_sheet(visual);
  wsVisual["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 14 }, { wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsVisual, "Análisis Visual");

  const baseName = payload.modo === "anual" ? `reporte_anual_${payload.year}` : `reporte_mensual_${payload.year}_${String(payload.month).padStart(2, "0")}`;
  XLSX.writeFile(wb, `${buildFileName(baseName)}.xlsx`);
}

