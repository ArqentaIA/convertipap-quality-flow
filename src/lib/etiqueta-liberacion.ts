// Etiqueta de Liberación (FOR-CAL-04) — se abre en ventana nueva, lista para imprimir.
// Sin marcas de plataforma, sin logos externos. Layout fiel al formato impreso.
import QRCode from "qrcode";
import logoUrl from "@/assets/logo-convertipap.png";
import sapHanaAsset from "@/assets/sap-hana-logo.jpg.asset.json";

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
  valor: number | null;
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
  estatus: "CONFORME" | "NO CONFORME" | "LIBERADO" | "CONDICIONAL" | "LIBERADO C/JUSTIF";
  estatusLiberacion?: "L" | "NC" | "C" | null;
  /** Cuando estatus = 'LIBERADO C/JUSTIF', motivo capturado por el operario. */
  justificacionLiberacion?: string | null;
  defectos?: string[];
  turno?: string | null;
  jefeMaquina?: string | null;
  operador?: string | null;
  prensero?: string | null;
  analista?: string | null;
  autorizacion?: {
    dictamen: "liberada" | "concesion" | "rechazada" | string;
    observaciones: string;
    motivo?: string | null;
    autorizadoAt?: string | null;
    rolAutorizador?: string | null;
    autorizadoPor?: string | null;
  } | null;
};


function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Dominio público canónico: el QR SIEMPRE debe apuntar al dominio propio,
// nunca al preview de Lovable (`*.lovable.app`) ni a window.location.origin,
// para evitar que al escanear desde un teléfono aparezca el login de la
// plataforma con marca ajena.
const TRACE_BASE_URL = "https://www.convertipap.site";

function buildTraceUrl(muestraId: string): string {
  return `${TRACE_BASE_URL}/muestra/${muestraId}`;
}

function isPesoLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  return s === "peso" || s === "peso del rollo" || s === "peso rollo";
}

function row(m: EtiquetaMedicion): string {
  const v = m.valor === null || m.valor === undefined ? "—" : m.valor;
  const unidad = m.unidad;
  const cls = isPesoLabel(m.etiqueta) ? "peso" : "";
  return `
    <tr class="${cls}">
      <td class="lbl">${esc(m.etiqueta)}</td>
      <td class="val">${esc(String(v))}${unidad ? ` <span class="u">${esc(unidad)}</span>` : ""}</td>
    </tr>`;
}

const OBS_OPCIONES = ["Arruga", "Picado", "Porosidad", "Hoyos por gomas", "Otro"];

