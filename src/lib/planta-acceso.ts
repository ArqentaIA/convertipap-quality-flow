// =====================================================================
// Acceso por planta.
// Un usuario con filas en `user_plantas` queda restringido a esas plantas.
// Sin filas => sin restricción (ve todas las plantas).
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

/** Devuelve los IDs de planta permitidos, o `null` si el usuario no está restringido. */
export async function allowedPlantaIds(sb: SB, userId: string): Promise<string[] | null> {
  const { data, error } = await sb
    .from("user_plantas")
    .select("planta_id")
    .eq("user_id", userId);
  if (error) return null;
  const ids = (data ?? []).map((r) => r.planta_id as string);
  return ids.length > 0 ? ids : null;
}

// ---------------------------------------------------------------------
// Hook de UI: plantas visibles para el usuario en sesión.
// Si el usuario tiene filas en `user_plantas`, solo ve esas plantas.
// ---------------------------------------------------------------------
export type PlantaRow = { id: string; codigo: string; nombre: string };
