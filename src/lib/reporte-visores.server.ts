// =============================================================================
// Reporte de cierre de turno a partir de los Visores (server-only).
// READ ONLY: consume exclusivamente fetchOperatorVisionData(), la misma fuente
// que alimenta las pantallas. No escribe en base de datos ni modifica visores.
// =============================================================================
import ExcelJS from "exceljs";
import { fetchOperatorVisionData } from "./operator-vision.server";
import { inyectarGraficasDashboard } from "./reporte-visores-charts.server";
import logoDataUrl from "@/assets/reporte-visores-logo.png?inline";
import irmLogoDataUrl from "@/assets/irm-logo.png?inline";

/** Logotipo embebido en el correo como imagen en línea (CID). */
export const LOGO_CID = "logoconvertipap";
const LOGO_BASE64 = String(logoDataUrl).split(",")[1] ?? "";

/** Firma IRM al pie del correo, embebida como imagen en línea (CID). */
export const IRM_LOGO_CID = "logoirm";
const IRM_LOGO_BASE64 = String(irmLogoDataUrl).split(",")[1] ?? "";
const IRM_URL = "mailto:direccion@imr-intelligence.pro?subject=Contacto%20desde%20reporte%20de%20cierre%20de%20turno";

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
  kgProducidos: number;
  cumplimientoPct: number;
  cumplimientoVariablesPct: number;
  estadoMaquina: string;
};

type RolloResumen = {
  hora: string;
  rollo: string;
  skuSap: string;
  turno: string;
  operador: string;
  analista: string;
  estatus: string;
  fuera: number;
};

