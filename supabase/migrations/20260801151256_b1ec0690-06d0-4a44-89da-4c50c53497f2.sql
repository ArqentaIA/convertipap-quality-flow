ALTER TABLE public.pesajes_cintas_lotes ALTER COLUMN conductor_id DROP NOT NULL;
ALTER TABLE public.pesajes_cintas_lotes ALTER COLUMN bobinadora_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.crear_lote_pesaje_cintas_manual(
  _numero_rollo text, _peso_neto_kg numeric, _conductor_id uuid, _bobinadora_id uuid, _idempotency uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cond record; v_bob record;
  v_lote_id uuid;
  v_rollo text := trim(_numero_rollo);
  v_cond_nombre text := 'SIN DATOS REGISTRADOS';
  v_bob_nombre text := 'SIN DATOS REGISTRADOS';
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_lote_id FROM public.pesajes_cintas_lotes WHERE idempotency_key = _idempotency;
  IF v_lote_id IS NOT NULL THEN RETURN v_lote_id; END IF;

  IF v_rollo IS NULL OR length(v_rollo) = 0 OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;

  IF _peso_neto_kg IS NULL OR _peso_neto_kg <= 0 OR _peso_neto_kg > 3000 THEN
    RAISE EXCEPTION 'El peso debe ser mayor a 0 y no rebasar 3000 kg.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pclm:'||v_rollo));
  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE numero_rollo = v_rollo AND estado <> 'anulado') THEN
    RAISE EXCEPTION 'Ya existe un lote activo o finalizado para este rollo.' USING ERRCODE='22023';
  END IF;

  IF _conductor_id IS NOT NULL THEN
    SELECT * INTO v_cond FROM public.operarios WHERE id = _conductor_id AND activo = true;
    IF v_cond.id IS NULL THEN RAISE EXCEPTION 'Conductor inválido o inactivo.' USING ERRCODE='22023'; END IF;
    v_cond_nombre := v_cond.nombre;
  END IF;

  IF _bobinadora_id IS NOT NULL THEN
    SELECT * INTO v_bob FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo = true;
    IF v_bob.id IS NULL THEN RAISE EXCEPTION 'Bobinadora inválida o inactiva.' USING ERRCODE='22023'; END IF;
    v_bob_nombre := v_bob.nombre;
  END IF;

  INSERT INTO public.pesajes_cintas_lotes (
    numero_rollo, fabricacion, fecha_produccion,
    conductor_id, conductor_nombre_snapshot,
    bobinadora_id, bobinadora_nombre_snapshot,
    peso_bobina_madre_neto_kg, peso_pendiente_kg,
    datos_calidad_snapshot, es_manual,
    idempotency_key, creado_por
  ) VALUES (
    v_rollo, '', (now() AT TIME ZONE 'America/Mexico_City')::date,
    v_cond.id, v_cond_nombre,
    v_bob.id, v_bob_nombre,
    round(_peso_neto_kg, 2), round(_peso_neto_kg, 2),
    jsonb_build_object('numero_rollo', v_rollo, 'origen_peso', 'manual', 'mediciones', '{}'::jsonb),
    true,
    _idempotency, v_uid
  ) RETURNING id INTO v_lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (v_lote_id, 'LOTE_CREADO_MANUAL',
    jsonb_build_object('conductor', v_cond_nombre, 'bobinadora', v_bob_nombre,
                       'peso_neto_kg', round(_peso_neto_kg,2), 'origen_peso', 'manual'),
    v_uid);

  RETURN v_lote_id;
END;
$$;