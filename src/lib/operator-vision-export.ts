// =============================================================================
// Exportador XLSX del Visor Operativo (Visión Operador · MP-04/05/06/07).
// READ ONLY: consume EXCLUSIVAMENTE el mismo payload que ya alimenta el visor
// (getOperatorVisionData) — no ejecuta queries paralelas ni escribe en BD.
// =============================================================================
import ExcelJS from "exceljs";
import type { OperatorVisionData } from "./operator-vision.functions";
import { getEstadoOficial } from "./qc-estado-oficial";
import logoConvertipap from "@/assets/logo-convertipap.png";

type Muestra = OperatorVisionData["muestras"][number];
type Med = {
  clave: string;
  valor: number | null;
  min: number | null;
  obj: number | null;
  max: number | null;
  estado: string;
};

export interface VarDef {
  clave: string;
  etiqueta: string;
  unidad: string;
  min: number;
  obj: number;
  max: number;
  hasSpec: boolean;
}

export interface OperatorVisionExportInput {
  maquina: string;
  turnoLabel: string;
  data: OperatorVisionData;
  /** Universo de variables que el visor está mostrando (spec activa ∪ rollo actual). */
  variablesParaMostrar: VarDef[];
  /** Estado técnico por rollo, tal como lo pinta el visor ("ok" | "warn" | "bad" | "none"). */
  evalRollo: (m: Muestra) => string;
  /** KPIs del visor, ya calculados en pantalla. */
  kpis: {
    rollosProducidos: number;
    noConformes: number;
    cumplimientoPct: number;
    cumplimientoTexto: string;
    velocidadMaquina: number | null;
    velocidadEnrollador: number | null;
    crepadoPct: number | null;
    peso: number | null;
    unionesTurno: number;
    minSinCaptura: number | null;
  };
}

const HDR_FILL = "FF1E293B";
const SUB_FILL = "FFE2E8F0";

const fmtFecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const fmtHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-MX", { hour12: false, hour: "2-digit", minute: "2-digit" }) : "";

const estadoTecnico = (s: string) =>
  s === "ok" ? "EN SPEC" : s === "bad" ? "FUERA DE SPEC" : s === "warn" ? "CON JUSTIFICACIÓN" : "SIN DATO";

function colToLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function headerRow(ws: ExcelJS.Worksheet, values: string[], row: number) {
  const r = ws.getRow(row);
  r.values = values;
  r.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  r.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  r.height = 28;
  r.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
    c.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  });
  return r;
}

function labelValue(ws: ExcelJS.Worksheet, row: number, col: number, label: string, value: string | number) {
  const l = ws.getCell(row, col);
  l.value = label;
  l.font = { name: "Arial", bold: true, size: 10 };
  l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB_FILL } };
  const v = ws.getCell(row, col + 1);
  v.value = value;
  v.font = { name: "Arial", size: 10 };
}

async function loadLogo(wb: ExcelJS.Workbook): Promise<number | null> {
  try {
    const res = await fetch(logoConvertipap);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return wb.addImage({ buffer: buf as ArrayBuffer, extension: "png" });
  } catch {
    return null;
  }
}

