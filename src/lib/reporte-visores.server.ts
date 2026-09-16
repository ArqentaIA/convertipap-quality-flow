// =============================================================================
// Reporte de cierre de turno a partir de los Visores (server-only).
// READ ONLY: consume exclusivamente fetchOperatorVisionData(), la misma fuente
// que alimenta las pantallas. No escribe en base de datos ni modifica visores.
// =============================================================================
import ExcelJS from "exceljs";
import { fetchOperatorVisionData } from "./operator-vision.server";

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
  ws0.mergeCells("A1:J1");
  const t = ws0.getCell("A1");
  t.value = "CONVERTIPAP · REPORTE DE CIERRE DE TURNO · VISORES";
  t.font = { name: "Arial", bold: true, size: 15 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws0.getRow(1).height = 26;
  ws0.getCell("A2").value = `Generado: ${generado.toLocaleString("es-MX", { hour12: false, timeZone: "America/Mexico_City" })} (hora planta)`;
  ws0.getCell("A2").font = { name: "Arial", size: 10, italic: true };
  headerRow(ws0, ["Máquina", "Nombre", "Planta", "Turno", "Producto", "Rollos", "Liberados", "Cumpl. oficial %", "Cumpl. variables %", "Estado"], 4);

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


  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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
