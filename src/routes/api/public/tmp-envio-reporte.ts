// TEMPORAL — envío manual de prueba del reporte de visores. Eliminar tras usar.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmp-envio-reporte")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-tmp-token");
        if (token !== "envio-prueba-visores-2026") {
          return new Response("no", { status: 401 });
        }
        const { construirReporteVisores } = await import("@/lib/reporte-visores.server");
        const { sendSystemEmail } = await import("@/lib/email.server");
        const rep = await construirReporteVisores();
        const base64 = Buffer.from(rep.buffer as ArrayBuffer).toString("base64");
        if (request.headers.get("x-dump") === "1") {
          return new Response(base64, { headers: { "content-type": "text/plain" } });
        }
        const result = await sendSystemEmail({
          to: "direccion@imr-intelligence.pro",
          subject: "PRUEBA MANUAL DE REPORTE DE VISORES — DASHBOARD Y GRÁFICAS",
          html: rep.html,
          text: rep.texto,
          attachments: [{ filename: rep.fileName, content: base64 }],
        });
        return Response.json({
          ok: result.ok,
          id: result.ok ? result.id : null,
          error: result.ok ? null : result.error,
          fileName: rep.fileName,
          bytes: (rep.buffer as ArrayBuffer).byteLength,
          maquinas: rep.resumen.map((r) => r.codigo),
        });
      },
    },
  },
});
