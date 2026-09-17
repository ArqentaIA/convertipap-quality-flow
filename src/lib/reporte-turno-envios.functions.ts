// =============================================================================
// Historial de envíos del reporte de cierre de turno.
// Acceso exclusivo: adgral@convertipap.site
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_AUTORIZADO = "adgral@convertipap.site";

export type ReporteTurnoEnvioEstado = "pendiente" | "confirmado" | "fallido";

export type ReporteTurnoEnvio = {
  id: string;
  generado_at: string;
  fecha: string;
  hora: string;
  turno: string;
  destinatario: string;
  estado: ReporteTurnoEnvioEstado;
  asunto: string;
  proveedor_id: string | null;
  error: string | null;
  confirmado_at: string | null;
};

function assertAutorizado(claims: Record<string, unknown>) {
  const email = String(claims["email"] ?? "").toLowerCase();
  if (email !== EMAIL_AUTORIZADO) {
    throw new Error("Acceso denegado. Solo el usuario autorizado puede ver el historial de envíos.");
  }
}

export const listEnviosCierreTurno = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReporteTurnoEnvio[]> => {
    assertAutorizado(context.claims as Record<string, unknown>);
    const { data, error } = await context.supabase
      .from("reporte_turno_envios")
      .select("id, generado_at, fecha, hora, turno, destinatario, estado, asunto, proveedor_id, error, confirmado_at")
      .order("generado_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(`No se pudo cargar el historial de envíos: ${error.message}`);
    return (data ?? []).map((row) => ({
      ...row,
      estado: row.estado as ReporteTurnoEnvioEstado,
    }));
  });