// TEMPORAL — vista previa del reporte de cierre de turno (solo lectura).
// Requiere el mismo token de cron. NO envía correos.
import { createFileRoute } from "@tanstack/react-router";

async function ejecutar(request: Request) {
  const token = request.headers.get("x-cron-token");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: secreto } = await supabaseAdmin
    .from("cron_secrets")
    .select("valor")
    .eq("nombre", "reporte_turno")
    .maybeSingle();
  const esperado = secreto?.valor ?? process.env["CRON_REPORTE_TURNO_TOKEN"];
  if (!esperado || !token || token !== esperado) {
    return new Response("No autorizado", { status: 401 });
  }
  const { MAQUINAS_REPORTE, construirReporteVisores } = await import("@/lib/reporte-visores.server");
  const r = await construirReporteVisores(MAQUINAS_REPORTE, { forzarConsolidado: true });
  return new Response(
    JSON.stringify({
      fileName: r.fileName,
      subject: r.subject,
      turno: r.turno,
      html: r.html,
      xlsxBase64: Buffer.from(r.buffer as ArrayBuffer).toString("base64"),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/hooks/preview-temp")({
  server: { handlers: { POST: ({ request }) => ejecutar(request) } },
});
