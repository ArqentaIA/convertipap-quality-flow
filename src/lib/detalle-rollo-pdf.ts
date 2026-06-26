import logoUrl from "@/assets/logo-convertipap.png";

async function toDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type DetalleRolloPdfMed = {
  clave: string;
  etiqueta: string;
  unidad?: string | null;
  min: number | null;
  objetivo: number | null;
  max: number | null;
  valor: number | null;
  estado: string;
};

export type DetalleRolloPdfData = {
  rollo: {
    numero: string;
    folioOrden: string;
    producto: string;
    productoCodigo: string;
    maquina: string;
    planta: string;
    capturadoAt: string;
    turno: string | number;
    operador: string;
    jefeMaquina: string;
    analista: string;
    estatus: string;
    cumplimientoVariables: number | null;
    ncCount: number;
    defectos: string[];
    observaciones: string | null;
  };
  mediciones: DetalleRolloPdfMed[];
};

function estadoBadge(estado: string, valorNull: boolean): string {
  const malo = estado === "no_conforme" || estado === "fuera_rango_critico";
  const pend = estado === "pendiente" || valorNull;
  const cls = malo ? "bad" : pend ? "pend" : "ok";
  const label = malo ? esc(estado) : pend ? "pendiente" : "conforme";
  return `<span class="badge ${cls}">${label}</span>`;
}

