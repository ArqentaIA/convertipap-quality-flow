CREATE OR REPLACE FUNCTION public.finalizar_lote_cintas(_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_total numeric; v_cnt int;
  v_merma numeric; v_pct numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto.' USING ERRCODE='22023';
  END IF;
  IF v_lote.pesaje_bobina_madre_id IS NULL OR v_lote.peso_bobina_madre_neto_kg IS NULL
     OR v_lote.peso_bobina_madre_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0), COUNT(*)::int INTO v_total, v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';

  IF v_cnt < 1 THEN RAISE EXCEPTION 'Debe registrar al menos una cinta.' USING ERRCODE='22023'; END IF;
  IF v_cnt > 20 THEN RAISE EXCEPTION 'Máximo 20 cintas.' USING ERRCODE='22023'; END IF;
  IF v_total > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  v_merma := v_lote.peso_bobina_madre_neto_kg - v_total;
  v_pct := CASE WHEN v_lote.peso_bobina_madre_neto_kg > 0
                THEN ROUND((v_merma / v_lote.peso_bobina_madre_neto_kg) * 100, 4)
                ELSE 0 END;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_cnt,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_merma,
         merma_kg = v_merma,
         merma_porcentaje = v_pct,
         estado = 'finalizado',
         finalizado_por = v_uid,
         finalizado_at = now(),
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, 'LOTE_FINALIZADO',
    jsonb_build_object('peso_bobina_madre_neto_kg', v_lote.peso_bobina_madre_neto_kg,
                       'cintas_vigentes', v_cnt,
                       'peso_total_real_cintas_kg', v_total,
                       'merma_real_kg', v_merma,
                       'merma_real_pct', v_pct),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'merma_kg', v_merma, 'merma_porcentaje', v_pct);
END $function$;

CREATE OR REPLACE FUNCTION public.reabrir_lote_cintas(_lote_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_cnt int;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Debe indicar un motivo (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'finalizado' THEN
    RAISE EXCEPTION 'Solo se puede reabrir un lote finalizado.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_cnt >= 20 THEN
    RAISE EXCEPTION 'El lote ya tiene el máximo de 20 cintas.' USING ERRCODE='22023';
  END IF;

  UPDATE public.pesajes_cintas_lotes
     SET estado = 'abierto',
         merma_kg = NULL,
         merma_porcentaje = NULL,
         finalizado_por = NULL,
         finalizado_at = NULL,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id, 'LOTE_REABIERTO',
    jsonb_build_object('estado','finalizado','merma_kg',v_lote.merma_kg,'cintas_vigentes',v_cnt),
    jsonb_build_object('estado','abierto'),
    btrim(_motivo), v_uid);

  RETURN jsonb_build_object('estado','abierto','cintas_vigentes', v_cnt);
END $function$;

REVOKE ALL ON FUNCTION public.reabrir_lote_cintas(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reabrir_lote_cintas(uuid, text) TO authenticated;