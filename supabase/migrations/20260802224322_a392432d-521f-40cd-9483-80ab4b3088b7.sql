CREATE OR REPLACE FUNCTION public.preparar_impresion_etiquetas(_lote_id uuid, _motivo text DEFAULT NULL::text, _cinta_id uuid DEFAULT NULL::uuid)
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
  v_do jsonb;
  v_total_uniones int;
  v_excluidas int;
  v_version int;
  v_qr jsonb;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;

  IF _cinta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pesajes_cintas
     WHERE id = _cinta_id AND lote_id = _lote_id AND estado = 'registrada'
  ) THEN
    RAISE EXCEPTION 'La cinta no está vigente (anulada o sustituida): no puede reimprimirse.' USING ERRCODE='22023';
  END IF;

  SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.posicion), COUNT(*)::int, array_agg(t.posicion ORDER BY t.posicion)
    INTO v_cintas, v_cnt, v_pos
    FROM (
      SELECT id, posicion, uniones, peso_cinta_kg, ancho_util, ancho_util_unidad,
             observaciones, estado, COALESCE(version_etiqueta,1) AS version_etiqueta, created_at,
             v_lote.numero_rollo AS numero_rollo_original,
             v_lote.numero_rollo || '-C' || posicion::text AS numero_rollo_etiqueta
        FROM public.pesajes_cintas
       WHERE lote_id = _lote_id AND estado = 'registrada'
         AND (_cinta_id IS NULL OR id = _cinta_id)
       ORDER BY posicion
    ) t;

  IF v_cnt = 0 OR v_cintas IS NULL THEN
    RAISE EXCEPTION 'No hay cintas registradas para imprimir.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(uniones),0)::int INTO v_total_uniones
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';

  SELECT COUNT(*)::int INTO v_excluidas
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado <> 'registrada';

  v_do := COALESCE(v_lote.datos_calidad_snapshot -> 'datos_origen', '{}'::jsonb);

  SELECT COUNT(*) INTO v_cnt_prev
    FROM public.impresiones_etiquetas_cintas
   WHERE lote_id = _lote_id
     AND (_cinta_id IS NULL OR cinta_id = _cinta_id OR cinta_id IS NULL);

  v_tipo := CASE WHEN v_cnt_prev = 0 THEN 'ORIGINAL'::impresion_cinta_tipo ELSE 'REIMPRESION'::impresion_cinta_tipo END;

  SELECT MAX(COALESCE(version_etiqueta,1)) INTO v_version
    FROM public.pesajes_cintas
   WHERE lote_id = _lote_id AND estado = 'registrada'
     AND (_cinta_id IS NULL OR id = _cinta_id);

  v_folio := 'IMP-' || to_char(now() AT TIME ZONE 'America/Mexico_City','YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text,1,8);

  v_snapshot := jsonb_build_object(
    'lote_id', v_lote.id,
    'muestra_calidad_id', v_lote.muestra_calidad_id,
    'numero_orden', COALESCE(v_lote.numero_orden, v_do ->> 'orden_produccion_manual'),
    'numero_rollo', v_lote.numero_rollo,
    'numero_rollo_original', v_lote.numero_rollo,
    'fabricacion', v_lote.fabricacion,
    'producto_codigo', v_lote.producto_codigo,
    'producto_nombre', v_lote.producto_nombre,
    'fecha_produccion', v_lote.fecha_produccion,
    'conductor', v_lote.conductor_nombre_snapshot,
    'bobinadora', v_lote.bobinadora_nombre_snapshot,
    'datos_calidad', v_lote.datos_calidad_snapshot,
    'origen_rollo', COALESCE(v_do ->> 'origen', CASE WHEN v_lote.es_manual THEN 'captura_manual' ELSE 'sistema' END),
    'peso_neto_rollo_kg', COALESCE((v_do ->> 'peso_neto_origen_kg')::numeric, v_lote.peso_bobina_madre_neto_kg),
    'diametro_rollo_cm', (v_do ->> 'diametro_origen_cm')::numeric,
    'uniones_rollo', (v_do ->> 'uniones_origen')::numeric,
    'total_uniones_cintas', v_total_uniones,
    'cintas_excluidas', v_excluidas,
    'folio', v_folio,
    'version_etiqueta', COALESCE(v_version,1),
    'generado_at', now(),
    'cintas', v_cintas
  );

  v_qr := jsonb_build_object(
    'version_esquema_qr', 1,
    'lote_id', v_lote.id,
    'numero_rollo', v_lote.numero_rollo,
    'numero_rollo_original', v_lote.numero_rollo,
    'origen_rollo', v_snapshot ->> 'origen_rollo',
    'orden_produccion', v_snapshot ->> 'numero_orden',
    'peso_neto_rollo_kg', v_snapshot -> 'peso_neto_rollo_kg',
    'diametro_rollo_cm', v_snapshot -> 'diametro_rollo_cm',
    'uniones_rollo', v_snapshot -> 'uniones_rollo',
    'total_uniones_cintas', v_total_uniones,
    'version_etiqueta', COALESCE(v_version,1),
    'cintas', v_cintas,
    'generado_at', now()
  );

  SELECT COALESCE(MAX(numero_impresion),0) + 1 INTO v_cnt_prev
    FROM public.impresiones_etiquetas_cintas WHERE lote_id = _lote_id;

  INSERT INTO public.impresiones_etiquetas_cintas(
    lote_id, cinta_id, folio_impresion, cantidad_etiquetas, posiciones_impresas,
    datos_impresion_snapshot, tipo, motivo_reimpresion, impreso_por,
    numero_impresion, version_etiqueta, qr_contenido, total_uniones_cintas
  ) VALUES (
    _lote_id, _cinta_id, v_folio, v_cnt, v_pos, v_snapshot, v_tipo,
    CASE WHEN v_tipo = 'REIMPRESION' THEN _motivo ELSE NULL END, v_uid,
    v_cnt_prev, COALESCE(v_version,1), v_qr, v_total_uniones
  ) RETURNING id INTO v_imp_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id, _cinta_id,
          CASE WHEN v_tipo='ORIGINAL' THEN 'ETIQUETAS_IMPRESAS' ELSE 'ETIQUETAS_REIMPRESAS' END,
          jsonb_build_object('folio', v_folio, 'cantidad', v_cnt, 'posiciones', v_pos,
                             'numero_impresion', v_cnt_prev, 'version_etiqueta', COALESCE(v_version,1),
                             'total_uniones_cintas', v_total_uniones),
          _motivo, v_uid);

  RETURN jsonb_build_object(
    'impresion_id', v_imp_id,
    'folio', v_folio,
    'tipo', v_tipo,
    'numero_impresion', v_cnt_prev,
    'version_etiqueta', COALESCE(v_version,1),
    'total_uniones_cintas', v_total_uniones,
    'cintas_excluidas', v_excluidas,
    'cantidad_etiquetas', v_cnt,
    'snapshot', v_snapshot
  );
END $function$;