// =====================================================================
// Reporte Mensual de Bobinadoras (Pesaje de Cintas) — generador XLSX
// Solo lectura. Datos provenientes de Supabase vía server function.
// Campo de periodo: pesajes_cintas_lotes.fecha_produccion (fecha operativa)
// =====================================================================
import type {
  ReporteMensualCintasData,
  LoteCintas,
  CintaRegistrada,
  Json,
} from "@/lib/pesaje-cintas.functions";
import logoUrl from "@/assets/logo-convertipap.png";
import { fechaHoraLargaMX } from "@/lib/format";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const POSICIONES = 20;

const COLOR = {
  azulOscuro: "FF0B2D5B",
  azul: "FF1E3A8A",
  azulClaro: "FFDBEAFE",
  gris: "FFE2E8F0",
  grisAnulada: "FFD9D9D9",
  amarillo: "FFFFF7CC",
  verde: "FFD1FAE5",
  blanco: "FFFFFFFF",
  borde: "FFCBD5E1",
  rojo: "FFB91C1C",
};

// ------------------------------- Tipos ------------------------------------ //

export type CintaNorm = {
  id: string;
  posicion: number;
  peso: number;
  ancho: number;
  uniones: number;
  estado: CintaRegistrada["estado"];
  observaciones: string | null;
  created_at: string;
};

export type RolloNorm = {
  lote: LoteCintas;
  fecha: string;              // fecha operativa YYYY-MM-DD
  turno: string;
  bobinadora: string;
  bobinador: string;
  conductor: string;
  operador: string;
  analista: string;
  supervisor: string;
  fabricacion: string;
  productoCodigo: string;
  productoNombre: string;
  diametro: number | null;
  netoKg: number;
  cintas: CintaNorm[];        // todas (incl. anuladas)
  activas: CintaNorm[];
  patron: string;
  produccionKg: number;
  mermaCalcKg: number;
  mermaCalcPct: number | null;
  mermaRealKg: number | null;
  difMermaKg: number | null;
  uniones: number;
  estadoInfo: string;
};

export class ReporteError extends Error {}

// ---------------------------- Normalización -------------------------------- //

function snap(s: Json | undefined): Record<string, unknown> {
  return s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
}

function str(v: unknown, fallback = "—"): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s === "" ? fallback : s;
}

function medicion(sn: Record<string, unknown>, clave: string): number | null {
  const m = sn["mediciones"];
  if (!m || typeof m !== "object") return null;
  const v = (m as Record<string, unknown>)[clave];
  if (!v || typeof v !== "object") return null;
  const val = (v as Record<string, unknown>)["valor"];
  return typeof val === "number" ? val : null;
}

