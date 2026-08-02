// Generador de HTML imprimible para etiquetas de Pesaje de Cintas.
// Formato fijo: hoja Carta (215.9 × 279.4 mm), 4 etiquetas por hoja
// (2×2), etiqueta de 97.95 × 129.70 mm, separación de 10 mm, margen 5 mm.
// Nunca escalar. Nunca "responsive". Nunca centrar cuando hay una sola.
// Muestra "Fabricación", nunca "Máquina". El número grande superior derecho
// es la POSICIÓN de la cinta.

import logoUrl from "@/assets/logo-convertipap.png";
import sapHanaAsset from "@/assets/sap-hana-logo.jpg.asset.json";
import QRCode from "qrcode";

// Dominio público canónico (mismo que la etiqueta de rollo).
const TRACE_BASE_URL = "https://www.convertipap.site";

async function toDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

type Medicion = { valor: number; min: number; obj: number; max: number };

export type EtiquetaCinta = {
  id: string;
  posicion: number;
  uniones: number;
  peso_cinta_kg: number;
  ancho_util: number;
  ancho_util_unidad: string | null;
  observaciones: string | null;
  estado?: string;
  version_etiqueta?: number;
  created_at?: string;
};

export type EtiquetaSnapshot = {
  lote_id: string;
  muestra_calidad_id?: string | null;
  numero_orden?: string | null;
  numero_rollo: string;
  fabricacion: string;
  producto_codigo: string | null;
  producto_nombre: string | null;
  fecha_produccion: string | null;
  conductor: string;
  bobinadora: string;
  origen_rollo?: "sistema" | "captura_manual";
  peso_neto_rollo_kg?: number | null;
  diametro_rollo_cm?: number | null;
  uniones_rollo?: number | null;
  total_uniones_cintas?: number;
  cintas_excluidas?: number;
  folio?: string;
  version_etiqueta?: number;
  generado_at?: string;
  datos_calidad: {
    turno?: string;
    jefe_maquina?: string | null;
    operador?: string | null;
    prensero?: string | null;
    analista?: string | null;
    mediciones?: Record<string, Medicion>;
  } & Record<string, unknown>;
  cintas: EtiquetaCinta[];
};

// Fuente única de datos de etiqueta: vista previa, impresión, reimpresión,
// contenido del QR y snapshot de auditoría usan SIEMPRE esta función.
export type CintaLabelData = {
  origen_rollo: "sistema" | "captura_manual";
  es_manual: boolean;
  numero_rollo: string;
  numero_rollo_etiqueta: string;
  orden_produccion: string | null;
  peso_neto_rollo_kg: number | null;
  diametro_rollo_cm: number | null;
  uniones_rollo: number | null;
  fabricacion: string | null;
  producto: string | null;
  turno: string | null;
  conductor: string | null;
  bobinadora: string | null;
  supervisor: string | null;
  analista: string | null;
  fecha_produccion: string | null;
  lote_id: string;
  cinta_id: string;
  posicion: number;
  peso_cinta_kg: number;
  ancho_cinta: number;
  ancho_unidad: string;
  uniones_cinta: number;
  estado_cinta: string;
  observaciones: string | null;
  registrado_at: string | null;
  version_etiqueta: number;
  total_uniones_cintas: number;
  generado_at: string;
  qr_payload: Record<string, unknown>;
  trace_url: string | null;
  sap_url: string | null;
};

const SIN_DATOS = /^\s*(sin datos registrados|—|-)?\s*$/i;
function limpio(v: string | null | undefined): string | null {
  if (v == null) return null;
  return SIN_DATOS.test(v) ? null : v;
}

