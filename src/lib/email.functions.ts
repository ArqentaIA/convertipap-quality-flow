// =============================================================================
// Server functions de correo. Solo exponen la capa sendSystemEmail().
// No se expone ninguna credencial al cliente.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const testSchema = z.object({
  to: z.string().email("Correo destino inválido"),
  subject: z.string().trim().min(1).max(200).default("Prueba de correo — ConvertiPap"),
  mensaje: z.string().trim().min(1).max(2000).default("Prueba de configuración de correo transaccional."),
});

/** Estado de configuración del correo (sin revelar la clave). */
export const getEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { SYSTEM_EMAIL_FROM } = await import("./email.server");
    return {
      configurado: Boolean(process.env["RESEND_API_KEY"]),
      remitente: SYSTEM_EMAIL_FROM,
      proveedor: "resend" as const,
    };
  });

/** Envío de prueba manual (no scheduler, no reportes automáticos). */
export const sendTestSystemEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => testSchema.parse(data))
  .handler(async ({ data }) => {
    const { sendSystemEmail } = await import("./email.server");
    const result = await sendSystemEmail({
      to: data.to,
      subject: data.subject,
      html: `<p>${data.mensaje}</p>`,
      text: data.mensaje,
    });
    if (!result.ok) throw new Error(`No se pudo enviar el correo: ${result.error}`);
    return { id: result.id };
  });
