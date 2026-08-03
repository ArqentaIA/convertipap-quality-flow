// =============================================================================
// Reporte 2 — Reporte Mejorado de Bobinadoras (Cintas)
// Formato ajustado por el usuario (archivo reporte_bobinadoras.xlsx):
//  • UNA sola hoja: "Reporte Bobinadoras".
//  • Cada rollo ocupa dos filas: pesos de cintas y, debajo, el ancho útil.
//  • Rollos alternados con color de fondo para identificarlos rápidamente.
//  • Totales con unidades (Kg) + total de cintas y total de peso.
// =============================================================================
import {
  normalizarLotes,
  agrupar,
  descargarLibro,
  fmtFechaLegible,
  ReporteCintasError,
  MAX_POSICIONES,
  colLetter,
  type LoteNorm,
} from "./cintas-plantilla-base";
import type { DatosReporteCintas } from "@/lib/reportes-cintas.functions";
import type { ResultadoReporte } from "./reporteDiarioBobinadorasCintas";

const COL_POS_INI = 4; // D
const FILA_TITULO_TABLA = 9;
const FILA_ENCABEZADO = 10;
const FILA_DATO_INI = 11;

const AZUL = "FF1F3864";
const GRIS = "FFD9D9D9";
const BANDA_A = "FFEAF1FB";
const BANDA_B = "FFFFF7E6";

const borde = {
  top: { style: "thin" as const, color: { argb: "FF9AA5B1" } },
  left: { style: "thin" as const, color: { argb: "FF9AA5B1" } },
  bottom: { style: "thin" as const, color: { argb: "FF9AA5B1" } },
  right: { style: "thin" as const, color: { argb: "FF9AA5B1" } },
};

