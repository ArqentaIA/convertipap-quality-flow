// =====================================================================
// Exportación XLSX — Reporte CONSOLIDADO
// Estilo basado en consolidado.xlsx: bloques por máquina, encabezados
// negros con texto blanco, bordes visibles, totales/promedios resaltados.
// =====================================================================
import ExcelJS from "exceljs";
import logoUrl from "@/assets/logo-convertipap.png";
import {
  MAQUINAS_CONSOLIDADO,
  VARIABLES_PROMEDIO,
  type ConsolidadoPayload,
  type ConsolidadoRow,
  type VariableClave,
} from "./consolidado.functions";

const TURNO_LABEL: Record<string, string> = {
  "1": "1ER TURNO",
  "2": "2DO TURNO",
  "3": "3ER TURNO",
};

const TURNOS = ["1", "2", "3"] as const;

// Columnas: TURNO, FECHA, CÓDIGO, N.° ROLLO, OBSERVACIONES, ESTATUS, HORA,
// PESO BASE, BLANCURA (R457), a*, b*, PESO BOBINA (Kg), ANCHO ÚTIL,
// CALIBRE, DIÁMETRO, ELONG MD, HUMEDAD, REL MD/CD, TENSIÓN CD, TENSIÓN MD,
// TENSIÓN RH, UNIONES
type ColDef = {
  key: string;
  header: string;
  variable?: VariableClave;
  width: number;
  numFmt?: string;
};

const COLS: ColDef[] = [
  { key: "turno", header: "TURNO", width: 14 },
  { key: "fecha", header: "FECHA", width: 12 },
  { key: "codigo", header: "CÓDIGO", width: 10 },
  { key: "rollo", header: "N.° ROLLO", width: 12 },
  { key: "observaciones", header: "OBSERVACIONES", width: 36 },
  { key: "estatus", header: "ESTATUS", width: 12 },
  { key: "hora", header: "HORA", width: 9 },
  { key: "pesoBase", header: "PESO BASE", variable: "pesoBase", width: 11, numFmt: "0.00" },
  { key: "blancuraR457", header: "BLANCURA (R457)", variable: "blancuraR457", width: 14, numFmt: "0.00" },
  { key: "blancuraA", header: "a*", variable: "blancuraA", width: 8, numFmt: "0.00" },
  { key: "blancuraB", header: "b*", variable: "blancuraB", width: 8, numFmt: "0.00" },
  { key: "peso", header: "PESO BOBINA (Kg)", variable: "peso", width: 16, numFmt: "0.00" },
  { key: "anchoUtil", header: "ANCHO ÚTIL", variable: "anchoUtil", width: 12, numFmt: "0.00" },
];

const TOTAL_COLS = COLS.length;

