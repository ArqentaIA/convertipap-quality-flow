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

export type MaquinaPermitidaRow = {
  id: string;
  codigo: string;
  nombre: string;
  area: string | null;
  planta_id: string;
  plantas: { id: string; codigo: string; nombre: string } | null;
};

/**
 * Máquinas visibles para captura/pesaje, incluyendo MP-10 como máquina de
 * pruebas compartida entre Tlaxcala e Ixtapaluca. Si el usuario tiene acceso
 * a cualquiera de esas plantas, MP-10 se agrega aunque su planta asignada en
 * el catálogo sea la contraria.
 *
 * NOTA: reportes, visores y tableros de producción NO usan este helper;
 * ellos siguen excluyendo MP-10 porque es máquina de pruebas.
 */
export async function maquinasPermitidasConPruebas(
  sb: SB,
  userId: string,
): Promise<MaquinaPermitidaRow[]> {
  const plantas = await allowedPlantaIds(sb, userId);

  let q = sb
    .from("maquinas")
    .select("id, nombre, codigo, area, planta_id, plantas(id, nombre, codigo)")
    .eq("activo", true)
    .order("codigo");
  if (plantas) q = q.in("planta_id", plantas);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const lista = (data ?? []) as MaquinaPermitidaRow[];

  const { data: plantasCodigo } = await sb
    .from("plantas")
    .select("codigo")
    .in("id", plantas ?? []);
  const codigos = (plantasCodigo ?? []).map((p) => (p.codigo ?? "").toUpperCase());
  const incluirMP10 = !plantas || codigos.includes("TLX") || codigos.includes("IXT");
  if (incluirMP10 && !lista.some((m) => m.codigo === "MP-10")) {
    const { data: mp10 } = await sb
      .from("maquinas")
      .select("id, nombre, codigo, area, planta_id, plantas(id, nombre, codigo)")
      .eq("codigo", "MP-10")
      .eq("activo", true)
      .maybeSingle();
    if (mp10) lista.push(mp10 as MaquinaPermitidaRow);
  }

  return lista.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// ---------------------------------------------------------------------
// Hook de UI: plantas visibles para el usuario en sesión.
// Si el usuario tiene filas en `user_plantas`, solo ve esas plantas.
// ---------------------------------------------------------------------
export type PlantaRow = { id: string; codigo: string; nombre: string };
