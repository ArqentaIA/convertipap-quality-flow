// =====================================================================
// Alcance por planta (aislamiento TLX / IXT).
//
// Regla de negocio: la información NO se mezcla entre plantas. Cada
// pantalla, reporte y exportación debe mostrar únicamente datos de la
// planta activa seleccionada en el encabezado.
//
// Este módulo resuelve, del lado del servidor, el conjunto de plantas y
// máquinas que una consulta puede tocar:
//   1. Se parte de las plantas permitidas al usuario (`user_plantas`).
//   2. Si el cliente envía la planta activa, se recorta a esa planta.
//
// Las tablas sin `planta_id` (ordenes_produccion, pesajes_cintas_lotes,
// etc.) se filtran por los códigos/IDs de máquina de la planta.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

export type PlantaScope = {
  /** IDs de planta visibles para esta consulta. */
  plantaIds: string[];
  /** IDs de máquina pertenecientes a esas plantas. */
  maquinaIds: string[];
  /** Códigos de máquina (MP-01, MP-04, …) de esas plantas. */
  maquinaCodigos: string[];
  /** Código de la planta activa, si el cliente la envió. */
  plantaCodigo: string | null;
  /** Nombre de la planta activa (para encabezados de reportes). */
  plantaNombre: string | null;
};

/** Campo de entrada estándar para las server functions con alcance de planta. */
export type PlantaInput = { planta?: string | null };

/**
 * Resuelve el alcance efectivo. Siempre devuelve listas concretas, de modo
 * que una consulta filtrada con `.in(...)` nunca puede escaparse de planta.
 */
export async function resolvePlantaScope(
  sb: SB,
  userId: string,
  plantaCodigo?: string | null,
): Promise<PlantaScope> {
  const codigo = (plantaCodigo ?? "").trim().toUpperCase() || null;

  const [{ data: up }, { data: plantasRows }] = await Promise.all([
    sb.from("user_plantas").select("planta_id").eq("user_id", userId),
    sb.from("plantas").select("id, codigo, nombre").eq("activo", true),
  ]);

  const permitidas = (up ?? []).map((r) => r.planta_id as string);
  let plantas = (plantasRows ?? []) as { id: string; codigo: string; nombre: string }[];
  if (permitidas.length > 0) plantas = plantas.filter((p) => permitidas.includes(p.id));

  // Recorte a la planta activa (solo si el usuario tiene acceso a ella).
  const activa = codigo ? plantas.find((p) => (p.codigo ?? "").toUpperCase() === codigo) : undefined;
  const seleccionadas = activa ? [activa] : plantas;

  const plantaIds = seleccionadas.map((p) => p.id);

  let maquinaIds: string[] = [];
  let maquinaCodigos: string[] = [];
  if (plantaIds.length > 0) {
    const { data: maquinas } = await sb
      .from("maquinas")
      .select("id, codigo")
      .in("planta_id", plantaIds)
      .order("codigo");
    // MP-10 es máquina de PRUEBAS: se excluye de reportes/visores (este scope
    // solo lo consumen reportes y tableros). Su captura sigue habilitada.
    const productivas = (maquinas ?? []).filter((m) => m.codigo !== MAQUINA_PRUEBAS_CODIGO);
    maquinaIds = productivas.map((m) => m.id as string);
    maquinaCodigos = productivas.map((m) => m.codigo as string);
  }

  return {
    plantaIds,
    maquinaIds,
    maquinaCodigos,
    plantaCodigo: activa?.codigo ?? null,
    plantaNombre: activa?.nombre ?? seleccionadas[0]?.nombre ?? null,
  };
}
