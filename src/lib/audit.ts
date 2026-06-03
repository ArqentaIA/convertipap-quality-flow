import { supabase } from "@/integrations/supabase/client";

export type AuditModule =
  | "auth"
  | "etiqueta"
  | "qr"
  | "reportes"
  | "muestra"
  | "auditoria"
  | string;

/**
 * Registra una acción de negocio en audit_log mediante la función RPC audit_action().
 * No bloquea ni lanza: si falla, sólo lo loguea en consola.
 */
export async function auditAction(
  modulo: AuditModule,
  descripcion: string,
  registroId?: string | null,
  datos?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const args: Record<string, unknown> = {
      p_modulo: modulo,
      p_descripcion: descripcion,
    };
    if (registroId) args.p_registro_id = registroId;
    if (datos) args.p_datos = datos;
    const { error } = await supabase.rpc("audit_action", args as never);
    if (error) console.warn("[audit] rpc error", error.message);
  } catch (e) {
    console.warn("[audit] threw", e);
  }
}