export function buildCintaLabelData(snap: EtiquetaSnapshot, cinta: EtiquetaCinta): CintaLabelData {
  const dc = snap.datos_calidad ?? {};
  const origen: "sistema" | "captura_manual" =
    snap.origen_rollo ?? (snap.muestra_calidad_id ? "sistema" : "captura_manual");
  const esManual = origen === "captura_manual";
  const muestraId = snap.muestra_calidad_id ?? null;
  const traceBase = muestraId
    ? `${TRACE_BASE_URL}/muestra/${muestraId}`
    : (snap.lote_id ? `${TRACE_BASE_URL}/lote-cintas/${snap.lote_id}` : null);
  const version = cinta.version_etiqueta ?? snap.version_etiqueta ?? 1;
  const traceUrl = traceBase
    ? `${traceBase}${traceBase.includes("?") ? "&" : "?"}cinta=${cinta.id}&v=${version}`
    : null;
  const sapUrl = muestraId
    ? `${TRACE_BASE_URL}/muestra/${muestraId}?vista=sap&rollo=${encodeURIComponent(snap.numero_rollo || "")}`
    : null;

  const generadoAt = snap.generado_at ?? new Date().toISOString();
  const data: CintaLabelData = {
    origen_rollo: origen,
    es_manual: esManual,
    numero_rollo: snap.numero_rollo,
    orden_produccion: limpio(snap.numero_orden ?? null),
    peso_neto_rollo_kg: snap.peso_neto_rollo_kg ?? null,
    diametro_rollo_cm: snap.diametro_rollo_cm ?? null,
    uniones_rollo: snap.uniones_rollo ?? null,
    fabricacion: limpio(snap.fabricacion),
    producto: limpio(snap.producto_nombre ?? snap.producto_codigo ?? null),
    turno: limpio(dc.turno ?? null),
    conductor: limpio(snap.conductor),
    bobinadora: limpio(snap.bobinadora),
    supervisor: limpio(dc.jefe_maquina ?? null),
    analista: limpio(dc.analista ?? null),
    fecha_produccion: snap.fecha_produccion,
    lote_id: snap.lote_id,
    cinta_id: cinta.id,
    posicion: cinta.posicion,
    peso_cinta_kg: cinta.peso_cinta_kg,
    ancho_cinta: cinta.ancho_util,
    ancho_unidad: cinta.ancho_util_unidad ?? "cm",
    uniones_cinta: cinta.uniones,
    estado_cinta: cinta.estado ?? "registrada",
    observaciones: limpio(cinta.observaciones),
    registrado_at: cinta.created_at ?? null,
    version_etiqueta: version,
    total_uniones_cintas: snap.total_uniones_cintas ?? 0,
    generado_at: generadoAt,
    qr_payload: {},
    trace_url: traceUrl,
    sap_url: sapUrl,
  };

  data.qr_payload = {
    version_esquema_qr: 1,
    origen_rollo: data.origen_rollo,
    numero_rollo: data.numero_rollo,
    orden_produccion: data.orden_produccion,
    peso_neto_rollo_kg: data.peso_neto_rollo_kg,
    diametro_rollo_cm: data.diametro_rollo_cm,
    uniones_rollo: data.uniones_rollo,
    lote_id: data.lote_id,
    cinta_id: data.cinta_id,
    posicion: data.posicion,
    peso_cinta_kg: data.peso_cinta_kg,
    ancho_cinta_cm: data.ancho_cinta,
    uniones_cinta: data.uniones_cinta,
    estado_cinta: data.estado_cinta,
    version_etiqueta: data.version_etiqueta,
    generado_at: data.generado_at,
    url: data.trace_url,
  };

  return data;
}


const VAR_LABEL: Record<string, string> = {
  pesoBase: "Peso base",
  calibre: "Calibre",
  tensionMD: "Res. seca MD",
  tensionCD: "Res. seca CD",
  tensionRH: "RH total",
  humedad: "Humedad",
  blancuraR457: "Blancura R457",
  elongMD: "Elongación",
};

function med(snap: EtiquetaSnapshot, key: string): string {
  const m = snap.datos_calidad?.mediciones?.[key];
  if (!m || m.valor == null) return "—";
  return String(m.valor);
}

function fmtKg(value: number | string): string {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return "—";
  return numero.toFixed(3).replace(/\.?0+$/, "");
}

type Assets = {
  logo: string;
  sapLogo: string;
  qrTrace: string | null;
  qrSap: string | null;
};

