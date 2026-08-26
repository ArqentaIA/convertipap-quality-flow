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
  estatus:
    | "CONFORME"
    | "NO CONFORME"
    | "LIBERADO"
    | "LIBERADO CON CONCESIÓN"
    | "CONDICIONAL"
    | "LIBERADO C/JUSTIF"
    | "PENDIENTE";
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
  numeroOrdenSap?: string | null;
  estadoSap?: string | null;
};

function fmtKg(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(3).replace(/\.?0+$/, "");
}


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

// -----------------------------------------------------------------------------
// Payloads de los 3 QR inferiores: TEXTO PLANO con el valor del dato.
// Sin URL, sin esquema URI, sin JSON, sin UUID. Aplica igual en impresión
// inicial y en reimpresión (ambas usan printEtiquetaLiberacion).
// -----------------------------------------------------------------------------
export function buildPayloadRollo(data: Pick<EtiquetaData, "numeroRollo">): string {
  return String(data.numeroRollo ?? "").trim();
}

/** Peso oficial: exclusivamente la medición de Control de Calidad (clave `peso`). */
export function buildPayloadPeso(data: Pick<EtiquetaData, "mediciones">): string {
  const med = (data.mediciones || []).find(
    (m) => m.clave?.trim().toLowerCase() === "peso" || isPesoLabel(m.etiqueta),
  );
  // Sin medición oficial de peso no se codifica un número inventado.
  if (!med || med.valor === null || med.valor === undefined) return "Sin peso registrado";
  return fmtKg(med.valor);
}

/** Orden de producción: fuente canónica SAP; sin orden vinculada = texto oficial. */
export function buildPayloadOrden(numeroOrdenSap: string | null | undefined): string {
  const v = (numeroOrdenSap ?? "").trim();
  return v || "Sin orden SAP vinculada";
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
  qrRolloDataUrl: string,
  qrPesoDataUrl: string,
  qrOrdenDataUrl: string,
  logoDataUrl: string,
  sapLogoDataUrl: string,
  payloads: { rollo: string; peso: string; orden: string },
): string {
  const fechaImpresion = new Date().toLocaleString("es-MX");
  const estatusColor =
    data.estatus === "CONFORME" || data.estatus === "LIBERADO"
      ? "#15803d"
      : data.estatus === "LIBERADO C/JUSTIF"
      ? "#854d0e"
      : data.estatus === "CONDICIONAL" || data.estatus === "LIBERADO CON CONCESIÓN"
      ? "#b45309"
      : data.estatus === "PENDIENTE"
      ? "#0369a1"
      : "#b91c1c";
  const estatusBg =
    data.estatus === "CONFORME" || data.estatus === "LIBERADO"
      ? "#dcfce7"
      : data.estatus === "LIBERADO C/JUSTIF"
      ? "#fef08a"
      : data.estatus === "CONDICIONAL" || data.estatus === "LIBERADO CON CONCESIÓN"
      ? "#fef3c7"
      : data.estatus === "PENDIENTE"
      ? "#e0f2fe"
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

  // PESO OFICIAL: exclusivamente la variable "Peso" capturada en Control de
  // Calidad. Sin fallback a báscula (pesajes_bobina_madre.peso_neto_kg).
  const pesoMedValor =
    pesoMed && pesoMed.valor !== null && pesoMed.valor !== undefined
      ? String(pesoMed.valor)
      : null;
  const pesoValor = pesoMedValor ?? "No disponible";
  const pesoUnidad = pesoMedValor != null ? (pesoMed?.unidad || "kg") : "";

  const pesoBlock = `
    <div class="peso-highlight">
      <div class="peso-label">Peso</div>
      <div class="peso-value">${esc(pesoValor)}<span class="peso-unit">${esc(pesoUnidad)}</span></div>
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
  .head{display:grid;grid-template-columns:110px 1fr;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:8px;border-right:1px solid #0f172a}
  .head .brand img{max-width:100px;max-height:100px;object-fit:contain;display:block}
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

  /* Observaciones (solo comentarios / justificaciones) */
  .obs-block{border-bottom:2px solid #0f172a}
  .obs-block > div{padding:10px 12px}
  .obs-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#475569;margin-bottom:6px}
  .comentarios{min-height:40px;font-size:12px;line-height:1.4;color:#1e293b;white-space:pre-wrap}

  /* Estatus */
  .estatus{display:grid;grid-template-columns:110px 1fr;align-items:stretch;border-bottom:2px solid #0f172a;page-break-inside:avoid;break-inside:avoid}
  .estatus .lbl-e{background:#0f172a;color:#fff;font-weight:900;font-size:16px;text-align:center;padding:16px 8px;letter-spacing:.16em;display:flex;align-items:center;justify-content:center}
  .estatus .val-e{padding:16px 8px;text-align:center;font-weight:900;font-size:32px;letter-spacing:.16em;color:${estatusColor};background:${estatusBg};display:flex;align-items:center;justify-content:center}

  /* Bloque inferior: 3 QR con valor visible + logo SAP HANA a la derecha */
  .sap-footer{display:grid;grid-template-columns:1fr 1fr 1fr 0.9fr;align-items:stretch;border-bottom:2px solid #0f172a;background:#f8fafc}
  .sap-footer .sap-qr{padding:10px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid #0f172a}
  .sap-footer .sap-qr:last-child{border-right:0}
  .sap-footer .sap-qr img{width:140px;height:140px;display:block;background:#fff;padding:4px}
  .sap-footer .sap-qr .cap{font-size:9px;color:#334155;margin-top:6px;text-align:center;letter-spacing:.1em;text-transform:uppercase;font-weight:800;line-height:1.2}

  .sap-logo{display:flex;align-items:center;justify-content:center;padding:10px}
  .sap-logo img{max-width:100%;max-height:96px;width:auto;height:auto;object-fit:contain}

  .foot{padding:5px 12px;font-size:9.5px;color:#64748b;text-align:right;margin-top:auto}

  /* Contenedor de ajuste a media carta */
  .fit{width:139.7mm;margin:0 auto;transform-origin:top center}

  .hint{max-width:140mm;margin:0 auto 8px;font-size:11px;color:#334155;background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;line-height:1.4}

  @page{size:5.5in 8.5in portrait;margin:0}
  @media print{
    html,body{background:#fff;padding:0;margin:0;width:139.7mm;height:215.9mm;overflow:hidden}
    .toolbar,.hint{display:none}
    .fit{width:135mm;margin:0;transform:scale(var(--fit-scale,1));transform-origin:top left}
    .sheet{width:135mm;min-height:auto;border:2px solid #0f172a;box-shadow:none;margin:0;page-break-inside:avoid;break-inside:avoid;page-break-after:avoid}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="secondary" onclick="window.close()">Cerrar</button>
    <button onclick="window.print()">Imprimir</button>
  </div>
  <div class="fit">
  <div class="sheet">
    <div class="head">
      <div class="brand"><img src="${logoDataUrl}" alt="Convertipap" /></div>
      <div class="title">
        <b>CONVERTIDOR DE PAPEL S.A. DE C.V</b>
        <span class="sub">${data.estatus === "NO CONFORME" ? "ETIQUETA DE CONTROL DE CALIDAD" : "ETIQUETA DE LIBERACIÓN"}</span>
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
    </div>

    <div class="estatus">
      <div class="lbl-e">ESTATUS</div>
      <div class="val-e">${esc(data.estatus)}</div>
    </div>

    <div class="sap-footer">
      <div class="sap-qr">
        <img src="${qrRolloDataUrl}" alt="QR N.º de rollo" />
        <div class="cap">N.º de rollo</div>
      </div>
      <div class="sap-qr">
        <img src="${qrPesoDataUrl}" alt="QR Peso" />
        <div class="cap">Peso</div>
      </div>
      <div class="sap-qr">
        <img src="${qrOrdenDataUrl}" alt="QR Orden de producción" />
        <div class="cap">Orden de producción</div>
      </div>

      <div class="sap-logo">
        <img src="${sapLogoDataUrl}" alt="SAP HANA" />
      </div>
    </div>


    <div class="foot">FOR-CAL-04 · Generado automáticamente</div>
  </div>
  </div>
<script>
(function(){
  var MM = 96/25.4;
  function fit(){
    var el = document.querySelector('.fit');
    var sheet = document.querySelector('.sheet');
    if(!el||!sheet) return;
    el.style.setProperty('--fit-scale','1');
    var availH = 215.9*MM - 4;      // alto media carta
    var availW = 139.7*MM - 4;      // ancho media carta
    var h = sheet.getBoundingClientRect().height;
    var w = sheet.getBoundingClientRect().width;
    var s = Math.min(1, availH/h, availW/w);
    el.style.setProperty('--fit-scale', String(s));
  }
  window.addEventListener('load', fit);
  window.addEventListener('beforeprint', fit);
  setTimeout(fit, 400);
})();
</script>
</body>
</html>`;
}

