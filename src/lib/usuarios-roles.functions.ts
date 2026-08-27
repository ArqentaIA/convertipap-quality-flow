// =====================================================================
// Perfiles y Roles — asignar / quitar roles
// Acceso exclusivo: adgral@convertipap.site
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_AUTORIZADO = "adgral@convertipap.site";

const ROLES = [
  "administrador",
  "direccion_general",
  "gerente_general",
  "direccion",
  "calidad",
  "calidad_operativo",
  "capturista",
  "reportes_consulta",
  "planeacion",
  "pesaje_operativo",
] as const;

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

function assertAutorizado(claims: Record<string, unknown>) {
  const email = String(claims["email"] ?? "").toLowerCase();
  if (email !== EMAIL_AUTORIZADO) {
    throw new Error("Acceso denegado. Solo el usuario autorizado puede modificar roles.");
  }
}

export const asignarRol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    assertAutorizado(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const quitarRol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    assertAutorizado(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------
// Módulos por rol (module_permissions)
// ---------------------------------------------------------------------
const MODULOS = [
  "dashboard",
  "produccion",
  "control_calidad",
  "variables_calidad",
  "reportes",
  "configuracion",
  "usuarios_permisos",
  "auditoria",
  "catalogos",
  "ordenes_produccion",
  "pesaje_bobina_madre",
  "pesaje_cintas",
] as const;

const moduloSchema = z.object({
  role: z.enum(ROLES),
  module: z.enum(MODULOS),
});

export const agregarModuloARol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduloSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertAutorizado(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("module_permissions")
      .insert({ role: data.role, module: data.module });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const quitarModuloDeRol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduloSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertAutorizado(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("module_permissions")
      .delete()
      .eq("role", data.role)
      .eq("module", data.module);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