export function normalizar(data: ReporteMensualCintasData): RolloNorm[] {
  const porLote = new Map<string, CintaNorm[]>();
  for (const c of data.cintas) {
    const arr = porLote.get(c.lote_id) ?? [];
    arr.push({
      id: c.id,
      posicion: c.posicion,
      peso: Number(c.peso_cinta_kg) || 0,
      ancho: Number(c.ancho_util) || 0,
      uniones: Number(c.uniones) || 0,
      estado: c.estado,
      observaciones: c.observaciones,
      created_at: c.created_at,
    });
    porLote.set(c.lote_id, arr);
  }

  const out: RolloNorm[] = [];
  for (const lote of data.lotes) {
    const sn = snap(data.snapshots[lote.id]);
    const cintas = (porLote.get(lote.id) ?? []).sort((a, b) => a.posicion - b.posicion);
    const activas = cintas.filter((c) => c.estado === "registrada");

    // Validación: posiciones activas duplicadas
    const vistos = new Map<number, string[]>();
    for (const c of activas) {
      const ids = vistos.get(c.posicion) ?? [];
      ids.push(c.id);
      vistos.set(c.posicion, ids);
    }
    for (const [pos, ids] of vistos) {
      if (ids.length > 1) {
        throw new ReporteError(
          `Posición activa duplicada · Rollo ${lote.numero_rollo} · Posición ${pos} · IDs: ${ids.join(", ")}`,
        );
      }
      if (pos < 1 || pos > POSICIONES) {
        throw new ReporteError(`Posición inválida (${pos}) en el rollo ${lote.numero_rollo}.`);
      }
    }

    const neto = Number(lote.peso_bobina_madre_neto_kg) || 0;
    const produccion = activas.reduce((a, c) => a + c.peso, 0);
    const mermaCalc = neto - produccion;
    const mermaReal = lote.merma_real_kg == null ? null : Number(lote.merma_real_kg);
    const patron = activas.map((c) => c.ancho).join("|") || "SIN CINTAS";

    const estadoInfo =
      lote.estado === "abierto"
        ? "MERMA PROVISIONAL"
        : activas.length < POSICIONES && mermaReal == null
          ? "LOTE INCOMPLETO"
          : "FINALIZADO";

    out.push({
      lote,
      fecha: lote.fecha_produccion ?? "",
      turno: str(sn["turno"], "—"),
      bobinadora: str(lote.bobinadora_nombre_snapshot, "SIN DATOS REGISTRADOS"),
      bobinador: str(sn["jefe_maquina"], "—"),
      conductor: str(lote.conductor_nombre_snapshot, "SIN DATOS REGISTRADOS"),
      operador: str(sn["operador"], "—"),
      analista: str(sn["analista"], "—"),
      supervisor: str(sn["prensero"], "—"),
      fabricacion: str(lote.fabricacion ?? sn["fabricacion"], "—"),
      productoCodigo: str(lote.producto_codigo ?? sn["producto_codigo"], "S/P"),
      productoNombre: str(lote.producto_nombre ?? sn["producto_nombre"], "—"),
      diametro: medicion(sn, "diametro"),
      netoKg: neto,
      cintas,
      activas,
      patron,
      produccionKg: produccion,
      mermaCalcKg: mermaCalc,
      mermaCalcPct: neto > 0 ? mermaCalc / neto : null,
      mermaRealKg: mermaReal,
      difMermaKg: mermaReal == null ? null : mermaReal - mermaCalc,
      uniones: activas.reduce((a, c) => a + c.uniones, 0),
      estadoInfo,
    });
  }
  return out;
}

// -------------------------------- Helpers ---------------------------------- //

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function thin() {
  const s = { style: "thin" as const, color: { argb: COLOR.borde } };
  return { top: s, left: s, bottom: s, right: s };
}

