import { createFileRoute } from "@tanstack/react-router";
import { construirReporteVisores } from "@/lib/reporte-visores.server";

export const Route = createFileRoute("/api/public/tmp-preview-correo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("x-tmp-token") !== "preview-correo-2026") {
          return new Response("no", { status: 401 });
        }
        const r = await construirReporteVisores();
        return new Response(r.html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
