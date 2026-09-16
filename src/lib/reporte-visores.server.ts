// =============================================================================
// Reporte de cierre de turno a partir de los Visores (server-only).
// READ ONLY: consume exclusivamente fetchOperatorVisionData(), la misma fuente
// que alimenta las pantallas. No escribe en base de datos ni modifica visores.
// =============================================================================
import ExcelJS from "exceljs";
import { fetchOperatorVisionData } from "./operator-vision.server";
import { inyectarGraficasDashboard } from "./reporte-visores-charts.server";
import logoDataUrl from "@/assets/logo-convertipap.png?inline";

/** Inserta el logotipo Convertipap en la esquina superior izquierda de la hoja. */
function ponerLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, col: number, row: number) {
  try {
    const base64 = String(logoDataUrl).split(",")[1] ?? "";
    if (!base64) return;
    const id = wb.addImage({ base64, extension: "png" });
    ws.addImage(id, { tl: { col, row }, ext: { width: 168, height: 72 } });
  } catch {
    /* el logotipo es decorativo: si falla, el reporte se genera igual */
  }
}

/** Amarillo claro + texto rojo para valores fuera de especificación. */
const FUERA_FILL = "FFFFF3CD";
const FUERA_TEXT = "FFB3261E";

export const MAQUINAS_REPORTE = ["MP-01", "MP-04", "MP-05", "MP-06", "MP-07"] as const;

const fmtHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-MX", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";

const HDR_FILL = "FF1E293B";

function headerRow(ws: ExcelJS.Worksheet, values: string[], row: number) {
  const r = ws.getRow(row);
  r.values = values;
  r.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  r.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  r.height = 26;
  r.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
}

export type ResumenMaquina = {
  codigo: string;
  nombre: string;
  planta: string;
  turno: string | null;
  producto: string;
  rollos: number;
  liberados: number;
  cumplimientoPct: number;
  cumplimientoVariablesPct: number;
  estadoMaquina: string;
};