export async function printEtiquetaLiberacion(data: EtiquetaData): Promise<void> {
  const traceUrl = buildTraceUrl(data.muestraId);


  // Enriquecer con datos SAP (N.º de orden + estado) si no vienen ya en `data`.
  let numeroOrdenSap: string | null = data.numeroOrdenSap ?? null;
  let estadoSap: string | null = data.estadoSap ?? null;
  if (numeroOrdenSap == null || estadoSap == null) {
    try {
      const { getMuestraTrace } = await import("@/lib/trace.functions");
      const trace = await getMuestraTrace({ data: { id: data.muestraId } });
      if (trace.found) {
        numeroOrdenSap = numeroOrdenSap ?? trace.numero_orden_sap ?? null;
        estadoSap = estadoSap ?? trace.estado_sap ?? null;
      }
    } catch {
      /* no bloquear impresión si el trace falla */
    }
  }

  // Payloads de los 3 QR inferiores: TEXTO PLANO, sin URL ni esquema URI.
  const payloadRollo = buildPayloadRollo(data);
  const payloadPeso = buildPayloadPeso(data);
  const payloadOrden = buildPayloadOrden(numeroOrdenSap);

  const [qrDataUrl, qrRolloDataUrl, qrPesoDataUrl, qrOrdenDataUrl, logoDataUrl, sapLogoDataUrl] =
    await Promise.all([
      QRCode.toDataURL(traceUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(payloadRollo, { margin: 2, width: 400, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(payloadPeso, { margin: 2, width: 400, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(payloadOrden, { margin: 2, width: 400, errorCorrectionLevel: "M" }),
      toDataUrl(logoUrl),
      toDataUrl(sapHanaAsset.url),
    ]);
  const html = buildHtml(
    { ...data, numeroOrdenSap, estadoSap },
    qrDataUrl,
    qrRolloDataUrl,
    qrPesoDataUrl,
    qrOrdenDataUrl,
    logoDataUrl,
    sapLogoDataUrl,
    { rollo: payloadRollo, peso: payloadPeso, orden: payloadOrden },
  );

  const w = window.open("", "_blank", "width=960,height=900");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir la etiqueta.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
