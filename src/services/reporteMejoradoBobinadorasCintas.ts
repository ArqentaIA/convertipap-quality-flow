// =============================================================================
// Reporte 2 — Reporte Mejorado de Bobinadoras (Cintas)
// Plantilla real: public/plantillas/plantilla-bobinadoras-mejorada.xlsx
// Hoja base: "Reporte Bobinadoras" (A1:P41 · encabezado de posiciones en filas
// 9 y 10, posiciones D:N, Observaciones O:P, resumen filas 39-41).
// La hoja "Mejora propuesta" es solo referencia y no se incluye.
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
  type SheetModel,
} from "./cintas-plantilla-base";
import type { DatosReporteCintas } from "@/lib/reportes-cintas.functions";
import type { ResultadoReporte } from "./reporteDiarioBobinadorasCintas";

const COL_POS_INI = 4;        // D
const POS_TPL = 11;           // D:N en la plantilla
const COL_OBS_TPL = 15;       // O
const FILA_ANCHO = 9;
const FILA_PESO = 10;
const FILA_DATO_INI = 11;
const FILA_RESUMEN = 39;
const FILAS_DATO_TPL = FILA_RESUMEN - FILA_DATO_INI; // 28

export async function generarReporteMejoradoCintas(
  data: DatosReporteCintas,
  fileName: string,
): Promise<ResultadoReporte> {
  const lotes = normalizarLotes(data);
  if (lotes.length === 0) throw new ReporteCintasError("SIN_REGISTROS");
  const grupos = agrupar(lotes);
  const totTurno = totalesPorTurno(grupos);

  const { wb, ws } = await cargarPlantilla("mejorada");
  const model = capturarHoja(ws);
  for (const hoja of [...wb.worksheets]) wb.removeWorksheet(hoja.id);

  const usados = new Set<string>();
  for (const g of grupos) {
    const base = grupos.length === 1
      ? "Reporte Bobinadoras"
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
  model: SheetModel,
  nombre: string,
  g: Grupo,
  totalTurnoKg: number,
) {
  const n = Math.min(Math.max(g.maxPos, 1), MAX_POSICIONES);
  const colObs = COL_POS_INI + n;          // Observaciones inmediatamente después
  const extra = Math.max(0, g.lotes.length - FILAS_DATO_TPL);
  const mapRow = (r: number) => (r < FILA_RESUMEN ? r : r + extra);

  // Remapeo de columnas: posiciones dinámicas + Observaciones al final.
  const mapCol = (c: number): number | null => {
    if (c <= 3) return c;
    if (c >= COL_OBS_TPL) return colObs + (c - COL_OBS_TPL);
    const pos = c - COL_POS_INI + 1;         // 1..11
    if (pos > n) return null;                // se retira la columna sobrante
    return c;
  };

  const ws = clonarHoja(wb, model, nombre, mapCol, mapRow);

  // Ampliación: columnas de posición más allá de las 11 de la plantilla.
  if (n > POS_TPL) {
    const anchoCol = model.colWidths.get(COL_POS_INI) ?? 8;
    for (let p = POS_TPL + 1; p <= n; p++) {
      const col = COL_POS_INI + p - 1;
      ws.getColumn(col).width = anchoCol;
      for (const cell of model.cells.filter((x) => x.c === COL_POS_INI)) {
        ws.getCell(mapRow(cell.r), col).style = JSON.parse(JSON.stringify(cell.style)) as never;
      }
    }
  }

  // Filas de datos adicionales con el formato de la primera fila de datos.
  if (extra > 0) {
    const estilos = model.cells.filter((x) => x.r === FILA_DATO_INI);
    const alto = model.rowHeights.get(FILA_DATO_INI);
    for (let i = 0; i < extra; i++) {
      const r = FILA_RESUMEN + i;
      if (alto) ws.getRow(r).height = alto;
      for (let c = 1; c <= colObs + 1; c++) {
        const src = estilos.find((x) => (mapCol(x.c) ?? -1) === c) ?? estilos.find((x) => x.c === COL_POS_INI);
        if (src) ws.getCell(r, c).style = JSON.parse(JSON.stringify(src.style)) as never;
      }
    }
  }

  // Encabezado.
  ws.getCell("C5").value = g.bobinador;
  ws.getCell("C6").value = g.bobinadora;
  ws.getCell("C7").value = g.producto;
  ws.getCell(5, colObs).value = fmtFechaLegible(g.fecha);
  ws.getCell(6, colObs).value = g.turno;

  // Encabezado por posición: fila superior = ancho útil real, inferior = Peso (Kg).
  for (let p = 1; p <= n; p++) {
    const col = COL_POS_INI + p - 1;
    const ancho = g.anchoPorPos.get(p);
    const c1 = ws.getCell(FILA_ANCHO, col);
    c1.value = ancho != null ? `${fmtNum(ancho)} cm` : "—";
    c1.alignment = { ...(c1.alignment ?? {}), horizontal: "center", vertical: "middle", wrapText: true };
    c1.font = { ...(c1.font ?? {}), bold: true };
    const c2 = ws.getCell(FILA_PESO, col);
    c2.value = "Peso (Kg)";
    c2.alignment = { ...(c2.alignment ?? {}), horizontal: "center", vertical: "middle", wrapText: true };
  }

  // Datos.
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
      if (c.posicion > n) continue;
      const cell = ws.getCell(r, COL_POS_INI + c.posicion - 1);
      cell.value = round2(c.peso);
      cell.numFmt = "#,##0.00";
      cell.alignment = { ...(cell.alignment ?? {}), horizontal: "center", vertical: "middle" };
    }
    const obs = ws.getCell(r, colObs);
    obs.value = l.observaciones || "";
    obs.alignment = { ...(obs.alignment ?? {}), wrapText: true, vertical: "middle" };
  });

  // Resumen inferior.
  const rBase = FILA_RESUMEN + extra;
  const filas: [string, number][] = [
    ["PRODUCCIÓN TOTAL", round2(g.produccionKg)],
    ["TOTAL TURNO", round2(totalTurnoKg)],
    ["MERMA POR REVENTADORAS", round2(g.mermaPesoKg)],
    ["ROLLOS DE ORIGEN", g.rollos],
    ["CINTAS PRODUCIDAS", g.cintas],
  ];
  const estiloEtiqueta = ws.getCell(rBase, 1).style;
  filas.forEach(([label, valor], i) => {
    const r = rBase + i;
    if (i >= 3) {
      try { ws.mergeCells(r, 1, r, 3); } catch { /* ya combinada */ }
      ws.getCell(r, 1).style = JSON.parse(JSON.stringify(estiloEtiqueta)) as never;
    }
    const et = ws.getCell(r, 1);
    et.value = label;
    et.font = { ...(et.font ?? {}), bold: true };
    const v = ws.getCell(r, 4);
    v.value = valor;
    v.numFmt = Number.isInteger(valor) ? "#,##0" : "#,##0.00";
    v.font = { bold: true };
  });

  ws.pageSetup.printArea = `A1:${colLetter(colObs + 1)}${rBase + filas.length - 1}`;
}

function colLetter(n: number): string {
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
