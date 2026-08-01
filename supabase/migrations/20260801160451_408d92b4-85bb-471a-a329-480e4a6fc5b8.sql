ALTER TABLE public.pesajes_cintas_lotes
  ADD COLUMN IF NOT EXISTS merma_real_kg numeric(10,2);

CREATE OR REPLACE FUNCTION public.finalizar_lote_cintas(_lote_id uuid, _merma_real_kg numeric DEFAULT NULL)
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

  IF _merma_real_kg IS NULL THEN
    RAISE EXCEPTION 'Debe capturar la merma real (kg) para finalizar el rollo.' USING ERRCODE='22023';
  END IF;
  IF _merma_real_kg < 0 THEN
    RAISE EXCEPTION 'La merma real no puede ser negativa.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto.' USING ERRCODE='22023';
  END IF;

  IF NOT COALESCE(v_lote.es_manual, false) AND v_lote.pesaje_bobina_madre_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;

  IF v_lote.peso_bobina_madre_neto_kg IS NULL OR v_lote.peso_bobina_madre_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;

  IF _merma_real_kg > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'La merma real no puede superar el peso neto del rollo de origen.' USING ERRCODE='22023';
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
         merma_real_kg = ROUND(_merma_real_kg, 2),
         estado = 'finalizado',
         finalizado_por = v_uid,
         finalizado_at = now(),
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, 'LOTE_FINALIZADO',
    jsonb_build_object('peso_bobina_madre_neto_kg', v_lote.peso_bobina_madre_neto_kg,
                       'origen_peso', CASE WHEN COALESCE(v_lote.es_manual,false) THEN 'manual' ELSE 'bobina_madre' END,
                       'cintas_vigentes', v_cnt,
                       'peso_total_real_cintas_kg', v_total,
                       'merma_sistema_kg', v_merma,
                       'merma_sistema_pct', v_pct,
                       'merma_real_kg', ROUND(_merma_real_kg, 2)),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'merma_kg', v_merma, 'merma_porcentaje', v_pct,
                            'merma_real_kg', ROUND(_merma_real_kg, 2));
END;
$function$;