function buildHtml(
  data: EtiquetaData,
  qrDataUrl: string,
  qrSapDataUrl: string,
  logoDataUrl: string,
  sapLogoDataUrl: string,
): string {
  const fechaImpresion = new Date().toLocaleString("es-MX");
  const estatusColor =
    data.estatus === "CONFORME" || data.estatus === "LIBERADO"
      ? "#15803d"
      : data.estatus === "LIBERADO C/JUSTIF"
      ? "#854d0e"
      : data.estatus === "CONDICIONAL"
      ? "#b45309"
      : "#b91c1c";
  const estatusBg =
    data.estatus === "CONFORME" || data.estatus === "LIBERADO"
      ? "#dcfce7"
      : data.estatus === "LIBERADO C/JUSTIF"
      ? "#fef08a"
      : data.estatus === "CONDICIONAL"
      ? "#fef3c7"
      : "#fee2e2";

  // Peso primero (destacado) y luego el resto en dos columnas
  const pesoIdx = data.mediciones.findIndex((m) => isPesoLabel(m.etiqueta));
  const pesoMed = pesoIdx >= 0 ? data.mediciones[pesoIdx] : null;
  const restantes = data.mediciones.filter((_, i) => i !== pesoIdx);

  const left: string[] = [];
  const right: string[] = [];
  restantes.forEach((m, i) => {
    (i % 2 === 0 ? left : right).push(row(m));
  });

  const defectosSet = new Set((data.defectos ?? []).map((d) => d.toLowerCase()));
  const obsHtml = OBS_OPCIONES.map(
    (o) => `<label class="ck"><input type="checkbox" ${defectosSet.has(o.toLowerCase()) ? "checked" : ""} /> ${esc(o)}</label>`,
  ).join("");

  const pesoValor = pesoMed && pesoMed.valor !== null && pesoMed.valor !== undefined ? pesoMed.valor : "—";
  const pesoUnidad = pesoMed?.unidad || "kg";

  const pesoBlock = `
    <div class="peso-highlight">
      <div class="peso-label">Peso</div>
      <div class="peso-value">${esc(String(pesoValor))}<span class="peso-unit">${esc(pesoUnidad)}</span></div>
    </div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiqueta de Liberación · ${esc(data.folio)}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Inter,Roboto,Arial,sans-serif;color:#0f172a}
  body{margin:0;padding:10px;background:#f1f5f9}
  .toolbar{max-width:140mm;margin:0 auto 8px;display:flex;justify-content:flex-end;gap:8px}
  .toolbar button{padding:8px 16px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
  .toolbar button.secondary{background:#fff;color:#0f172a}

  /* Hoja Media Carta Vertical (5.5" x 8.5") */
  .sheet{width:140mm;min-height:216mm;margin:0 auto;background:#fff;border:2px solid #0f172a;display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid}

  /* Encabezado */
  .head{display:grid;grid-template-columns:78px 1fr;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #0f172a}
  .head .brand img{max-width:72px;max-height:72px;object-fit:contain;display:block}
  .head .title{padding:8px 10px;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .head .title b{font-size:12px;color:#475569;letter-spacing:.04em}
  .head .title .sub{font-size:18px;font-weight:900;letter-spacing:.14em;margin-top:3px}
  .head .meta-bar{grid-column:1/-1;display:flex;justify-content:space-between;font-size:10px;color:#475569;padding:4px 10px;border-top:1px solid #cbd5e1;background:#f8fafc;letter-spacing:.02em}

  /* Bloque hero: No. Rollo + Producto + QR verificación */
  .hero{display:grid;grid-template-columns:1.1fr 1fr 118px;border-bottom:2px solid #0f172a}
  .hero .rollo{padding:12px 14px;background:#fff;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #0f172a}
  .hero .rollo .tag{font-size:11px;letter-spacing:.18em;color:#64748b;text-transform:uppercase;font-weight:700}
  .hero .rollo .num{font-size:48px;font-weight:900;line-height:1;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums}
  .hero .producto{padding:12px 12px;display:flex;flex-direction:column;justify-content:center;background:#fff;border-right:1px solid #0f172a}
  .hero .producto .tag{font-size:11px;letter-spacing:.18em;color:#64748b;text-transform:uppercase;font-weight:700}
  .hero .producto .nombre{font-size:16px;font-weight:900;line-height:1.1;margin-top:5px;color:#0f172a;letter-spacing:-.01em}
  .hero .producto .codigo{font-size:11px;color:#475569;margin-top:5px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}
  .hero .qr-verify{padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc}
  .hero .qr-verify img{width:96px;height:96px;display:block}
  .hero .qr-verify .cap{font-size:8.5px;color:#475569;margin-top:3px;text-align:center;letter-spacing:.08em;text-transform:uppercase;font-weight:700}

  /* Mediciones */
  .mediciones-title{padding:6px 12px;background:#0f172a;color:#fff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}

  /* Peso destacado */
  .peso-highlight{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(90deg,#fef3c7,#fde68a);border-bottom:2px solid #0f172a}
  .peso-label{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:#78350f}
  .peso-value{font-size:44px;font-weight:900;color:#0f172a;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
  .peso-unit{font-size:18px;font-weight:700;color:#78350f;margin-left:8px;letter-spacing:.02em}

  .mediciones{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #0f172a}
  .mediciones > div{padding:0}
  .mediciones > div + div{border-left:1px solid #0f172a}
  .mediciones table{border-collapse:collapse;width:100%}
  .mediciones table td{border-bottom:1px solid #e2e8f0;padding:5px 10px;font-size:13px}
  td.lbl{background:#f1f5f9;font-weight:700;text-align:right;width:50%;color:#334155}
  td.val{font-weight:800;text-align:left;font-variant-numeric:tabular-nums;color:#0f172a;font-size:14px}
  td.val .u{font-weight:500;color:#64748b;margin-left:3px;font-size:11px}

  /* Observaciones + SAP QR */
  .obs-block{display:grid;grid-template-columns:1fr 180px;border-bottom:2px solid #0f172a}
  .obs-block > div{padding:10px 12px;border-right:1px solid #0f172a}
  .obs-block > div:last-child{border-right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:6px}
  .obs-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#475569;margin-bottom:6px}
  .comentarios{min-height:50px;font-size:12px;line-height:1.4;color:#1e293b;white-space:pre-wrap}
  .sap-block{display:flex;flex-direction:row;align-items:center;gap:8px}
  .sap-block img.qr{width:96px;height:96px;display:block}
  .sap-block img.logo{width:64px;height:auto;object-fit:contain;display:block}
  .sap-cap{font-size:9px;color:#475569;text-align:center;letter-spacing:.08em;text-transform:uppercase;font-weight:700}

  /* Estatus */
  .estatus{display:grid;grid-template-columns:110px 1fr;align-items:stretch;border-bottom:1px solid #0f172a;page-break-inside:avoid;break-inside:avoid}
  .estatus .lbl-e{background:#0f172a;color:#fff;font-weight:900;font-size:16px;text-align:center;padding:16px 8px;letter-spacing:.16em;display:flex;align-items:center;justify-content:center}
  .estatus .val-e{padding:16px 8px;text-align:center;font-weight:900;font-size:32px;letter-spacing:.16em;color:${estatusColor};background:${estatusBg};display:flex;align-items:center;justify-content:center}

  .foot{padding:5px 12px;font-size:9.5px;color:#64748b;text-align:right;margin-top:auto}

  @page{size:5.5in 8.5in;margin:0}
  @media print{
    html,body{background:#fff;padding:0;margin:0}
    .toolbar{display:none}
    .sheet{border:2px solid #0f172a;width:auto;min-height:auto;box-shadow:none;margin:0;page-break-inside:avoid;break-inside:avoid}
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
        <span class="sub">ETIQUETA DE LIBERACIÓN</span>
      </div>
      <div class="meta-bar">
        <span>FOR-CAL-04 · Rev. 0</span>
        <span>Emisión 05-03-2026</span>
        <span>Impresión: ${esc(fechaImpresion)}</span>
      </div>
    </div>

    <div class="hero">
      <div class="rollo">
        <div class="tag">No. de Rollo</div>
        <div class="num">${esc(data.numeroRollo || "—")}</div>
      </div>
      <div class="producto">
        <div class="tag">Producto</div>
        <div class="nombre">${esc((data.productoNombre || data.productoCodigo).toUpperCase())}</div>
        <div class="codigo">${esc(data.productoCodigo)} · ${esc(data.maquinaCodigo)}</div>
      </div>
      <div class="qr-verify">
        <img src="${qrDataUrl}" alt="QR verificación" />
        <div class="cap">Verificar</div>
      </div>
    </div>

    <div class="mediciones-title">Resultados de Calidad</div>
    ${pesoBlock}
    <div class="mediciones">
      <div><table>${left.join("")}</table></div>
      <div><table>${right.join("")}</table></div>
    </div>

    <div class="obs-block">
      <div>
        <div class="obs-title">Comentarios</div>
        <div class="comentarios">${esc(data.observacionesGenerales || "—")}</div>
        ${
          data.estatus === "LIBERADO C/JUSTIF"
            ? (() => {
                const j = (data.justificacionLiberacion ?? "").trim();
                const texto = j.length > 0 ? j : "SIN JUSTIFICACIÓN";
                return `<div style="margin-top:6px;padding:5px 7px;border-left:3px solid #ca8a04;background:#fef9c3;border-radius:4px;font-size:9.5px;line-height:1.35;word-wrap:break-word;overflow-wrap:anywhere">
                 <div style="font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#854d0e;font-size:8px;margin-bottom:2px">Justificación de Liberación · Capturista</div>
                 <div style="color:#1e293b;white-space:pre-wrap">${esc(texto)}</div>
               </div>`;
              })()
            : ""
        }
        ${
          data.autorizacion
            ? `<div style="margin-top:6px;padding:5px 7px;border-left:3px solid #b45309;background:#fffbeb;border-radius:4px;font-size:9px;line-height:1.3">
                 <div style="font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#92400e;font-size:8px;margin-bottom:2px">Justificación · Gerente de Calidad</div>
                 <div style="color:#1e293b"><b>Dictamen:</b> ${esc(
                   data.autorizacion.dictamen === "liberada"
                     ? "Liberada"
                     : data.autorizacion.dictamen === "concesion"
                     ? "Concesión"
                     : data.autorizacion.dictamen === "rechazada"
                     ? "Rechazada"
                     : String(data.autorizacion.dictamen),
                 )}${data.autorizacion.motivo ? ` · <b>Motivo:</b> ${esc(data.autorizacion.motivo)}` : ""}</div>
                 <div style="color:#1e293b;white-space:pre-wrap;margin-top:2px">${esc(data.autorizacion.observaciones || "—")}</div>
               </div>`
            : ""
        }
      </div>
      <div>
        <div class="sap-block">
          <img class="qr" src="${qrSapDataUrl}" alt="QR SAP HANA" />
          <img class="logo" src="${sapLogoDataUrl}" alt="SAP HANA" />
        </div>
      </div>

    </div>

    <div class="estatus">
      <div class="lbl-e">ESTATUS</div>
      <div class="val-e">${esc(data.estatus)}</div>
    </div>

    <div class="foot">FOR-CAL-04 · Generado automáticamente</div>
  </div>
</body>
</html>`;
}

