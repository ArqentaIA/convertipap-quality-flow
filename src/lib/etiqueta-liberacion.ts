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

  // Mediciones en dos columnas
  const left: string[] = [];
  const right: string[] = [];
  data.mediciones.forEach((m, i) => {
    const cell = row(m.etiqueta, m.valor ?? "", m.unidad);
    (i % 2 === 0 ? left : right).push(cell);
  });

  const defectosSet = new Set((data.defectos ?? []).map((d) => d.toLowerCase()));
  const obsHtml = OBS_OPCIONES.map(
    (o) => `<label class="ck"><input type="checkbox" ${defectosSet.has(o.toLowerCase()) ? "checked" : ""} /> ${esc(o)}</label>`,
  ).join("");

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

  /* Hoja Media Carta Vertical (5.5" x 8.5") — usa 100% del área */
  .sheet{width:140mm;min-height:216mm;margin:0 auto;background:#fff;border:2px solid #0f172a;display:flex;flex-direction:column}

  /* Encabezado — logo más grande */
  .head{display:grid;grid-template-columns:78px 1fr;border-bottom:2px solid #0f172a}
  .head .brand{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #0f172a}
  .head .brand img{max-width:72px;max-height:72px;object-fit:contain;display:block}
  .head .title{padding:8px 10px;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .head .title b{font-size:12px;color:#475569;letter-spacing:.04em}
  .head .title .sub{font-size:18px;font-weight:900;letter-spacing:.14em;margin-top:3px}
  .head .meta-bar{grid-column:1/-1;display:flex;justify-content:space-between;font-size:10px;color:#475569;padding:4px 10px;border-top:1px solid #cbd5e1;background:#f8fafc;letter-spacing:.02em}

  /* Bloque hero: No. Rollo + Producto */
  .hero{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #0f172a}
  .hero .rollo{padding:12px 14px;background:#0f172a;color:#fff;display:flex;flex-direction:column;justify-content:center}
  .hero .rollo .tag{font-size:11px;letter-spacing:.18em;color:#94a3b8;text-transform:uppercase;font-weight:700}
  .hero .rollo .num{font-size:54px;font-weight:900;line-height:1;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums}
  .hero .producto{padding:12px 14px;display:flex;flex-direction:column;justify-content:center;background:#fff}
  .hero .producto .tag{font-size:11px;letter-spacing:.18em;color:#64748b;text-transform:uppercase;font-weight:700}
  .hero .producto .nombre{font-size:20px;font-weight:900;line-height:1.1;margin-top:5px;color:#0f172a;letter-spacing:-.01em}
  .hero .producto .codigo{font-size:12px;color:#475569;margin-top:5px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}

  /* Banda meta */
  .meta-band{display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;border-bottom:2px solid #0f172a}
  .meta-band > div{padding:8px 10px;border-right:1px solid #0f172a}
  .meta-band > div:last-child{border-right:0}
  .meta-band .k{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
  .meta-band .v{font-size:16px;font-weight:800;color:#0f172a;margin-top:3px;font-variant-numeric:tabular-nums;line-height:1.1}
  .meta-band .v.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.02em}

  /* Personal */
  .personal{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:2px solid #0f172a;background:#f8fafc}
  .personal > div{padding:7px 10px;border-right:1px solid #cbd5e1}
  .personal > div:last-child{border-right:0}
  .personal .k{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
  .personal .v{font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  /* Mediciones */
  .mediciones-title{padding:6px 12px;background:#0f172a;color:#fff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .mediciones{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #0f172a}
  .mediciones > div{padding:0}
  .mediciones > div + div{border-left:1px solid #0f172a}
  .mediciones table{border-collapse:collapse;width:100%}
  .mediciones table td{border-bottom:1px solid #e2e8f0;padding:6px 10px;font-size:14px}
  td.lbl{background:#f1f5f9;font-weight:700;text-align:right;width:50%;color:#334155}
  td.val{font-weight:800;text-align:left;font-variant-numeric:tabular-nums;color:#0f172a;font-size:15px}
  td.val .u{font-weight:500;color:#64748b;margin-left:3px;font-size:12px}

  /* Observaciones + QR */
  .obs-block{display:grid;grid-template-columns:1fr 160px;border-bottom:2px solid #0f172a}
  .obs-block > div{padding:10px 12px;border-right:1px solid #0f172a}
  .obs-block > div:last-child{border-right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc}
  .obs-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#475569;margin-bottom:6px}
  .ck{display:flex;align-items:center;gap:7px;font-size:13px;padding:2px 0;color:#1e293b;font-weight:600}
  .ck input{width:14px;height:14px}
  .comentarios{min-height:60px;font-size:13px;line-height:1.4;color:#1e293b;white-space:pre-wrap}
  .qr-box img{width:128px;height:128px;display:block}
  .qr-box .cap{font-size:10px;color:#475569;margin-top:4px;text-align:center;letter-spacing:.08em;text-transform:uppercase;font-weight:700}

  /* Estatus */
  .estatus{display:grid;grid-template-columns:110px 1fr;align-items:stretch;border-bottom:1px solid #0f172a}
  .estatus .lbl-e{background:#0f172a;color:#fff;font-weight:900;font-size:16px;text-align:center;padding:18px 8px;letter-spacing:.16em;display:flex;align-items:center;justify-content:center}
  .estatus .val-e{padding:18px 8px;text-align:center;font-weight:900;font-size:36px;letter-spacing:.18em;color:${estatusColor};background:${estatusBg};display:flex;align-items:center;justify-content:center}

  .foot{padding:5px 12px;font-size:9.5px;color:#64748b;text-align:right;margin-top:auto}

  @page{size:5.5in 8.5in;margin:4mm}
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
    </div>

    <div class="meta-band">
      <div><div class="k">Fecha</div><div class="v">${esc(data.fecha)}</div></div>
      <div><div class="k">Turno</div><div class="v">${data.turno ? esc(String(data.turno)) : "—"}</div></div>
      <div><div class="k">Máquina</div><div class="v">${esc(data.maquinaCodigo)}</div></div>
      <div><div class="k">Folio</div><div class="v mono">${esc(data.folio)}</div></div>
    </div>

    <div class="personal">
      <div><div class="k">Jefe de Máquina</div><div class="v">${esc(data.jefeMaquina || "—")}</div></div>
      <div><div class="k">Operador</div><div class="v">${esc(data.operador || "—")}</div></div>
      <div><div class="k">Prensero</div><div class="v">${esc(data.prensero || "—")}</div></div>
      <div><div class="k">Analista</div><div class="v">${esc(data.analista || "—")}</div></div>
    </div>

    <div class="mediciones-title">Resultados de Calidad</div>
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
        ${
          data.estatus === "LIBERADO C/JUSTIF"
            ? (() => {
                const j = (data.justificacionLiberacion ?? "").trim();
                const texto = j.length > 0 ? j : "SIN JUSTIFICACIÓN";
                return `<div style="margin-top:8px;padding:6px 8px;border-left:3px solid #ca8a04;background:#fef9c3;border-radius:4px;font-size:10px;line-height:1.4;word-wrap:break-word;overflow-wrap:anywhere">
                 <div style="font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#854d0e;font-size:8.5px;margin-bottom:3px">Justificación de Liberación · Capturista</div>
                 <div style="color:#1e293b;white-space:pre-wrap">${esc(texto)}</div>
               </div>`;
              })()
            : ""
        }
        ${
          data.autorizacion
            ? `<div style="margin-top:8px;padding:6px 8px;border-left:3px solid #b45309;background:#fffbeb;border-radius:4px;font-size:9.5px;line-height:1.35">
                 <div style="font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#92400e;font-size:8.5px;margin-bottom:3px">Justificación · Gerente de Calidad</div>
                 <div style="color:#1e293b"><b>Dictamen:</b> ${esc(
                   data.autorizacion.dictamen === "liberada"
                     ? "Liberada"
                     : data.autorizacion.dictamen === "concesion"
                     ? "Concesión"
                     : data.autorizacion.dictamen === "rechazada"
                     ? "Rechazada"
                     : String(data.autorizacion.dictamen),
                 )}${data.autorizacion.motivo ? ` · <b>Motivo:</b> ${esc(data.autorizacion.motivo)}` : ""}</div>
                 <div style="color:#1e293b;white-space:pre-wrap;margin-top:3px">${esc(data.autorizacion.observaciones || "—")}</div>
               </div>`
            : ""
        }
      </div>
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="QR muestra" />
        <div class="cap">Verificar</div>
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
  const qrDataUrl = await QRCode.toDataURL(traceUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
  const logoDataUrl = await toDataUrl(logoUrl);
  const html = buildHtml(data, qrDataUrl, logoDataUrl);
  const w = window.open("", "_blank", "width=960,height=900");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana. Permite popups para imprimir la etiqueta.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
