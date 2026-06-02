import QRCode from "qrcode";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/logo-convertipap.png";
import type { Measurement, GeneralInfo } from "@/lib/qc-data";
import { buildTraceUrl } from "@/lib/roll-report";
import { resolveRolloStatus } from "@/lib/roll-status";

export type RollLabelData = {
  m: Measurement;
  info: GeneralInfo;
  plantName: string;
  productoNombre: string;
};

// El estatus impreso SIEMPRE proviene de resolveRolloStatus().
// `Measurement.estatus` es solo la sugerencia del capturista (referencia interna).

function parseNotas(notas: string): string[] {
  return notas.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function check(active: boolean) {
  return active ? "☑" : "☐";
}

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

export async function printRollLabel(data: RollLabelData) {
  const { m, info, plantName, productoNombre } = data;
  const folio = `${info.maquina}-${info.fecha}-${m.rollo}`.replace(/\s+/g, "");
  // Estatus unificado: dictamen de Calidad > "pendiente_revision".
  const est = resolveRolloStatus({
    rolloId: m.rollo,
    folio,
    legacyEstatus: m.estatus, // sugerencia del capturista como respaldo si no existe dictamen real
  });
  const notas = parseNotas(m.notas || "");
  const has = (k: string) => notas.some((n) => n.includes(k));
  const fechaImpresion = new Date().toLocaleDateString("es-MX");

  const folio = `${info.maquina}-${info.fecha}-${m.rollo}`.replace(/\s+/g, "");
  const traceUrl = buildTraceUrl(folio);
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    QRCode.toDataURL(traceUrl, { margin: 1, width: 200, errorCorrectionLevel: "M" }),
    toDataUrl(logoUrl),
  ]);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiqueta de Liberación</title>
