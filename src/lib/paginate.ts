// =====================================================================
// Utilidades de paginación PostgREST.
// PostgREST limita por defecto cada respuesta a 1000 filas. Estas helpers
// evitan truncamiento silencioso en lecturas/reportes.
//
// USO:
//   const rows = await fetchAllPaged((from, to) =>
//     sb.from("tabla").select("...").gte(...).range(from, to),
//   );
//
//   const rows = await fetchInChunks(ids, 200, (slice, from, to) =>
//     sb.from("mediciones_calidad")
//       .select("muestra_id, variable_clave, valor")
//       .in("muestra_id", slice)
//       .range(from, to),
//   );
// =====================================================================

const PAGE = 1000;
const MAX_PAGES = 500; // tope de seguridad (≤500k filas por llamada)

type PagedResp<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Itera .range() sobre un único builder hasta agotar resultados. */
export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PagedResp<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const from = p * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

/**
 * Particiona un arreglo de IDs en lotes y pagina cada lote.
 * Útil para evitar URLs gigantes en `.in()` y truncamiento en JOIN-like queries.
 */
export async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  build: (slice: string[], from: number, to: number) => PagedResp<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const part = await fetchAllPaged<T>((from, to) => build(slice, from, to));
    out.push(...part);
  }
  return out;
}
