CREATE OR REPLACE FUNCTION public.pc_puede_editar_corte(_lote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_email text; v_codigo text; v_ref timestamptz; v_expira timestamptz; v_estado text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('puede', false, 'motivo', 'Sesión no válida.'); END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  SELECT COALESCE(mq1.codigo, mq2.codigo), l.created_at, l.estado::text
    INTO v_codigo, v_ref, v_estado
    FROM public.pesajes_cintas_lotes l
    LEFT JOIN public.muestras_calidad m ON m.id = l.muestra_calidad_id
    LEFT JOIN public.maquinas mq1 ON mq1.id = m.maquina_id
    LEFT JOIN public.pesajes_bobina_madre pb ON pb.id = l.pesaje_bobina_madre_id
    LEFT JOIN public.maquinas mq2 ON mq2.id = pb.maquina_id
   WHERE l.id = _lote_id;
  IF v_ref IS NULL THEN RETURN jsonb_build_object('puede', false, 'motivo', 'Lote no encontrado.'); END IF;
  IF v_estado = 'anulado' THEN RETURN jsonb_build_object('puede', false, 'motivo', 'Lote anulado.'); END IF;
  IF NOT public.has_role(v_uid, 'administrador') AND NOT EXISTS (
    SELECT 1 FROM public.qc_edicion_permisos p
     WHERE lower(p.email) = lower(coalesce(v_email,'')) AND p.maquina_codigo = v_codigo AND p.activo
  ) THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'No tiene autorización para editar cortes de esta máquina.', 'maquina', v_codigo);
  END IF;
  v_expira := v_ref + interval '36 hours';
  IF now() > v_expira THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'La ventana de edición de 36 horas ya venció.', 'expira_at', v_expira, 'maquina', v_codigo);
  END IF;
  RETURN jsonb_build_object('puede', true, 'expira_at', v_expira, 'maquina', v_codigo);
END $$;

CREATE OR REPLACE FUNCTION public.pc_editar_cinta_corte(
  _cinta_id uuid, _peso_cinta_kg numeric, _ancho_util numeric, _sku_sap text,
  _uniones integer, _observaciones text, _estatus text, _motivo text, _idempotency uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_ant record; v_lote record; v_perm jsonb; v_total numeric; v_new_id uuid; v_ver int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE='42501'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).' USING ERRCODE='22023'; END IF;
  IF _peso_cinta_kg IS NULL OR _peso_cinta_kg <= 0 THEN RAISE EXCEPTION 'El peso debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF _ancho_util IS NULL OR _ancho_util <= 0 THEN RAISE EXCEPTION 'El ancho útil debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF _uniones IS NULL OR _uniones < 0 THEN RAISE EXCEPTION 'Uniones inválidas.' USING ERRCODE='22023'; END IF;
  IF _estatus IS NOT NULL AND _estatus NOT IN ('L','C','NC') THEN RAISE EXCEPTION 'Estatus inválido.' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_new_id FROM public.pesajes_cintas WHERE idempotency_key = _idempotency;
  IF v_new_id IS NOT NULL THEN RETURN jsonb_build_object('cinta_id', v_new_id, 'idempotent', true); END IF;

  SELECT * INTO v_ant FROM public.pesajes_cintas WHERE id = _cinta_id FOR UPDATE;
  IF v_ant.id IS NULL THEN RAISE EXCEPTION 'Cinta no encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_ant.estado <> 'registrada' THEN RAISE EXCEPTION 'La cinta ya fue modificada por otro usuario; recargue el detalle.' USING ERRCODE='40001'; END IF;

  v_perm := public.pc_puede_editar_corte(v_ant.lote_id);
  IF NOT COALESCE((v_perm->>'puede')::boolean, false) THEN
    RAISE EXCEPTION '%', v_perm->>'motivo' USING ERRCODE='42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||v_ant.lote_id::text));
  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = v_ant.lote_id FOR UPDATE;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total FROM public.pesajes_cintas
   WHERE lote_id = v_ant.lote_id AND estado = 'registrada' AND id <> _cinta_id;
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre.' USING ERRCODE='22023'; END IF;

  UPDATE public.pesajes_cintas SET estado = 'sustituida', motivo_anulacion = _motivo, actualizado_por = v_uid, updated_at = now()
   WHERE id = _cinta_id;

  v_ver := COALESCE(v_ant.version_etiqueta,1) + 1;
  INSERT INTO public.pesajes_cintas (lote_id, posicion, uniones, peso_cinta_kg, ancho_util, ancho_util_unidad,
    observaciones, sustituye_a_cinta_id, idempotency_key, creado_por, version_etiqueta,
    lote_logistico_pza, rollo_id, sku_sap, estatus_liberacion)
  VALUES (v_ant.lote_id, v_ant.posicion, _uniones, _peso_cinta_kg, _ancho_util, v_ant.ancho_util_unidad,
    NULLIF(trim(COALESCE(_observaciones,'')),''), v_ant.id, _idempotency, v_uid, v_ver,
    v_ant.lote_logistico_pza, v_ant.rollo_id, NULLIF(trim(COALESCE(_sku_sap,'')),''), _estatus)
  RETURNING id INTO v_new_id;

  v_total := v_total + _peso_cinta_kg;
  UPDATE public.pesajes_cintas_lotes SET peso_total_cintas_kg = v_total,
         peso_pendiente_kg = peso_bobina_madre_neto_kg - v_total, actualizado_por = v_uid, updated_at = now()
   WHERE id = v_ant.lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (v_ant.lote_id, v_new_id, 'CINTA_EDITADA_DETALLE',
    jsonb_build_object('cinta_id', v_ant.id, 'peso_real_kg', v_ant.peso_cinta_kg, 'ancho_util', v_ant.ancho_util, 'sku_sap', v_ant.sku_sap,
      'uniones', v_ant.uniones, 'observaciones', v_ant.observaciones, 'estatus_liberacion', v_ant.estatus_liberacion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1)),
    jsonb_build_object('cinta_id', v_new_id, 'peso_real_kg', _peso_cinta_kg, 'ancho_util', _ancho_util, 'sku_sap', NULLIF(trim(COALESCE(_sku_sap,'')),''),
      'uniones', _uniones, 'observaciones', NULLIF(trim(COALESCE(_observaciones,'')),''), 'estatus_liberacion', _estatus, 'version_etiqueta', v_ver),
    trim(_motivo), v_uid);

  RETURN jsonb_build_object('cinta_id', v_new_id, 'posicion', v_ant.posicion, 'version_etiqueta', v_ver);
END $$;

REVOKE ALL ON FUNCTION public.pc_editar_cinta_corte(uuid,numeric,numeric,text,integer,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_editar_cinta_corte(uuid,numeric,numeric,text,integer,text,text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pc_puede_editar_corte(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_puede_editar_corte(uuid) TO authenticated;