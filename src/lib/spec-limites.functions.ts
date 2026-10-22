import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guardarVariablesSchema } from "./spec-limites";

export const guardarVariablesBorrador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => guardarVariablesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: cambios, error } = await context.supabase.rpc("guardar_variables_borrador", {
      _spec_id: data.spec_id, _variables: data.variables, _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { cambios: cambios ?? 0 };
  });