export async function printEtiquetaLiberacion(data: EtiquetaData): Promise<void> {
  const traceUrl = buildTraceUrl(data.muestraId);

  // QR SAP HANA: debe abrir la vista pública corporativa del rollo.
  // Antes se codificaba texto plano (rollo/peso/estatus); iOS/Google Lens lo
  // interpreta como búsqueda web. Con URL canónica siempre abre Convertipap.
  const pesoMed = data.mediciones.find(
    (m) => m.etiqueta.trim().toLowerCase() === "peso" ||
      m.etiqueta.trim().toLowerCase() === "peso del rollo" ||
      m.etiqueta.trim().toLowerCase() === "peso rollo",
  );
  const pesoTxt = pesoMed && pesoMed.valor !== null && pesoMed.valor !== undefined ? String(pesoMed.valor) : "—";
  const sapTraceUrl = `${traceUrl}?vista=sap&rollo=${encodeURIComponent(data.numeroRollo || "")}&peso=${encodeURIComponent(pesoTxt)}&estatus=${encodeURIComponent(data.estatus)}`;

  const [qrDataUrl, qrSapDataUrl, logoDataUrl, sapLogoDataUrl] = await Promise.all([
    QRCode.toDataURL(traceUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }),
    QRCode.toDataURL(sapTraceUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }),
    toDataUrl(logoUrl),
    toDataUrl(sapHanaAsset.url),
  ]);
  const html = buildHtml(data, qrDataUrl, qrSapDataUrl, logoDataUrl, sapLogoDataUrl);
  const w = window.open("", "_blank", "width=960,height=900");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir la etiqueta.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
