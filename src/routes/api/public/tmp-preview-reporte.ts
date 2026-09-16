// TEMPORAL: solo para generar la vista previa del correo y del PDF. No envía correo.
import { createFileRoute } from "@tanstack/react-router";
import { construirReporteVisores } from "@/lib/reporte-visores.server";

export const Route = createFileRoute("/api/public/tmp-preview-reporte")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-tmp-token") !== "preview-visores-2026") {
          return new Response("no", { status: 401 });
        }
        const rep = await construirReporteVisores();
        return Response.json({
          html: rep.html,
          pdfName: rep.pdfName,
          pdfBase64: Buffer.from(rep.pdf as ArrayBuffer).toString("base64"),
          logoBase64: rep.logoBase64,
          logoCid: rep.logoCid,
        });
      },
    },
  },
});