function fila(k: string, v: string | null): string {
  // No se imprimen campos sin dato (flujo manual): se omiten por completo.
  if (v == null || v === "") return "";
  return `<div><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

function renderEtiqueta(d: CintaLabelData, snap: EtiquetaSnapshot, assets: Assets): string {
  const mediciones = snap.datos_calidad?.mediciones ?? {};
  const gridVars = Object.keys(VAR_LABEL)
    .filter((k) => mediciones[k]?.valor != null)
    .map((k) => `<div><span class="k">${VAR_LABEL[k]}</span><span class="v">${med(snap, k)}</span></div>`)
    .join("");

  const filaRollo = [
    fila("N.º Rollo", d.numero_rollo),
    fila("Fecha", d.fecha_produccion),
    fila("O. Producción", d.orden_produccion),
  ].filter(Boolean).join("");

  const filaProd = [
    fila("Fabricación", d.fabricacion),
    fila("Turno", d.turno),
    fila("Producto", d.producto),
  ].filter(Boolean).join("");

  const filaOrigen = [
    fila("Diámetro del rollo", d.diametro_rollo_cm == null ? null : `${d.diametro_rollo_cm} cm`),
    fila("Uniones del rollo", d.uniones_rollo == null ? null : String(d.uniones_rollo)),
    fila("Origen", d.origen_rollo === "sistema" ? "Sistema" : "Captura manual"),
  ].filter(Boolean).join("");

  const filaPersonal = [
    fila("Conductor", d.conductor),
    fila("Bobinadora", d.bobinadora),
    fila("Supervisor", d.supervisor),
    fila("Analista", d.analista),
  ].filter(Boolean).join("");

  return `
  <div class="print-label">
    <div class="lbl-inner">
      <div class="lbl-header">
        <div class="lbl-title">
          <img class="lbl-logo" src="${assets.logo}" alt="Convertipap" />
          <div class="lbl-sub">Etiqueta de Cinta · Producción</div>
        </div>
        <div class="lbl-pos">${d.posicion}</div>
      </div>

      ${filaRollo ? `<div class="lbl-row">${filaRollo}</div>` : ""}
      ${filaProd ? `<div class="lbl-row">${filaProd}</div>` : ""}
      ${filaOrigen ? `<div class="lbl-row">${filaOrigen}</div>` : ""}

      ${gridVars ? `<div class="lbl-grid">${gridVars}</div>` : ""}

      <div class="lbl-cinta">
        <div class="lbl-cinta-tit">Datos de esta cinta</div>
        <div class="lbl-row">
          <div><span class="k">Peso</span><span class="v big">${fmtKg(d.peso_cinta_kg)} kg</span></div>
          <div><span class="k">Ancho de la cinta</span><span class="v">${d.ancho_cinta} ${d.ancho_unidad}</span></div>
          <div><span class="k">Uniones de esta cinta</span><span class="v">${d.uniones_cinta}</span></div>
        </div>
      </div>

      ${filaPersonal ? `<div class="lbl-row">${filaPersonal}</div>` : ""}

      ${d.observaciones ? `<div class="lbl-obs"><span class="k">Obs.</span> ${d.observaciones}</div>` : ""}

      ${assets.qrTrace || assets.qrSap ? `
      <div class="lbl-qr-zone">
        ${assets.qrTrace ? `
        <div class="qr-box">
          <img src="${assets.qrTrace}" alt="QR trazabilidad" />
          <div class="qr-cap">Trazabilidad</div>
        </div>` : ""}
        ${assets.qrSap ? `
        <div class="qr-box">
          <img src="${assets.qrSap}" alt="QR SAP HANA" />
          <div class="qr-cap"><img class="qr-saplogo" src="${assets.sapLogo}" alt="SAP HANA" /></div>
        </div>` : ""}
      </div>` : ""}
      <div class="lbl-ver">Versión de etiqueta ${d.version_etiqueta}${snap.folio ? ` · ${snap.folio}` : ""}</div>
    </div>
  </div>`;
}

export async function abrirImpresionEtiquetas(snap: EtiquetaSnapshot): Promise<void> {
  const cintas = [...snap.cintas].sort((a, b) => a.posicion - b.posicion);
  const datos = cintas.map((c) => buildCintaLabelData(snap, c));

  const [logoDataUrl, sapLogoDataUrl] = await Promise.all([
    toDataUrl(logoUrl),
    toDataUrl(sapHanaAsset.url),
  ]);

  // El QR se regenera SIEMPRE con los datos vigentes de cada cinta.
  const etiquetas = await Promise.all(
    datos.map(async (d) => {
      const [qrTrace, qrSap] = await Promise.all([
        d.trace_url ? QRCode.toDataURL(d.trace_url, { margin: 1, width: 220, errorCorrectionLevel: "M" }) : Promise.resolve(null),
        d.sap_url ? QRCode.toDataURL(d.sap_url, { margin: 1, width: 220, errorCorrectionLevel: "M" }) : Promise.resolve(null),
      ]);
      return renderEtiqueta(d, snap, { logo: logoDataUrl, sapLogo: sapLogoDataUrl, qrTrace, qrSap });
    }),
  );

  const paginas: string[] = [];
  for (let i = 0; i < etiquetas.length; i += 4) {
    const bloque = etiquetas.slice(i, i + 4);
    const celdas = [0, 1, 2, 3].map((j) => bloque[j] ?? `<div class="print-label empty"></div>`).join("");
    paginas.push(`<section class="print-page">${celdas}</section>`);
  }


  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Etiquetas Cintas · ${snap.numero_rollo}</title>
<style>
  @page { size: Letter portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  * { box-sizing: border-box; }
  .print-page {
    width: 215.9mm; height: 279.4mm; padding: 5mm;
    display: grid;
    grid-template-columns: 97.95mm 97.95mm;
    grid-template-rows: 129.70mm 129.70mm;
    column-gap: 10mm; row-gap: 10mm;
    page-break-after: always; break-after: page;
  }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .print-label {
    width: 97.95mm; height: 129.70mm;
    border: 0.4mm solid #0a3d1f;
    background: #e9f4ea;
    overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .print-label.empty { border-style: dashed; border-color: #cbd5cb; background: transparent; }
  .lbl-inner { padding: 3mm 3.2mm; height: 100%; display: flex; flex-direction: column; gap: 1.2mm; font-size: 8.5pt; line-height: 1.15; }
  .lbl-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 0.3mm solid #0a3d1f; padding-bottom: 1.5mm; }
  .lbl-logo { display: block; height: 11mm; max-width: 52mm; object-fit: contain; }
  .lbl-sub { font-size: 7pt; color: #244; }
  .lbl-pos { font-size: 30pt; font-weight: 900; color: #0a3d1f; line-height: 0.9; padding: 0 2mm; }
  .lbl-row { display: flex; gap: 3mm; }
  .lbl-row > div { flex: 1; display: flex; flex-direction: column; }
  .lbl-row > div.wide { flex: 2; }
  .k { font-size: 6.5pt; text-transform: uppercase; color: #476; letter-spacing: 0.3px; }
  .v { font-size: 9pt; font-weight: 700; color: #08221a; }
  .v.big { font-size: 13pt; }
  .lbl-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm 3mm; border-top: 0.2mm dashed #0a3d1f66; border-bottom: 0.2mm dashed #0a3d1f66; padding: 1.5mm 0; }
  .lbl-grid > div { display: flex; flex-direction: column; }
  .lbl-cinta { background: #d4e8d6; padding: 1.5mm 2mm; border-radius: 1mm; }
  .lbl-cinta-tit { font-size: 6.5pt; text-transform: uppercase; color: #08221a; font-weight: 700; margin-bottom: 1mm; }
  .lbl-obs { font-size: 7pt; padding-top: 1mm; border-top: 0.2mm dotted #0a3d1f88; }
  .lbl-ver { font-size: 6pt; color: #476; text-align: right; }

  .lbl-qr-zone { margin-top: auto; padding-top: 1.5mm; border-top: 0.3mm solid #0a3d1f; display: flex; justify-content: space-around; align-items: flex-end; gap: 4mm; }
  .lbl-qr-zone .qr-box { display: flex; flex-direction: column; align-items: center; gap: 0.8mm; }
  .lbl-qr-zone .qr-box img { width: 20mm; height: 20mm; display: block; }
  .lbl-qr-zone .qr-cap { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #08221a; display: flex; align-items: center; justify-content: center; height: 4mm; }
  .lbl-qr-zone .qr-saplogo { width: auto !important; height: 4mm !important; max-width: 22mm; object-fit: contain; }
  @media screen {
    body { background: #eee; padding: 20px; }
    .print-page { margin: 0 auto 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); background: #fff; }
    .print-toolbar { max-width: 215.9mm; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 8px; }
    .print-toolbar button { padding: 8px 14px; border: 0; background: #0a3d1f; color: #fff; border-radius: 6px; cursor: pointer; font-weight: 600; }
  }
  @media print { .print-toolbar { display: none; } }
</style>
</head>
<body>
  <div class="print-toolbar"><button onclick="window.print()">Imprimir</button></div>
  ${paginas.join("\n")}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;

  // Preferimos iframe oculto (no lo bloquean los navegadores). Fallback a window.open.
  try {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("iframe sin documento");
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => setTimeout(() => iframe.remove(), 1000);
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        cleanup();
      }
    }, 400);
    return;
  } catch {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      alert("Habilita las ventanas emergentes para imprimir las etiquetas.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
