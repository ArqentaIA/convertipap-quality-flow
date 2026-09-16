import { createFileRoute } from "@tanstack/react-router";
import { construirReporteVisores } from "@/lib/reporte-visores.server";
import { sendSystemEmail, SYSTEM_EMAIL_FROM } from "@/lib/email.server";

const TOKEN = "envio-reporte-20260916-1825";

export const Route = createFileRoute("/api/public/envio-reporte-temporal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-preview-token") !== TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }
        const reporte = await construirReporteVisores();
        const resultado = await sendSystemEmail({
          to: "direccion@imr-intelligence.pro",
          subject: "PRUEBA REAL — REPORTE DE VISORES CON NUEVO LOGOTIPO",
          html: reporte.html,
          text: reporte.texto,
          attachments: [
            {
              filename: "logo-convertipap.png",
              content: reporte.logoBase64,
              contentType: "image/png",
              contentId: reporte.logoCid,
            },
            {
              filename: reporte.fileName,
              content: Buffer.from(reporte.buffer).toString("base64"),
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });
        return Response.json({
          ...resultado,
          from: SYSTEM_EMAIL_FROM,
          to: "direccion@imr-intelligence.pro",
          fileName: reporte.fileName,
          bytes: reporte.buffer.byteLength,
          logoEmbedded: Boolean(reporte.logoBase64),
        });
      },
    },
  },
});