import type { ReporteFueraTurno } from "./reporte-fuera-turno.functions";
import { fechaCortoMX, horaMX } from "./format";

export async function exportReporteFueraTurno(data: ReporteFueraTurno) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const keys = [...new Set(data.rows.flatMap((r) => Object.keys(r.mediciones)))].sort();
  const headers = ["ID registro", "N.º Rollo", "Fecha de captura", "Hora de captura", "Fecha de muestreo", "Hora de muestreo", "Máquina", "Turno declarado", "Producto", "SKU SAP", "Capturado por", "Operador", "Analista", "Estatus", "Motivo", ...keys];
  const rows = data.rows.map((r) => [r.id, r.rollo, fechaCortoMX(r.capturadoAt), horaMX(r.capturadoAt), fechaCortoMX(r.muestreoAt), horaMX(r.muestreoAt), r.maquina, r.turno, r.producto, r.skuSap ?? "—", r.capturadoPor, r.operador, r.analista, r.estatus, r.motivo, ...keys.map((k) => r.mediciones[k] ?? "—")]);
  const ws = XLSX.utils.aoa_to_sheet([
    ["CONVERTIPAP — CAPTURAS FUERA DE TURNO"], [data.planta, data.periodo],
    ["Fecha de captura · America/Mexico_City · 24 horas", "Registros", data.rows.length],
    [`Del ${fechaCortoMX(data.inicio)} ${horaMX(data.inicio)} al ${fechaCortoMX(data.finExclusivo)} ${horaMX(data.finExclusivo)}`], headers, ...rows,
  ]);
  ws["!cols"] = headers.map((h) => ({ wch: h === "Motivo" ? 50 : h === "ID registro" ? 38 : 22 }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + rows.length, c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, "Capturas fuera de turno");
  XLSX.writeFile(wb, `Capturas_fuera_turno_${data.periodo}.xlsx`);
}