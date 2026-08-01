CREATE OR REPLACE FUNCTION public.trazabilidad_lote_cintas(_lote_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'lote_id', l.id,
    'numero_rollo', l.numero_rollo,
    'fabricacion', l.fabricacion,
    'numero_orden', l.numero_orden,
    'producto_codigo', l.producto_codigo,
    'producto_nombre', l.producto_nombre,
    'fecha_produccion', l.fecha_produccion,
    'peso_bobina_madre_neto_kg', l.peso_bobina_madre_neto_kg,
    'peso_total_cintas_kg', l.peso_total_cintas_kg,
    'cantidad_cintas', l.cantidad_cintas,
    'merma_kg', l.merma_kg,
    'merma_porcentaje', l.merma_porcentaje,
    'estado', l.estado,
    'es_manual', l.es_manual,
    'origen_peso', CASE WHEN COALESCE(l.es_manual,false) THEN 'manual' ELSE 'bobina_madre' END,
    'cintas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'posicion', c.posicion,
               'peso_cinta_kg', c.peso_cinta_kg,
               'uniones', c.uniones,
               'ancho_util', c.ancho_util,
               'ancho_util_unidad', c.ancho_util_unidad
             ) ORDER BY c.posicion)
      FROM public.pesajes_cintas c
      WHERE c.lote_id = l.id AND c.estado = 'registrada'
    ), '[]'::jsonb)
  )
  FROM public.pesajes_cintas_lotes l
  WHERE l.id = _lote_id AND l.estado <> 'anulado';
$$;

GRANT EXECUTE ON FUNCTION public.trazabilidad_lote_cintas(uuid) TO anon, authenticated;