function buildHtml(d: DetalleRolloPdfData, logoDataUrl: string): string {
  const r = d.rollo;
  const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? "—" : String(n));
  const fecha = new Date(r.capturadoAt).toLocaleString("es-MX");
  const fechaImpresion = new Date().toLocaleString("es-MX");

  const tieneAviso =
    r.ncCount > 0 &&
    (r.estatus === "L" || r.estatus === "C" || r.estatus === "liberada" || r.estatus === "concesion");

  const rows = d.mediciones
    .map((m, i) => {
      const malo = m.estado === "no_conforme" || m.estado === "fuera_rango_critico";
      const pend = m.estado === "pendiente" || m.valor == null;
      const valClass = malo ? "val bad" : pend ? "val pend" : "val ok";
      return `<tr class="${malo ? "row-bad" : ""}">
        <td class="num">${i + 1}</td>
        <td class="lbl"><div class="lbl-main">${esc(m.etiqueta)}</div><div class="lbl-sub">${esc(m.clave)}</div></td>
        <td>${fmt(m.min)}</td>
        <td class="obj">${fmt(m.objetivo)}</td>
        <td>${fmt(m.max)}</td>
        <td class="${valClass}">${fmt(m.valor)}</td>
        <td class="unit">${esc(m.unidad || "—")}</td>
        <td>${estadoBadge(m.estado, m.valor == null)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Detalle de Calidad · ${esc(r.numero)}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Inter,Roboto,Arial,sans-serif;color:#0f172a}
  body{margin:0;padding:10px;background:#f1f5f9}
  .toolbar{max-width:210mm;margin:0 auto 8px;display:flex;justify-content:flex-end;gap:8px}
  .toolbar button{padding:8px 16px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
  .toolbar button.secondary{background:#fff;color:#0f172a}

  .sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;border:2px solid #0f172a;display:flex;flex-direction:column}

  .head{display:grid;grid-template-columns:90px 1fr 220px;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #0f172a;background:#fff}
  .head .brand img{max-width:84px;max-height:84px;object-fit:contain;display:block}
  .head .title{padding:10px;display:flex;flex-direction:column;justify-content:center;text-align:center;border-right:1px solid #0f172a}
  .head .title .t1{font-size:15px;font-weight:900;letter-spacing:.14em;color:#0f172a}
  .head .title .t2{font-size:10px;color:#64748b;letter-spacing:.06em;margin-top:4px;text-transform:uppercase}
  .head .title .t3{font-size:14px;font-weight:900;color:#0ea5e9;letter-spacing:.06em;margin-top:6px}
  .head .info{display:flex;flex-direction:column}
  .head .info .block{flex:1;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #0f172a}
  .head .info .block:last-child{border-bottom:0}
  .head .info .k{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
  .head .info .v{font-size:11px;color:#0f172a;margin-top:2px;font-weight:800}

  .hero{display:grid;grid-template-columns:1.1fr 2fr;border-bottom:2px solid #0f172a}
  .hero .rollo{padding:14px;background:#0f172a;color:#fff;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #0f172a}
  .hero .rollo .k{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:700}
  .hero .rollo .num{font-size:36px;font-weight:900;line-height:1;letter-spacing:-.02em;color:#fff;margin-top:4px;font-variant-numeric:tabular-nums}
  .hero .rollo .of{font-size:11px;margin-top:10px;color:#cbd5e1;font-weight:700}
  .hero .rollo .prod{font-size:12px;margin-top:6px;color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
  .hero .meta{padding:0}
  .hero .meta table{width:100%;height:100%;border-collapse:collapse}
  .hero .meta td{border:1px solid #e2e8f0;padding:6px 10px;font-size:10px;vertical-align:middle}
  .hero .meta td.k{color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700;background:#f8fafc;font-size:9px;width:38%}
  .hero .meta td.v{color:#0f172a;font-weight:800;font-size:11px}

  .kpi{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:2px solid #0f172a}
  .kpi .k{padding:10px 14px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;align-items:flex-start}
  .kpi .k:last-child{border-right:0}
  .kpi .k .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:700}
  .kpi .k .val{font-size:22px;font-weight:900;color:#0f172a;margin-top:3px;font-variant-numeric:tabular-nums}
  .kpi .k.danger .val{color:#dc2626}
  .kpi .k.ok .val{color:#059669}

  .aviso{padding:8px 14px;background:#fffbeb;border-bottom:2px solid #f59e0b;font-size:10px;color:#92400e;line-height:1.45}
  .aviso strong{color:#78350f}

  .sec-title{padding:6px 14px;background:#0f172a;color:#fff;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}

  .tbl{border-bottom:2px solid #0f172a}
  .tbl table{border-collapse:collapse;width:100%}
  .tbl thead th{background:#f1f5f9;padding:7px 8px;font-size:10px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.06em;text-align:center;border-bottom:2px solid #0f172a;border-right:1px solid #cbd5e1}
  .tbl thead th:last-child{border-right:0}
  .tbl thead th.lbl-h{text-align:left}
  .tbl tbody td{padding:4px 8px;font-size:10.5px;text-align:center;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-variant-numeric:tabular-nums;color:#0f172a}
  .tbl tbody td:last-child{border-right:0}
  .tbl tbody td.num{color:#94a3b8;font-weight:700}
  .tbl tbody td.lbl{text-align:left;background:#f8fafc}
  .tbl tbody td.lbl .lbl-main{font-weight:800;color:#0f172a}
  .tbl tbody td.lbl .lbl-sub{font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-top:1px}
  .tbl tbody td.obj{font-weight:900;background:#fef3c7;color:#0f172a}
  .tbl tbody td.unit{color:#64748b;font-size:10px}
  .tbl tbody td.val{font-weight:900;font-size:12px}
  .tbl tbody td.val.bad{color:#dc2626}
  .tbl tbody td.val.ok{color:#0f172a}
  .tbl tbody td.val.pend{color:#94a3b8}
  .tbl tbody tr.row-bad td{background:#fef2f2}
  .tbl tbody tr.row-bad td.lbl{background:#fee2e2}
  .tbl tbody tr.row-bad td.obj{background:#fde68a}

  .badge{display:inline-block;padding:2px 7px;border-radius:9px;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
  .badge.ok{background:#d1fae5;color:#065f46}
  .badge.bad{background:#fee2e2;color:#991b1b}
  .badge.pend{background:#e2e8f0;color:#475569}

  .notas{padding:10px 14px;border-bottom:2px solid #0f172a;font-size:10.5px;line-height:1.5;color:#1e293b;min-height:42px}
  .notas .k{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-right:6px}
  .notas .def{color:#dc2626;font-weight:700}

  .firmas{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:2px solid #0f172a}
  .firmas .f{padding:10px 6px;border-right:1px solid #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-height:78px}
  .firmas .f:last-child{border-right:0}
  .firmas .line{width:90%;border-top:1px solid #0f172a;margin:18px 0 4px}
  .firmas .rol{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475569}
  .firmas .nom{font-size:10px;font-weight:800;color:#0f172a;margin-top:2px}

  .foot{padding:6px 14px;font-size:9px;color:#64748b;display:flex;justify-content:space-between;margin-top:auto}

  @page{size:Letter;margin:4mm}
  @media print{
    body{background:#fff;padding:0}
    .toolbar{display:none}
    .sheet{border:2px solid #0f172a;width:auto;min-height:auto;box-shadow:none}
  }
</style></head>
<body>
  <div class="toolbar">
    <button class="secondary" onclick="window.close()">Cerrar</button>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="brand"><img src="${logoDataUrl}" alt="Convertipap" /></div>
      <div class="title">
        <div class="t1">CONVERTIDOR DE PAPEL S.A. DE C.V.</div>
        <div class="t2">Sistema de Gestión de Calidad · ISO 9001:2015</div>
        <div class="t3">DETALLE DE CALIDAD POR ROLLO</div>
      </div>
      <div class="info">
        <div class="block"><div class="k">Documento</div><div class="v">REP-QC-ROLLO</div></div>
        <div class="block"><div class="k">Fecha de Impresión</div><div class="v">${esc(fechaImpresion)}</div></div>
      </div>
    </div>

    <div class="hero">
      <div class="rollo">
        <div class="k">Rollo</div>
        <div class="num">${esc(r.numero)}</div>
        <div class="of">${esc(r.folioOrden)}</div>
        <div class="prod">${esc(r.producto)}${r.productoCodigo !== "—" ? ` · ${esc(r.productoCodigo)}` : ""}</div>
      </div>
      <div class="meta">
        <table><tbody>
          <tr><td class="k">Máquina</td><td class="v">${esc(r.maquina)}</td><td class="k">Planta</td><td class="v">${esc(r.planta)}</td></tr>
          <tr><td class="k">Capturado</td><td class="v">${esc(fecha)}</td><td class="k">Turno</td><td class="v">${esc(r.turno)}</td></tr>
          <tr><td class="k">Operador</td><td class="v">${esc(r.operador)}</td><td class="k">Jefe de Máquina</td><td class="v">${esc(r.jefeMaquina)}</td></tr>
          <tr><td class="k">Analista de Calidad</td><td class="v">${esc(r.analista)}</td><td class="k">Estatus Oficial</td><td class="v">${esc(r.estatus)}</td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="kpi">
      <div class="k"><div class="lbl">Variables Evaluadas</div><div class="val">${d.mediciones.length}</div></div>
      <div class="k ${r.cumplimientoVariables != null && r.cumplimientoVariables >= 90 ? "ok" : r.cumplimientoVariables != null && r.cumplimientoVariables < 70 ? "danger" : ""}"><div class="lbl">Cumplimiento de Variables</div><div class="val">${r.cumplimientoVariables == null ? "—" : r.cumplimientoVariables + "%"}</div></div>
      <div class="k ${r.ncCount > 0 ? "danger" : "ok"}"><div class="lbl">Fuera de Especificación</div><div class="val">${r.ncCount}</div></div>
    </div>

    ${tieneAviso ? `<div class="aviso"><strong>Aviso informativo:</strong> el estatus oficial de este rollo es <strong>${esc(r.estatus)}</strong>, pero presenta ${r.ncCount} variable${r.ncCount === 1 ? "" : "s"} fuera de especificación. Esta información es complementaria y no modifica el dictamen de liberación.</div>` : ""}

    <div class="sec-title">Variables de Calidad Capturadas</div>
    <div class="tbl">
      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th class="lbl-h">Variable</th>
          <th style="width:60px">Mín</th>
          <th style="width:70px">Objetivo</th>
          <th style="width:60px">Máx</th>
          <th style="width:70px">Valor</th>
          <th style="width:60px">Unidad</th>
          <th style="width:110px">Estado</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="8" style="padding:20px;color:#94a3b8;text-align:center">Sin variables capturadas</td></tr>`}</tbody>
      </table>
    </div>

    <div class="sec-title">Defectos y Observaciones</div>
    <div class="notas">
      <div><span class="k">Defectos:</span>${r.defectos.length > 0 ? `<span class="def">${esc(r.defectos.join(", "))}</span>` : "SIN DEFECTO"}</div>
      <div style="margin-top:4px"><span class="k">Observaciones:</span>${r.observaciones ? esc(r.observaciones) : "SIN OBSERVACIONES"}</div>
    </div>


    <div class="foot">
      <div>Convertipap Quality Flow · Reporte generado automáticamente</div>
      <div>Rollo ${esc(r.numero)} · ${esc(r.folioOrden)}</div>
    </div>
  </div>
</body></html>`;
}

export async function imprimirDetalleRollo(data: DetalleRolloPdfData): Promise<void> {
  const logoDataUrl = await toDataUrl(logoUrl);
  const html = buildHtml(data, logoDataUrl);
  const w = window.open("", "_blank", "width=980,height=920");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
