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

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type VariableRow = {
  label: string;
  unit: string;
  min: number;
  objective: number;
  max: number;
};

export type LogRow = {
  modificado_at: string;
  modificado_por_nombre: string | null;
  modificado_por_rol: string | null;
  variable_etiqueta: string;
  campo: string;
  valor_anterior: number | string | null;
  valor_nuevo: number | string | null;
  motivo: string;
};

export type VariablesPrintData = {
  code: string;
  name: string;
  family: string;
  specVersion?: string | null;
  planta?: string | null;
  clausula?: string | null;
  tipoDocumento?: string | null;
  area?: string | null;
  docCode?: string | null;
  fechaActualizacion?: string | null;
  revision?: string | null;
  pagina?: string | null;
  variables: VariableRow[];
  caracteristicas?: string | null;
  log?: LogRow[];
};

function buildHtml(data: VariablesPrintData, logoDataUrl: string): string {
  const fechaImpresion = new Date().toLocaleString("es-MX");
  const fechaDoc = esc(data.fechaActualizacion ?? new Date().toLocaleDateString("es-MX"));
  const vars = data.variables;

  const varRows = vars.map((v) => `
    <tr>
      <td class="lbl">${esc(v.label)}</td>
      <td>${esc(v.unit ?? "—")}</td>
      <td>${v.min != null ? esc(String(v.min)) : "—"}</td>
      <td class="obj">${v.objective != null ? esc(String(v.objective)) : "—"}</td>
      <td>${v.max != null ? esc(String(v.max)) : "—"}</td>
      <td>INTERNO</td>
    </tr>`).join("");

  const logRows = (data.log ?? []).map((r) => `
    <tr>
      <td>${esc(new Date(r.modificado_at).toLocaleString("es-MX"))}</td>
      <td>${esc(r.modificado_por_nombre ?? "—")}</td>
      <td>${esc(r.modificado_por_rol ?? "—")}</td>
      <td>${esc(r.variable_etiqueta)}</td>
      <td>${esc(r.campo)}</td>
      <td class="num">${esc(String(r.valor_anterior ?? "—"))}</td>
      <td class="num nvo">${esc(String(r.valor_nuevo ?? "—"))}</td>
      <td>${esc(r.motivo)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Especificaciones de Calidad · ${esc(data.code)}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Inter,Roboto,Arial,sans-serif;color:#0f172a}
  body{margin:0;padding:10px;background:#f1f5f9}
  .toolbar{max-width:210mm;margin:0 auto 8px;display:flex;justify-content:flex-end;gap:8px}
  .toolbar button{padding:8px 16px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
  .toolbar button.secondary{background:#fff;color:#0f172a}

  .sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;border:2px solid #0f172a;display:flex;flex-direction:column}

  .head{display:grid;grid-template-columns:78px 1fr 210px;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #0f172a}
  .head .brand img{max-width:72px;max-height:72px;object-fit:contain;display:block}
  .head .title{padding:8px 10px;display:flex;flex-direction:column;justify-content:center;text-align:center;border-right:1px solid #0f172a}
  .head .title .t1{font-size:14px;font-weight:900;letter-spacing:.12em;color:#0f172a}
  .head .title .t2{font-size:11px;color:#475569;letter-spacing:.04em;margin-top:3px}
  .head .title .t3{font-size:11px;font-weight:800;color:#0f172a;letter-spacing:.08em;margin-top:4px}
  .head .info{display:flex;flex-direction:column}
  .head .info .block{flex:1;padding:6px 8px;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #0f172a}
  .head .info .block:last-child{border-bottom:0}
  .head .info .k{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
  .head .info .v{font-size:10px;color:#0f172a;margin-top:2px;font-weight:700}

  .subhead{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #0f172a}
  .subhead .product{padding:14px;display:flex;flex-direction:column;justify-content:center;background:#fff;border-right:1px solid #0f172a}
  .subhead .product .code{font-size:26px;font-weight:900;line-height:1;letter-spacing:-.02em;color:#0f172a;font-variant-numeric:tabular-nums}
  .subhead .product .name{font-size:13px;font-weight:800;line-height:1.25;margin-top:6px;color:#0f172a;text-transform:uppercase;letter-spacing:.02em}
  .subhead .meta{padding:0}
  .subhead .meta table{width:100%;height:100%;border-collapse:collapse}
  .subhead .meta td{border:1px solid #0f172a;padding:5px 8px;font-size:10px;vertical-align:middle;text-align:center}
  .subhead .meta td.k{color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700;background:#f8fafc;font-size:9px}
  .subhead .meta td.v{color:#0f172a;font-weight:800;font-size:11px}

  .policy-bar{padding:5px 12px;background:#f1f5f9;border-bottom:1px solid #0f172a;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0f172a;text-align:center}
  .policy-text{padding:8px 12px;border-bottom:2px solid #0f172a;font-size:10px;line-height:1.5;color:#334155;text-align:justify}

  .mediciones-title{padding:6px 12px;background:#0f172a;color:#fff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .mediciones{border-bottom:2px solid #0f172a;padding:0}
  .mediciones table{border-collapse:collapse;width:100%}
  .mediciones thead th{background:#f1f5f9;padding:8px 10px;font-size:11px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.08em;text-align:center;border-bottom:2px solid #0f172a;border-right:1px solid #cbd5e1}
  .mediciones thead th:last-child{border-right:0}
  .mediciones tbody td{padding:7px 10px;font-size:13px;text-align:center;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-variant-numeric:tabular-nums;color:#0f172a}
  .mediciones tbody td:last-child{border-right:0}
  .mediciones tbody td.lbl{text-align:left;font-weight:700;color:#0f172a;background:#f8fafc}
  .mediciones tbody td.obj{font-weight:900;background:#fef3c7;color:#0f172a}
  .mediciones tbody tr:nth-child(even) td:not(.lbl):not(.obj){background:#fbfdff}

  .atrib-title{padding:6px 12px;background:#f8fafc;border-bottom:1px solid #0f172a;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#475569;display:flex;justify-content:space-between;align-items:center}
  .atrib-title .lim{font-size:9px;color:#94a3b8;font-weight:600;letter-spacing:.06em;text-transform:none}
  .atrib{padding:10px 12px;border-bottom:2px solid #0f172a;font-size:12px;line-height:1.45;color:#1e293b;white-space:pre-wrap;min-height:64px}

  .firmas-title{padding:6px 12px;background:#0f172a;color:#fff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .firmas{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:2px solid #0f172a}
  .firmas .f{padding:8px 6px;border-right:1px solid #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:92px}
  .firmas .f:last-child{border-right:0}
  .firmas .accion{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#475569;text-align:center;margin-bottom:2px}
  .firmas .line{width:92%;border-top:1px solid #0f172a;margin:4px 0}
  .firmas .nombre{font-size:10.5px;font-weight:800;color:#0f172a;text-align:center;line-height:1.15;margin-top:4px}
  .firmas .rol{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#475569;text-align:center;margin-bottom:4px}

  .log-title{padding:6px 12px;background:#f8fafc;border-bottom:1px solid #0f172a;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#475569}
  .log{padding:0;border-bottom:2px solid #0f172a}
  .log table{border-collapse:collapse;width:100%;font-size:11px}
  .log th{background:#f1f5f9;padding:5px 8px;text-align:left;font-weight:700;color:#334155;border-bottom:1px solid #e2e8f0}
  .log td{padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top}
  .log td.num{text-align:right;font-variant-numeric:tabular-nums}
  .log td.nvo{font-weight:800;color:#0f172a}

  .foot{padding:5px 12px;font-size:9.5px;color:#64748b;text-align:right;margin-top:auto}

  @page{size:Letter;margin:4mm}
  @media print{
    body{background:#fff;padding:0}
    .toolbar{display:none}
    .sheet{border:2px solid #0f172a;width:auto;min-height:auto;box-shadow:none}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="secondary" onclick="window.close()">Cerrar</button>
    <button onclick="window.print()">Imprimir</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="brand"><img src="${logoDataUrl}" alt="Convertipap" /></div>
      <div class="title">
        <div class="t1">CONVERTIDOR DE PAPEL</div>
        <div class="t2">S.A DE C.V</div>
        <div class="t3">* PLANTA ${esc(data.planta ?? "TLAXCALA")} *</div>
      </div>
      <div class="info">
        <div class="block">
          <div class="k">CLAÚSULA DE REFERENCIA</div>
          <div class="v">${esc(data.clausula ?? "Cláusula 9.1.2 ISO 9001:2015")}</div>
        </div>
        <div class="block">
          <div class="k">TIPO DOCUMENTO</div>
          <div class="v">${esc(data.tipoDocumento ?? "ESPECIFICACIÓN PST")}</div>
        </div>
      </div>
    </div>

    <div class="subhead">
      <div class="product">
        <div class="code">${esc(data.code)}</div>
        <div class="name">${esc(data.name.toUpperCase())}</div>
      </div>
      <div class="meta">
        <table>
          <tbody>
            <tr><td class="k" colspan="2">ÁREA</td><td class="k">CÓDIGO</td></tr>
            <tr><td class="v" colspan="2">${esc(data.area ?? "CALIDAD")}</td><td class="v">${esc(data.docCode ?? data.code)}</td></tr>
            <tr><td class="k">FECHA DE ACTUALIZACIÓN</td><td class="k">REVISIÓN</td><td class="k">PÁGINA</td></tr>
            <tr><td class="v">${fechaDoc}</td><td class="v">${esc(data.revision ?? data.specVersion ?? "—")}</td><td class="v">${esc(data.pagina ?? "1-1")}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="policy-bar">POLÍTICA AL MEDIO AMBIENTE</div>
    <div class="policy-text">En CONVERTIDOR DE PAPEL S. A. DE C. V. Fabricamos Papel Higiénico, Papel Servilleta, Toalla y Toalla para cocina a base de fibras recicladas y otros aditivos de origen orgánico. Características que hacen que nuestros productos sean 100% biodegradables. Para CONVERTIDOR DE PAPEL S. A. DE C. V. El salvaguardar el medio ambiente es un compromiso de nuestro trabajo con nuestros clientes y el planeta.</div>

    <div class="mediciones-title">Especificaciones Vigentes</div>
    <div class="mediciones">
      <table>
        <thead>
          <tr>
            <th style="text-align:left">Variable</th>
            <th>Unidad</th>
            <th>Mínimo</th>
            <th>Objetivo</th>
            <th>Máximo</th>
            <th>Método</th>
          </tr>
        </thead>
        <tbody>${varRows}</tbody>
      </table>
    </div>

    <div class="atrib-title"><span>Características de los Atributos</span><span class="lim">Máx. 250 caracteres</span></div>
    <div class="atrib">${esc((data.caracteristicas || "Sin características registradas.").slice(0, 250))}</div>

    <div class="firmas-title">Firmas de Autorización</div>
    <div class="firmas">
      <div class="f"><div class="accion">Elaboró</div><div class="line"></div><div class="nombre">Karina Méndez</div><div class="rol">Jefe de Calidad</div></div>
      <div class="f"><div class="accion">Revisó</div><div class="line"></div><div class="nombre">Jonatan Peláez</div><div class="rol">Gerente de Calidad</div></div>
      <div class="f"><div class="accion">Revisó</div><div class="line"></div><div class="nombre">Luis Alcalá</div><div class="rol">Gerente de Producción</div></div>
      <div class="f"><div class="accion">Autorizó</div><div class="line"></div><div class="nombre">Javier García</div><div class="rol">Director de Planta</div></div>
      <div class="f"><div class="accion">Autorizó</div><div class="line"></div><div class="nombre">Lic. Luis Reséndiz</div><div class="rol">Dirección Corporativa</div></div>
    </div>

    ${data.log && data.log.length > 0 ? `
    <div class="log-title">Bitácora de Cambios</div>
    <div class="log">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Usuario</th><th>Rol</th><th>Variable</th><th>Campo</th><th>Anterior</th><th>Nuevo</th><th>Motivo</th>
          </tr>
        </thead>
        <tbody>${logRows}</tbody>
      </table>
    </div>
    ` : ""}

    <div class="foot">Oficinas Corporativo Ajusco · Carretera Picacho Ajusco No. 130 Int. 404 · Col. Jardines en la Montaña · C.P. 14210<br/>Documento generado automáticamente · Convertipap Quality Flow</div>
  </div>
</body>
</html>`;
}

export async function imprimirVariablesCalidad(data: VariablesPrintData): Promise<void> {
  const logoDataUrl = await toDataUrl(logoUrl);
  const html = buildHtml(data, logoDataUrl);
  const w = window.open("", "_blank", "width=960,height=900");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
