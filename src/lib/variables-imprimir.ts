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
  variables: VariableRow[];
  caracteristicas?: string | null;
  log?: LogRow[];
};

function buildHtml(data: VariablesPrintData, logoDataUrl: string): string {
  const fechaImpresion = new Date().toLocaleString("es-MX");
  const vars = data.variables;

  const varRows = vars.map((v) => `
    <tr>
      <td class="lbl">${esc(v.label)}</td>
      <td>${esc(v.unit ?? "—")}</td>
      <td>${v.min != null ? esc(String(v.min)) : "—"}</td>
      <td class="obj">${v.objective != null ? esc(String(v.objective)) : "—"}</td>
      <td>${v.max != null ? esc(String(v.max)) : "—"}</td>
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

  .head{display:grid;grid-template-columns:78px 1fr;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #0f172a}
  .head .brand img{max-width:72px;max-height:72px;object-fit:contain;display:block}
  .head .title{padding:8px 10px;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .head .title b{font-size:12px;color:#475569;letter-spacing:.04em}
  .head .title .sub{font-size:18px;font-weight:900;letter-spacing:.14em;margin-top:3px}
  .head .meta-bar{grid-column:1/-1;display:flex;justify-content:space-between;font-size:10px;color:#475569;padding:4px 10px;border-top:1px solid #cbd5e1;background:#f8fafc;letter-spacing:.02em}

  .hero{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #0f172a}
  .hero .code{padding:12px 14px;background:#0f172a;color:#fff;display:flex;flex-direction:column;justify-content:center}
  .hero .code .tag{font-size:11px;letter-spacing:.18em;color:#e2e8f0;text-transform:uppercase;font-weight:700}
  .hero .code .num{font-size:54px;font-weight:900;line-height:1;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums}
  .hero .producto{padding:12px 14px;display:flex;flex-direction:column;justify-content:center;background:#fff}
  .hero .producto .tag{font-size:11px;letter-spacing:.18em;color:#64748b;text-transform:uppercase;font-weight:700}
  .hero .producto .nombre{font-size:20px;font-weight:900;line-height:1.1;margin-top:5px;color:#0f172a;letter-spacing:-.01em}
  .hero .producto .codigo{font-size:12px;color:#475569;margin-top:5px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}

  .meta-band{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #0f172a}
  .meta-band > div{padding:8px 10px;border-right:1px solid #0f172a}
  .meta-band > div:last-child{border-right:0}
  .meta-band .k{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
  .meta-band .v{font-size:16px;font-weight:800;color:#0f172a;margin-top:3px;font-variant-numeric:tabular-nums;line-height:1.1}

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
  .firmas .f{padding:18px 6px 8px;border-right:1px solid #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-height:80px}
  .firmas .f:last-child{border-right:0}
  .firmas .line{width:90%;border-top:1px solid #0f172a;margin-bottom:5px}
  .firmas .rol{font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#334155;text-align:center}

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
        <b>CONVERTIDOR DE PAPEL S.A. DE C.V</b>
        <span class="sub">ESPECIFICACIONES DE CALIDAD</span>
      </div>
      <div class="meta-bar">
        <span>Catálogo Maestro de Variables</span>
        <span>Impresión: ${esc(fechaImpresion)}</span>
      </div>
    </div>

    <div class="hero">
      <div class="code">
        <div class="tag">Código de Producto</div>
        <div class="num">${esc(data.code)}</div>
      </div>
      <div class="producto">
        <div class="tag">Producto</div>
        <div class="nombre">${esc(data.name.toUpperCase())}</div>
        <div class="codigo">${esc(data.family)}${data.specVersion ? ` · Versión ${esc(data.specVersion)}` : ""}</div>
      </div>
    </div>

    <div class="meta-band">
      <div><div class="k">Familia</div><div class="v">${esc(data.family)}</div></div>
      <div><div class="k">Variables</div><div class="v">${vars.length}</div></div>
      <div><div class="k">Versión</div><div class="v">${esc(data.specVersion ?? "—")}</div></div>
    </div>

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
          </tr>
        </thead>
        <tbody>${varRows}</tbody>
      </table>
    </div>

    <div class="atrib-title">Características de los Atributos</div>
    <div class="atrib">${esc(data.caracteristicas || "Sin características registradas.")}</div>

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

    <div class="foot">Documento generado automáticamente · Convertipap Quality Flow</div>
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
