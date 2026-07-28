CREATE OR REPLACE FUNCTION public.buscar_contexto_rollo_cintas(_numero_rollo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rollo text := trim(_numero_rollo);
  v_muestras int;
  v_pesajes int;
  v_m record;
  v_p record;
  v_mediciones jsonb;
  v_producto record;
  v_lote record;
  v_peso_cc numeric;
  v_peso_efectivo numeric;
  v_pesaje_id uuid;
  v_orden_id uuid;
  v_num_orden text;
  v_maq_id uuid;
  v_maq_codigo text;
  v_fecha_pesaje timestamptz;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF v_rollo IS NULL OR length(v_rollo) = 0 THEN
    RAISE EXCEPTION 'Número de rollo requerido.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*) INTO v_muestras FROM public.muestras_calidad WHERE numero_rollo = v_rollo;
  IF v_muestras = 0 THEN
    RAISE EXCEPTION 'No se encontró información de Control de Calidad para este número de rollo.' USING ERRCODE='P0002';
  END IF;
  IF v_muestras > 1 THEN
    RAISE EXCEPTION 'Existen varias muestras con el mismo número de rollo. Corrija en Control de Calidad antes de continuar.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_m FROM public.muestras_calidad WHERE numero_rollo = v_rollo LIMIT 1;

  SELECT COUNT(*) INTO v_pesajes FROM public.pesajes_bobina_madre WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id;
  IF v_pesajes > 1 THEN
    RAISE EXCEPTION 'Existen varios pesajes con el mismo número de rollo. Contacte al administrador.' USING ERRCODE='22023';
  END IF;

  IF v_pesajes = 1 THEN
    SELECT * INTO v_p FROM public.pesajes_bobina_madre
     WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id LIMIT 1;
    v_peso_efectivo := v_p.peso_neto_kg;
    v_pesaje_id := v_p.id;
    v_orden_id := v_p.orden_produccion_id;
    v_num_orden := v_p.numero_orden;
    v_maq_id := v_p.maquina_id;
    v_maq_codigo := v_p.maquina_codigo;
    v_fecha_pesaje := v_p.fecha_hora_pesaje;
  ELSE
    SELECT valor INTO v_peso_cc FROM public.mediciones_calidad
      WHERE muestra_id = v_m.id AND variable_clave = 'peso' LIMIT 1;
    IF v_peso_cc IS NULL OR v_peso_cc <= 0 THEN
      RAISE EXCEPTION 'No se encontró el peso del rollo (ni en Pesaje de Bobina Madre ni en la medición "peso" de Control de Calidad).' USING ERRCODE='P0002';
    END IF;
    v_peso_efectivo := v_peso_cc;
    v_pesaje_id := NULL;
    v_orden_id := NULL;
    v_num_orden := NULL;
    v_maq_id := v_m.maquina_id;
    SELECT codigo INTO v_maq_codigo FROM public.maquinas WHERE id = v_m.maquina_id;
    v_fecha_pesaje := v_m.capturado_at;
  END IF;

  SELECT id, codigo, nombre INTO v_producto FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  IF v_pesaje_id IS NOT NULL THEN
    SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
     WHERE pesaje_bobina_madre_id = v_pesaje_id AND estado <> 'anulado' LIMIT 1;
  ELSE
    SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
     WHERE muestra_calidad_id = v_m.id AND pesaje_bobina_madre_id IS NULL AND estado <> 'anulado' LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'muestra', jsonb_build_object(
      'id', v_m.id,
      'numero_rollo', v_m.numero_rollo,
      'fabricacion', COALESCE(v_producto.codigo, ''),
      'producto_id', v_m.producto_id,
      'producto_codigo', v_producto.codigo,
      'producto_nombre', v_producto.nombre,
      'turno', v_m.turno,
      'jefe_maquina', v_m.jefe_maquina,
      'operador', v_m.operador,
      'prensero', v_m.prensero,
      'analista', v_m.analista,
      'capturado_at', v_m.capturado_at,
      'observaciones', v_m.observaciones_generales,
      'mediciones', COALESCE(v_mediciones, '{}'::jsonb)
    ),
    'pesaje', jsonb_build_object(
      'id', v_pesaje_id,
      'peso_neto_kg', v_peso_efectivo,
      'fecha_hora_pesaje', v_fecha_pesaje,
      'orden_produccion_id', v_orden_id,
      'numero_orden', v_num_orden,
      'maquina_id', v_maq_id,
      'maquina_codigo', v_maq_codigo,
      'origen_peso', CASE WHEN v_pesaje_id IS NULL THEN 'control_calidad' ELSE 'pesaje_bobina_madre' END
    ),
    'lote', CASE WHEN v_lote.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_lote.id,
      'estado', v_lote.estado,
      'cantidad_cintas', v_lote.cantidad_cintas,
      'peso_total_cintas_kg', v_lote.peso_total_cintas_kg,
      'peso_pendiente_kg', v_lote.peso_pendiente_kg,
      'merma_kg', v_lote.merma_kg,
      'merma_porcentaje', v_lote.merma_porcentaje,
      'conductor_id', v_lote.conductor_id,
      'conductor_nombre_snapshot', v_lote.conductor_nombre_snapshot,
      'bobinadora_id', v_lote.bobinadora_id,
      'bobinadora_nombre_snapshot', v_lote.bobinadora_nombre_snapshot
    ) END
  );
END;
$function$;