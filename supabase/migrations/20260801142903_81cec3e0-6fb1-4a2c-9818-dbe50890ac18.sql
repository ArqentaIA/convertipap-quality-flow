CREATE OR REPLACE FUNCTION public.registrar_cinta(_lote_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cinta_id uuid;
  v_lote record;
  v_next_pos smallint;
  v_total numeric;
  v_pendiente numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_cinta_id FROM public.pesajes_cintas WHERE idempotency_key = _idempotency;
  IF v_cinta_id IS NOT NULL THEN
    RETURN jsonb_build_object('cinta_id', v_cinta_id, 'idempotent', true);
  END IF;

  IF _uniones IS NULL OR _peso_cinta_kg IS NULL OR _ancho_util IS NULL OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;
  IF _uniones < 0 THEN RAISE EXCEPTION 'Uniones no puede ser negativo.' USING ERRCODE='22023'; END IF;
  IF _peso_cinta_kg <= 0 THEN RAISE EXCEPTION 'El peso real de la cinta debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF _ancho_util <= 0 THEN RAISE EXCEPTION 'Ancho útil debe ser mayor a 0.' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto para registrar cintas.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(MAX(posicion), 0)::smallint + 1 INTO v_next_pos
    FROM public.pesajes_cintas
    WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_next_pos > 20 THEN
    RAISE EXCEPTION 'Ya se registraron las 20 cintas permitidas.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pesajes_cintas (
    lote_id, posicion, uniones, peso_cinta_kg, ancho_util,
    observaciones, idempotency_key, creado_por
  ) VALUES (
    _lote_id, v_next_pos, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''), _idempotency, v_uid
  ) RETURNING id INTO v_cinta_id;

  v_total := v_total + _peso_cinta_kg;
  v_pendiente := v_lote.peso_bobina_madre_neto_kg - v_total;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_next_pos,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_pendiente,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, v_cinta_id, 'CINTA_REGISTRADA',
    jsonb_build_object('posicion', v_next_pos, 'peso_real_kg', _peso_cinta_kg,
                       'uniones', _uniones, 'ancho_util', _ancho_util,
                       'idempotency_key', _idempotency),
    v_uid);

  RETURN jsonb_build_object('cinta_id', v_cinta_id, 'posicion', v_next_pos,
    'peso_total_cintas_kg', v_total, 'peso_pendiente_kg', v_pendiente);
END $function$;