export async function exportarHistorialVisor(input: OperatorVisionExportInput): Promise<string> {
  const { maquina, turnoLabel, data, variablesParaMostrar, evalRollo, kpis } = input;
  const muestras = data.muestras ?? [];
  const current = muestras[muestras.length - 1];
  const generado = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Convertipap";
  wb.created = generado;
  const logoId = await loadLogo(wb);

  const valorDe = (m: Muestra, clave: string) =>
    (m.mediciones as Med[]).find((x) => x.clave === clave)?.valor ?? null;

  // ---------------------------------------------------------------- Resumen
  const ws1 = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws1.columns = [
    { width: 26 }, { width: 34 }, { width: 4 }, { width: 28 }, { width: 22 },
  ];
  if (logoId !== null) {
    ws1.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 190, height: 58 } });
  }
  ws1.getRow(1).height = 24;
  ws1.getRow(2).height = 24;
  ws1.mergeCells("B1:E2");
  const title = ws1.getCell("B1");
  title.value = "HISTORIAL DEL VISOR OPERATIVO";
  title.font = { name: "Arial", bold: true, size: 16 };
  title.alignment = { vertical: "middle", horizontal: "center" };

  let r = 4;
  ws1.getCell(r, 1).value = "DATOS GENERALES";
  ws1.getCell(r, 1).font = { name: "Arial", bold: true, size: 12 };
  r += 1;
  const generales: Array<[string, string]> = [
    ["Planta", data.maquina?.area ?? ""],
    ["Máquina", `${data.maquina?.codigo ?? maquina} — ${data.maquina?.nombre ?? ""}`],
    ["Fecha", fmtFecha(generado.toISOString())],
    ["Turno", turnoLabel || "—"],
    ["Operador (rollo actual)", current?.operador || "—"],
    ["Analista (rollo actual)", current?.analista || "—"],
    ["Producto", data.orden?.producto ? `${data.orden.productoCodigo} — ${data.orden.producto}` : "—"],
    ["Orden de fabricación", data.orden?.folio || "—"],
    ["Estado de máquina", data.estadoMaquina?.estado ?? "—"],
    ["Generado", `${fmtFecha(generado.toISOString())} ${generado.toLocaleTimeString("es-MX", { hour12: false })}`],
  ];
  for (const [l, v] of generales) { labelValue(ws1, r, 1, l, v); r += 1; }

  r += 1;
  ws1.getCell(r, 1).value = "INDICADORES";
  ws1.getCell(r, 1).font = { name: "Arial", bold: true, size: 12 };
  r += 1;
  headerRow(ws1, ["Indicador", "Valor", "", "Unidad", "Alcance"], r);
  r += 1;
  const indicadores: Array<[string, string | number, string, string]> = [
    ["Rollos producidos", kpis.rollosProducidos, "rollos", "TURNO"],
    ["No conformes (técnico)", kpis.noConformes, "rollos", "TURNO"],
    ["Cumplimiento (en spec)", kpis.cumplimientoPct, "%", "TURNO"],
    ["Detalle cumplimiento", kpis.cumplimientoTexto, "", "TURNO"],
    ["Cumplimiento oficial (L+C)", data.cumplimientoTurno?.pct ?? 0, "%", "TURNO"],
    ["Uniones acumuladas", kpis.unionesTurno, "u", "TURNO"],
    ["Velocidad Máquina", kpis.velocidadMaquina ?? "—", "m/min", "ROLLO ACTUAL"],
    ["Velocidad Enrollador", kpis.velocidadEnrollador ?? "—", "m/min", "ROLLO ACTUAL"],
    ["% Crepado", kpis.crepadoPct ?? "—", "%", "ROLLO ACTUAL"],
    ["Peso (Calidad)", kpis.peso ?? "—", "kg", "ROLLO ACTUAL"],
    ["Tiempo sin captura", kpis.minSinCaptura ?? "—", "min", "ESTADO ACTUAL"],
  ];
  for (const [nombre, valor, unidad, alcance] of indicadores) {
    const row = ws1.getRow(r);
    row.getCell(1).value = nombre;
    row.getCell(2).value = valor as never;
    row.getCell(4).value = unidad;
    row.getCell(5).value = alcance;
    row.font = { name: "Arial", size: 10 };
    row.getCell(1).font = { name: "Arial", size: 10, bold: true };
    r += 1;
  }

  if (muestras.length === 0) {
    r += 1;
    const c = ws1.getCell(r, 1);
    c.value = "Sin rollos capturados en el turno seleccionado";
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFB91C1C" } };
  }

  // ------------------------------------------------- Historial del Turno
  const ws2 = wb.addWorksheet("Historial del Turno");
  const varCols = variablesParaMostrar;
  const head2 = ["Hora", "Rollo", ...varCols.map((v) => (v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta)), "Estado oficial", "Estado técnico"];
  ws2.columns = head2.map((_, i) => ({ width: i < 2 ? 12 : 16 }));
  headerRow(ws2, head2, 1);
  const ordenados = [...muestras].reverse(); // más reciente primero (igual que el visor)
  for (const m of ordenados) {
    const row = ws2.addRow([
      fmtHora(m.capturadoAt),
      m.rollo,
      ...varCols.map((v) => {
        const val = valorDe(m, v.clave);
        return val === null ? "" : Number(val);
      }),
      getEstadoOficial({ estatus_liberacion: m.estatus }).estado_nombre,
      estadoTecnico(evalRollo(m)),
    ]);
    row.font = { name: "Arial", size: 10 };
    row.alignment = { horizontal: "center" };
  }

  // Fila de resumen al final del historial
  if (ordenados.length > 0) {
    const lastDataRow = 1 + ordenados.length;
    const summaryRow = ws2.getRow(lastDataRow + 1);
    summaryRow.getCell(1).value = "RESUMEN";
    summaryRow.getCell(2).value = "PROMEDIO";
    varCols.forEach((_, idx) => {
      const col = 3 + idx;
      const letter = colToLetter(col);
      summaryRow.getCell(col).value = { formula: `AVERAGE(${letter}2:${letter}${lastDataRow})` };
    });
    summaryRow.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = {
        top: { style: "double" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center" };
    });
  }

  ws2.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  if (ordenados.length > 0) {
    ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head2.length } };
  } else {
    ws2.addRow(["Sin rollos capturados en el turno seleccionado"]).font = { name: "Arial", bold: true };
  }




  // ------------------------------------------------------------- Descarga
  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaArch = `${generado.getFullYear()}-${pad(generado.getMonth() + 1)}-${pad(generado.getDate())}`;
  const fileName = `Convertipap_Historial_${data.maquina?.codigo ?? maquina}_${fechaArch}_${turnoLabel || "ST"}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}
