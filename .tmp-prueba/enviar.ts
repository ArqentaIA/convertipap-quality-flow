import { writeFileSync } from "fs";
import { construirReporteVisores, construirResumenEjecutivoDiario } from "@/lib/reporte-visores.server";
import { sendSystemEmail } from "@/lib/email.server";
const TO = ["direccion@imr-intelligence.pro"];
const att = (r: any) => [
  { filename: r.fileName, content: Buffer.from(r.buffer).toString("base64"), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { filename: "logo-convertipap.png", content: r.logoBase64, contentType: "image/png", contentId: r.logoCid },
  { filename: "logo-irm.png", content: r.irmLogoBase64, contentType: "image/png", contentId: r.irmLogoCid },
];
const t1: any = await construirReporteVisores(undefined, { referencia: new Date("2026-10-07T20:59:00Z") });
const d: any = await construirResumenEjecutivoDiario("2026-10-06");
writeFileSync("/tmp/t1.html", t1.html); writeFileSync("/tmp/d.html", d.html);
writeFileSync("/tmp/"+t1.fileName, Buffer.from(t1.buffer)); writeFileSync("/tmp/"+d.fileName, Buffer.from(d.buffer));
for (const r of [t1, d]) {
  const res = await sendSystemEmail({ to: TO, subject: "[PRUEBA] " + r.subject, html: r.html, text: r.texto, attachments: att(r) });
  console.log(r.subject, r.fileName, JSON.stringify(res).slice(0, 200));
}
