// =============================================================================
// Base común para los Reportes de Cintas basados en plantillas Excel reales.
// Carga la plantilla .xlsx original (public/plantillas/*), captura su modelo
// (valores, estilos, combinaciones, anchos, altos y configuración de impresión)
// y permite clonar la hoja base tantas veces como configuraciones existan.
// =============================================================================
import type { Worksheet, Workbook, Row } from "exceljs";
import type {
  DatosReporteCintas,
  LoteCintasRow,
  CintaRow,
} from "@/lib/reportes-cintas.functions";
import type { Json } from "@/lib/pesaje-cintas.functions";

export const MAX_POSICIONES = 20;

export class ReporteCintasError extends Error {}

// ------------------------------- Plantillas -------------------------------- //

export const PLANTILLAS = {
  diario: {
    url: "/plantillas/plantilla-diario-bobinadoras.xlsx",
    hoja: "Reporte Diario",
    nombre: "3 Plantilla_Reporte_Diario_Bobinadoras.xlsx",
  },
  mejorada: {
    url: "/plantillas/plantilla-bobinadoras-mejorada.xlsx",
    hoja: "Reporte Bobinadoras",
    nombre: "4 Plantilla_Bobinadoras_Mejorada.xlsx",
  },
} as const;

export async function cargarPlantilla(key: keyof typeof PLANTILLAS): Promise<{ wb: Workbook; ws: Worksheet }> {
  const cfg = PLANTILLAS[key];
  const ExcelJS = (await import("exceljs")).default;
  let buf: ArrayBuffer;
  try {
    const res = await fetch(cfg.url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    buf = await res.arrayBuffer();
  } catch {
    throw new ReporteCintasError(
      `No se pudo cargar la plantilla requerida: ${cfg.nombre}. Verifica que el archivo esté disponible en el servidor.`,
    );
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(cfg.hoja);
  if (!ws) {
    throw new ReporteCintasError(`La plantilla ${cfg.nombre} no contiene la hoja base "${cfg.hoja}".`);
  }
  return { wb, ws };
}

// --------------------------- Modelo de hoja base --------------------------- //

type AnyRec = Record<string, unknown>;

export type SheetModel = {
  cells: { r: number; c: number; value: unknown; style: AnyRec }[];
  merges: { top: number; left: number; bottom: number; right: number }[];
  colWidths: Map<number, number | undefined>;
  rowHeights: Map<number, number | undefined>;
  pageSetup: AnyRec;
  maxCol: number;
  maxRow: number;
};

export function capturarHoja(ws: Worksheet): SheetModel {
  const cells: SheetModel["cells"] = [];
  ws.eachRow({ includeEmpty: true }, (row: Row, r: number) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const style = JSON.parse(JSON.stringify(cell.style ?? {})) as AnyRec;
      if (cell.value === null && Object.keys(style).length === 0) return;
      cells.push({ r, c, value: cell.value as unknown, style });
    });
  });

  const merges: SheetModel["merges"] = [];
  const model = ws.model as unknown as { merges?: string[] };
  for (const m of model.merges ?? []) {
    const [a, b] = m.split(":");
    const pa = parseRef(a);
    const pb = parseRef(b ?? a);
    merges.push({ top: pa.r, left: pa.c, bottom: pb.r, right: pb.c });
  }

  const colWidths = new Map<number, number | undefined>();
  for (let c = 1; c <= ws.columnCount; c++) colWidths.set(c, ws.getColumn(c).width);
  const rowHeights = new Map<number, number | undefined>();
  for (let r = 1; r <= ws.rowCount; r++) rowHeights.set(r, ws.getRow(r).height);

  return {
    cells,
    merges,
    colWidths,
    rowHeights,
    pageSetup: JSON.parse(JSON.stringify(ws.pageSetup ?? {})) as AnyRec,
    maxCol: ws.columnCount,
    maxRow: ws.rowCount,
  };
}