function fmtFecha(iso: string): string {
  // Convertir a TZ México (UTC-6)
  const d = new Date(iso);
  const local = new Date(d.getTime() + -6 * 60 * 60 * 1000 - d.getTimezoneOffset() * 60 * 1000);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function fmtHora(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() + -6 * 60 * 60 * 1000 - d.getTimezoneOffset() * 60 * 1000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mi = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function statusLabel(row: ConsolidadoRow): string {
  const s = (row.estatus_liberacion ?? "").trim();
  if (s === "L" && row.liberado_con_justificacion) return "L · Liberado c/justif";
  if (s === "L") return "L · Liberado";
  if (s === "NC") return "NC · No Conforme";
  if (s === "C") return "C · Condicionado";
  if (s) return s;
  return (row.estado ?? "").toString();
}

async function loadLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function styleBorder(): ExcelJS.Borders {
  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF808080" } };
  return { top: thin, left: thin, bottom: thin, right: thin } as ExcelJS.Borders;
}

function applyHeaderFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = styleBorder();
}

function lastColLetter(): string {
  // Convert 1-based col index to letter (handles >26)
  let n = TOTAL_COLS;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function avg(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function exportConsolidadoXLSX(payload: ConsolidadoPayload): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertiPap QMS";
  wb.created = new Date();

  const ws = wb.addWorksheet("Consolidado", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Column widths
  COLS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  const LAST_COL = lastColLetter();

  // ── Encabezado institucional ──
  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imgId = wb.addImage({ buffer: logoBuf, extension: "png" });
    ws.addImage(imgId, {
      tl: { col: 0, row: 0 },
      ext: { width: 150, height: 60 },
      editAs: "oneCell",
    });
  }
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 22;

  ws.mergeCells(`C1:${LAST_COL}1`);
  const titleCell = ws.getCell("C1");
  titleCell.value = "CONVERTIPAP S.A. DE C.V. — PLANTA TLAXCALA";
  titleCell.font = { name: "Calibri", size: 14, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`C2:${LAST_COL}2`);
  const subCell = ws.getCell("C2");
  subCell.value = "REPORTE CONSOLIDADO DE PRODUCCIÓN — CALIDAD";
  subCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF333333" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`C3:${LAST_COL}3`);
  const docCell = ws.getCell("C3");
  docCell.value =
    "CLÁUSULA DE REFERENCIA: Cláusula 9.1.2 ISO 9001:2015  ·  TIPO DOCUMENTO: ESPECIFICACIÓN PST  ·  ÁREA: CALIDAD  ·  CÓDIGO: EPST-004";
  docCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF555555" } };
  docCell.alignment = { horizontal: "center", vertical: "middle" };

  // Fecha del reporte
  ws.mergeCells(`A5:${LAST_COL}5`);
  const fechaCell = ws.getCell("A5");
  const [yy, mm, dd] = payload.fecha.split("-");
  fechaCell.value = `FECHA DEL REPORTE: ${dd}/${mm}/${yy}`;
  fechaCell.font = { name: "Calibri", size: 12, bold: true };
  fechaCell.alignment = { horizontal: "center", vertical: "middle" };
  fechaCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };
  ws.getRow(5).height = 22;

  let cursor = 7;
  const totalesPorMaquina: { codigo: string; kg: number }[] = [];

  // ── Bloques por máquina ──
  for (const block of payload.maquinas) {
    // Título de bloque
    ws.mergeCells(`A${cursor}:${LAST_COL}${cursor}`);
    const titulo = ws.getCell(`A${cursor}`);
    titulo.value = `PRODUCCIONES MÁQUINA ${block.codigo}`;
    titulo.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titulo.alignment = { horizontal: "center", vertical: "middle" };
    titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    titulo.border = styleBorder();
    ws.getRow(cursor).height = 22;
    cursor += 1;

    // Encabezados de tabla
    const headerRow = ws.getRow(cursor);
    COLS.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      applyHeaderFill(cell);
    });
    headerRow.height = 30;
    const headerRowNum = cursor;
    cursor += 1;

    if (block.rows.length === 0) {
      ws.mergeCells(`A${cursor}:${LAST_COL}${cursor}`);
      const empty = ws.getCell(`A${cursor}`);
      empty.value = "Sin registros para la fecha seleccionada";
      empty.font = { italic: true, color: { argb: "FF6B7280" } };
      empty.alignment = { horizontal: "center", vertical: "middle" };
      empty.border = styleBorder();
      ws.getRow(cursor).height = 22;
      cursor += 2;
      totalesPorMaquina.push({ codigo: block.codigo, kg: 0 });
      continue;
    }

    // Filas de datos
    const dataStart = cursor;
    for (const row of block.rows) {
      const r = ws.getRow(cursor);
      const values: (string | number | null)[] = [
        TURNO_LABEL[row.turno] ?? row.turno,
        fmtFecha(row.hora_muestreo),
        row.codigo_producto ?? "",
        row.numero_rollo,
        row.observaciones ?? "",
        statusLabel(row),
        fmtHora(row.hora_muestreo),
      ];
      // Variables numéricas (col 8 en adelante)
      for (let i = 7; i < COLS.length; i++) {
        const def = COLS[i];
        const v = def.variable ? row.mediciones[def.variable] : undefined;
        values.push(v == null ? null : v);
      }
      values.forEach((val, i) => {
        const cell = r.getCell(i + 1);
        cell.value = val;
        cell.border = styleBorder();
        cell.alignment = {
          horizontal: i === 4 ? "left" : "center",
          vertical: "middle",
          wrapText: i === 4,
        };
        cell.font = { name: "Calibri", size: 10 };
        const def = COLS[i];
        if (def.numFmt && typeof val === "number") cell.numFmt = def.numFmt;
      });
      cursor += 1;
    }
    const dataEnd = cursor - 1;

    // Filtros en encabezado
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: dataEnd, column: TOTAL_COLS },
    };

    // ── Resumen por turno (a la derecha de la tabla principal) ──
    // Columnas: TURNO | CÓDIGO | PRODUCCIÓN (Kg) | PROM PESO BASE | PROM PESO BASE x TURNO x CÓDIGO
    const RES_COL_START = TOTAL_COLS + 2; // deja una columna de separación
    ws.getColumn(RES_COL_START).width = 12;
    ws.getColumn(RES_COL_START + 1).width = 12;
    ws.getColumn(RES_COL_START + 2).width = 16;
    ws.getColumn(RES_COL_START + 3).width = 16;
    ws.getColumn(RES_COL_START + 4).width = 22;

    const RES_TOTAL_COLS = 5;
    const resTitleRow = headerRowNum - 1; // alineado con el título del bloque
    ws.mergeCells(resTitleRow, RES_COL_START, resTitleRow, RES_COL_START + RES_TOTAL_COLS - 1);
    const resumenTitle = ws.getCell(resTitleRow, RES_COL_START);
    resumenTitle.value = `RESUMEN — ${block.codigo}`;
    resumenTitle.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    resumenTitle.alignment = { horizontal: "center", vertical: "middle" };
    resumenTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    resumenTitle.border = styleBorder();

    const resHeaders = [
      "TURNO",
      "CÓDIGO",
      "PRODUCCIÓN (Kg)",
      "PROM PESO BASE",
      "PROM PESO BASE × TURNO × CÓDIGO",
    ];
    resHeaders.forEach((h, i) => {
      const cell = ws.getCell(headerRowNum, RES_COL_START + i);
      cell.value = h;
      applyHeaderFill(cell);
    });

    let kgMaquina = 0;
    let resRow = headerRowNum + 1;
    for (const turno of TURNOS) {
      const rowsTurno = block.rows.filter((r) => r.turno === turno);
      const kgTurno = rowsTurno.reduce((a, r) => a + (r.mediciones.peso ?? 0), 0);
      kgMaquina += kgTurno;
      const pesoBaseNums = rowsTurno
        .map((r) => r.mediciones.pesoBase)
        .filter((x): x is number => typeof x === "number");
      const promTurno = avg(pesoBaseNums);

      // Agrupar por código de producto dentro del turno
      const porCodigo = new Map<string, number[]>();
      for (const r of rowsTurno) {
        const cod = (r.codigo_producto ?? "—").toString();
        if (typeof r.mediciones.pesoBase !== "number") continue;
        const arr = porCodigo.get(cod) ?? [];
        arr.push(r.mediciones.pesoBase);
        porCodigo.set(cod, arr);
      }
      const codigos = Array.from(porCodigo.keys()).sort();

      if (codigos.length === 0) {
        // Fila vacía (sin códigos con peso base)
        const vals: (string | number | null)[] = [
          TURNO_LABEL[turno],
          null,
          rowsTurno.length === 0 ? null : kgTurno,
          promTurno,
          null,
        ];
        vals.forEach((val, i) => {
          const cell = ws.getCell(resRow, RES_COL_START + i);
          cell.value = val;
          cell.border = styleBorder();
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { name: "Calibri", size: 10 };
          if (i === 2) cell.numFmt = "#,##0";
          else if ((i === 3 || i === 4) && typeof val === "number") cell.numFmt = "0.00";
        });
        resRow += 1;
      } else {
        const firstRow = resRow;
        codigos.forEach((cod, idx) => {
          const promCod = avg(porCodigo.get(cod)!);
          const vals: (string | number | null)[] = [
            idx === 0 ? TURNO_LABEL[turno] : null,
            cod,
            idx === 0 ? (rowsTurno.length === 0 ? null : kgTurno) : null,
            idx === 0 ? promTurno : null,
            promCod,
          ];
          vals.forEach((val, i) => {
            const cell = ws.getCell(resRow, RES_COL_START + i);
            cell.value = val;
            cell.border = styleBorder();
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.font = { name: "Calibri", size: 10 };
            if (i === 2) cell.numFmt = "#,##0";
            else if ((i === 3 || i === 4) && typeof val === "number") cell.numFmt = "0.00";
          });
          resRow += 1;
        });
        // Merge vertical para TURNO, PRODUCCIÓN, PROM PESO BASE si hay >1 código
        if (codigos.length > 1) {
          ws.mergeCells(firstRow, RES_COL_START, resRow - 1, RES_COL_START);
          ws.mergeCells(firstRow, RES_COL_START + 2, resRow - 1, RES_COL_START + 2);
          ws.mergeCells(firstRow, RES_COL_START + 3, resRow - 1, RES_COL_START + 3);
        }
      }
    }

    // Total máquina
    const totalCells = [
      { v: `TOTAL ${block.codigo}` as string | number, fmt: undefined as string | undefined },
      { v: null as unknown as string | number, fmt: undefined },
      { v: kgMaquina, fmt: "#,##0" },
      { v: null as unknown as string | number, fmt: undefined },
      { v: null as unknown as string | number, fmt: undefined },
    ];
    totalCells.forEach((t, i) => {
      const c = ws.getCell(resRow, RES_COL_START + i);
      c.value = t.v;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = styleBorder();
      if (t.fmt) c.numFmt = t.fmt;
    });

    resRow += 1;

    // ── Tablas de ESTATUS por turno + código (CONDICIONADOS / NO CONFORMES) ──
    // Lado a lado debajo del resumen. 4 columnas cada una: TURNO | CÓDIGO | ROLLOS | KG
    const COND_START = RES_COL_START;       // 4 cols: +0,+1,+2,+3
    const NC_START = RES_COL_START + 5;     // 4 cols: +5,+6,+7,+8 (gap en +4)
    for (let i = 0; i < 9; i++) ws.getColumn(RES_COL_START + i).width = 14;

    resRow += 1; // fila en blanco de separación
    const estatusTitleRow = resRow;
    ws.mergeCells(estatusTitleRow, COND_START, estatusTitleRow, COND_START + 3);
    const condTitle = ws.getCell(estatusTitleRow, COND_START);
    condTitle.value = "CONDICIONADOS POR TURNO Y CÓDIGO";
    condTitle.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    condTitle.alignment = { horizontal: "center", vertical: "middle" };
    condTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD97706" } };
    condTitle.border = styleBorder();

    ws.mergeCells(estatusTitleRow, NC_START, estatusTitleRow, NC_START + 3);
    const ncTitle = ws.getCell(estatusTitleRow, NC_START);
    ncTitle.value = "NO CONFORMES POR TURNO Y CÓDIGO";
    ncTitle.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    ncTitle.alignment = { horizontal: "center", vertical: "middle" };
    ncTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    ncTitle.border = styleBorder();
    resRow += 1;

    // Encabezados
    ["TURNO", "CÓDIGO", "ROLLOS", "KG"].forEach((h, i) => {
      applyHeaderFill(ws.getCell(resRow, COND_START + i));
      ws.getCell(resRow, COND_START + i).value = h;
      applyHeaderFill(ws.getCell(resRow, NC_START + i));
      ws.getCell(resRow, NC_START + i).value = h;
    });
    resRow += 1;

    // Agrupar por turno+código por cada estatus
    type Agg = { rollos: number; kg: number };
    const buildGroups = (estatus: "C" | "NC" | "L") => {
      const groups: { turno: typeof TURNOS[number]; codigo: string; rollos: number; kg: number }[] = [];
      for (const turno of TURNOS) {
        const rowsTurno = block.rows.filter(
          (r) => r.turno === turno && (r.estatus_liberacion ?? "").trim() === estatus,
        );
        const porCod = new Map<string, Agg>();
        for (const r of rowsTurno) {
          const cod = (r.codigo_producto ?? "—").toString();
          const a = porCod.get(cod) ?? { rollos: 0, kg: 0 };
          a.rollos += 1;
          a.kg += r.mediciones.peso ?? 0;
          porCod.set(cod, a);
        }
        const cods = Array.from(porCod.keys()).sort();
        for (const cod of cods) {
          const a = porCod.get(cod)!;
          groups.push({ turno, codigo: cod, rollos: a.rollos, kg: a.kg });
        }
      }
      return groups;
    };
    const condGroups = buildGroups("C");
    const ncGroups = buildGroups("NC");

    const condRollosTot = condGroups.reduce((a, g) => a + g.rollos, 0);
    const condKgTot = condGroups.reduce((a, g) => a + g.kg, 0);
    const ncRollosTot = ncGroups.reduce((a, g) => a + g.rollos, 0);
    const ncKgTot = ncGroups.reduce((a, g) => a + g.kg, 0);

    const maxRows = Math.max(condGroups.length, ncGroups.length, 1);
    const dataStartRow = resRow;
    for (let i = 0; i < maxRows; i++) {
      const sides = [
        { col: COND_START, g: condGroups[i] },
        { col: NC_START, g: ncGroups[i] },
      ];
      for (const s of sides) {
        const vals: (string | number | null)[] = s.g
          ? [TURNO_LABEL[s.g.turno], s.g.codigo, s.g.rollos, s.g.kg]
          : [null, null, null, null];
        vals.forEach((v, j) => {
          const c = ws.getCell(resRow, s.col + j);
          c.value = v;
          c.border = styleBorder();
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.font = { name: "Calibri", size: 10 };
          if (j === 3 && typeof v === "number") c.numFmt = "#,##0";
        });
      }
      resRow += 1;
    }
    void dataStartRow;

    // Totales
    const totals = [
      { col: COND_START, vals: ["TOTAL", "", condRollosTot, condKgTot], color: "FFD97706" },
      { col: NC_START, vals: ["TOTAL", "", ncRollosTot, ncKgTot], color: "FFDC2626" },
    ];
    for (const t of totals) {
      t.vals.forEach((v, i) => {
        const c = ws.getCell(resRow, t.col + i);
        c.value = v;
        c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.color } };
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = styleBorder();
        if (i === 3 && typeof v === "number") c.numFmt = "#,##0";
      });
    }

    resRow += 1;

    // ── Tabla LIBERADOS por turno y código (debajo) ──
    const LIB_START = RES_COL_START; // 4 cols
    resRow += 1; // separación
    const libTitleRow = resRow;
    ws.mergeCells(libTitleRow, LIB_START, libTitleRow, LIB_START + 3);
    const libTitle = ws.getCell(libTitleRow, LIB_START);
    libTitle.value = "LIBERADOS POR TURNO Y CÓDIGO";
    libTitle.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    libTitle.alignment = { horizontal: "center", vertical: "middle" };
    libTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
    libTitle.border = styleBorder();
    resRow += 1;

    ["TURNO", "CÓDIGO", "ROLLOS", "KG"].forEach((h, i) => {
      applyHeaderFill(ws.getCell(resRow, LIB_START + i));
      ws.getCell(resRow, LIB_START + i).value = h;
    });
    resRow += 1;

    const libGroups = buildGroups("L");
    const libRollosTot = libGroups.reduce((a, g) => a + g.rollos, 0);
    const libKgTot = libGroups.reduce((a, g) => a + g.kg, 0);

    const libRows = libGroups.length || 1;
    for (let i = 0; i < libRows; i++) {
      const g = libGroups[i];
      const vals: (string | number | null)[] = g
        ? [TURNO_LABEL[g.turno], g.codigo, g.rollos, g.kg]
        : [null, null, null, null];
      vals.forEach((v, j) => {
        const c = ws.getCell(resRow, LIB_START + j);
        c.value = v;
        c.border = styleBorder();
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.font = { name: "Calibri", size: 10 };
        if (j === 3 && typeof v === "number") c.numFmt = "#,##0";
      });
      resRow += 1;
    }

    ["TOTAL", "", libRollosTot, libKgTot].forEach((v, i) => {
      const c = ws.getCell(resRow, LIB_START + i);
      c.value = v;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = styleBorder();
      if (i === 3 && typeof v === "number") c.numFmt = "#,##0";
    });
    resRow += 1;

    // Avanza el cursor del bloque al final del panel derecho (resumen + estatus + liberados),
    // para que el siguiente bloque no traslape merges existentes y dispare
    // "Cannot merge already merged cells".
    cursor = Math.max(cursor, resRow) + 1;

    totalesPorMaquina.push({ codigo: block.codigo, kg: kgMaquina });
  }

  // ── Resumen general del día ──
  ws.mergeCells(`A${cursor}:${LAST_COL}${cursor}`);
  const grandTitle = ws.getCell(`A${cursor}`);
  grandTitle.value = "RESUMEN GENERAL DEL DÍA";
  grandTitle.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  grandTitle.alignment = { horizontal: "center", vertical: "middle" };
  grandTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  grandTitle.border = styleBorder();
  cursor += 1;

  const grandHeaderRow = ws.getRow(cursor);
  ["MÁQUINA", "PRODUCCIÓN (Kg)"].forEach((h, i) => {
    const cell = grandHeaderRow.getCell(i + 1);
    cell.value = h;
    applyHeaderFill(cell);
  });
  cursor += 1;

  let kgDia = 0;
  for (const t of totalesPorMaquina) {
    const r = ws.getRow(cursor);
    r.getCell(1).value = t.codigo;
    r.getCell(2).value = t.kg;
    r.getCell(2).numFmt = "#,##0";
    for (let i = 1; i <= 2; i++) {
      const c = r.getCell(i);
      c.border = styleBorder();
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.font = { name: "Calibri", size: 10 };
    }
    kgDia += t.kg;
    cursor += 1;
  }
  const grandTotalRow = ws.getRow(cursor);
  grandTotalRow.getCell(1).value = "TOTAL DEL DÍA";
  grandTotalRow.getCell(2).value = kgDia;
  grandTotalRow.getCell(2).numFmt = "#,##0";
  for (let i = 1; i <= 2; i++) {
    const c = grandTotalRow.getCell(i);
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = styleBorder();
  }

  // Asegurar que las cuatro máquinas usadas son las solicitadas
  void MAQUINAS_CONSOLIDADO;
  void VARIABLES_PROMEDIO;

  // Descargar
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Consolidado_${payload.fecha}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
