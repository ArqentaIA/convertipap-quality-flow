CREATE OR REPLACE FUNCTION public.actualizar_datos_operativos_lote_cintas(
  _lote_id uuid,
  _conductor_id uuid,
  _bobinadora_id uuid,
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_cond record;
  v_bob record;
  v_ant jsonb;
  v_new jsonb;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  IF NOT (public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'calidad')
       OR public.has_role(v_uid,'gerente_general')) THEN
    RAISE EXCEPTION 'Operación restringida a roles autorizados.' USING ERRCODE='42501';
  END IF;

  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN
    RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002';
  END IF;
  IF v_lote.estado = 'anulado' THEN
    RAISE EXCEPTION 'Lote anulado.' USING ERRCODE='22023';
  END IF;

  SELECT id, nombre INTO v_cond FROM public.operarios WHERE id = _conductor_id AND activo = true;
  IF v_cond.id IS NULL THEN
    RAISE EXCEPTION 'Conductor no válido o inactivo.' USING ERRCODE='22023';
  END IF;

  SELECT id, nombre INTO v_bob FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo = true;
  IF v_bob.id IS NULL THEN
    RAISE EXCEPTION 'Bobinadora no válida o inactiva.' USING ERRCODE='22023';
  END IF;

  v_ant := jsonb_build_object(
    'conductor_id', v_lote.conductor_id,
    'conductor_nombre', v_lote.conductor_nombre_snapshot,
    'bobinadora_id', v_lote.bobinadora_id,
    'bobinadora_nombre', v_lote.bobinadora_nombre_snapshot
  );
  v_new := jsonb_build_object(
    'conductor_id', v_cond.id,
    'conductor_nombre', v_cond.nombre,
    'bobinadora_id', v_bob.id,
    'bobinadora_nombre', v_bob.nombre
  );

  UPDATE public.pesajes_cintas_lotes
     SET conductor_id = v_cond.id,
         conductor_nombre_snapshot = v_cond.nombre,
         bobinadora_id = v_bob.id,
         bobinadora_nombre_snapshot = v_bob.nombre,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id, NULL, 'DATOS_OPERATIVOS_ACTUALIZADOS', v_ant, v_new, _motivo, v_uid);

  RETURN jsonb_build_object('ok', true, 'lote_id', _lote_id, 'anterior', v_ant, 'nuevo', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) TO service_role;