CREATE OR REPLACE FUNCTION public.corregir_cinta(_cinta_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _motivo text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_ant record;
  v_lote record;
  v_total numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;
  IF _peso_cinta_kg IS NULL OR _peso_cinta_kg <= 0 THEN
    RAISE EXCEPTION 'El peso real de la cinta debe ser mayor a 0.' USING ERRCODE='22023';
  END IF;

  SELECT id INTO v_new_id FROM public.pesajes_cintas WHERE idempotency_key = _idempotency;
  IF v_new_id IS NOT NULL THEN RETURN jsonb_build_object('cinta_id', v_new_id, 'idempotent', true); END IF;

  SELECT * INTO v_ant FROM public.pesajes_cintas WHERE id = _cinta_id FOR UPDATE;
  IF v_ant.id IS NULL THEN RAISE EXCEPTION 'Cinta no encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_ant.estado <> 'registrada' THEN
    RAISE EXCEPTION 'Sólo se pueden corregir cintas registradas.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||v_ant.lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = v_ant.lote_id FOR UPDATE;
  IF v_lote.estado = 'anulado' THEN
    RAISE EXCEPTION 'Lote anulado.' USING ERRCODE='22023';
  END IF;
  IF v_lote.estado = 'finalizado'
     AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'calidad')) THEN
    RAISE EXCEPTION 'Lote finalizado: corrección restringida a rol autorizado.' USING ERRCODE='42501';
  END IF;

  UPDATE public.pesajes_cintas
     SET estado = 'sustituida', motivo_anulacion = _motivo,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = _cinta_id;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas
    WHERE lote_id = v_ant.lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pesajes_cintas (
    lote_id, posicion, uniones, peso_cinta_kg, ancho_util,
    observaciones, sustituye_a_cinta_id, idempotency_key, creado_por, version_etiqueta,
    lote_logistico_pza, rollo_id
  ) VALUES (
    v_ant.lote_id, v_ant.posicion, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''),
    v_ant.id, _idempotency, v_uid, COALESCE(v_ant.version_etiqueta,1) + 1,
    v_ant.lote_logistico_pza, v_ant.rollo_id
  ) RETURNING id INTO v_new_id;

  v_total := v_total + _peso_cinta_kg;
  UPDATE public.pesajes_cintas_lotes
     SET peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_lote.peso_bobina_madre_neto_kg - v_total,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = v_ant.lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (v_ant.lote_id, v_new_id, 'CINTA_CORREGIDA',
    jsonb_build_object('peso_real_kg', v_ant.peso_cinta_kg, 'uniones', v_ant.uniones, 'ancho_util', v_ant.ancho_util, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1), 'lote_logistico_pza', v_ant.lote_logistico_pza),
    jsonb_build_object('peso_real_kg', _peso_cinta_kg, 'uniones', _uniones, 'ancho_util', _ancho_util, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1)+1, 'lote_logistico_pza', v_ant.lote_logistico_pza, 'idempotency_key', _idempotency),
    _motivo, v_uid);

  RETURN jsonb_build_object('cinta_id', v_new_id, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1)+1);
END
$function$;