
CREATE OR REPLACE FUNCTION public._pc_pesaje_desde_calidad(_muestra_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m record;
  v_peso numeric;
  v_maq record;
  v_id uuid;
BEGIN
  SELECT * INTO v_m FROM public.muestras_calidad WHERE id = _muestra_id;
  IF v_m.id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_m.numero_rollo AND maquina_id = v_m.maquina_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT valor INTO v_peso FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'peso' AND valor > 0
   ORDER BY created_at DESC LIMIT 1;
  IF v_peso IS NULL OR v_peso <= 0 THEN RETURN NULL; END IF;

  SELECT id, codigo INTO v_maq FROM public.maquinas WHERE id = v_m.maquina_id;
  IF v_maq.id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.pesajes_bobina_madre (
    numero_rollo, maquina_id, maquina_codigo,
    orden_produccion_id, numero_orden,
    peso_bruto_kg, peso_eje_kg, peso_neto_kg,
    fecha_hora_pesaje, evidencia_path, ocr_raw, capturado_por
  ) VALUES (
    v_m.numero_rollo, v_maq.id, v_maq.codigo,
    NULL, NULL,
    v_peso, 0, v_peso,
    COALESCE(v_m.capturado_at, now()), 'MIGRADO_DESDE_CALIDAD',
    jsonb_build_object('origen','migracion_calidad','muestra_id', v_m.id, 'migrado_por', auth.uid(), 'migrado_at', now()),
    auth.uid()
  ) RETURNING id INTO v_id;

  UPDATE public.muestras_calidad SET pesaje_id = v_id WHERE id = v_m.id AND pesaje_id IS NULL;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._pc_pesaje_desde_calidad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._pc_pesaje_desde_calidad(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buscar_contexto_rollo_cintas(_numero_rollo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_new_id uuid;
  v_origen text := 'pesaje_rollo';
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

  SELECT COUNT(*) INTO v_pesajes FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id;
  IF v_pesajes > 1 THEN
    RAISE EXCEPTION 'Existen varios pesajes con el mismo número de rollo. Contacte al administrador.' USING ERRCODE='22023';
  END IF;
  IF v_pesajes = 0 THEN
    v_new_id := public._pc_pesaje_desde_calidad(v_m.id);
    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
    END IF;
  END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  IF v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
  END IF;

  IF v_p.evidencia_path = 'MIGRADO_DESDE_CALIDAD' THEN
    v_origen := 'migrado_calidad';
  END IF;

  SELECT id, codigo, nombre INTO v_producto FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
   WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado' LIMIT 1;

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
      'id', v_p.id,
      'peso_neto_kg', v_p.peso_neto_kg,
      'fecha_hora_pesaje', v_p.fecha_hora_pesaje,
      'orden_produccion_id', v_p.orden_produccion_id,
      'numero_orden', v_p.numero_orden,
      'maquina_id', v_p.maquina_id,
      'maquina_codigo', v_p.maquina_codigo,
      'origen_peso', v_origen
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
$$;

CREATE OR REPLACE FUNCTION public.crear_lote_pesaje_cintas(_numero_rollo text, _conductor_id uuid, _bobinadora_id uuid, _idempotency uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m record; v_p record; v_prod record;
  v_cond record; v_bob record;
  v_lote_id uuid;
  v_snapshot jsonb;
  v_mediciones jsonb;
  v_new_id uuid;
  v_origen text := 'pesaje_rollo';
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_lote_id FROM public.pesajes_cintas_lotes WHERE idempotency_key = _idempotency;
  IF v_lote_id IS NOT NULL THEN RETURN v_lote_id; END IF;

  IF _numero_rollo IS NULL OR _bobinadora_id IS NULL OR _conductor_id IS NULL OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_m FROM public.muestras_calidad WHERE numero_rollo = trim(_numero_rollo) LIMIT 1;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Muestra no encontrada.' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_m.numero_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  IF v_p.id IS NULL THEN
    v_new_id := public._pc_pesaje_desde_calidad(v_m.id);
    IF v_new_id IS NOT NULL THEN
      SELECT * INTO v_p FROM public.pesajes_bobina_madre WHERE id = v_new_id;
    END IF;
  END IF;

  IF v_p.id IS NULL OR v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
  END IF;

  IF v_p.evidencia_path = 'MIGRADO_DESDE_CALIDAD' THEN
    v_origen := 'migrado_calidad';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pcl:'||v_p.id::text));
  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado') THEN
    RAISE EXCEPTION 'Ya existe un lote activo o finalizado para este rollo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_cond FROM public.operarios WHERE id = _conductor_id AND activo = true;
  IF v_cond.id IS NULL THEN RAISE EXCEPTION 'Conductor inválido o inactivo.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_bob FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo = true;
  IF v_bob.id IS NULL THEN RAISE EXCEPTION 'Bobinadora inválida o inactiva.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prod FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  v_snapshot := jsonb_build_object(
    'numero_rollo', v_m.numero_rollo,
    'fecha', (v_m.capturado_at AT TIME ZONE 'America/Mexico_City')::date,
    'fabricacion', COALESCE(v_prod.codigo, ''),
    'producto_codigo', v_prod.codigo,
    'producto_nombre', v_prod.nombre,
    'turno', v_m.turno,
    'jefe_maquina', v_m.jefe_maquina,
    'operador', v_m.operador,
    'prensero', v_m.prensero,
    'analista', v_m.analista,
    'observaciones_calidad', v_m.observaciones_generales,
    'mediciones', COALESCE(v_mediciones, '{}'::jsonb),
    'origen_peso', v_origen
  );

  INSERT INTO public.pesajes_cintas_lotes (
    pesaje_bobina_madre_id, muestra_calidad_id,
    orden_produccion_id, numero_orden,
    numero_rollo, fabricacion, fecha_produccion,
    producto_id, producto_codigo, producto_nombre,
    conductor_id, conductor_nombre_snapshot,
    bobinadora_id, bobinadora_nombre_snapshot,
    peso_bobina_madre_neto_kg, peso_pendiente_kg,
    datos_calidad_snapshot,
    idempotency_key, creado_por
  ) VALUES (
    v_p.id, v_m.id,
    v_p.orden_produccion_id, v_p.numero_orden,
    v_m.numero_rollo, COALESCE(v_prod.codigo,''),
    (v_m.capturado_at AT TIME ZONE 'America/Mexico_City')::date,
    v_m.producto_id, v_prod.codigo, v_prod.nombre,
    v_cond.id, v_cond.nombre,
    v_bob.id, v_bob.nombre,
    v_p.peso_neto_kg, v_p.peso_neto_kg,
    v_snapshot,
    _idempotency, v_uid
  ) RETURNING id INTO v_lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (v_lote_id, 'LOTE_CREADO',
    jsonb_build_object('conductor', v_cond.nombre, 'bobinadora', v_bob.nombre,
                       'peso_neto_kg', v_p.peso_neto_kg, 'origen_peso', v_origen),
    v_uid);

  RETURN v_lote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_contexto_rollo_cintas(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_contexto_rollo_cintas(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_lote_pesaje_cintas(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_lote_pesaje_cintas(text, uuid, uuid, uuid) TO authenticated, service_role;
