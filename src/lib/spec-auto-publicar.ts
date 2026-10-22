// Guardar = publicar: tras guardar un cambio autorizado, el borrador pasa por
// revisión y publicación en la misma acción (cada paso deja su bitácora).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = { from: (t: string) => any; rpc: (f: string, a: any) => any };

export async function publicarSpec(sb: SB, specId: string, motivo: string) {
  const { data: spec, error } = await sb
    .from("producto_especificaciones").select("id, estado").eq("id", specId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!spec) return;
  if (spec.estado === "borrador") {
    const r = await sb.rpc("enviar_a_revision", { _spec_id: specId, _motivo: motivo });
    if (r.error) throw new Error(`Guardado, pero no se pudo enviar a revisión: ${r.error.message}`);
  }
  if (spec.estado === "borrador" || spec.estado === "en_revision") {
    const p = await sb.rpc("publicar_especificacion", { _spec_id: specId, _motivo: motivo });
    if (p.error) throw new Error(`Guardado, pero no se pudo publicar: ${p.error.message}`);
  }
}

export async function publicarBorradoresProducto(sb: SB, productoId: string, motivo: string) {
  const { data, error } = await sb
    .from("producto_especificaciones").select("id")
    .eq("producto_id", productoId).in("estado", ["borrador", "en_revision"]);
  if (error) throw new Error(error.message);
  for (const s of data ?? []) await publicarSpec(sb, s.id, motivo);
}