export async function construirReporteVisores(maquinas: readonly string[] = MAQUINAS_REPORTE) {
  const generado = new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Convertipap";
  wb.lastModifiedBy = "Convertipap";
  wb.company = "Convertipap";
  wb.title = "CONVERTIPAP · Reporte de cierre de turno";
  wb.subject = "Cierre de turno · Visores de calidad";
  wb.keywords = "Convertipap;cierre de turno;visores;calidad";
  wb.category = "Reporte operativo";
  wb.created = generado;
  wb.modified = generado;

  const resumen: ResumenMaquina[] = [];
  const datos = await Promise.all(maquinas.map((m) => fetchOperatorVisionData(m)));

  // Dashboard ejecutivo: se crea primero para que sea la hoja de entrada.
  const wsd = wb.addWorksheet("Dashboard Ejecutivo", { views: [{ showGridLines: false }] });

  // --------------------------------------------------------------- Portada
  const ws0 = wb.addWorksheet("Resumen de turno", { views: [{ showGridLines: false }] });

  ws0.columns = [{ width: 12 }, { width: 28 }, { width: 14 }, { width: 8 }, { width: 30 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 14 }];
  ponerLogo(wb, ws0, 0.1, 0.2);
  [1, 2, 3].forEach((r) => (ws0.getRow(r).height = 20));
  ws0.mergeCells("C1:J2");
  const t = ws0.getCell("C1");
  t.value = "REPORTE DE CIERRE DE TURNO · VISORES";
  t.font = { name: "Arial", bold: true, size: 16, color: { argb: HDR_FILL } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws0.mergeCells("C3:J3");
  const st = ws0.getCell("C3");
  st.value = `Generado: ${generado.toLocaleString("es-MX", { hour12: false, timeZone: "America/Mexico_City" })} (hora planta)`;
  st.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF5B6573" } };
  st.alignment = { horizontal: "center", vertical: "middle" };
  ws0.getRow(4).height = 6;
  headerRow(ws0, ["Máquina", "Nombre", "Planta", "Turno", "Producto", "Rollos", "Liberados", "Cumpl. oficial %", "Cumpl. variables %", "Estado"], 5);

  for (let i = 0; i < maquinas.length; i++) {
    const codigo = maquinas[i]!;
    const d = datos[i]!;
    const fila: ResumenMaquina = {
      codigo: d.maquina?.codigo ?? codigo,
      nombre: d.maquina?.nombre ?? "",
      planta: d.maquina?.plantaCodigo ?? "",
      turno: d.cumplimientoTurno?.turno ?? null,
      producto: d.orden?.producto ? `${d.orden.productoCodigo} — ${d.orden.producto}` : "—",
      rollos: d.cumplimientoTurno?.capturados ?? 0,
      liberados: d.cumplimientoTurno?.liberados ?? 0,
      cumplimientoPct: d.cumplimientoTurno?.pct ?? 0,
      cumplimientoVariablesPct: d.cumplimientoVariables?.pct ?? 0,
      estadoMaquina: d.estadoMaquina?.estado ?? "—",
    };
    resumen.push(fila);
    const row = ws0.addRow([
      fila.codigo, fila.nombre, fila.planta, fila.turno ?? "—", fila.producto,
      fila.rollos, fila.liberados, fila.cumplimientoPct, fila.cumplimientoVariablesPct, fila.estadoMaquina,
    ]);
    row.font = { name: "Arial", size: 10 };
    row.height = 18;
    row.eachCell((c, col) => {
      c.alignment = { vertical: "middle", horizontal: col === 2 || col === 5 ? "left" : "center" };
      c.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    });

    // --------------------------------------------------- Hoja por máquina
    const ws = wb.addWorksheet(fila.codigo);
    const vars = d.variables ?? [];
    const head = ["Hora", "Rollo", "Turno", "Operador", "Analista", ...vars.map((v) => (v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta)), "Estatus"];
    ws.columns = head.map((_, idx) => ({ width: idx < 5 ? 14 : 16 }));
    headerRow(ws, head, 1);
    const muestras = [...(d.muestras ?? [])].reverse();
    for (const m of muestras) {
      const r2 = ws.addRow([
        fmtHora(m.capturadoAt),
        m.rollo,
        m.fueraDeTurno ? `${m.turno} (FT)` : m.turno,
        m.operador || "—",
        m.analista || "—",
        ...vars.map((v) => {
          const med = (m.mediciones as Array<{ clave: string; valor: number | null }>).find((x) => x.clave === v.clave);
          return med?.valor ?? "";
        }),
        m.estatus ?? "—",
      ]);
      r2.font = { name: "Arial", size: 10 };
      r2.alignment = { horizontal: "center" };
    }
    if (muestras.length === 0) {
      ws.addRow(["Sin rollos capturados en el turno vigente"]).font = { name: "Arial", bold: true };
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  // ------------------------------------------------- Dashboard ejecutivo
  construirDashboard(wsd, resumen, generado);


  const bruto = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const n = Math.max(resumen.length, 1);
  const buffer = inyectarGraficasDashboard(bruto, {
    sheetNumber: 1,
    puntos: n,
    series: [
      {
        titulo: "Volumen capturado por máquina",
        hoja: "Dashboard Ejecutivo",
        catRef: `$B$37:$B$${36 + n}`,
        valRef: `$C$37:$C$${36 + n}`,
        color: "2D8A9E",
        numFmt: "0",
        from: { col: 1, row: 12 },
        to: { col: 8, row: 30 },
      },
      {
        titulo: "Cumplimiento de variables por máquina",
        hoja: "Dashboard Ejecutivo",
        catRef: `$B$37:$B$${36 + n}`,
        valRef: `$G$37:$G$${36 + n}`,
        color: "1B7F5E",
        numFmt: "0.0%",
        from: { col: 9, row: 12 },
        to: { col: 14, row: 30 },
      },
    ],
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  const fileName = `Convertipap_Cierre_Turno_Visores_${generado.getFullYear()}-${pad(generado.getMonth() + 1)}-${pad(generado.getDate())}_${pad(generado.getHours())}${pad(generado.getMinutes())}.xlsx`;

  const filas = resumen
    .map(
      (r) => `<tr><td style="padding:6px 10px;border:1px solid #cbd5e1">${r.codigo}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1">${r.planta}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1">${r.turno ?? "—"}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1">${r.producto}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:center">${r.rollos}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:center">${r.liberados}</td>
<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:center">${r.cumplimientoPct}%</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<h2 style="margin:0 0 4px">CONVERTIPAP — Reporte de cierre de turno (Visores)</h2>
<p style="margin:0 0 12px;font-size:13px">Generado: ${generado.toLocaleString("es-MX", { hour12: false, timeZone: "America/Mexico_City" })} (hora planta)</p>
<table style="border-collapse:collapse;font-size:13px">
<thead><tr style="background:#1e293b;color:#fff">
<th style="padding:6px 10px;border:1px solid #cbd5e1">Máquina</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Planta</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Turno</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Producto</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Rollos</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Liberados</th>
<th style="padding:6px 10px;border:1px solid #cbd5e1">Cumplimiento</th>
</tr></thead><tbody>${filas}</tbody></table>
<p style="margin:14px 0 0;font-size:12px;color:#475569">Detalle por máquina y rollo en el archivo adjunto.</p>
</div>`;

  const texto = resumen
    .map((r) => `${r.codigo} (${r.planta}) T${r.turno ?? "—"} · ${r.rollos} rollos · ${r.liberados} liberados · ${r.cumplimientoPct}%`)
    .join("\n");

  return { buffer, fileName, html, texto, resumen, generado };
}

// =============================================================================
// Dashboard Ejecutivo — replica el formato, organización y paleta del archivo
// de referencia validado por Dirección (tarjetas KPI, lectura ejecutiva y
// tabla base). Las barras se representan con formato condicional en celda.
// =============================================================================
const DASH = {
  dark: "FF1F2F46",
  card: "FFEAF2F8",
  muted: "FF5B6573",
  ok: "FF1B7F5E",
  warn: "FFB3261E",
  bar: "FF2D8A9E",
};

function construirDashboard(ws: ExcelJS.Worksheet, resumen: ResumenMaquina[], generado: Date) {
  const F = "Calibri";
  ws.columns = [
    { width: 4 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 15 }, { width: 12 }, { width: 12 }, { width: 4 }, { width: 15 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  // Banda superior + títulos
  ws.mergeCells("A1:N1");
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.dark } };
  ws.getRow(1).height = 21;
  ws.mergeCells("D2:N3");
  const tit = ws.getCell("D2");
  tit.value = "CONVERTIPAP · DASHBOARD EJECUTIVO DE CIERRE DE TURNO";
  tit.font = { name: F, size: 18, bold: true, color: { argb: DASH.dark } };
  tit.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells("D4:N4");
  const sub = ws.getCell("D4");
  sub.value = `Análisis · Volumen, liberación y cumplimiento por máquina · ${generado.toLocaleString("es-MX", { hour12: false, timeZone: "America/Mexico_City" })} (hora planta)`;
  sub.font = { name: F, size: 10, color: { argb: DASH.muted } };
  sub.alignment = { horizontal: "center", vertical: "middle" };
  [2, 3, 4].forEach((r) => (ws.getRow(r).height = 19.2));

  const totalRollos = resumen.reduce((a, r) => a + r.rollos, 0);
  const totalLib = resumen.reduce((a, r) => a + r.liberados, 0);
  const liberacion = totalRollos > 0 ? totalLib / totalRollos : 0;
  const promVars = resumen.length > 0 ? resumen.reduce((a, r) => a + r.cumplimientoVariablesPct, 0) / resumen.length / 100 : 0;

  // Tarjetas KPI
  const cards: Array<[string, string, string, number | string, string]> = [
    ["B6:D7", "B8:D8", "ROLLOS CAPTURADOS", totalRollos, "0"],
    ["F6:H7", "F8:H8", "ROLLOS LIBERADOS", totalLib, "0"],
    ["J6:L7", "J8:L8", "LIBERACIÓN", liberacion, "0.0%"],
    ["M6:N7", "M8:N8", "PROM. VARIABLES", promVars, "0.0%"],
  ];
  for (const [rgVal, rgLbl, label, valor, fmt] of cards) {
    ws.mergeCells(rgVal);
    const cv = ws.getCell(rgVal.split(":")[0]!);
    cv.value = valor;
    cv.numFmt = fmt;
    cv.font = { name: F, size: 17, bold: true, color: { argb: DASH.dark } };
    cv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.card } };
    cv.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(rgLbl);
    const cl = ws.getCell(rgLbl.split(":")[0]!);
    cl.value = label;
    cl.font = { name: F, size: 9, bold: true, color: { argb: DASH.muted } };
    cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.card } };
    cl.alignment = { horizontal: "center", vertical: "middle" };
  }
  [6, 7, 8, 9].forEach((r) => (ws.getRow(r).height = 21.6));

  // Mejor desempeño / atención prioritaria
  const orden = [...resumen].sort((a, b) => b.cumplimientoVariablesPct - a.cumplimientoVariablesPct);
  const mejor = orden[0];
  const peor = orden[orden.length - 1];
  ws.mergeCells("B9:G9");
  const cb = ws.getCell("B9");
  cb.value = mejor ? `MEJOR DESEMPEÑO · ${mejor.codigo} · ${mejor.cumplimientoVariablesPct}%` : "MEJOR DESEMPEÑO · —";
  cb.font = { name: F, size: 10, bold: true, color: { argb: DASH.ok } };
  cb.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells("H9:N9");
  const cp = ws.getCell("H9");
  cp.value = peor ? `ATENCIÓN PRIORITARIA · ${peor.codigo} · ${peor.cumplimientoVariablesPct}%` : "ATENCIÓN PRIORITARIA · —";
  cp.font = { name: F, size: 10, bold: true, color: { argb: DASH.warn } };
  cp.alignment = { horizontal: "center", vertical: "middle" };

  // Sección gráfica (barras en celda)
  ws.mergeCells("B11:N11");
  const sec = ws.getCell("B11");
  sec.value = "VOLUMEN VS CUMPLIMIENTO · LECTURA EJECUTIVA";
  sec.font = { name: F, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  sec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.dark } };
  sec.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(11).height = 19.2;

  // Las dos gráficas de barras nativas se insertan sobre B13:H31 y J13:N31
  // (ver inyectarGraficasDashboard); toman sus datos de la tabla base.


  // Lectura ejecutiva
  ws.mergeCells("B32:N33");
  const lec = ws.getCell("B32");
  lec.value =
    mejor && peor
      ? `Lectura ejecutiva: a la izquierda se observa el volumen capturado por máquina; a la derecha, el cumplimiento de variables. ${peor.codigo} concentra la principal oportunidad de mejora (${peor.cumplimientoVariablesPct}%), mientras ${mejor.codigo} lidera el desempeño (${mejor.cumplimientoVariablesPct}%).`
      : "Lectura ejecutiva: sin datos suficientes en el turno vigente.";
  lec.font = { name: F, size: 10, color: { argb: DASH.dark } };
  lec.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  // Tabla base
  const heads = ["Máquina", "Rollos", "Liberados", "Liberación %", "Cumpl. oficial %", "Cumpl. variables %", "Planta"];
  heads.forEach((h, i) => {
    const c = ws.getCell(36, 2 + i);
    c.value = h;
    c.font = { name: F, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.dark } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  resumen.forEach((r, i) => {
    const row = 37 + i;
    const vals: Array<string | number> = [
      r.codigo, r.rollos, r.liberados,
      r.rollos > 0 ? r.liberados / r.rollos : 0,
      r.cumplimientoPct / 100,
      r.cumplimientoVariablesPct / 100,
      r.planta,
    ];
    vals.forEach((v, j) => {
      const c = ws.getCell(row, 2 + j);
      c.value = v;
      c.font = { name: F, size: 11 };
      c.alignment = { horizontal: "center" };
      if (j >= 3 && j <= 5) c.numFmt = "0.0%";
    });
  });
}