function parseRef(ref: string): { r: number; c: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
  if (!m) return { r: 1, c: 1 };
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Clona la hoja base dentro del mismo libro respetando estilos, combinaciones,
 * anchos, altos y configuración de impresión. `mapCol` permite reubicar
 * columnas (usado para ampliar/reducir el bloque de posiciones).
 */
export function clonarHoja(
  wb: Workbook,
  model: SheetModel,
  nombre: string,
  mapCol: (c: number) => number | null = (c) => c,
  mapRow: (r: number) => number = (r) => r,
): Worksheet {
  const ws = wb.addWorksheet(nombre, {
    pageSetup: model.pageSetup as never,
    properties: { defaultRowHeight: 15 },
  });

  for (const [c, w] of model.colWidths) {
    const t = mapCol(c);
    if (t && w) ws.getColumn(t).width = w;
  }
  for (const [r, h] of model.rowHeights) {
    if (h) ws.getRow(mapRow(r)).height = h;
  }
  for (const cell of model.cells) {
    const t = mapCol(cell.c);
    if (!t) continue;
    const dst = ws.getCell(mapRow(cell.r), t);
    dst.value = cell.value as never;
    dst.style = JSON.parse(JSON.stringify(cell.style)) as never;
  }
  for (const m of model.merges) {
    const l = mapCol(m.left);
    const r = mapCol(m.right);
    if (!l || !r || r < l) continue;
    try {
      ws.mergeCells(mapRow(m.top), l, mapRow(m.bottom), r);
    } catch {
      /* combinación no aplicable tras el remapeo */
    }
  }
  return ws;
}

export function nombreHojaUnico(base: string, usados: Set<string>): string {
  const limpio = base.replace(/[\\/*?:[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31) || "Hoja";
  if (!usados.has(limpio)) { usados.add(limpio); return limpio; }
  let i = 2;
  let cand = `${limpio.slice(0, 28)}_${i}`;
  while (usados.has(cand)) { i++; cand = `${limpio.slice(0, 28)}_${i}`; }
  usados.add(cand);
  return cand;
}

// ------------------------------ Normalización ------------------------------ //

export type CintaNorm = {
  id: string;
  posicion: number;
  peso: number;
  ancho: number;
  uniones: number;
  observaciones: string | null;
};

export type LoteNorm = {
  lote: LoteCintasRow;
  loteId: string;
  numeroRollo: string;
  fecha: string;
  turno: string;
  bobinadora: string;
  bobinador: string;
  producto: string;
  netoKg: number;
  diametroCm: number | null;
  diametroM: number | null;
  activas: CintaNorm[];
  todas: CintaRow[];
  patron: string;
  produccionKg: number;
  mermaRealKg: number | null;
  observaciones: string;
  esManual: boolean;
};

const NO_DISPONIBLE = "No disponible";

function snap(s: Json | undefined | null): Record<string, unknown> {
  return s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
}

function txt(v: unknown, fb = NO_DISPONIBLE): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s === "" || s === "SIN DATOS REGISTRADOS" ? fb : s;
}

function medicionNum(sn: Record<string, unknown>, clave: string): number | null {
  const m = sn["mediciones"];
  if (!m || typeof m !== "object") return null;
  const v = (m as Record<string, unknown>)[clave];
  if (!v || typeof v !== "object") return null;
  const val = (v as Record<string, unknown>)["valor"];
  return typeof val === "number" ? val : null;
}

export function normalizarLotes(data: DatosReporteCintas): LoteNorm[] {
  const porLote = new Map<string, CintaRow[]>();
  for (const c of data.cintas) {
    const arr = porLote.get(c.lote_id) ?? [];
    arr.push(c);
    porLote.set(c.lote_id, arr);
  }

  const out: LoteNorm[] = [];
  for (const lote of data.lotes) {
    const sn = snap(lote.datos_calidad_snapshot);
    const todas = (porLote.get(lote.id) ?? []).sort((a, b) => a.posicion - b.posicion);
    const activas: CintaNorm[] = todas
      .filter((c) => c.estado === "registrada")
      .map((c) => ({
        id: c.id,
        posicion: Number(c.posicion),
        peso: Number(c.peso_cinta_kg) || 0,
        ancho: Number(c.ancho_util) || 0,
        uniones: Number(c.uniones) || 0,
        observaciones: c.observaciones,
      }));

    for (const c of activas) {
      if (c.posicion < 1 || c.posicion > MAX_POSICIONES) {
        throw new ReporteCintasError(
          `Posición inválida (${c.posicion}) en el rollo ${lote.numero_rollo}. Máximo permitido: ${MAX_POSICIONES}.`,
        );
      }
    }

    const diametroCm = medicionNum(sn, "diametro");
    const obsLote = activas
      .map((c) => (c.observaciones ?? "").trim())
      .filter(Boolean);

    out.push({
      lote,
      loteId: lote.id,
      numeroRollo: lote.numero_rollo,
      fecha: lote.fecha_produccion ?? "",
      turno: txt(sn["turno"]),
      bobinadora: txt(lote.bobinadora_nombre_snapshot),
      bobinador: txt(lote.conductor_nombre_snapshot),
      producto: txt(lote.producto_nombre ?? lote.producto_codigo ?? sn["producto_nombre"]),
      netoKg: Number(lote.peso_bobina_madre_neto_kg) || 0,
      diametroCm,
      diametroM: diametroCm == null ? null : diametroCm / 100,
      activas,
      todas,
      patron: activas.map((c) => c.ancho).join("|") || "SIN CINTAS",
      produccionKg: activas.reduce((a, c) => a + c.peso, 0),
      mermaRealKg: lote.merma_real_kg == null ? null : Number(lote.merma_real_kg),
      observaciones: Array.from(new Set(obsLote)).join(" · "),
      esManual: !!lote.es_manual,
    });
  }
  return out;
}

export type Grupo = {
  clave: string;
  fecha: string;
  turno: string;
  bobinadora: string;
  bobinador: string;
  producto: string;
  patron: string;
  lotes: LoteNorm[];
  maxPos: number;
  anchoPorPos: Map<number, number>;
  produccionKg: number;
  rollos: number;
  cintas: number;
  mermaPesoKg: number;
};

/** Agrupa por fecha operativa + turno + bobinadora + operador + producto + patrón. */
export function agrupar(lotes: LoteNorm[]): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const l of lotes) {
    const clave = [l.fecha, l.turno, l.bobinadora, l.bobinador, l.producto, l.patron].join("|");
    let g = map.get(clave);
    if (!g) {
      g = {
        clave,
        fecha: l.fecha,
        turno: l.turno,
        bobinadora: l.bobinadora,
        bobinador: l.bobinador,
        producto: l.producto,
        patron: l.patron,
        lotes: [],
        maxPos: 0,
        anchoPorPos: new Map(),
        produccionKg: 0,
        rollos: 0,
        cintas: 0,
        mermaPesoKg: 0,
      };
      map.set(clave, g);
    }
    g.lotes.push(l);
    for (const c of l.activas) {
      g.maxPos = Math.max(g.maxPos, c.posicion);
      if (!g.anchoPorPos.has(c.posicion)) g.anchoPorPos.set(c.posicion, c.ancho);
    }
  }
  const grupos = Array.from(map.values());
  for (const g of grupos) {
    g.produccionKg = g.lotes.reduce((a, l) => a + l.produccionKg, 0);
    g.rollos = new Set(g.lotes.map((l) => l.loteId)).size;
    g.cintas = g.lotes.reduce((a, l) => a + l.activas.length, 0);
    // Merma por Peso: una sola vez por lote.
    g.mermaPesoKg = g.lotes.reduce((a, l) => a + (l.mermaRealKg ?? 0), 0);
    g.maxPos = Math.min(Math.max(g.maxPos, 1), MAX_POSICIONES);
  }
  grupos.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.turno.localeCompare(b.turno) || a.bobinadora.localeCompare(b.bobinadora),
  );
  return grupos;
}

/** Total del turno: suma de producción de todas las hojas de la misma fecha+turno. */
export function totalesPorTurno(grupos: Grupo[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of grupos) {
    const k = `${g.fecha}|${g.turno}`;
    m.set(k, (m.get(k) ?? 0) + g.produccionKg);
  }
  return m;
}

// ------------------------------- Descarga ---------------------------------- //

export function sanitizarNombreArchivo(n: string): string {
  return n.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

export async function descargarLibro(wb: Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizarNombreArchivo(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fmtFechaLegible(iso: string): string {
  if (!iso) return NO_DISPONIBLE;
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

export { NO_DISPONIBLE };
