// Generador de HTML imprimible para etiquetas de Pesaje de Cintas.
// Formato fijo: hoja Carta (215.9 × 279.4 mm), 4 etiquetas por hoja
// (2×2), etiqueta de 97.95 × 129.70 mm, separación de 10 mm, margen 5 mm.
// Nunca escalar. Nunca "responsive". Nunca centrar cuando hay una sola.
// Muestra "Fabricación", nunca "Máquina". El número grande superior derecho
// es la POSICIÓN de la cinta.

type Medicion = { valor: number; min: number; obj: number; max: number };

export type EtiquetaSnapshot = {
  lote_id: string;
  numero_rollo: string;
  fabricacion: string;
  producto_codigo: string | null;
  producto_nombre: string | null;
  fecha_produccion: string | null;
  conductor: string;
  bobinadora: string;
  datos_calidad: {
    turno?: string;
    jefe_maquina?: string | null;
    operador?: string | null;
    prensero?: string | null;
    analista?: string | null;
    mediciones?: Record<string, Medicion>;
  } & Record<string, unknown>;
  cintas: Array<{
    id: string;
    posicion: number;
    uniones: number;
    peso_cinta_kg: number;
    ancho_util: number;
    ancho_util_unidad: string | null;
    observaciones: string | null;
  }>;
};

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

function renderEtiqueta(snap: EtiquetaSnapshot, cinta: EtiquetaSnapshot["cintas"][number]): string {
  const dc = snap.datos_calidad ?? {};
  const fecha = snap.fecha_produccion ?? "";
  // Fuente única de verdad para el PESO impreso: peso individual de esta cinta
  // (public.pesajes_cintas.peso_cinta_kg de la versión vigente = 'registrada').
  // No usar peso neto de bobina madre, snapshot general del lote, acumulado,
  // pendiente ni merma. Cada etiqueta muestra el peso de SU propia cinta.
  const pesoEtiquetaKg = cinta.peso_cinta_kg;
  return `
  <div class="print-label">
    <div class="lbl-inner">
      <div class="lbl-header">
        <div class="lbl-title">
          <div class="lbl-brand">CONVERTIPAP</div>
          <div class="lbl-sub">Etiqueta de Cinta · Producción</div>
        </div>
        <div class="lbl-pos">${cinta.posicion}</div>
      </div>

      <div class="lbl-row">
        <div><span class="k">N.º Rollo</span><span class="v">${snap.numero_rollo}</span></div>
        <div><span class="k">Fecha</span><span class="v">${fecha}</span></div>
      </div>

      <div class="lbl-row">
        <div><span class="k">Fabricación</span><span class="v">${snap.fabricacion || "—"}</span></div>
        <div><span class="k">Turno</span><span class="v">${dc.turno ?? "—"}</span></div>
      </div>

      <div class="lbl-row">
        <div class="wide"><span class="k">Producto</span><span class="v">${snap.producto_nombre ?? snap.producto_codigo ?? "—"}</span></div>
      </div>

      <div class="lbl-grid">
        <div><span class="k">${VAR_LABEL.pesoBase}</span><span class="v">${med(snap,"pesoBase")}</span></div>
        <div><span class="k">${VAR_LABEL.calibre}</span><span class="v">${med(snap,"calibre")}</span></div>
        <div><span class="k">${VAR_LABEL.tensionMD}</span><span class="v">${med(snap,"tensionMD")}</span></div>
        <div><span class="k">${VAR_LABEL.tensionCD}</span><span class="v">${med(snap,"tensionCD")}</span></div>
        <div><span class="k">${VAR_LABEL.tensionRH}</span><span class="v">${med(snap,"tensionRH")}</span></div>
        <div><span class="k">${VAR_LABEL.humedad}</span><span class="v">${med(snap,"humedad")}</span></div>
        <div><span class="k">${VAR_LABEL.blancuraR457}</span><span class="v">${med(snap,"blancuraR457")}</span></div>
        <div><span class="k">${VAR_LABEL.elongMD}</span><span class="v">${med(snap,"elongMD")}</span></div>
      </div>

      <div class="lbl-cinta">
        <div class="lbl-cinta-tit">Datos de la cinta</div>
        <div class="lbl-row">
          <div><span class="k">Peso</span><span class="v big">${fmtKg(pesoEtiquetaKg)} kg</span></div>
          <div><span class="k">Ancho útil</span><span class="v">${cinta.ancho_util} ${cinta.ancho_util_unidad ?? "cm"}</span></div>
          <div><span class="k">Uniones</span><span class="v">${cinta.uniones}</span></div>
        </div>
      </div>

      <div class="lbl-row">
        <div><span class="k">Conductor</span><span class="v">${snap.conductor}</span></div>
        <div><span class="k">Bobinadora</span><span class="v">${snap.bobinadora}</span></div>
      </div>

      <div class="lbl-row">
        <div><span class="k">Supervisor</span><span class="v">${dc.jefe_maquina ?? "—"}</span></div>
        <div><span class="k">Analista</span><span class="v">${dc.analista ?? "—"}</span></div>
      </div>

      ${cinta.observaciones ? `<div class="lbl-obs"><span class="k">Obs.</span> ${cinta.observaciones}</div>` : ""}
    </div>
  </div>`;
}

export function abrirImpresionEtiquetas(snap: EtiquetaSnapshot): void {
  const cintas = [...snap.cintas].sort((a, b) => a.posicion - b.posicion);
  const paginas: string[] = [];
  for (let i = 0; i < cintas.length; i += 4) {
    const bloque = cintas.slice(i, i + 4);
    const celdas = [0, 1, 2, 3].map((j) => bloque[j] ? renderEtiqueta(snap, bloque[j]) : `<div class="print-label empty"></div>`).join("");
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
  .lbl-brand { font-weight: 800; font-size: 10.5pt; letter-spacing: 0.5px; color: #0a3d1f; }
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
  .lbl-obs { font-size: 7pt; margin-top: auto; padding-top: 1mm; border-top: 0.2mm dotted #0a3d1f88; }
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

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!w) {
    alert("Habilita las ventanas emergentes para imprimir las etiquetas.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