type DetalleMaquina = {
  codigo: string;
  nombre: string;
  planta: string;
  turno: string | null;
  head: string[];
  filas: Array<Array<{ v: string | number; ok: boolean }>>;
  rollosResumen: RolloResumen[];
  fuera: number;
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
  const detalles: DetalleMaquina[] = [];
  const datos = await Promise.all(maquinas.map((m) => fetchOperatorVisionData(m)));

  // Dashboard ejecutivo: se crea primero para que sea la hoja de entrada.
  const wsd = wb.addWorksheet("Dashboard Ejecutivo", { views: [{ showGridLines: false }] });

  // --------------------------------------------------------------- Portada
  const ws0 = wb.addWorksheet("Resumen de turno", { views: [{ showGridLines: false }] });

  ws0.columns = [{ width: 12 }, { width: 28 }, { width: 14 }, { width: 8 }, { width: 30 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 }];
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
  headerRow(ws0, ["Máquina", "Nombre", "Planta", "Turno", "Producto", "Rollos", "Liberados", "Kg producidos", "Cumpl. oficial %", "Cumpl. variables %"], 5);

  for (let i = 0; i < maquinas.length; i++) {
    const codigo = maquinas[i]!;
    const d = datos[i]!;
    const kgProducidos = (d.muestras ?? []).reduce((acc: number, m: { mediciones: Array<{ clave: string; valor: number | null }> }) => {
      const peso = m.mediciones.find((x: { clave: string; valor: number | null }) => x.clave === "peso")?.valor;
      return typeof peso === "number" && Number.isFinite(peso) ? acc + peso : acc;
    }, 0);
    const fila: ResumenMaquina = {
      codigo: d.maquina?.codigo ?? codigo,
      nombre: d.maquina?.nombre ?? "",
      planta: d.maquina?.plantaCodigo ?? "",
      turno: d.cumplimientoTurno?.turno ?? null,
      producto: d.orden?.producto ? `${d.orden.productoCodigo} — ${d.orden.producto}` : "—",
      rollos: d.cumplimientoTurno?.capturados ?? 0,
      liberados: d.cumplimientoTurno?.liberados ?? 0,
      kgProducidos: Number(kgProducidos.toFixed(2)),
      cumplimientoPct: d.cumplimientoTurno?.pct ?? 0,
      cumplimientoVariablesPct: d.cumplimientoVariables?.pct ?? 0,
      estadoMaquina: d.estadoMaquina?.estado ?? "—",
    };
    resumen.push(fila);
    const row = ws0.addRow([
      fila.codigo, fila.nombre, fila.planta, fila.turno ?? "—", fila.producto,
      fila.rollos, fila.liberados, fila.kgProducidos, fila.cumplimientoPct, fila.cumplimientoVariablesPct,
    ]);
    row.font = { name: "Arial", size: 10 };
    row.height = 18;
    row.eachCell((c, col) => {
      c.alignment = { vertical: "middle", horizontal: col === 2 || col === 5 ? "left" : "center" };
      c.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
      if (col === 8) c.numFmt = '#,##0 "kg"';
    });

    // --------------------------------------------------- Hoja por máquina
    const ws = wb.addWorksheet(fila.codigo);
    const vars = d.variables ?? [];
    const muestras = [...(d.muestras ?? [])].reverse();
    const head = [
      "Hora", "Rollo", "SKU SAP",
      "Turno", "Operador", "Analista",
      ...vars.map((v) => (v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta)),
      "Estatus",
    ];
    const leadingCols = 6;
    ws.columns = head.map((_, idx) => ({ width: idx < leadingCols ? 14 : 16 }));
    headerRow(ws, head, 1);
    const detalle: DetalleMaquina = { codigo: fila.codigo, nombre: fila.nombre, planta: fila.planta, turno: fila.turno, head, filas: [], rollosResumen: [], fuera: 0 };
    detalles.push(detalle);
    let fuera = 0;
    for (const m of muestras) {
      const meds = m.mediciones as Array<{ clave: string; valor: number | null; min?: number | null; max?: number | null }>;
      const celdas = vars.map((v) => {
        const med = meds.find((x) => x.clave === v.clave);
        const valor = med?.valor ?? null;
        const min = med?.min ?? v.min;
        const max = med?.max ?? v.max;
        const ok =
          valor === null ||
          !Number.isFinite(valor) ||
          ((min === null || min === undefined || !Number.isFinite(min) || valor >= min) &&
            (max === null || max === undefined || !Number.isFinite(max) || valor <= max));
        return { valor, ok };
      });
      const r2 = ws.addRow([
        fmtHora(m.capturadoAt),
        m.rollo,
        m.skuSap ?? "—",
        m.fueraDeTurno ? `${m.turno} (FT)` : m.turno,
        m.operador || "—",
        m.analista || "—",
        ...celdas.map((c) => c.valor ?? ""),
        m.estatus ?? "—",
      ]);
      r2.font = { name: "Arial", size: 10 };
      r2.alignment = { horizontal: "center" };
      celdas.forEach((c, idx) => {
        if (c.ok) return;
        fuera++;
        const cell = r2.getCell(leadingCols + 1 + idx);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUERA_FILL } };
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: FUERA_TEXT } };
      });
      detalle.filas.push([
        { v: fmtHora(m.capturadoAt), ok: true },
        { v: m.rollo ?? "—", ok: true },
        { v: m.skuSap ?? "—", ok: true },
        { v: m.fueraDeTurno ? `${m.turno} (FT)` : (m.turno ?? "—"), ok: true },
        { v: m.operador || "—", ok: true },
        { v: m.analista || "—", ok: true },
        ...celdas.map((c) => ({ v: c.valor ?? "—", ok: c.ok })),
        { v: m.estatus ?? "—", ok: true },
      ]);
      detalle.rollosResumen.push({
        hora: fmtHora(m.capturadoAt),
        rollo: String(m.rollo ?? "—"),
        skuSap: String(m.skuSap ?? "—"),
        turno: m.fueraDeTurno ? `${m.turno} (FT)` : String(m.turno ?? "—"),
        operador: m.operador || "—",
        analista: m.analista || "—",
        estatus: m.estatus ?? "—",
        fuera: celdas.filter((c) => !c.ok).length,
      });
    }
    detalle.fuera = fuera;
    if (muestras.length === 0) {
      ws.addRow(["Sin rollos capturados en el turno vigente"]).font = { name: "Arial", bold: true };
    } else {
      ws.addRow([]);
      const leyenda = ws.addRow([
        `Celdas resaltadas = valor fuera del rango mín/máx de especificación (${fuera} en el turno).`,
      ]);
      leyenda.font = { name: "Arial", size: 9, italic: true, color: { argb: FUERA_TEXT } };
      leyenda.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUERA_FILL } };
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  // ------------------------------------------------- Dashboard ejecutivo
  construirDashboard(wb, wsd, resumen, generado);


  const bruto = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const n = Math.max(resumen.length, 1);
  const buffer = inyectarGraficasDashboard(bruto, {
    sheetNumber: 1,
    puntos: n,
    series: [
      {
        titulo: "Volumen capturado por máquina",
        hoja: "Dashboard Ejecutivo",
        catRef: `$B$59:$B$${58 + n}`,
        valRef: `$C$59:$C$${58 + n}`,
        color: "2D8A9E",
        numFmt: "0",
        from: { col: 1, row: 12 },
        to: { col: 8, row: 30 },
      },
      {
        titulo: "Cumplimiento de variables por máquina",
        hoja: "Dashboard Ejecutivo",
        catRef: `$B$59:$B$${58 + n}`,
        valRef: `$H$59:$H$${58 + n}`,
        color: "1B7F5E",
        numFmt: "0.0%",
        from: { col: 9, row: 12 },
        to: { col: 14, row: 30 },
      },
      {
        titulo: "Kg producidos por máquina",
        hoja: "Dashboard Ejecutivo",
        catRef: `$B$59:$B$${58 + n}`,
        valRef: `$E$59:$E$${58 + n}`,
        color: "2D8A9E",
        numFmt: '#,##0 "kg"',
        from: { col: 1, row: 33 },
        to: { col: 14, row: 51 },
      },
    ],
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  // Hora planta (America/Mexico_City) para fecha y turno del nombre de archivo.
  const partesPlanta = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(generado);
  const p = (t: string) => partesPlanta.find((x) => x.type === t)?.value ?? "00";
  const fechaPlanta = `${p("year")}${p("month")}${p("day")}`;
  const horaPlanta = Number(p("hour")) % 24;
  const turnoArchivo = horaPlanta >= 7 && horaPlanta < 15 ? "T1" : horaPlanta >= 15 && horaPlanta < 23 ? "T2" : "T3";
  const fileName = `Convertipap_CierreTurno_${fechaPlanta}_${turnoArchivo} Python 3.12.10.xlsx`;
  // Asunto dinámico: "Cierre de Turno | DD-MM-YYYY | T1"
  const subject = `Cierre de Turno | ${p("day")}-${p("month")}-${p("year")} | ${turnoArchivo}`;

  // ------------------------------- Correo embebido: resumen ejecutivo
  // El correo NO reproduce el detalle del adjunto (variables de cada rollo):
  // muestra indicadores, gráfica ejecutiva y los rollos del turno por máquina.
  const esc = (v: unknown) =>
    String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const TD = "padding:6px 9px;border:1px solid #d7dee8;font-size:12px";
  const TH = "padding:7px 9px;border:1px solid #33415a;font-size:11px;color:#fff;background:#1e293b;text-align:center;font-weight:bold";
  const H2 = "margin:24px 0 8px;font-size:15px;color:#0f172a;border-left:4px solid #1e293b;padding-left:9px";

  const totalRollos = resumen.reduce((a, r) => a + r.rollos, 0);
  const totalLib = resumen.reduce((a, r) => a + r.liberados, 0);
  const totalKg = resumen.reduce((a, r) => a + r.kgProducidos, 0);
  const libPct = totalRollos > 0 ? Math.round((totalLib / totalRollos) * 1000) / 10 : 0;
  const promVars =
    resumen.length > 0
      ? Math.round((resumen.reduce((a, r) => a + r.cumplimientoVariablesPct, 0) / resumen.length) * 10) / 10
      : 0;
  const totalFuera = detalles.reduce((a, d) => a + d.fuera, 0);
  const ranking = [...resumen].sort((a, b) => b.cumplimientoVariablesPct - a.cumplimientoVariablesPct);
  const mejor = ranking[0];
  const peor = ranking[ranking.length - 1];
  const plantas = [...new Set(resumen.map((r) => r.planta).filter(Boolean))].join(" · ") || "—";
  const turnos = [...new Set(resumen.map((r) => r.turno).filter(Boolean))].join(" · ") || "—";
  const fechaLarga = generado.toLocaleDateString("es-MX", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Mexico_City",
  });

  const kpi = (etiqueta: string, valor: string) =>
    `<td style="padding:12px 8px;border:1px solid #d7dee8;background:#f6f8fb;text-align:center;width:16.66%">
<div style="font-size:10px;color:#5b6573;letter-spacing:.06em;text-transform:uppercase">${etiqueta}</div>
<div style="font-size:22px;font-weight:bold;color:#1e293b;padding-top:4px">${valor}</div></td>`;

  // Gráfica ejecutiva en HTML puro (sin imágenes): barras horizontales.
  const maxRollos = Math.max(1, ...resumen.map((r) => r.rollos));
  const maxKg = Math.max(1, ...resumen.map((r) => r.kgProducidos));
  const barra = (pct: number, color: string) =>
    `<table style="border-collapse:collapse;width:100%;background:#eef2f7"><tr>
<td style="background:${color};height:12px;width:${Math.max(1, Math.round(pct))}%;font-size:0;line-height:0">&nbsp;</td>
<td style="font-size:0;line-height:0">&nbsp;</td></tr></table>`;

  const grafica = resumen
    .map(
      (r) => `<tr>
<td style="padding:5px 8px;font-size:12px;font-weight:bold;color:#1e293b;width:64px;white-space:nowrap">${esc(r.codigo)}</td>
<td style="padding:5px 8px;width:40%">${barra((r.rollos / maxRollos) * 100, "#2d8a9e")}</td>
<td style="padding:5px 8px;font-size:11px;color:#2d8a9e;width:70px;white-space:nowrap">${r.rollos} rollos</td>
<td style="padding:5px 8px;width:40%">${barra(Math.min(100, r.cumplimientoVariablesPct), "#1b7f5e")}</td>
<td style="padding:5px 8px;font-size:11px;color:#1b7f5e;width:52px;white-space:nowrap;text-align:right">${r.cumplimientoVariablesPct}%</td></tr>`,
    )
    .join("");

  const graficaKg = resumen
    .map(
      (r) => `<tr>
<td style="padding:5px 8px;font-size:12px;font-weight:bold;color:#1e293b;width:64px;white-space:nowrap">${esc(r.codigo)}</td>
<td style="padding:5px 8px">${barra((r.kgProducidos / maxKg) * 100, "#2d8a9e")}</td>
<td style="padding:5px 8px;font-size:11px;color:#2d8a9e;width:92px;white-space:nowrap;text-align:right">${Math.round(r.kgProducidos).toLocaleString("es-MX")} kg</td></tr>`,
    )
    .join("");

  const filasResumen = resumen
    .map(
      (r) => `<tr>
<td style="${TD};font-weight:bold">${esc(r.codigo)}</td>
<td style="${TD}">${esc(r.nombre)}</td>
<td style="${TD};text-align:center">${esc(r.planta)}</td>
<td style="${TD};text-align:center">${esc(r.turno ?? "—")}</td>
<td style="${TD}">${esc(r.producto)}</td>
<td style="${TD};text-align:center">${r.rollos}</td>
<td style="${TD};text-align:center">${r.liberados}</td>
<td style="${TD};text-align:center">${Math.round(r.kgProducidos).toLocaleString("es-MX")} kg</td>
<td style="${TD};text-align:center">${r.cumplimientoPct}%</td>
<td style="${TD};text-align:center">${r.cumplimientoVariablesPct}%</td></tr>`,
    )
    .join("");

  const bloquesMaquina = detalles
    .map((d) => {
      const cuerpo =
        d.rollosResumen.length === 0
          ? `<tr><td style="${TD};text-align:center" colspan="8">Sin rollos capturados en el turno vigente</td></tr>`
          : d.rollosResumen
              .map(
                (r) => `<tr>
<td style="${TD};text-align:center">${esc(r.hora)}</td>
<td style="${TD};text-align:center;font-weight:bold">${esc(r.rollo)}</td>
<td style="${TD};text-align:center;white-space:nowrap">${esc(r.skuSap)}</td>
<td style="${TD};text-align:center">${esc(r.turno)}</td>
<td style="${TD}">${esc(r.operador)}</td>
<td style="${TD}">${esc(r.analista)}</td>
<td style="${TD};text-align:center">${esc(r.estatus)}</td>
<td style="${TD};text-align:center${r.fuera > 0 ? ";background:#fff3cd;color:#b3261e;font-weight:bold" : ""}">${r.fuera}</td></tr>`,
              )
              .join("");
      return `<h3 style="${H2}">${esc(d.codigo)}${d.nombre ? ` · ${esc(d.nombre)}` : ""}${d.planta ? ` · ${esc(d.planta)}` : ""} <span style="font-size:11px;font-weight:normal;color:#5b6573">Turno ${esc(d.turno ?? "—")} · ${d.rollosResumen.length} rollos · ${d.fuera} valores fuera de rango</span></h3>
<table style="border-collapse:collapse;width:100%">
<thead><tr><th style="${TH}">Hora</th><th style="${TH}">Rollo</th><th style="${TH}">SKU SAP</th><th style="${TH}">Turno</th><th style="${TH}">Operador</th><th style="${TH}">Analista</th><th style="${TH}">Estatus</th><th style="${TH}">Fuera de rango</th></tr></thead>
<tbody>${cuerpo}</tbody></table>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:900px">
<div style="background:#1e293b;color:#fff;padding:16px 22px;border-radius:6px 6px 0 0">
<table style="border-collapse:collapse;width:100%"><tr>
<td style="width:150px;vertical-align:middle"><img src="cid:${LOGO_CID}" alt="Convertipap" width="140" style="display:block;border:0;outline:none"></td>
<td style="vertical-align:middle;text-align:right">
<div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Reporte ejecutivo de operación</div>
<div style="font-size:20px;font-weight:bold;padding-top:3px">Cierre de turno · Visores</div>
</td></tr></table>
</div>
<div style="border:1px solid #d7dee8;border-top:0;padding:18px 22px;border-radius:0 0 6px 6px">

<table style="border-collapse:collapse;width:100%;margin-bottom:14px"><tr>
<td style="${TD};background:#f6f8fb;width:33%"><b>Fecha:</b> ${esc(fechaLarga)}</td>
<td style="${TD};background:#f6f8fb;width:33%"><b>Turno:</b> ${esc(turnos)}</td>
<td style="${TD};background:#f6f8fb"><b>Planta:</b> ${esc(plantas)}</td>
</tr></table>

<h3 style="${H2};margin-top:4px">Indicadores del turno</h3>
<table style="border-collapse:collapse;width:100%"><tr>
${kpi("Rollos capturados", String(totalRollos))}
${kpi("Rollos liberados", String(totalLib))}
${kpi("Total kg producidos", `${Math.round(totalKg).toLocaleString("es-MX")} kg`)}
${kpi("Cumplimiento", `${libPct}%`)}
${kpi("Prom. variables", `${promVars}%`)}
${kpi("Fuera de rango", String(totalFuera))}
</tr></table>
<p style="margin:12px 0 0;font-size:12px;color:#334155">
<b style="color:#1b7f5e">Mejor desempeño:</b> ${mejor ? `${esc(mejor.codigo)} · ${mejor.cumplimientoVariablesPct}%` : "—"} &nbsp;|&nbsp;
<b style="color:#b3261e">Atención prioritaria:</b> ${peor ? `${esc(peor.codigo)} · ${peor.cumplimientoVariablesPct}%` : "—"}</p>

<h3 style="${H2}">Volumen vs Cumplimiento</h3>
<table style="border-collapse:collapse;width:100%;border:1px solid #d7dee8;background:#fcfdff">
<tr><td colspan="5" style="padding:6px 8px;font-size:10px;color:#5b6573">
<span style="color:#2d8a9e">&#9632;</span> Rollos capturados &nbsp;&nbsp; <span style="color:#1b7f5e">&#9632;</span> Cumplimiento de variables</td></tr>
${grafica}</table>

<h3 style="${H2}">Kg producidos por máquina</h3>
<table style="border-collapse:collapse;width:100%;border:1px solid #d7dee8;background:#fcfdff">
<tr><td colspan="3" style="padding:6px 8px;font-size:10px;color:#5b6573">
<span style="color:#2d8a9e">&#9632;</span> Peso oficial de Calidad</td></tr>
${graficaKg}</table>

<h3 style="${H2}">Resumen por máquina</h3>
<table style="border-collapse:collapse;width:100%">
<thead><tr>
<th style="${TH}">Máquina</th><th style="${TH}">Nombre</th><th style="${TH}">Planta</th><th style="${TH}">Turno</th>
<th style="${TH}">Producto</th><th style="${TH}">Rollos</th><th style="${TH}">Liberados</th>
<th style="${TH}">Kg producidos</th><th style="${TH}">Cumpl. oficial %</th><th style="${TH}">Cumpl. variables %</th>
</tr></thead><tbody>${filasResumen}</tbody></table>

${bloquesMaquina}

<div style="margin-top:24px;background:#f6f8fb;border:1px solid #d7dee8;border-radius:5px;padding:14px 16px">
<p style="margin:0;font-size:12.5px;color:#1e293b;line-height:1.6">
<b>Cierre del turno.</b> Este resumen concentra la operación de MP-01, MP-04, MP-05, MP-06 y MP-07 con corte a las ${esc(generado.toLocaleTimeString("es-MX", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }))} horas (hora planta).
El detalle completo por máquina, con todas las variables medidas y sus gráficas, se incluye en el archivo Excel adjunto <b>${esc(fileName)}</b>. Correo y adjunto se generan de la misma fuente de datos de los Visores.</p>
</div>

<div style="margin-top:20px;border-top:1px solid #d7dee8;padding-top:12px">
<p style="margin:0;font-size:10.5px;line-height:1.55;color:#64748b;text-align:justify">
<b style="color:#1e293b">AVISO DE CONFIDENCIALIDAD.</b> Este correo y sus anexos contienen información operativa y de calidad propiedad de Convertipap, de carácter confidencial y de uso exclusivo del personal autorizado como destinatario. Queda prohibida su divulgación, reproducción total o parcial, distribución o uso por cualquier medio sin autorización expresa de la Dirección General. La reproducción o el uso indebido de esta información es responsabilidad exclusiva de quien la ejecute. Si usted recibió este mensaje por error, notifíquelo al remitente y elimínelo de inmediato. Documento generado automáticamente; no responda a esta dirección.
</p>
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 4px"><tr>
<td style="background:#ffffff;border-radius:7px;box-shadow:0 3px 10px rgba(15,23,42,.16),inset 0 -1px 0 rgba(15,23,42,.08);padding:0">
<a href="${IRM_URL}" title="Contactar a IRM" style="text-decoration:none;display:block;padding:7px 14px;border-radius:7px">
<img src="cid:${IRM_LOGO_CID}" alt="Contactar a IRM" width="48" style="display:block;border:0;outline:none;opacity:0.94">
</a>
</td></tr></table>
<p style="margin:0;text-align:center;font-size:4.75px;color:#94a3b8;letter-spacing:0">Consultoría en Transformación Digital e Inteligencia Artificial</p>
</div></div>`;

  const texto = resumen
    .map((r) => `${r.codigo} (${r.planta}) T${r.turno ?? "—"} · ${r.rollos} rollos · ${r.liberados} liberados · ${Math.round(r.kgProducidos).toLocaleString("es-MX")} kg · ${r.cumplimientoPct}%`)
    .join("\n");

  return {
    buffer,
    fileName,
    subject,
    turno: turnoArchivo,
    logoCid: LOGO_CID,
    logoBase64: LOGO_BASE64,
    irmLogoCid: IRM_LOGO_CID,
    irmLogoBase64: IRM_LOGO_BASE64,
    html,
    texto,
    resumen,
    generado,
  };
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

function construirDashboard(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, resumen: ResumenMaquina[], generado: Date) {
  const F = "Calibri";
  ws.columns = [
    { width: 4 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 15 }, { width: 12 }, { width: 12 }, { width: 4 }, { width: 15 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  // Logotipo + títulos
  ponerLogo(wb, ws, 0.6, 0.6);
  ws.getRow(1).height = 10;
  ws.mergeCells("D2:N3");
  const tit = ws.getCell("D2");
  tit.value = "DASHBOARD EJECUTIVO DE CIERRE DE TURNO";
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
  const totalKg = resumen.reduce((a, r) => a + r.kgProducidos, 0);
  const liberacion = totalRollos > 0 ? totalLib / totalRollos : 0;
  const promVars = resumen.length > 0 ? resumen.reduce((a, r) => a + r.cumplimientoVariablesPct, 0) / resumen.length / 100 : 0;

  // Tarjetas KPI
  const cards: Array<[string, string, string, number | string, string]> = [
    ["B6:C7", "B8:C8", "ROLLOS CAPTURADOS", totalRollos, "0"],
    ["D6:E7", "D8:E8", "ROLLOS LIBERADOS", totalLib, "0"],
    ["F6:H7", "F8:H8", "TOTAL KG PRODUCIDOS", totalKg, '#,##0 "kg"'],
    ["I6:K7", "I8:K8", "LIBERACIÓN", liberacion, "0.0%"],
    ["L6:N7", "L8:N8", "PROM. VARIABLES", promVars, "0.0%"],
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

  // Las gráficas de barras nativas se insertan sobre B13:H31, J13:N31 y B34:N52
  // (ver inyectarGraficasDashboard); toman sus datos de la tabla base.


  // Lectura ejecutiva
  ws.mergeCells("B54:N55");
  const lec = ws.getCell("B54");
  lec.value =
    mejor && peor
      ? `Lectura ejecutiva: arriba se observa el volumen capturado, el cumplimiento de variables y los kg producidos por máquina. ${peor.codigo} concentra la principal oportunidad de mejora (${peor.cumplimientoVariablesPct}%), mientras ${mejor.codigo} lidera el desempeño (${mejor.cumplimientoVariablesPct}%).`
      : "Lectura ejecutiva: sin datos suficientes en el turno vigente.";
  lec.font = { name: F, size: 10, color: { argb: DASH.dark } };
  lec.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  // Tabla base
  const heads = ["Máquina", "Rollos", "Liberados", "Kg producidos", "Liberación %", "Cumpl. oficial %", "Cumpl. variables %", "Planta"];
  heads.forEach((h, i) => {
    const c = ws.getCell(58, 2 + i);
    c.value = h;
    c.font = { name: F, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DASH.dark } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  resumen.forEach((r, i) => {
    const row = 59 + i;
    const vals: Array<string | number> = [
      r.codigo, r.rollos, r.liberados,
      r.kgProducidos,
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
      if (j === 3) c.numFmt = '#,##0 "kg"';
      if (j >= 4 && j <= 6) c.numFmt = "0.0%";
    });
  });
}
