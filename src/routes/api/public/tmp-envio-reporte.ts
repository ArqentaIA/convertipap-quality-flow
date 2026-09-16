import { createFileRoute } from "@tanstack/react-router";
import { construirReporteVisores, MAQUINAS_REPORTE } from "@/lib/reporte-visores.server";
import { sendSystemEmail } from "@/lib/email.server";

const TOKEN = "envio-prueba-visores-2026";

export const Route = createFileRoute("/api/public/tmp-envio-reporte")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-tmp-token") !== TOKEN) {
          return Response.json({ ok: false, error: "token inválido" }, { status: 401 });
        }
        try {
          const rep = await construirReporteVisores();
          const base64 = Buffer.from(rep.buffer as ArrayBuffer).toString("base64");
          let id: string | null = null;
          let error: string | undefined;
          if (request.headers.get("x-dump") !== "1") {
            const res = await sendSystemEmail({
              to: ["direccion@imr-intelligence.pro"],
              subject: "PRUEBA MANUAL DE REPORTE DE VISORES — DASHBOARD Y GRÁFICAS",
              html: rep.html,
              text: rep.texto,
              attachments: [{ filename: rep.fileName, content: base64 }],
            });
            if (res.ok) id = res.id;
            else error = res.error;
          }
          return Response.json({
            ok: !error,
            id,
            error,
            fileName: rep.fileName,
            bytes: (rep.buffer as ArrayBuffer).byteLength,
            maquinas: MAQUINAS_REPORTE,
            xlsxBase64: request.headers.get("x-dump") === "1" ? base64 : undefined,
          });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
