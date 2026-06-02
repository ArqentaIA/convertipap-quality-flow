// Etiqueta de Liberación (FOR-CAL-04) — se abre en ventana nueva, lista para imprimir.
// Sin marcas de plataforma, sin logos externos. Layout fiel al formato impreso.
import QRCode from "qrcode";
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

export type EtiquetaMedicion = {
  clave: string;
  etiqueta: string;
  valor: number;
  unidad: string;
  min: number;
  max: number;
  fueraSpec: boolean;
};

export type EtiquetaData = {
  muestraId: string;
  folio: string;
  fecha: string; // dd/mm/aaaa
  numeroRollo: string;
  maquinaCodigo: string;
  maquinaNombre: string;
  productoCodigo: string;
  productoNombre: string;
  observacionesGenerales: string;
  mediciones: EtiquetaMedicion[];
  estatus: "CONFORME" | "NO CONFORME";
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildTraceUrl(muestraId: string): string {
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  return `${origin}/muestra/${muestraId}`;
}

function row(label: string, valor: string | number, unidad = ""): string {
  const v = valor === null || valor === undefined || valor === "" ? "—" : valor;
  return `
    <tr>
      <td class="lbl">${esc(label)}</td>
      <td class="val">${esc(String(v))}${unidad ? ` <span class="u">${esc(unidad)}</span>` : ""}</td>
    </tr>`;
}

const OBS_OPCIONES = ["Arruga", "Picado", "Porosidad", "Hoyos por gomas", "Otro"];

function buildHtml(data: EtiquetaData, qrDataUrl: string, logoDataUrl: string): string {
  const fechaImpresion = new Date().toLocaleString("es-MX");
  const estatusColor = data.estatus === "CONFORME" ? "#15803d" : "#b91c1c";
  const estatusBg = data.estatus === "CONFORME" ? "#dcfce7" : "#fee2e2";


  // Distribuir mediciones en dos columnas
  const left: string[] = [];
  const right: string[] = [];
  data.mediciones.forEach((m, i) => {
    const cell = row(m.etiqueta, m.valor, m.unidad);
    (i % 2 === 0 ? left : right).push(cell);
  });

  const obsHtml = OBS_OPCIONES.map(
    (o) => `<label class="ck"><input type="checkbox" /> ${esc(o)}</label>`,
  ).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiqueta de Liberación · ${esc(data.folio)}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Inter,Roboto,Arial,sans-serif;color:#0f172a}
  body{margin:0;padding:18px;background:#f1f5f9}
  .toolbar{max-width:900px;margin:0 auto 12px;display:flex;justify-content:flex-end;gap:8px}
  .toolbar button{padding:8px 16px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
  .toolbar button.secondary{background:#fff;color:#0f172a}
  .sheet{max-width:900px;margin:0 auto;background:#fff;border:2px solid #0f172a}
  .head{display:grid;grid-template-columns:1fr 1.6fr 1fr;border-bottom:2px solid #0f172a}
  .head > div{padding:10px 14px;border-right:1px solid #0f172a}
  .head > div:last-child{border-right:0}
  .brand{display:flex;align-items:center;justify-content:center;padding:8px}
  .brand img{max-width:100%;max-height:64px;width:auto;height:auto;object-fit:contain;display:block}
  .title{display:flex;flex-direction:column;justify-content:center;text-align:center}
  .title b{font-size:12px}
  .title .sub{margin-top:4px;font-size:14px;font-weight:800;letter-spacing:.08em}
  .meta{font-size:9.5px;line-height:1.55;color:#1e293b}
  table.kv{width:100%;border-collapse:collapse}
  table.kv td{border:1px solid #0f172a;padding:5px 10px;font-size:12px;vertical-align:middle}
  td.lbl{background:#f1f5f9;font-weight:700;text-align:right;width:42%}
  td.val{font-weight:700;text-align:left;font-variant-numeric:tabular-nums}
  td.val .u{font-weight:500;color:#64748b;margin-left:4px;font-size:10.5px}
  .ident{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #0f172a}
  .ident > div{padding:12px 14px}
  .ident .producto{background:#0f172a;color:#fff;padding:16px 14px}
  .ident .producto .codigo{font-size:11px;letter-spacing:.08em;color:#cbd5e1}
  .ident .producto .nombre{font-weight:800;font-size:18px;margin-top:4px;line-height:1.2}
  .ident .meta-rollo table td{border-color:#94a3b8}
  .mediciones{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #0f172a}
  .mediciones > div{padding:0}
  .mediciones table{border-collapse:collapse;width:100%}
  .mediciones table td{border:1px solid #cbd5e1;padding:6px 10px;font-size:12px}
  .obs-block{display:grid;grid-template-columns:.9fr 1.4fr .9fr;border-bottom:1px solid #0f172a}
  .obs-block > div{padding:12px 14px;border-right:1px solid #0f172a}
  .obs-block > div:last-child{border-right:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .obs-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-bottom:8px}
  .ck{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0}
  .ck input{width:14px;height:14px}
  .comentarios{min-height:80px;font-size:12px;line-height:1.4;color:#1e293b;white-space:pre-wrap}
  .qr-box img{width:120px;height:120px;display:block}
  .qr-box .cap{font-size:9px;color:#64748b;margin-top:4px;text-align:center;letter-spacing:.06em;text-transform:uppercase}
  .estatus{display:grid;grid-template-columns:200px 1fr;align-items:center}
  .estatus .lbl{background:#f1f5f9;font-weight:800;font-size:14px;text-align:center;padding:16px;letter-spacing:.1em;border-right:1px solid #0f172a}
  .estatus .val{padding:16px;text-align:center;font-weight:800;font-size:22px;letter-spacing:.15em;color:${estatusColor};background:${estatusBg}}
  .foot{padding:6px 14px;font-size:9px;color:#64748b;text-align:right}
  @page{size:letter;margin:10mm}
  @media print{
    body{background:#fff;padding:0}
    .toolbar{display:none}
    .sheet{border:2px solid #0f172a;max-width:none}
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
      <div class="brand">
        <img src="${logoDataUrl}" alt="Convertipap" />
      </div>
      <div class="title">
        <b>CONVERTIDOR DE PAPEL S.A. DE C.V</b>
        <span class="sub">ETIQUETA DE LIBERACIÓN</span>
      </div>
      <div class="meta">
        CÓDIGO: FOR-CAL-04<br/>
        REVISIÓN: 0<br/>
        FECHA DE EMISIÓN: 05-03-2026<br/>
        FECHA DE ACTUALIZACIÓN: 05-03-2026<br/>
        IMPRESIÓN: ${esc(fechaImpresion)}
      </div>
    </div>

    <div class="ident">
      <div class="producto">
        <div class="codigo">FABRICACIÓN ${esc(data.maquinaCodigo)} · ${esc(data.productoCodigo)}</div>
        <div class="nombre">${esc(data.productoNombre.toUpperCase())}</div>
      </div>
      <div class="meta-rollo">
        <table class="kv">
          <tr>
            <td class="lbl">No. Rollo</td>
            <td class="val" style="font-size:16px">${esc(data.numeroRollo || "—")}</td>
          </tr>
          <tr>
            <td class="lbl">Fecha</td>
            <td class="val">${esc(data.fecha)}</td>
          </tr>
          <tr>
            <td class="lbl">Máquina</td>
            <td class="val">${esc(data.maquinaCodigo)} · ${esc(data.maquinaNombre)}</td>
          </tr>
          <tr>
            <td class="lbl">Folio</td>
            <td class="val" style="font-family:ui-monospace,Menlo,monospace;font-size:11px">${esc(data.folio)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="mediciones">
      <div><table>${left.join("")}</table></div>
      <div><table>${right.join("")}</table></div>
    </div>

    <div class="obs-block">
      <div>
        <div class="obs-title">Observaciones</div>
        ${obsHtml}
      </div>
      <div>
        <div class="obs-title">Comentarios</div>
        <div class="comentarios">${esc(data.observacionesGenerales || "—")}</div>
      </div>
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="QR muestra" />
        <div class="cap">Verificar muestra</div>
      </div>
    </div>

    <div class="estatus">
      <div class="lbl">ESTATUS</div>
      <div class="val">${esc(data.estatus)}</div>
    </div>

    <div class="foot">FOR-CAL-04 · Generado automáticamente</div>
  </div>
</body>
</html>`;
}

export async function printEtiquetaLiberacion(data: EtiquetaData): Promise<void> {
  const traceUrl = buildTraceUrl(data.muestraId);
  const qrDataUrl = await QRCode.toDataURL(traceUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
  const html = buildHtml(data, qrDataUrl);
  const w = window.open("", "_blank", "width=960,height=900");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir la etiqueta.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
