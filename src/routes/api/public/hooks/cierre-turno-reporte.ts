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

type Reporte = Awaited<ReturnType<typeof import("@/lib/reporte-visores.server").construirReporteVisores>>;
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function enviarReporte(to: string[], reporte: Reporte, subject: string) {
  const { sendSystemEmail } = await import("@/lib/email.server");
  return sendSystemEmail({
    to,
    subject,
    html: reporte.html,
    text: reporte.texto,
    attachments: [
      { filename: reporte.fileName, content: Buffer.from(reporte.buffer as ArrayBuffer).toString("base64"), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { filename: "logo-convertipap.png", content: reporte.logoBase64, contentType: "image/png", contentId: reporte.logoCid },
      { filename: "logo-irm.png", content: reporte.irmLogoBase64, contentType: "image/png", contentId: reporte.irmLogoCid },
    ],
  });
}

const MARCA_REINTENTO = "REINTENTO";

/** Reintenta una sola vez los cierres T1/T2/T3 que quedaron pendientes/fallidos > 10 min (últimas 24 h). */
async function reintentar(admin: Admin) {
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const hasta = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await admin
    .from("reporte_turno_envios")
    .select("id, generado_at, turno, destinatario, estado, error")
    .in("estado", ["pendiente", "fallido"])
    .in("turno", ["T1", "T2", "T3"])
    .gte("generado_at", desde)
    .lte("generado_at", hasta);
  if (error) return json({ error: error.message }, 500);
  const candidatos = (data ?? []).filter((r) => !String(r.error ?? "").startsWith(MARCA_REINTENTO));
  const grupos = new Map<string, typeof candidatos>();
  for (const r of candidatos) grupos.set(r.generado_at, [...(grupos.get(r.generado_at) ?? []), r]);
  const resultados: unknown[] = [];
  for (const [generadoAt, filas] of grupos) {
    const ids = filas.map((f) => f.id);
    await admin.from("reporte_turno_envios").update({ error: `${MARCA_REINTENTO}: en curso` }).in("id", ids);
    const { construirReporteVisores } = await import("@/lib/reporte-visores.server");
    const reporte = await construirReporteVisores(undefined, { referencia: new Date(new Date(generadoAt).getTime() - 60_000) });
    const dest = [...new Set(filas.map((f) => f.destinatario))];
    const r = await enviarReporte(dest, reporte, reporte.subject);
    if (r.ok) {
      await admin.from("reporte_turno_envios").update({ estado: "confirmado", proveedor_id: r.id, confirmado_at: new Date().toISOString(), error: `${MARCA_REINTENTO}: enviado` }).in("id", ids);
    } else {
      await admin.from("reporte_turno_envios").update({ estado: "fallido", error: `${MARCA_REINTENTO}: ${r.error}`.slice(0, 1000) }).in("id", ids);
      const { sendSystemEmail } = await import("@/lib/email.server");
      await sendSystemEmail({
        to: "adgral@convertipap.site",
        subject: `ALERTA: no se pudo enviar ${reporte.subject}`,
        text: `El reporte "${reporte.subject}" no se pudo enviar tras el reintento automático.\nDestinatarios: ${dest.join(", ")}\nError: ${r.error}`,
      });
    }
    resultados.push({ asunto: reporte.subject, ok: r.ok });
  }
  return json({ ok: true, reintentados: resultados });
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


  let body: { modo?: string; referencia?: string; destinatarios?: string[] } = {};
  try { body = (await request.json()) as typeof body; } catch { body = {}; }
  if (body.modo === "reintento") return reintentar(supabaseAdmin);
  if (body.modo === "reenvio") {
    const ref = body.referencia ? new Date(body.referencia) : null;
    const dest = (body.destinatarios ?? []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!ref || Number.isNaN(ref.getTime()) || dest.length === 0) return json({ error: "Reenvío requiere referencia y destinatarios válidos" }, 400);
    const { construirReporteVisores } = await import("@/lib/reporte-visores.server");
    const reporte = await construirReporteVisores(undefined, { referencia: ref });
    const r = await enviarReporte(dest, reporte, reporte.subject);
    return json(r.ok ? { ok: true, id: r.id, asunto: reporte.subject } : { error: r.error }, r.ok ? 200 : 502);
  }
  if (body.modo === "prueba") {
    const ref = body.referencia ? new Date(body.referencia) : new Date(Date.now() - 60_000);
    const dest = (body.destinatarios ?? []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (dest.length === 0 || Number.isNaN(ref.getTime())) return json({ error: "Prueba requiere destinatarios y referencia válida" }, 400);
    const { construirReporteVisores } = await import("@/lib/reporte-visores.server");
    const reporte = await construirReporteVisores(undefined, { referencia: ref });
    const r = await enviarReporte(dest, reporte, `[PRUEBA] ${reporte.subject}`);
    return json(r.ok ? { ok: true, id: r.id, asunto: `[PRUEBA] ${reporte.subject}` } : { error: r.error }, r.ok ? 200 : 502);
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
  const reporte = await construirReporteVisores(undefined, { referencia: new Date(Date.now() - 60_000) });

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

  const result = await enviarReporte(destinatarios, reporte, reporte.subject);

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
