// =============================================================================
// Envío programado del reporte de cierre de turno.
// Lo dispara pg_cron un minuto antes del cierre de cada turno (hora planta).
// Seguridad: token compartido en el encabezado x-cron-token.
// =============================================================================

import { createFileRoute } from "@tanstack/react-router";

function fechaHoraPlanta(fecha: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const p = (type: string) => partes.find((x) => x.type === type)?.value ?? "00";
  return {
    fecha: `${p("year")}-${p("month")}-${p("day")}`,
    hora: `${p("hour")}:${p("minute")}:${p("second")}`.replace(/^24:/, "00:"),
  };
}

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


  const { data: rows, error } = await supabaseAdmin
    .from("reporte_turno_destinatarios")
    .select("destinatarios, activo")
    .eq("activo", true);

  if (error) {
    console.error("[cierre-turno] No se pudieron leer los destinatarios:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const destinatarios = [
    ...new Set(
      (rows ?? [])
        .flatMap((r) => String(r.destinatarios ?? "").split(/[,;\s]+/))
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  ];

  if (destinatarios.length === 0) {
    return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: "sin destinatarios activos" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { construirReporteVisores } = await import("@/lib/reporte-visores.server");
  const reporte = await construirReporteVisores();

  const { fecha, hora } = fechaHoraPlanta(reporte.generado);
  const baseEnvio = {
    generado_at: reporte.generado.toISOString(),
    fecha,
    hora,
    turno: reporte.turno,
    asunto: reporte.subject,
  };

  const { data: bitacora, error: bitacoraError } = await supabaseAdmin
    .from("reporte_turno_envios")
    .insert(
      destinatarios.map((destinatario) => ({
        ...baseEnvio,
        destinatario,
        estado: "pendiente",
      })),
    )
    .select("id");
  if (bitacoraError) {
    console.error("[cierre-turno] No se pudo registrar la bitácora de envío:", bitacoraError.message);
  }
  const bitacoraIds = (bitacora ?? []).map((row) => row.id);

  const { sendSystemEmail } = await import("@/lib/email.server");
  const result = await sendSystemEmail({
    to: destinatarios,
    subject: reporte.subject,
    html: reporte.html,
    text: reporte.texto,
    attachments: [
      {
        filename: reporte.fileName,
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

  if (!result.ok) {
    console.error("[cierre-turno] Envío rechazado:", result.error);
    if (bitacoraIds.length > 0) {
      await supabaseAdmin
        .from("reporte_turno_envios")
        .update({ estado: "fallido", error: result.error })
        .in("id", bitacoraIds);
    }
    return new Response(JSON.stringify({ error: result.error }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (bitacoraIds.length > 0) {
    await supabaseAdmin
      .from("reporte_turno_envios")
      .update({ estado: "confirmado", proveedor_id: result.id, confirmado_at: new Date().toISOString(), error: null })
      .in("id", bitacoraIds);
  }

  return new Response(
    JSON.stringify({ ok: true, id: result.id, turno: reporte.turno, enviados: destinatarios.length }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/hooks/cierre-turno-reporte")({
  server: {
    handlers: {
      POST: ({ request }) => ejecutar(request),
    },
  },
});