<style>
  @page { size: auto; margin: 8mm; }
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Inter,Roboto,sans-serif}
  body{margin:0;padding:18px;color:#0f172a;background:#fff}
  .sheet{max-width:780px;margin:0 auto;border:2px solid #0f172a}
  table{width:100%;border-collapse:collapse}
  td,th{border:1px solid #0f172a;padding:4px 8px;font-size:11px;vertical-align:middle}
  .head td{padding:6px 8px}
  .logo-cell{text-align:center;padding:8px}
  .logo-cell img{max-width:150px;max-height:70px;object-fit:contain}
  .title{text-align:center;font-weight:800;font-size:13px}
  .sub{text-align:center;font-weight:700;font-size:12px;letter-spacing:.05em}
  .meta{font-size:9px;line-height:1.4}
  .label{background:#f1f5f9;font-weight:700;text-align:right;width:22%}
  .val{font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
  .big{font-size:14px}
  .fab{background:#e2e8f0;font-weight:800;text-align:center;font-size:12px;padding:8px}
  .producto{background:#fff;font-weight:800;text-align:center;font-size:13px;padding:10px}
  .codigo{background:#f1f5f9;font-weight:700;text-align:center;font-size:11px}
  .estatus{padding:10px;text-align:center;font-weight:800;font-size:16px;letter-spacing:.12em;color:${est.color};background:${est.bg}}
  .obs td{padding:6px 8px}
  .obs .ck{font-family:"Segoe UI Symbol",sans-serif;font-size:13px;margin-right:4px}
  .qr-box{text-align:center;padding:6px}
  .qr-box img{width:110px;height:110px;display:block;margin:0 auto}
  .qr-box .cap{font-size:8px;color:#475569;margin-top:3px;letter-spacing:.04em;text-transform:uppercase}
  .qr-box .url{font-family:ui-monospace,Menlo,monospace;font-size:7px;color:#334155;word-break:break-all;margin-top:2px;line-height:1.2}
  .actions{max-width:780px;margin:0 auto 12px;text-align:right}
  .actions button{padding:8px 14px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:12px;cursor:pointer}
  @media print{body{padding:0}.actions{display:none}}
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Imprimir</button></div>
<div class="sheet">
  <!-- Encabezado -->
  <table class="head">
    <tr>
      <td class="logo-cell" style="width:22%" rowspan="2">
        <img src="${logoDataUrl}" alt="Convertipap" />
      </td>
      <td class="title">CONVERTIDOR DE PAPEL S.A. DE C.V</td>
      <td class="meta" style="width:26%" rowspan="2">
        CÓDIGO: FOR-CAL-04<br/>
        REVISIÓN: 0<br/>
        FECHA DE EMISIÓN: 05-03-2026<br/>
        FECHA DE ACTUALIZACIÓN: 05-03-2026<br/>
        IMPRESIÓN: ${fechaImpresion}
      </td>
    </tr>
    <tr><td class="sub">ETIQUETA DE LIBERACIÓN</td></tr>
  </table>

  <!-- Rollo / Fecha -->
  <table>
    <tr>
      <td class="label">No. Rollo</td>
      <td class="val big" style="width:28%">${m.rollo}</td>
      <td class="label">Fecha</td>
      <td class="val big">${info.fecha}</td>
    </tr>
    <tr>
      <td class="label">Hora</td>
      <td class="val">${m.hora}</td>
      <td class="label">Turno</td>
      <td class="val">T${info.turno} · ${plantName} · ${info.maquina}</td>
    </tr>
  </table>

  <!-- Fabricación / Producto / Personal -->
  <table>
    <tr>
      <td class="fab" style="width:30%">Fabricación ${info.maquina}:</td>
      <td colspan="3" class="producto">${productoNombre.toUpperCase()}</td>
    </tr>
    <tr>
      <td class="codigo">Código de fabricación:<br/><span style="font-size:13px">${info.fabricacion}</span></td>
      <td class="label">Jefe de MQ</td>
      <td colspan="2" class="val">${info.jefeMaquina || "—"}</td>
    </tr>
    <tr>
      <td rowspan="2"></td>
      <td class="label">Conductor</td>
      <td colspan="2" class="val">${info.operador || "—"}</td>
    </tr>
    <tr>
      <td class="label">Analista</td>
      <td colspan="2" class="val">${info.analista || "—"}</td>
    </tr>
  </table>

  <!-- Variables de calidad -->
  <table>
    <tr>
      <td class="label">Peso Base</td><td class="val">${m.pesoBase ?? "—"}</td>
      <td class="label">Humedad</td><td class="val">${m.humedad ?? "—"}</td>
    </tr>
    <tr>
      <td class="label">Calibre</td><td class="val">${m.calibre ?? "—"}</td>
      <td class="label">Blancura R457</td><td class="val">${m.blancuraR457 ?? "—"}</td>
    </tr>
    <tr>
      <td class="label">Tensión MD</td><td class="val">${m.tensionMD ?? "—"}</td>
      <td class="label">a*</td><td class="val">${m.blancuraA ?? "—"}</td>
    </tr>
    <tr>
      <td class="label">Tensión CD</td><td class="val">${m.tensionCD ?? "—"}</td>
      <td class="label">b*</td><td class="val">${m.blancuraB ?? "—"}</td>
    </tr>
    <tr>
      <td class="label">Rel. MD/CD</td><td class="val">${m.relMDCD ?? "—"}</td>
      <td class="label">Elongación MD</td><td class="val">${m.elongMD ?? "—"} %</td>
    </tr>
    <tr>
      <td class="label">Ancho útil</td><td class="val">${m.anchoUtil ?? "—"} cm</td>
      <td class="label">Peso del rollo</td><td class="val">${m.pesoRollo ?? "—"} kg</td>
    </tr>
  </table>

  <!-- Observaciones / Comentarios / QR -->
  <table class="obs">
    <tr>
      <td style="width:26%;vertical-align:top">
        <div style="font-weight:700;margin-bottom:4px">Observaciones:</div>
        <div><span class="ck">${check(has("arruga"))}</span>Arruga</div>
        <div><span class="ck">${check(has("picad"))}</span>Picado</div>
        <div><span class="ck">${check(has("porosidad"))}</span>Porosidad</div>
        <div><span class="ck">${check(has("hoyo"))}</span>Hoyos / Hoyos por gomas</div>
        <div><span class="ck">${check(has("suciedad") || has("mancha") || has("desfase") || has("destase"))}</span>Otro</div>
      </td>
      <td style="vertical-align:top">
        <div style="font-weight:700;margin-bottom:4px">Comentarios</div>
        <div style="min-height:48px;font-size:12px">${m.notas || "—"}</div>
        <table style="margin-top:6px">
          <tr>
            <td class="label" style="width:35%">DIÁMETRO</td>
            <td class="val">${m.diametro ?? "—"} cm</td>
            <td class="label" style="width:20%">Uniones</td>
            <td class="val" style="width:15%">${m.uniones ?? 0}</td>
          </tr>
        </table>
      </td>
      <td class="qr-box" style="width:22%;vertical-align:middle">
        <img src="${qrDataUrl}" alt="QR de verificación" />
        <div class="cap">Verificar datos</div>
        <div class="url">${traceUrl}</div>
      </td>
    </tr>
  </table>

  <!-- Estatus -->
  <div class="estatus">ESTATUS: ${est.txt}</div>
</div>
</body>
</html>`;

  // Renderizar dentro de un iframe aislado para evitar heredar los estilos
  // globales del proyecto (que usan oklch() y rompen html2canvas).
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;background:#fff;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html.replace(/<script[\s\S]*?<\/script>/g, ""));
    doc.close();

    // Esperar a que carguen las imágenes (logo + QR) dentro del iframe
    await new Promise<void>((resolve) => {
      const imgs = Array.from(doc.images);
      if (imgs.length === 0) return resolve();
      let pending = imgs.length;
      const done = () => { if (--pending <= 0) resolve(); };
      imgs.forEach((img) => {
        if (img.complete) done();
        else { img.addEventListener("load", done); img.addEventListener("error", done); }
      });
      setTimeout(resolve, 2500);
    });

    const target = doc.querySelector(".sheet") as HTMLElement | null;
    if (!target) return;

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 820,
    });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableW = pageW - margin * 2;
    const ratio = canvas.height / canvas.width;
    let imgW = usableW;
    let imgH = imgW * ratio;
    if (imgH > pageH - margin * 2) {
      imgH = pageH - margin * 2;
      imgW = imgH / ratio;
    }
    const x = (pageW - imgW) / 2;
    pdf.addImage(img, "PNG", x, margin, imgW, imgH);
    pdf.save(`Etiqueta_Rollo_${m.rollo}.pdf`);
  } finally {
    iframe.remove();
  }
}
