CREATE OR REPLACE FUNCTION public.preparar_impresion_etiquetas(_lote_id uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_cnt_prev int;
  v_tipo impresion_cinta_tipo;
  v_cintas jsonb;
  v_cnt int;
  v_pos smallint[];
  v_folio text;
  v_snapshot jsonb;
  v_imp_id uuid;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;

  SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.posicion), COUNT(*)::int, array_agg(t.posicion ORDER BY t.posicion)
    INTO v_cintas, v_cnt, v_pos
    FROM (
      SELECT id, posicion, uniones, peso_cinta_kg, ancho_util, ancho_util_unidad, observaciones
        FROM public.pesajes_cintas
       WHERE lote_id = _lote_id AND estado = 'registrada'
       ORDER BY posicion
    ) t;

  IF v_cnt = 0 OR v_cintas IS NULL THEN
    RAISE EXCEPTION 'No hay cintas registradas para imprimir.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*) INTO v_cnt_prev FROM public.impresiones_etiquetas_cintas WHERE lote_id = _lote_id;
  v_tipo := CASE WHEN v_cnt_prev = 0 THEN 'ORIGINAL'::impresion_cinta_tipo ELSE 'REIMPRESION'::impresion_cinta_tipo END;

  IF v_tipo = 'REIMPRESION' AND (_motivo IS NULL OR length(trim(_motivo)) < 5) THEN
    RAISE EXCEPTION 'Motivo obligatorio para reimpresión.' USING ERRCODE='22023';
  END IF;

  v_folio := 'IMP-' || to_char(now() AT TIME ZONE 'America/Mexico_City','YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text,1,8);

  v_snapshot := jsonb_build_object(
    'lote_id', v_lote.id,
    'muestra_calidad_id', v_lote.muestra_calidad_id,
    'numero_orden', v_lote.numero_orden,
    'numero_rollo', v_lote.numero_rollo,
    'fabricacion', v_lote.fabricacion,
    'producto_codigo', v_lote.producto_codigo,
    'producto_nombre', v_lote.producto_nombre,
    'fecha_produccion', v_lote.fecha_produccion,
    'conductor', v_lote.conductor_nombre_snapshot,
    'bobinadora', v_lote.bobinadora_nombre_snapshot,
    'datos_calidad', v_lote.datos_calidad_snapshot,
    'cintas', v_cintas
  );

  INSERT INTO public.impresiones_etiquetas_cintas(
    lote_id, folio_impresion, cantidad_etiquetas, posiciones_impresas,
    datos_impresion_snapshot, tipo, motivo_reimpresion, impreso_por
  ) VALUES (
    _lote_id, v_folio, v_cnt, v_pos, v_snapshot, v_tipo,
    CASE WHEN v_tipo = 'REIMPRESION' THEN _motivo ELSE NULL END, v_uid
  ) RETURNING id INTO v_imp_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id,
          CASE WHEN v_tipo='ORIGINAL' THEN 'ETIQUETAS_IMPRESAS' ELSE 'ETIQUETAS_REIMPRESAS' END,
          jsonb_build_object('folio', v_folio, 'cantidad', v_cnt, 'posiciones', v_pos),
          _motivo, v_uid);

  RETURN jsonb_build_object(
    'impresion_id', v_imp_id,
    'folio', v_folio,
    'tipo', v_tipo,
    'cantidad_etiquetas', v_cnt,
    'snapshot', v_snapshot
  );
END $function$;