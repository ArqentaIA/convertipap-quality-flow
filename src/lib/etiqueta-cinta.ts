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
  /** Estatus de liberación de la cinta: L / C / NC (Planta Ixtapaluca). */
  estatus_liberacion?: string | null;
  /** Lote Logístico pza. capturado por cinta (tiene prioridad sobre el del lote/muestra). */
  lote_logistico_pza?: string | null;
  sku_sap?: string | null;
  version_etiqueta?: number;
  created_at?: string;
};

export const ESTATUS_CINTA_LABEL: Record<string, string> = {
  L: "LIBERADO",
  C: "CONDICIONADO",
  NC: "NO CONFORME",
};

const ESTATUS_CINTA_COLOR: Record<string, string> = {
  L: "#15803d",
  C: "#b45309",
  NC: "#b91c1c",
};

export type EtiquetaSnapshot = {
  lote_id: string;
  muestra_calidad_id?: string | null;
  lote_logistico?: string | null;
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
  peso_mermas_kg?: number | null;
  porcentaje_peso_mermas?: number | null;
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
  peso_mermas_kg: number | null;
  porcentaje_peso_mermas: number | null;
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
  estatus_liberacion: string | null;
  observaciones: string | null;
  registrado_at: string | null;
  version_etiqueta: number;
  total_uniones_cintas: number;
  generado_at: string;
  qr_payload: Record<string, unknown>;
  trace_url: string | null;
  sap_url: string | null;
  lote_logistico: string | null;
  /** Payloads de TEXTO PLANO de los 3 QR inferiores (sin URL, sin JSON). */
  url_qr_peso: string;
  url_qr_lote: string;
  sku_sap: string | null;
  url_qr_sku: string;
};

const SIN_DATOS = /^\s*(sin datos registrados|—|-)?\s*$/i;
function limpio(v: string | null | undefined): string | null {
  if (v == null) return null;
  return SIN_DATOS.test(v) ? null : v;
}

/**
 * Código de rebobinadora exclusivo de Planta Ixtapaluca. Cuando el lote usa una
 * de estas máquinas, el número de etiqueta lleva el sufijo del código.
 */
const BOBINADORA_CODIGO_IXT: Record<string, string> = {
  "JAGENBERG 1": "JG01",
  "JAGENBERG 2": "JG02",
  "MAQUINA 1": "RB01",
  "MAQUINA 2": "RB02",
};

export function codigoBobinadoraIxt(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const n = nombre.trim().toUpperCase();
  if (/^(JG01|JG02|RB01|RB02)$/.test(n)) return n;
  return BOBINADORA_CODIGO_IXT[n] ?? null;
}

/** Número visible de la etiqueta: <rollo original>-C<posición>[-<código máquina>]. */
export function buildNumeroRolloEtiqueta(
  numeroRollo: string,
  posicion: number,
  codigoBobinadora?: string | null,
): string {
  const base = `${numeroRollo}-C${posicion}`;
  return codigoBobinadora ? `${base}-${codigoBobinadora}` : base;
}


/**
 * Total de uniones del lote: suma de `uniones` de todas las cintas vigentes
 * (estado `registrada`); excluye anuladas y sustituidas e incluye la cinta que
 * se está imprimiendo.
 */