function sanitizeSheetName(base: string, usados: Set<string>): string {
  let name = base.replace(/[\\/*?:[\]]/g, "-").replace(/\s+/g, "_").slice(0, 31);
  if (!usados.has(name)) { usados.add(name); return name; }
  let i = 2;
  while (usados.has(`${name.slice(0, 28)}_${i}`)) i++;
  const fin = `${name.slice(0, 28)}_${i}`;
  usados.add(fin);
  return fin;
}

async function logoBase64(): Promise<string> {
  const res = await fetch(logoUrl);
  const buf = await res.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ------------------------------ Generación --------------------------------- //

export async function generarReporteMensualBobinadoras(
  data: ReporteMensualCintasData,
): Promise<{ fileName: string; dias: number; rollos: number; cintas: number; produccionKg: number }> {
  const ExcelJS = (await import("exceljs")).default;
  const rollos = normalizar(data);
  if (rollos.length === 0) throw new ReporteError("SIN_REGISTROS");

  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertiPap QMS";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  (wb.calcProperties as unknown as { forceFullCalc?: boolean }).forceFullCalc = true;

  let logoId: number | null = null;
  try {
    logoId = wb.addImage({ base64: await logoBase64(), extension: "png" });
  } catch { logoId = null; }

  const periodo = `${MESES[data.month - 1]} ${data.year}`;

  // ─────────────────── Hoja 1: Resumen Mensual ───────────────────
  const ws = wb.addWorksheet("Resumen Mensual", { views: [{ state: "frozen", ySplit: 0 }] });
  ws.getColumn(1).width = 34;
  for (let i = 2; i <= 16; i++) ws.getColumn(i).width = 16;

  const prodTotal = rollos.reduce((a, r) => a + r.produccionKg, 0);
  const netoTotal = rollos.reduce((a, r) => a + r.netoKg, 0);
  const mermaCalcTotal = netoTotal - prodTotal;
  const mermaRealTotal = rollos.reduce((a, r) => a + (r.mermaRealKg ?? 0), 0);
  const unionesTotal = rollos.reduce((a, r) => a + r.uniones, 0);
  const cintasTotal = rollos.reduce((a, r) => a + r.activas.length, 0);
  const dias = new Set(rollos.map((r) => r.fecha)).size;

  ws.mergeCells("A1:P1");
  const t1 = ws.getCell("A1");
  t1.value = `CONVERTIDOR DE PAPEL, S.A. DE C.V. — ${data.planta}`;
  t1.font = { bold: true, size: 13, color: { argb: COLOR.blanco } };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:P2");
  const t2 = ws.getCell("A2");
  t2.value = `REPORTE MENSUAL DE BOBINADORAS · ${periodo}`;
  t2.font = { bold: true, size: 11, color: { argb: COLOR.azulOscuro } };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulClaro } };

  const kpis: [string, string | number][] = [
    ["Mes reportado", periodo],
    ["Planta", data.planta],
    ["Fecha de generación", fechaHoraLargaMX(data.generadoAt)],
    ["Usuario que generó", data.usuario],
    ["Días con producción", dias],
    ["Total de rollos de origen", rollos.length],
    ["Total de cintas registradas", cintasTotal],
    ["Peso total de rollos de origen (kg)", Number(netoTotal.toFixed(2))],
    ["Producción total de cintas (kg)", Number(prodTotal.toFixed(2))],
    ["Merma calculada total (kg)", Number(mermaCalcTotal.toFixed(2))],
    ["Merma calculada (%)", netoTotal > 0 ? mermaCalcTotal / netoTotal : 0],
    ["Merma real total (kg)", Number(mermaRealTotal.toFixed(2))],
    ["Diferencia merma real - calculada (kg)", Number((mermaRealTotal - mermaCalcTotal).toFixed(2))],
    ["Total de uniones", unionesTotal],
    ["Lotes finalizados", rollos.filter((r) => r.estadoInfo === "FINALIZADO").length],
    ["Lotes en proceso", rollos.filter((r) => r.estadoInfo === "MERMA PROVISIONAL").length],
    ["Lotes incompletos", rollos.filter((r) => r.estadoInfo === "LOTE INCOMPLETO").length],
  ];
  let row = 4;
  for (const [k, v] of kpis) {
    ws.getCell(`A${row}`).value = k;
    ws.getCell(`A${row}`).font = { bold: true, size: 10 };
    const c = ws.getCell(`B${row}`);
    c.value = v;
    if (k === "Merma calculada (%)") c.numFmt = "0.00%";
    else if (typeof v === "number" && k.includes("kg")) c.numFmt = "#,##0.00";
    c.font = { size: 10 };
    row++;
  }

  // Tabla de resumen agrupada
  row += 2;
  const headRow = row;
  const heads = [
    "Fecha operativa", "Planta", "Bobinadora", "Turno", "Clave producto", "Nombre producto",
    "Rollos", "Cintas", "Peso rollos (kg)", "Producción (kg)", "Merma calc. (kg)", "Merma calc. (%)",
    "Merma real (kg)", "Dif. merma (kg)", "Uniones", "Estado información",
  ];
  ws.getRow(headRow).values = heads;
  for (let i = 1; i <= heads.length; i++) {
    const c = ws.getRow(headRow).getCell(i);
    c.font = { bold: true, size: 10, color: { argb: COLOR.blanco } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thin();
  }
  ws.getRow(headRow).height = 28;

  type Agg = {
    fecha: string; bobinadora: string; turno: string; cod: string; nom: string;
    rollos: number; cintas: number; neto: number; prod: number; real: number; uniones: number;
    estados: Set<string>;
  };
  const agg = new Map<string, Agg>();
  for (const r of rollos) {
    const key = `${r.fecha}|${r.bobinadora}|${r.turno}|${r.productoCodigo}`;
    const a = agg.get(key) ?? {
      fecha: r.fecha, bobinadora: r.bobinadora, turno: r.turno, cod: r.productoCodigo, nom: r.productoNombre,
      rollos: 0, cintas: 0, neto: 0, prod: 0, real: 0, uniones: 0, estados: new Set<string>(),
    };
    a.rollos += 1;
    a.cintas += r.activas.length;
    a.neto += r.netoKg;
    a.prod += r.produccionKg;
    a.real += r.mermaRealKg ?? 0;
    a.uniones += r.uniones;
    a.estados.add(r.estadoInfo);
    agg.set(key, a);
  }
  const filas = [...agg.values()].sort((x, y) =>
    x.fecha.localeCompare(y.fecha) || x.bobinadora.localeCompare(y.bobinadora) ||
    x.turno.localeCompare(y.turno) || x.cod.localeCompare(y.cod),
  );

  let r0 = headRow + 1;
  for (const a of filas) {
    const mermaCalc = a.neto - a.prod;
    ws.getRow(r0).values = [
      a.fecha, data.planta, a.bobinadora, a.turno, a.cod, a.nom,
      a.rollos, a.cintas, Number(a.neto.toFixed(2)), Number(a.prod.toFixed(2)),
      { formula: `I${r0}-J${r0}`, result: Number(mermaCalc.toFixed(2)) },
      { formula: `IF(I${r0}=0,0,K${r0}/I${r0})`, result: a.neto > 0 ? mermaCalc / a.neto : 0 },
      Number(a.real.toFixed(2)),
      { formula: `M${r0}-K${r0}`, result: Number((a.real - mermaCalc).toFixed(2)) },
      a.uniones,
      [...a.estados].join(" / "),
    ];
    for (let i = 1; i <= heads.length; i++) {
      const c = ws.getRow(r0).getCell(i);
      c.border = thin();
      c.font = { size: 10 };
      if (i >= 9 && i <= 14 && i !== 12) c.numFmt = "#,##0.00";
      if (i === 12) c.numFmt = "0.00%";
      if (i === 11 && mermaCalc < 0) c.font = { size: 10, bold: true, color: { argb: COLOR.rojo } };
    }
    r0++;
  }
  const totRow = r0;
  ws.getCell(`A${totRow}`).value = "TOTAL GENERAL DEL MES";
  ws.mergeCells(`A${totRow}:F${totRow}`);
  const first = headRow + 1;
  const last = r0 - 1;
  const totales: Record<number, unknown> = {
    7: { formula: `SUM(G${first}:G${last})`, result: rollos.length },
    8: { formula: `SUM(H${first}:H${last})`, result: cintasTotal },
    9: { formula: `SUM(I${first}:I${last})`, result: Number(netoTotal.toFixed(2)) },
    10: { formula: `SUM(J${first}:J${last})`, result: Number(prodTotal.toFixed(2)) },
    11: { formula: `I${totRow}-J${totRow}`, result: Number(mermaCalcTotal.toFixed(2)) },
    12: { formula: `IF(I${totRow}=0,0,K${totRow}/I${totRow})`, result: netoTotal > 0 ? mermaCalcTotal / netoTotal : 0 },
    13: { formula: `SUM(M${first}:M${last})`, result: Number(mermaRealTotal.toFixed(2)) },
    14: { formula: `M${totRow}-K${totRow}`, result: Number((mermaRealTotal - mermaCalcTotal).toFixed(2)) },
    15: { formula: `SUM(O${first}:O${last})`, result: unionesTotal },
  };
  for (let i = 1; i <= heads.length; i++) {
    const c = ws.getRow(totRow).getCell(i);
    if (totales[i] !== undefined) c.value = totales[i] as never;
    c.font = { bold: true, size: 10, color: { argb: COLOR.azulOscuro } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.verde } };
    c.border = thin();
    if (i >= 9 && i <= 14 && i !== 12) c.numFmt = "#,##0.00";
    if (i === 12) c.numFmt = "0.00%";
  }

  // ────────────── Hojas de Reporte de Producción (formato industrial) ──────────────
  const usados = new Set<string>(["Resumen Mensual", "Trazabilidad"]);
  const grupos = new Map<string, RolloNorm[]>();
  for (const r of rollos) {
    const key = `${r.fecha}|${r.bobinadora}|${r.turno}|${r.productoCodigo}`;
    const arr = grupos.get(key) ?? [];
    arr.push(r);
    grupos.set(key, arr);
  }
  const keysOrdenadas = [...grupos.keys()].sort();

  for (const key of keysOrdenadas) {
    const items = grupos.get(key)!;
    const g = items[0];
    const dd = (g.fecha.split("-")[2] ?? "00");
    const base = `${dd}_${g.bobinadora.replace(/\s+/g, "")}_T${g.turno}_${g.productoCodigo}`;
    const hoja = wb.addWorksheet(sanitizeSheetName(base, usados), {
      pageSetup: {
        paperSize: 8 as unknown as undefined, // A3
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
        printTitlesRow: "1:9",
      },
      views: [{ state: "frozen", xSplit: 3, ySplit: 9, showGridLines: false }],
    });

    const nCols = 3 + POSICIONES; // 23
    const lastCol = colLetter(nCols);
    hoja.getColumn(1).width = 16;
    hoja.getColumn(2).width = 14;
    hoja.getColumn(3).width = 12;
    for (let i = 4; i <= nCols; i++) hoja.getColumn(i).width = 11;

    if (logoId != null) {
      hoja.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 150, height: 42 } });
    }
    hoja.getRow(1).height = 38;
    hoja.mergeCells(`B1:${lastCol}1`);
    const h1 = hoja.getCell("B1");
    h1.value = `CONVERTIDOR DE PAPEL S.A. DE C.V. — ${data.planta}`;
    h1.font = { bold: true, size: 14, color: { argb: COLOR.blanco } };
    h1.alignment = { horizontal: "center", vertical: "middle" };
    h1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulOscuro } };
    hoja.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.blanco } };

    hoja.mergeCells(`A2:${lastCol}2`);
    const h2 = hoja.getCell("A2");
    h2.value = "REPORTE DE PRODUCCIÓN BOBINADORAS";
    h2.font = { bold: true, size: 12, color: { argb: COLOR.azulOscuro } };
    h2.alignment = { horizontal: "center", vertical: "middle" };
    h2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azulClaro } };

    const bobinadores = [...new Set(items.map((i) => i.bobinador))];
    const patrones = [...new Set(items.map((i) => i.patron))];
    hoja.mergeCells(`A3:${lastCol}3`);
    const h3 = hoja.getCell("A3");
    h3.value =
      `Fecha operativa: ${g.fecha}   ·   Turno: ${g.turno}   ·   Bobinadora: ${g.bobinadora}   ·   ` +
      `Bobinador: ${bobinadores.length > 1 ? "VARIOS" : bobinadores[0]}   ·   ` +
      `Producto: ${g.productoCodigo} — ${g.productoNombre}   ·   ` +
      `Patrón de corte: ${patrones.length > 1 ? `VARIOS (${patrones.join(" / ")})` : patrones[0]}`;

    h3.font = { size: 10, italic: true, color: { argb: "FF334155" } };
    h3.alignment = { horizontal: "center", vertical: "middle" };
    hoja.getRow(3).height = 18;

    // Nivel 1 (fila 5)
    hoja.mergeCells("A5:C5");
    hoja.getCell("A5").value = "ROLLO MADRE";
    const bloques: [number, number][] = [[4, 8], [9, 13], [14, 18], [19, 23]];
    for (const [a, b] of bloques) {
      hoja.mergeCells(`${colLetter(a)}5:${colLetter(b)}5`);
      hoja.getCell(`${colLetter(a)}5`).value = "MEDIDA";
    }
    for (let i = 1; i <= nCols; i++) {
      const c = hoja.getRow(5).getCell(i);
      c.font = { bold: true, size: 10, color: { argb: COLOR.blanco } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.azul } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = thin();
    }
    hoja.getRow(5).height = 20;

    // Nivel 2 (fila 6): posiciones con ancho real
    const anchoPorPos = new Map<number, number>();
    for (const it of items) for (const c of it.activas) if (!anchoPorPos.has(c.posicion)) anchoPorPos.set(c.posicion, c.ancho);
    const nivel2: (string | number)[] = ["NÚM. DE ROLLO", "PESO ROLLO (kg)", "DIÁMETRO"];
    for (let p = 1; p <= POSICIONES; p++) {
      const w = anchoPorPos.get(p);
      nivel2.push(w ? `P${String(p).padStart(2, "0")} · ${w} cm` : `P${String(p).padStart(2, "0")}`);
    }
    hoja.getRow(6).values = nivel2;
    // Nivel 3 (fila 7)
    const nivel3: (string | number)[] = ["", "", ""];
    for (let p = 1; p <= POSICIONES; p++) nivel3.push("Peso (kg)");
    hoja.getRow(7).values = nivel3;
    for (const rn of [6, 7]) {
      for (let i = 1; i <= nCols; i++) {
        const c = hoja.getRow(rn).getCell(i);
        c.font = { bold: rn === 6, size: rn === 6 ? 10 : 9, color: { argb: COLOR.azulOscuro } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.gris } };
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        c.border = thin();
      }
    }
    hoja.getRow(6).height = 26;

    // Datos: una fila por rollo, desde la fila 9
    let rr = 9;
    const firstData = rr;
    for (const it of items) {
      const rowVals: unknown[] = [
        it.lote.numero_rollo,
        Number(it.netoKg.toFixed(2)),
        it.diametro ?? "",
      ];
      for (let p = 1; p <= POSICIONES; p++) {
        const c = it.cintas.find((x) => x.posicion === p);
        if (!c) rowVals.push(null);
        else if (c.estado === "anulada") rowVals.push("ANULADA");
        else if (c.estado === "sustituida") rowVals.push(null);
        else rowVals.push(Number(c.peso.toFixed(2)));
      }
      hoja.getRow(rr).values = rowVals as never;
      for (let i = 1; i <= nCols; i++) {
        const cell = hoja.getRow(rr).getCell(i);
        cell.border = thin();
        cell.font = { size: 10 };
        cell.alignment = { horizontal: i === 1 ? "left" : "center", vertical: "middle" };
        if (i >= 2) cell.numFmt = "#,##0.00";
        if (i >= 4) {
          const p = i - 3;
          const c = it.cintas.find((x) => x.posicion === p && x.estado !== "sustituida");
          if (c?.estado === "anulada") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.grisAnulada } };
            cell.numFmt = "General";
            // El motivo de anulación se documenta en la hoja Trazabilidad.
          } else if (!c) {
            if (it.lote.estado === "abierto") {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.amarillo } };
            } else {
              cell.value = "N/A";
              cell.numFmt = "General";
            }
          }
        }
      }
      rr++;
    }
    const lastData = rr - 1;

    // Totales por hoja
    rr += 1;
    const sub = (a: number, b: number) =>
      items.reduce((acc, it) => acc + it.activas.filter((c) => c.posicion >= a && c.posicion <= b).reduce((x, c) => x + c.peso, 0), 0);
    const prod = items.reduce((a, i) => a + i.produccionKg, 0);
    const neto = items.reduce((a, i) => a + i.netoKg, 0);
    const real = items.reduce((a, i) => a + (i.mermaRealKg ?? 0), 0);
    const totalesHoja: [string, unknown, string?][] = [
      ["Cantidad de rollos", items.length],
      ["Cantidad de cintas", items.reduce((a, i) => a + i.activas.length, 0)],
      ["Subtotal posiciones 1–5 (kg)", { formula: `SUM(D${firstData}:H${lastData})`, result: Number(sub(1, 5).toFixed(2)) }, "#,##0.00"],
      ["Subtotal posiciones 6–10 (kg)", { formula: `SUM(I${firstData}:M${lastData})`, result: Number(sub(6, 10).toFixed(2)) }, "#,##0.00"],
      ["Subtotal posiciones 11–15 (kg)", { formula: `SUM(N${firstData}:R${lastData})`, result: Number(sub(11, 15).toFixed(2)) }, "#,##0.00"],
      ["Subtotal posiciones 16–20 (kg)", { formula: `SUM(S${firstData}:W${lastData})`, result: Number(sub(16, 20).toFixed(2)) }, "#,##0.00"],
      ["Producción acumulada (kg)", Number(prod.toFixed(2)), "#,##0.00"],
      ["Peso total de rollos de origen (kg)", { formula: `SUM(B${firstData}:B${lastData})`, result: Number(neto.toFixed(2)) }, "#,##0.00"],
      ["Merma calculada (kg)", Number((neto - prod).toFixed(2)), "#,##0.00"],
      ["Merma calculada (%)", neto > 0 ? (neto - prod) / neto : 0, "0.00%"],
      ["Merma real (kg)", Number(real.toFixed(2)), "#,##0.00"],
      ["Diferencia de merma (kg)", Number((real - (neto - prod)).toFixed(2)), "#,##0.00"],
      ["Total de uniones", items.reduce((a, i) => a + i.uniones, 0)],
      ["Estado de la información", [...new Set(items.map((i) => i.estadoInfo))].join(" / ")],
    ];
    for (const [k, v, fmt] of totalesHoja) {
      hoja.mergeCells(`A${rr}:C${rr}`);
      const kc = hoja.getCell(`A${rr}`);
      kc.value = k;
      kc.font = { bold: true, size: 10, color: { argb: COLOR.azulOscuro } };
      kc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.verde } };
      kc.alignment = { horizontal: "right", vertical: "middle" };
      kc.border = thin();
      const vc = hoja.getCell(`D${rr}`);
      vc.value = v as never;
      if (fmt) vc.numFmt = fmt;
      vc.font = { bold: true, size: 10 };
      vc.border = thin();
      rr++;
    }

    hoja.pageSetup.printArea = `A1:${lastCol}${rr - 1}`;
  }

  // ───────────────────── Hoja Trazabilidad ─────────────────────
  const tz = wb.addWorksheet("Trazabilidad", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [
    "Año", "Mes", "Fecha operativa", "ID lote", "ID rollo origen", "Número de rollo", "Orden de producción",
    "Peso neto rollo (kg)", "Diámetro", "Planta", "Turno", "Bobinadora", "Bobinador", "Conductor",
    "Operador", "Analista", "Supervisor", "Fabricación", "Clave producto", "Nombre producto",
    "ID cinta", "Posición", "Ancho", "Peso (kg)", "Uniones", "Estado cinta", "Motivo anulación",
    "Registro (fecha/hora)", "Usuario registró", "Estado lote", "Finalización",
    "Peso producido rollo (kg)", "Merma calculada (kg)", "Merma calculada (%)", "Merma real (kg)",
    "Diferencia merma (kg)", "Observación", "Generado", "Usuario que generó",
  ];
  const filasTz: unknown[][] = [];
  for (const r of rollos) {
    const base = [
      data.year, MESES[data.month - 1], r.fecha, r.lote.id,
      (r.lote as unknown as { pesaje_bobina_madre_id?: string | null }).pesaje_bobina_madre_id ?? "",
      r.lote.numero_rollo,
      (r.lote as unknown as { numero_orden?: string | null }).numero_orden ?? "",
      Number(r.netoKg.toFixed(2)), r.diametro ?? "", data.planta, r.turno, r.bobinadora, r.bobinador,
      r.conductor, r.operador, r.analista, r.supervisor, r.fabricacion, r.productoCodigo, r.productoNombre,
    ];
    const cola = [
      r.lote.estado,
      (r.lote as unknown as { finalizado_at?: string | null }).finalizado_at ?? "",
      Number(r.produccionKg.toFixed(2)),
      Number(r.mermaCalcKg.toFixed(2)),
      r.mermaCalcPct ?? 0,
      r.mermaRealKg ?? "",
      r.difMermaKg ?? "",
      [
        r.diametro == null ? "Diámetro no disponible" : "",
        r.mermaCalcKg < 0 ? "Producción mayor al peso de origen (merma negativa)" : "",
        r.estadoInfo,
      ].filter(Boolean).join(" · "),
      fechaHoraLargaMX(data.generadoAt),
      data.usuario,
    ];
    if (r.cintas.length === 0) {
      filasTz.push([...base, "", "", "", "", "", "SIN CINTAS", "", "", "", ...cola]);
      continue;
    }
    for (const c of r.cintas) {
      filasTz.push([
        ...base,
        c.id, c.posicion, c.ancho, Number(c.peso.toFixed(2)), c.uniones, c.estado,
        c.estado === "anulada" ? (c.observaciones ?? "") : "",
        c.created_at, "", ...cola,
      ]);
    }
  }

  tz.addTable({
    name: "Trazabilidad",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: cols.map((c) => ({ name: c, filterButton: true })),
    rows: filasTz as never[],
  });
  cols.forEach((c, i) => { tz.getColumn(i + 1).width = Math.min(30, Math.max(12, c.length + 3)); });
  for (let i = 2; i <= filasTz.length + 1; i++) {
    tz.getCell(i, 34).numFmt = "0.00%";
    for (const col of [8, 24, 32, 33, 35, 36]) tz.getCell(i, col).numFmt = "#,##0.00";
  }

  // ───────────────────────── Descarga ─────────────────────────
  const fileName = `Reporte_Mensual_Bobinadoras_${data.year}_${String(data.month).padStart(2, "0")}.xlsx`
    .replace(/[\\/:*?"<>|]/g, "_");
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
  a.remove();
  URL.revokeObjectURL(url);

  return { fileName, dias, rollos: rollos.length, cintas: cintasTotal, produccionKg: Number(prodTotal.toFixed(2)) };
}
