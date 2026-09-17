// TEMPORAL: reenvío manual del consolidado diario a un solo destinatario.
// Eliminar tras el envío.
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
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { MAQUINAS_REPORTE, construirReporteVisores } = await import("@/lib/reporte-visores.server");
  const reporte = await construirReporteVisores(MAQUINAS_REPORTE, {
    forzarConsolidado: true,
    // 06:59 hora planta del 17-09 => día operativo 16-09-2026 (T1+T2+T3).
    consolidadoRef: new Date("2026-09-17T12:59:00Z"),
  });

  const subject = "Consolidado Diario | 16-09-2026 | Turnos T1 + T2 + T3";
  const fileName = "Convertipap_ConsolidadoDiario_20260916 Python 3.12.10.xlsx";

  const { sendSystemEmail } = await import("@/lib/email.server");
  const result = await sendSystemEmail({
    to: ["direccion@imr-intelligence.pro"],
    subject,
    html: reporte.html,
    text: reporte.texto,
    attachments: [
      {
        filename: fileName,
        content: Buffer.from(reporte.buffer as ArrayBuffer).toString("base64"),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      {
        filename: "logo-convertipap.png",
        content: reporte.logoBase64,
        contentType: "image/png",
        contentId: reporte.logoCid,
      },
      {
        filename: "logo-irm.png",
        content: reporte.irmLogoBase64,
        contentType: "image/png",
        contentId: reporte.irmLogoCid,
      },
    ],
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/envio-temp")({
  server: { handlers: { POST: ({ request }) => ejecutar(request) } },
});
