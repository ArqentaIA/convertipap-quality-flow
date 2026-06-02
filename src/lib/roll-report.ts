import QRCode from "qrcode";
import { resolveRolloStatus } from "@/lib/roll-status";

export type RollReportMetric = {
  label: string;
  value: string | number;
  unit?: string;
  status?: "L" | "NC" | "C";
};

export type RollReportData = {
  folio: string;
  rollo?: string;
  ordenId?: string;
  maquina: string;
  planta: string;
  turno: string;
  operador: string;
  jefeMaquina?: string;
  fecha: string;
  hora?: string;
  producto: string;
  /** Estatus legado (sugerido). El estatus final se calcula con resolveRolloStatus(). */
  estatus: "L" | "NC" | "C";
  metricas: RollReportMetric[];
  notas?: string;
};

const TRACEABILITY_BASE_URL = "https://www.convertipap.site";

/**
 * Build the canonical traceability URL embedded in the QR code.
 * Backend persistence is pending; this URL will resolve to the registry
 * detail page when the API is connected.
 */
export function buildTraceUrl(folio: string): string {
  return `${TRACEABILITY_BASE_URL}/t/${encodeURIComponent(folio)}`;
}

export async function printRollReport(data: RollReportData) {
  const traceUrl = buildTraceUrl(data.folio);
  const qrDataUrl = await QRCode.toDataURL(traceUrl, {
    margin: 1,
    width: 220,
    errorCorrectionLevel: "M",
  });

  const est = resolveRolloStatus({
    rolloId: data.rollo,
    folio: data.folio,
    ordenId: data.ordenId,
    legacyEstatus: data.estatus,
  });
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte de rollo · ${data.folio}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#0f172a;margin:0;padding:24px;background:#fff}
  .sheet{max-width:780px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#475569}
  h1{font-size:22px;margin:4px 0 0;letter-spacing:-.01em}
  .folio{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#475569;margin-top:2px}
  .badge{display:inline-block;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#fff;background:${est.color}}
  .grid{display:grid;grid-template-columns:1fr 240px;gap:24px}
  .info{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;font-size:12px}
  .info div{display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:6px 0}
  .info span:first-child{color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-size:10px}
  .info span:last-child{font-weight:600;text-align:right}
  .qr{text-align:center;border:1px solid #e2e8f0;border-radius:10px;padding:12px}
  .qr img{display:block;margin:0 auto;width:200px;height:200px}
  .qr .cap{font-size:10px;color:#64748b;margin-top:6px;letter-spacing:.05em;text-transform:uppercase}
  .qr .url{font-family:ui-monospace,Menlo,monospace;font-size:9px;color:#334155;word-break:break-all;margin-top:4px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#334155;margin:22px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #f1f5f9}
  th{background:#f8fafc;text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:#475569;font-weight:600}
  td.val{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
  .pill.L{background:#dcfce7;color:#15803d}
  .pill.NC{background:#fee2e2;color:#b91c1c}
  .pill.C{background:#fef3c7;color:#a16207}
  footer{margin-top:24px;display:flex;justify-content:space-between;font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px}
  .notas{margin-top:14px;padding:10px 12px;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:4px;font-size:11px;color:#334155}
  @media print{body{padding:0}.sheet{border:none}.noprint{display:none}}
  .actions{margin:0 auto 16px;max-width:780px;text-align:right}
  .actions button{padding:8px 14px;border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:6px;font-size:12px;cursor:pointer}
</style>
</head>
<body>
<div class="actions noprint"><button onclick="window.print()">Imprimir</button></div>
<div class="sheet">
  <header>
    <div>
      <div class="brand">ConvertiPap · Control de Calidad</div>
      <h1>Reporte de rollo · trazabilidad</h1>
      <div class="folio">Folio: <strong>${data.folio}</strong>${data.rollo ? ` · Rollo: <strong>${data.rollo}</strong>` : ""}</div>
    </div>
    <span class="badge">${est.txt}</span>
  </header>

  <div class="grid">
    <div class="info">
      <div><span>Planta</span><span>${data.planta}</span></div>
      <div><span>Máquina</span><span>${data.maquina}</span></div>
      <div><span>Turno</span><span>T${data.turno}</span></div>
      <div><span>Fecha</span><span>${data.fecha}${data.hora ? ` · ${data.hora}` : ""}</span></div>
      <div><span>Operador</span><span>${data.operador}</span></div>
      ${data.jefeMaquina ? `<div><span>Jefe de máquina</span><span>${data.jefeMaquina}</span></div>` : ""}
      <div style="grid-column:1/-1"><span>Producto</span><span>${data.producto}</span></div>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR ${data.folio}" />
      <div class="cap">Escanear para validar</div>
      <div class="url">${traceUrl}</div>
    </div>
  </div>

  <div class="notas" style="margin-top:18px;border-left-color:#0f172a">
    <strong>Métricas de calidad protegidas.</strong> Los valores detallados (calibre, humedad, peso base, tensión, cumplimiento y estatus por variable) no se imprimen en este documento por política de trazabilidad. Escanee el código QR superior para consultarlos en el sistema, donde se valida la autenticidad del folio y se registra el acceso para auditoría.
  </div>

  ${data.notas ? `<div class="notas"><strong>Notas:</strong> ${data.notas}</div>` : ""}

  <footer>
    <span>Documento generado: ${new Date().toLocaleString()}</span>
    <span>QR ligado a folio interno · uso para auditoría y trazabilidad</span>
  </footer>
</div>
<script>setTimeout(()=>window.print(),350)</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("Habilita las ventanas emergentes para imprimir el reporte.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