export function calcularTotalUniones(cintas: EtiquetaCinta[]): number {
  return cintas
    .filter((c) => (c.estado ?? "registrada") === "registrada")
    .reduce((acc, c) => acc + (Number(c.uniones) || 0), 0);
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
    // Identificador derivado SOLO para etiqueta/QR/snapshot. Nunca se persiste
    // como numero_rollo del lote.
    numero_rollo_etiqueta: buildNumeroRolloEtiqueta(
      snap.numero_rollo,
      cinta.posicion,
      codigoBobinadoraIxt(snap.bobinadora),
    ),

    orden_produccion: limpio(snap.numero_orden ?? null),
    peso_neto_rollo_kg: snap.peso_neto_rollo_kg ?? null,
    diametro_rollo_cm: snap.diametro_rollo_cm ?? null,
    uniones_rollo: snap.uniones_rollo ?? null,
    peso_mermas_kg: snap.peso_mermas_kg ?? null,
    porcentaje_peso_mermas: snap.porcentaje_peso_mermas ?? null,
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
    estatus_liberacion: cinta.estatus_liberacion ?? null,
    observaciones: limpio(cinta.observaciones),
    registrado_at: cinta.created_at ?? null,
    version_etiqueta: version,
    total_uniones_cintas: snap.total_uniones_cintas ?? calcularTotalUniones(snap.cintas ?? []),
    generado_at: generadoAt,
    qr_payload: {},
    trace_url: traceUrl,
    sap_url: sapUrl,
    // Fuente del QR/dato "Lote Logístico": el valor capturado en la propia
    // cinta (Lote Logístico pza.); en su defecto, el del lote/muestra.
    lote_logistico: limpio(cinta.lote_logistico_pza ?? snap.lote_logistico ?? null),
    url_qr_peso: "",
    url_qr_lote: "",
    sku_sap: limpio(cinta.sku_sap ?? null),
    url_qr_sku: "",
  };

  // TEXTO PLANO: solo el valor del dato. Si está vacío, no se genera QR y la
  // etiqueta muestra "Dato no disponible".
  {
    const p = fmtKg(data.peso_cinta_kg);
    data.url_qr_peso = p === "—" ? "" : p;
  }
  data.url_qr_lote = (data.lote_logistico ?? "").trim();
  data.url_qr_sku = (data.sku_sap ?? "").trim();

  data.qr_payload = {
    version_esquema_qr: 1,
    origen_rollo: data.origen_rollo,
    numero_rollo: data.numero_rollo,
    numero_rollo_original: data.numero_rollo,
    numero_rollo_etiqueta: data.numero_rollo_etiqueta,
    bobinadora_codigo: codigoBobinadoraIxt(snap.bobinadora),

    orden_produccion: data.orden_produccion,
    peso_neto_rollo_kg: data.peso_neto_rollo_kg,
    diametro_rollo_cm: data.diametro_rollo_cm,
    uniones_rollo: data.uniones_rollo,
    peso_mermas_kg: data.peso_mermas_kg,
    porcentaje_peso_mermas: data.porcentaje_peso_mermas,
    lote_id: data.lote_id,
    cinta_id: data.cinta_id,
    posicion: data.posicion,
    posicion_cinta: data.posicion,
    peso_cinta_kg: data.peso_cinta_kg,
    ancho_cinta_cm: data.ancho_cinta,
    uniones_cinta: data.uniones_cinta,
    total_uniones_cintas: data.total_uniones_cintas,
    estado_cinta: data.estado_cinta,
    estatus_liberacion: data.estatus_liberacion,
    lote_logistico: data.lote_logistico,
    estatus_liberacion_texto: data.estatus_liberacion ? (ESTATUS_CINTA_LABEL[data.estatus_liberacion] ?? data.estatus_liberacion) : null,
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
  qrPeso: string;
  qrLote: string;
  qrSku: string;
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
    fila("N.º Rollo / Cinta", d.numero_rollo_etiqueta),
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
    fila("Total de uniones", String(d.total_uniones_cintas)),
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

      ${d.observaciones ? (() => {
        const n = (d.observaciones ?? "").length;
        const fs = n > 320 ? "4pt" : n > 220 ? "5pt" : n > 120 ? "6pt" : "7pt";
        return `<div class="lbl-obs" style="font-size:${fs}">
          <span class="k">Obs.</span>
          <div class="lbl-obs-txt">${d.observaciones}</div>
        </div>`;
      })() : ""}

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

      ${d.observaciones ? (() => {
        const n = (d.observaciones ?? "").length;
        const fs = n > 320 ? "4pt" : n > 220 ? "5pt" : n > 120 ? "6pt" : "7pt";
        return `<div class="lbl-obs" style="font-size:${fs}">
          <span class="k">Obs.</span>
          <div class="lbl-obs-txt">${d.observaciones}</div>
        </div>`;
      })() : ""}

      ${d.estatus_liberacion || d.lote_logistico || d.sku_sap ? `<div class="lbl-meta">
        ${d.lote_logistico ? `<div class="lbl-meta-item"><span class="k">N° de ID SAP</span><span class="v">${d.lote_logistico}</span></div>` : ""}
        ${d.sku_sap ? `<div class="lbl-meta-item"><span class="k">SKU SAP</span><span class="v">${d.sku_sap}</span></div>` : ""}
        ${d.estatus_liberacion ? `<div class="lbl-meta-item"><span class="k">Estatus</span><span class="est-badge" style="background:${ESTATUS_CINTA_COLOR[d.estatus_liberacion] ?? "#555"}">${ESTATUS_CINTA_LABEL[d.estatus_liberacion] ?? d.estatus_liberacion}</span></div>` : ""}
      </div>` : ""}

      <div class="lbl-qr-zone">
        <div class="qr-box">
          ${assets.qrPeso ? `<img src="${assets.qrPeso}" alt="QR Peso" />` : `<div class="qr-na">Dato no disponible</div>`}
          <div class="qr-cap">Peso (kg)</div>
        </div>
        <div class="qr-box">
          ${assets.qrLote ? `<img src="${assets.qrLote}" alt="QR N° de ID SAP" />` : `<div class="qr-na">Dato no disponible</div>`}
          <div class="qr-cap">N° de ID SAP</div>
        </div>
        <div class="qr-box">
          ${assets.qrSku ? `<img src="${assets.qrSku}" alt="QR SKU SAP" />` : `<div class="qr-na">Dato no disponible</div>`}
          <div class="qr-val">${d.url_qr_sku || "Dato no disponible"}</div>
          <div class="qr-cap">SKU SAP</div>
        </div>
        <div class="qr-sap"><img src="${assets.sapLogo}" alt="SAP HANA" /></div>
      </div>
      <div class="lbl-ver">Versión de Etiqueta 2.1</div>
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
  // Si el dato está vacío no se genera QR; la etiqueta muestra "Dato no disponible".
  const qrPlano = (valor: string, opts: { margin: number; width: number; errorCorrectionLevel: "M" }) =>
    valor ? QRCode.toDataURL(valor, opts) : Promise.resolve("");
  const etiquetas = await Promise.all(
    datos.map(async (d) => {
      const opts = { margin: 1, width: 220, errorCorrectionLevel: "M" as const };
      const [qrPeso, qrLote, qrSku] = await Promise.all([
        qrPlano(d.url_qr_peso, opts),
        qrPlano(d.url_qr_lote, opts),
        qrPlano(d.url_qr_sku, opts),
      ]);
      return renderEtiqueta(d, snap, { logo: logoDataUrl, sapLogo: sapLogoDataUrl, qrPeso, qrLote, qrSku });
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
    border: 0;
    background: #fff;
    overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .print-label.empty { background: transparent; }
  .lbl-inner { padding: 3mm 3.2mm; height: 100%; display: flex; flex-direction: column; gap: 1.2mm; font-size: 8.5pt; line-height: 1.15; }
  .lbl-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 0.3mm solid #555; padding-bottom: 1.5mm; }
  .lbl-logo { display: block; height: 11mm; max-width: 52mm; object-fit: contain; }
  .lbl-sub { font-size: 7pt; color: #444; }
  .lbl-pos { font-size: 30pt; font-weight: 900; color: #111; line-height: 0.9; padding: 0 2mm; }
  .lbl-row { display: flex; gap: 3mm; }
  .lbl-row > div { flex: 1; display: flex; flex-direction: column; }
  .lbl-row > div.wide { flex: 2; }
  .k { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.3px; }
  .v { font-size: 9pt; font-weight: 700; color: #111; }
  .v.big { font-size: 13pt; }
  .lbl-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm 3mm; border-top: 0.2mm dashed #999; border-bottom: 0.2mm dashed #999; padding: 1.5mm 0; }
  .lbl-grid > div { display: flex; flex-direction: column; }
  .lbl-cinta { background: transparent; padding: 1.5mm 0; border-top: 0.2mm solid #999; border-bottom: 0.2mm solid #999; }
  .lbl-cinta-tit { font-size: 6.5pt; text-transform: uppercase; color: #111; font-weight: 700; margin-bottom: 1mm; }
  .lbl-obs { font-size: 7pt; padding-top: 1mm; border-top: 0.2mm dotted #999; display: block; max-height: 18mm; overflow: hidden; }
  .lbl-obs .k { display: block; margin-bottom: 0.4mm; }
  .lbl-obs-txt { word-break: break-word; overflow: hidden; line-height: 1.15; }
  .lbl-meta { display: flex; gap: 2mm; align-items: flex-start; flex-shrink: 0; padding-top: 1mm; border-top: 0.2mm dotted #999; }
  .lbl-meta-item { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6mm; }
  .lbl-qr-zone { flex-shrink: 0; }
  .est-badge { display: inline-block; padding: 0.6mm 2mm; border-radius: 1mm; color: #fff; font-size: 8pt; font-weight: 900; letter-spacing: 0.3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl-ver { font-size: 5pt; color: #555; text-align: right; white-space: nowrap; }

  .lbl-qr-zone { margin-top: auto; padding-top: 1.5mm; border-top: 0.3mm solid #555; display: flex; justify-content: space-around; align-items: flex-end; gap: 4mm; }
  .lbl-qr-zone .qr-box { display: flex; flex-direction: column; align-items: center; gap: 0.8mm; }
  .lbl-qr-zone .qr-box img { width: 20mm; height: 20mm; display: block; }
  .lbl-qr-zone .qr-box .qr-na { width: 20mm; height: 20mm; display: flex; align-items: center; justify-content: center; border: 0.3mm dashed #999; color: #666; font-size: 6pt; font-weight: 700; text-align: center; padding: 1mm; }
  .lbl-qr-zone .qr-cap { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #111; display: flex; align-items: center; justify-content: center; height: 4mm; }
  .lbl-qr-zone .qr-val { font-size: 6.5pt; font-weight: 700; color: #111; text-align: center; max-width: 22mm; word-break: break-all; line-height: 1.1; }
  .lbl-qr-zone .qr-saplogo { width: auto !important; height: 4mm !important; max-width: 22mm; object-fit: contain; }
  .lbl-qr-zone .qr-box img { width: 15mm; height: 15mm; }
  .lbl-qr-zone .qr-box .qr-na { width: 15mm; height: 15mm; }
  .lbl-qr-zone .qr-sap { display: flex; align-items: flex-end; }
  .lbl-qr-zone .qr-sap img { height: 6mm; max-width: 18mm; object-fit: contain; }
  @media screen {
    body { background: #eee; padding: 20px; }
    .print-page { margin: 0 auto 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); background: #fff; }
    .print-toolbar { max-width: 215.9mm; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 8px; }
    .print-toolbar button { padding: 8px 14px; border: 0; background: #333; color: #fff; border-radius: 6px; cursor: pointer; font-weight: 600; }
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
