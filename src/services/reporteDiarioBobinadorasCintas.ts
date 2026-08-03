// =============================================================================
// Reporte 1 — Reporte Diario de Bobinadoras (Cintas)
// Plantilla real: public/plantillas/plantilla-diario-bobinadoras.xlsx
// Hoja base: "Reporte Diario" (A1:W37 · encabezados de posición en fila 9,
// posiciones en columnas D:W = 20 posiciones máximo).
// =============================================================================
import {
  cargarPlantilla,
  capturarHoja,
  clonarHoja,
  normalizarLotes,
  agrupar,
  totalesPorTurno,
  nombreHojaUnico,
  descargarLibro,
  fmtFechaLegible,
  ReporteCintasError,
  MAX_POSICIONES,
  type Grupo,
} from "./cintas-plantilla-base";
import type { DatosReporteCintas } from "@/lib/reportes-cintas.functions";

const COL_POS_INI = 4;          // D
const FILA_ENCABEZADO = 9;
const FILA_DATO_INI = 10;
const FILA_TOTALES = 37;
const FILAS_DATO_TPL = FILA_TOTALES - FILA_DATO_INI; // 27

export type ResultadoReporte = {
  fileName: string;
  hojas: number;
  lotes: number;
  cintas: number;
  produccionKg: number;
};

export async function generarReporteDiarioCintas(
  data: DatosReporteCintas,
  fileName: string,
): Promise<ResultadoReporte> {
  const lotes = normalizarLotes(data);
  if (lotes.length === 0) throw new ReporteCintasError("SIN_REGISTROS");
  const grupos = agrupar(lotes);
  const totTurno = totalesPorTurno(grupos);

  const { wb, ws } = await cargarPlantilla("diario");
  const model = capturarHoja(ws);
  wb.removeWorksheet(ws.id);

  const usados = new Set<string>();
  for (const g of grupos) {
    const base = grupos.length === 1
      ? "Reporte Diario"
      : `${g.fecha || "s-f"} T${g.turno} ${g.bobinadora}`;
    const nombre = nombreHojaUnico(base, usados);
    pintarHoja(wb, model, nombre, g, totTurno.get(`${g.fecha}|${g.turno}`) ?? g.produccionKg);
  }

  await descargarLibro(wb, fileName);
  return {
    fileName,
    hojas: grupos.length,
    lotes: lotes.length,
    cintas: lotes.reduce((a, l) => a + l.activas.length, 0),
    produccionKg: lotes.reduce((a, l) => a + l.produccionKg, 0),
  };
}

function pintarHoja(
  wb: Parameters<typeof clonarHoja>[0],
  model: Parameters<typeof clonarHoja>[1],
  nombre: string,
  g: Grupo,
  totalTurnoKg: number,
) {
  const extra = Math.max(0, g.lotes.length - FILAS_DATO_TPL);
  const mapRow = (r: number) => (r < FILA_TOTALES ? r : r + extra);
  const ws = clonarHoja(wb, model, nombre, (c) => c, mapRow);

  // Filas de datos adicionales: clonan formato de la primera fila de datos.
  if (extra > 0) {
    const estilos = model.cells.filter((x) => x.r === FILA_DATO_INI);
    const alto = model.rowHeights.get(FILA_DATO_INI);
    for (let i = 0; i < extra; i++) {
      const r = FILA_TOTALES + i;
      if (alto) ws.getRow(r).height = alto;
      for (const cell of estilos) {
        ws.getCell(r, cell.c).style = JSON.parse(JSON.stringify(cell.style)) as never;
      }
    }
  }

  // Encabezado institucional del reporte.
  ws.getCell("C5").value = g.bobinador;
  ws.getCell("C6").value = g.bobinadora;
  ws.getCell("C7").value = g.producto;
  ws.getCell("S4").value = `Fecha: ${fmtFechaLegible(g.fecha)}`;
  ws.getCell("S5").value = `Turno: ${g.turno}`;

  // Encabezados de posición corregidos y consecutivos (Medida 1..N).
  for (let p = 1; p <= MAX_POSICIONES; p++) {
    const col = COL_POS_INI + p - 1;
    ws.getCell(FILA_ENCABEZADO, col).value = `Medida ${p}\nPeso`;
    const cell = ws.getCell(FILA_ENCABEZADO, col);
    cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, horizontal: "center", vertical: "middle" };
  }

  // Columnas dinámicas: ocultar posiciones posteriores al máximo del grupo.
  for (let p = g.maxPos + 1; p <= MAX_POSICIONES; p++) {
    ws.getColumn(COL_POS_INI + p - 1).hidden = true;
  }

  // Datos: una fila por rollo de origen / lote.
  g.lotes.forEach((l, i) => {
    const r = FILA_DATO_INI + i;
    ws.getCell(r, 1).value = l.numeroRollo;
    ws.getCell(r, 2).value = round2(l.netoKg);
    ws.getCell(r, 2).numFmt = "#,##0.00";
    if (l.diametroM != null) {
      ws.getCell(r, 3).value = round2(l.diametroM);
      ws.getCell(r, 3).numFmt = "0.00";
    } else {
      ws.getCell(r, 3).value = "No disponible";
    }
    for (const c of l.activas) {
      const cell = ws.getCell(r, COL_POS_INI + c.posicion - 1);
      cell.value = `${fmtNum(c.ancho)} cm\n${fmtNum(c.peso)} kg`;
      cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, horizontal: "center", vertical: "middle" };
    }
  });

  // Totales (área inferior, sin alterar el diseño institucional).
  const rTot = FILA_TOTALES + extra;
  const totales: [string, number][] = [
    ["PRODUCCIÓN TOTAL :", round2(g.produccionKg)],
    ["TOTAL TURNO :", round2(totalTurnoKg)],
    ["MERMA POR PESO :", round2(g.mermaPesoKg)],
    ["ROLLOS DE ORIGEN :", g.rollos],
    ["CINTAS PRODUCIDAS :", g.cintas],
  ];
  const estiloEtiqueta = ws.getCell(rTot, 14).style;
  totales.forEach(([label, valor], i) => {
    const r = rTot + i;
    const et = ws.getCell(r, 14);
    et.value = label;
    et.style = JSON.parse(JSON.stringify(estiloEtiqueta)) as never;
    et.font = { ...(et.font ?? {}), bold: true };
    const v = ws.getCell(r, 16);
    v.value = valor;
    v.numFmt = Number.isInteger(valor) ? "#,##0" : "#,##0.00";
    v.font = { bold: true };
  });

  ws.pageSetup.printArea = `A1:${colLetterLocal(3 + g.maxPos)}${rTot + totales.length - 1}`;
}

function colLetterLocal(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n));
}