function ordenNatural(a: string, b: string): number {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

export async function generarReporteMejoradoCintas(
  data: DatosReporteCintas,
  fileName: string,
): Promise<ResultadoReporte> {
  const lotes = normalizarLotes(data);
  if (lotes.length === 0) throw new ReporteCintasError("SIN_REGISTROS");

  const grupos = agrupar(lotes);
  const g0 = grupos[0]!;

  const ordenados: LoteNorm[] = [...lotes].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || ordenNatural(a.numeroRollo, b.numeroRollo),
  );

  const maxPos = Math.min(
    Math.max(1, ...ordenados.flatMap((l) => l.activas.map((c) => c.posicion))),
    MAX_POSICIONES,
  );
  const colObs = COL_POS_INI + maxPos;

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONVERTIPAP";
  const ws = wb.addWorksheet("Reporte Bobinadoras", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 12;
  for (let p = 1; p <= maxPos; p++) ws.getColumn(COL_POS_INI + p - 1).width = 11;
  ws.getColumn(colObs).width = 38;

  // ------------------------------ Encabezado ------------------------------ //
  const titulos = [
    "CONVERTIDOR DE PAPEL S.A. DE C.V.",
    (data.planta || "PLANTA TLAXCALA").toUpperCase(),
    "REPORTE DIARIO DE PRODUCCIÓN BOBINADORAS",
  ];
  titulos.forEach((t, i) => {
    const r = i + 1;
    ws.mergeCells(r, 1, r, colObs);
    const c = ws.getCell(r, 1);
    c.value = t;
    c.font = { bold: true, size: i === 0 ? 14 : 12, color: { argb: i === 2 ? AZUL : "FF000000" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Fecha / periodo y turno(s) reales cubiertos por el reporte.
  const fechas = [...new Set(ordenados.map((l) => l.fecha).filter(Boolean))].sort();
  const etiquetaFecha = fechas.length > 1 ? "Periodo:" : "Fecha:";
  const valorFecha =
    fechas.length === 0
      ? "—"
      : fechas.length === 1
        ? fmtFechaLegible(fechas[0]!)
        : `Del ${fmtFechaLegible(fechas[0]!)} al ${fmtFechaLegible(fechas[fechas.length - 1]!)} (${fechas.length} días)`;

  const turnos = [...new Set(ordenados.map((l) => String(l.turno ?? "").trim()).filter(Boolean))].sort();
  const etiquetaTurno = turnos.length > 1 ? "Turnos:" : "Turno:";
  const valorTurno =
    turnos.length === 0 ? "—" : turnos.length >= 3 ? `Todos (${turnos.join(", ")})` : turnos.join(", ");

  const meta: [string, string, string?, string?][] = [
    ["Nombre de Bobinador:", g0.bobinador, etiquetaFecha, valorFecha],
    ["Nombre de Bobinadora:", g0.bobinadora, etiquetaTurno, valorTurno],
    ["Tipo de Papel:", g0.producto],
  ];
  meta.forEach(([et, val, et2, val2], i) => {
    const r = 5 + i;
    const a = ws.getCell(r, 1);
    a.value = et;
    a.font = { bold: true };
    const v = ws.getCell(r, 3);
    v.value = val;
    if (et2) {
      const b = ws.getCell(r, colObs - 1);
      b.value = et2;
      b.font = { bold: true };
      b.alignment = { horizontal: "right" };
      ws.getCell(r, colObs).value = val2 ?? "";
    }
  });

  // ---------------------------- Encabezado tabla --------------------------- //
  ws.mergeCells(FILA_TITULO_TABLA, 1, FILA_TITULO_TABLA, 3);
  ws.mergeCells(FILA_TITULO_TABLA, COL_POS_INI, FILA_TITULO_TABLA, colObs - 1);
  const th1 = ws.getCell(FILA_TITULO_TABLA, 1);
  th1.value = "ROLLO MADRE";
  const th2 = ws.getCell(FILA_TITULO_TABLA, COL_POS_INI);
  th2.value = "CINTAS";
  for (const c of [th1, th2]) {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = borde;
  }
  ws.getCell(FILA_TITULO_TABLA, colObs).border = borde;

  const heads = ["No. Rollo", "Peso Rollo (Kg)", "Diámetro (M)"];
  for (let c = 1; c <= colObs; c++) {
    const cell = ws.getCell(FILA_ENCABEZADO, c);
    cell.value =
      c <= 3 ? heads[c - 1] : c === colObs ? "Observaciones" : "Peso (Kg)";
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borde;
  }
  ws.getRow(FILA_ENCABEZADO).height = 30;

  // -------------------------------- Datos ---------------------------------- //
  let r = FILA_DATO_INI;
  ordenados.forEach((l, idx) => {
    const banda = idx % 2 === 0 ? BANDA_A : BANDA_B;
    const rPeso = r;
    const rAncho = r + 1;

    for (const fila of [rPeso, rAncho]) {
      for (let c = 1; c <= colObs; c++) {
        const cell = ws.getCell(fila, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: banda } };
        cell.border = borde;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: c === colObs };
      }
    }

    // Columnas del rollo madre combinadas verticalmente.
    for (const c of [1, 2, 3, colObs]) {
      try { ws.mergeCells(rPeso, c, rAncho, c); } catch { /* ya combinada */ }
    }

    const cRollo = ws.getCell(rPeso, 1);
    cRollo.value = l.numeroRollo;
    cRollo.font = { bold: true };

    const cPeso = ws.getCell(rPeso, 2);
    cPeso.value = round2(l.netoKg);
    cPeso.numFmt = "#,##0.00";

    const cDia = ws.getCell(rPeso, 3);
    if (l.diametroM != null) {
      cDia.value = round2(l.diametroM);
      cDia.numFmt = "0.00";
    } else {
      cDia.value = "No disponible";
    }

    for (const c of l.activas) {
      if (c.posicion > maxPos) continue;
      const col = COL_POS_INI + c.posicion - 1;
      const cp = ws.getCell(rPeso, col);
      cp.value = round2(c.peso);
      cp.numFmt = "#,##0.00";
      cp.font = { bold: true };
      const ca = ws.getCell(rAncho, col);
      ca.value = c.ancho ? `${fmtNum(c.ancho)} cm` : "—";
      ca.font = { italic: true, size: 10, color: { argb: "FF555555" } };
    }

    const obs = ws.getCell(rPeso, colObs);
    obs.value = l.observaciones || "";
    obs.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

    r += 2;
  });

  // ------------------------------- Totales --------------------------------- //
  const totalCintas = ordenados.reduce((a, l) => a + l.activas.length, 0);
  const totalPeso = ordenados.reduce((a, l) => a + l.produccionKg, 0);
  const totalTurno = grupos.reduce((a, g) => a + g.produccionKg, 0);
  const mermaPeso = ordenados.reduce((a, l) => a + (l.mermaRealKg ?? 0), 0);
  const rollos = new Set(ordenados.map((l) => l.loteId)).size;

  const filasTot: [string, number, string][] = [
    ["TOTAL TURNO", round2(totalTurno), "Kg"],
    ["MERMA POR REVENTADORAS", round2(mermaPeso), "Kg"],
    ["ROLLOS DE ORIGEN", rollos, "rollos"],
    ["CINTAS PRODUCIDAS", totalCintas, "cintas"],
    ["TOTAL DE PESO", round2(totalPeso), "Kg"],
  ];

  const rTotIni = r + 1;
  filasTot.forEach(([label, valor, unidad], i) => {
    const fr = rTotIni + i;
    try { ws.mergeCells(fr, 1, fr, 3); } catch { /* ya combinada */ }
    const et = ws.getCell(fr, 1);
    et.value = label;
    et.font = { bold: true };
    et.alignment = { horizontal: "right", vertical: "middle" };
    et.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    et.border = borde;

    const v = ws.getCell(fr, COL_POS_INI);
    v.value = valor;
    v.numFmt = Number.isInteger(valor) ? "#,##0" : "#,##0.00";
    v.font = { bold: true };
    v.alignment = { horizontal: "center", vertical: "middle" };
    v.border = borde;

    const u = ws.getCell(fr, COL_POS_INI + 1);
    u.value = unidad;
    u.font = { bold: true, color: { argb: AZUL } };
    u.alignment = { horizontal: "left", vertical: "middle" };
    u.border = borde;
  });

  ws.pageSetup.printArea = `A1:${colLetter(colObs)}${rTotIni + filasTot.length - 1}`;
  ws.views = [{ state: "frozen", ySplit: FILA_ENCABEZADO }];

  await descargarLibro(wb, fileName);
  return {
    fileName,
    hojas: 1,
    lotes: ordenados.length,
    cintas: totalCintas,
    produccionKg: totalPeso,
  };
}
