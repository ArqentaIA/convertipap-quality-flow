// =====================================================================
// Exportación XLSX — Reporte de Producción Mensual (dinámico)
// Conserva la estructura del formato FOR-PRO-05, generando columnas de
// días según el periodo cerrado del mes seleccionado.
// =====================================================================
import type {
  ReporteProduccionMesPayload,
} from "./reporte-produccion-mes.functions";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const COLOR = {
  azulOscuro: "FF0B2D5B",
  azul: "FF1E3A8A",
  azulClaro: "FFDBEAFE",
  grisHeader: "FFE2E8F0",
  grisCelda: "FFF8FAFC",
  blanco: "FFFFFFFF",
  amarilloTotal: "FFFEF3C7",
  verdeTotal: "FFD1FAE5",
  bordeGris: "FFCBD5E1",
};

function buildFileName(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fecha = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `reporte_produccion_${year}_${mm}_${fecha}.xlsx`;
}

export async function exportReporteProduccionMesXLSX(payload: ReporteProduccionMesPayload) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertiPap QMS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Producción", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 5 }],
  });

  const dias = payload.dias;
  // Columnas: A=producto, luego un col por día, luego TOTAL
  const numCols = 1 + dias.length + 1;
  const lastColLetter = colLetter(numCols);

  // Anchos
  ws.getColumn(1).width = 28;
  for (let i = 2; i <= 1 + dias.length; i++) ws.getColumn(i).width = 12;
  ws.getColumn(numCols).width = 16;

  // ── Encabezado documental ──────────────────────────────────────────
  ws.mergeCells(`A1:${lastColLetter}1`);
  const c1 = ws.getCell("A1");
  c1.value = "CONVERTIDOR DE PAPEL, S.A. DE C.V. — PLANTA TLAXCALA";
  c1.font = { bold: true, size: 13, color: { argb: COLOR.blanco } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${lastColLetter}2`);
  const c2 = ws.getCell("A2");
  c2.value = `CÓDIGO: FOR-PRO-05    ·    REPORTE DE PRODUCCIÓN MENSUAL`;
  c2.font = { bold: true, size: 10, color: { argb: COLOR.azulOscuro } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulClaro } };

  ws.mergeCells(`A3:${lastColLetter}3`);
  const c3 = ws.getCell("A3");
  const periodo = `${MESES[payload.month - 1]} ${payload.year}`;
  const ultimo = payload.ultimoTurnoCerrado
    ? `Último turno cerrado: ${payload.ultimoTurnoCerrado}`
    : "Sin turnos cerrados aún";
  const gen = new Date(payload.generadoAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
  c3.value = `Periodo: ${periodo}    ·    ${ultimo}    ·    Generado: ${gen}`;
  c3.font = { size: 9, italic: true, color: { argb: "FF334155" } };
  c3.alignment = { horizontal: "center", vertical: "middle" };

  // ── Cabecera de columnas globales (fila 5) ─────────────────────────
  const HEADER_ROW = 5;
  ws.getRow(HEADER_ROW - 1).height = 6; // espacio

  const headerCells: (string | number)[] = ["PRODUCTOS FABRICADOS"];
  for (const d of dias) headerCells.push(formatDayHeader(d));
  headerCells.push("TOTAL POR PRODUCTO");
  ws.getRow(HEADER_ROW).values = headerCells;
  styleHeaderRow(ws.getRow(HEADER_ROW), numCols);

  // Indicar turnos incluidos por día (fila 6)
  const turnosRow: (string | number)[] = ["Turnos incluidos"];
  for (const d of dias) {
    const turnos = payload.diasDetalle[d]?.turnos ?? [];
    turnosRow.push(turnos.length ? `T${turnos.join(",T")}` : "—");
  }
  turnosRow.push("");
  ws.getRow(HEADER_ROW + 1).values = turnosRow;
  styleSubHeaderRow(ws.getRow(HEADER_ROW + 1), numCols);

  let rowIdx = HEADER_ROW + 2;

  // ── Bloques por máquina ─────────────────────────────────────────────
  for (const m of payload.maquinas) {
    rowIdx++; // espacio antes
    // Título de máquina
    ws.mergeCells(`A${rowIdx}:${lastColLetter}${rowIdx}`);
    const mc = ws.getCell(`A${rowIdx}`);
    mc.value = `${m.codigo} — ${m.nombre}`;
    mc.font = { bold: true, size: 12, color: { argb: COLOR.blanco } };
    mc.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    mc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azul } };
    ws.getRow(rowIdx).height = 22;
    rowIdx++;

    // Filas de productos
    for (const p of m.productos) {
      const vals: (string | number)[] = [`${p.codigo} — ${p.nombre}`];
      for (const d of dias) vals.push(p.porDia[d] ?? 0);
      vals.push(p.total);
      ws.getRow(rowIdx).values = vals;
      styleDataRow(ws.getRow(rowIdx), numCols);
      rowIdx++;
    }

    // Fila TOTAL POR DÍA
    const totVals: (string | number)[] = ["TOTAL POR DÍA"];
    for (const d of dias) totVals.push(m.totalesPorDia[d] ?? 0);
    totVals.push(m.totalMaquina);
    ws.getRow(rowIdx).values = totVals;
    styleTotalRow(ws.getRow(rowIdx), numCols, COLOR.amarilloTotal);
    rowIdx++;

    // Fila TOTAL KG máquina (resaltada)
    ws.mergeCells(`A${rowIdx}:${colLetter(numCols - 1)}${rowIdx}`);
    const tk = ws.getCell(`A${rowIdx}`);
    tk.value = `TOTAL KG ${m.codigo}`;
    tk.font = { bold: true, size: 11, color: { argb: COLOR.azulOscuro } };
    tk.alignment = { horizontal: "right", vertical: "middle" };
    tk.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.verdeTotal } };
    const tkv = ws.getCell(`${lastColLetter}${rowIdx}`);
    tkv.value = m.totalMaquina;
    tkv.numFmt = "#,##0.00";
    tkv.font = { bold: true, size: 12, color: { argb: COLOR.azulOscuro } };
    tkv.alignment = { horizontal: "right", vertical: "middle" };
    tkv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.verdeTotal } };
    ws.getRow(rowIdx).height = 20;
    rowIdx++;
  }

  // ── Total general planta ───────────────────────────────────────────
  rowIdx++;
  ws.mergeCells(`A${rowIdx}:${colLetter(numCols - 1)}${rowIdx}`);
  const tg = ws.getCell(`A${rowIdx}`);
  tg.value = "TOTAL GENERAL DE PLANTA (KG)";
  tg.font = { bold: true, size: 12, color: { argb: COLOR.blanco } };
  tg.alignment = { horizontal: "right", vertical: "middle" };
  tg.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
  const tgv = ws.getCell(`${lastColLetter}${rowIdx}`);
  tgv.value = payload.totalGeneral;
  tgv.numFmt = "#,##0.00";
  tgv.font = { bold: true, size: 13, color: { argb: COLOR.blanco } };
  tgv.alignment = { horizontal: "right", vertical: "middle" };
  tgv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
  ws.getRow(rowIdx).height = 26;

  // Si no hay máquinas
  if (payload.maquinas.length === 0) {
    rowIdx++;
    ws.mergeCells(`A${rowIdx}:${lastColLetter}${rowIdx}`);
    const e = ws.getCell(`A${rowIdx}`);
    e.value = "Sin producción registrada para el periodo seleccionado.";
    e.alignment = { horizontal: "center" };
    e.font = { italic: true, color: { argb: "FF64748B" } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildFileName(payload.year, payload.month);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── helpers ─────────────────────────────────────────────────────────
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function formatDayHeader(ymd: string): string {
  const [, , d] = ymd.split("-");
  return `Día ${parseInt(d, 10)}`;
}

type Row = { getCell: (col: number) => { value: unknown; font?: unknown; fill?: unknown; alignment?: unknown; border?: unknown; numFmt?: string }; height?: number };

function styleHeaderRow(row: Row, numCols: number) {
  for (let i = 1; i <= numCols; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, size: 10, color: { argb: COLOR.blanco } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder();
  }
  row.height = 28;
}

function styleSubHeaderRow(row: Row, numCols: number) {
  for (let i = 1; i <= numCols; i++) {
    const c = row.getCell(i);
    c.font = { italic: true, size: 9, color: { argb: "FF334155" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.grisHeader } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  }
  row.height = 16;
}

function styleDataRow(row: Row, numCols: number) {
  for (let i = 1; i <= numCols; i++) {
    const c = row.getCell(i);
    c.alignment = { horizontal: i === 1 ? "left" : "right", vertical: "middle", indent: i === 1 ? 1 : 0 };
    c.border = thinBorder();
    if (i === 1) {
      c.font = { size: 10, color: { argb: "FF0F172A" } };
    } else {
      c.numFmt = "#,##0.00;-#,##0.00;\"·\"";
      c.font = { size: 10, color: { argb: "FF0F172A" } };
    }
  }
  row.height = 18;
}

function styleTotalRow(row: Row, numCols: number, bg: string) {
  for (let i = 1; i <= numCols; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, size: 10, color: { argb: COLOR.azulOscuro } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    c.alignment = { horizontal: i === 1 ? "right" : "right", vertical: "middle" };
    c.border = thinBorder();
    if (i > 1) c.numFmt = "#,##0.00;-#,##0.00;\"·\"";
  }
  row.height = 20;
}

function thinBorder() {
  const s = { style: "thin" as const, color: { argb: COLOR.bordeGris } };
  return { top: s, left: s, bottom: s, right: s };
}
