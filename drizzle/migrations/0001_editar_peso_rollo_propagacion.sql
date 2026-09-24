CREATE OR REPLACE FUNCTION public.pesajes_immutables_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(current_setting('app.correccion_peso_autorizada', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.peso_bruto_kg      IS DISTINCT FROM OLD.peso_bruto_kg      OR
     NEW.peso_neto_kg       IS DISTINCT FROM OLD.peso_neto_kg       OR
     NEW.peso_eje_kg        IS DISTINCT FROM OLD.peso_eje_kg        OR
     NEW.evidencia_path     IS DISTINCT FROM OLD.evidencia_path     OR
     NEW.fecha_hora_pesaje  IS DISTINCT FROM OLD.fecha_hora_pesaje  OR
     NEW.capturado_por      IS DISTINCT FROM OLD.capturado_por      OR
     NEW.ocr_confianza      IS DISTINCT FROM OLD.ocr_confianza      OR
     NEW.ocr_raw            IS DISTINCT FROM OLD.ocr_raw            OR
     NEW.numero_rollo       IS DISTINCT FROM OLD.numero_rollo       OR
     NEW.maquina_id         IS DISTINCT FROM OLD.maquina_id         THEN
    RAISE EXCEPTION 'Los datos de pesaje registrados son inmutables. Elimina el registro si requiere corrección.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._qc_propagar_peso_rollo(_muestra_id uuid, _peso numeric, _motivo text, _uid uuid, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pesaje uuid;
  v_numero text;
  v_codigo text;
  v_old_neto numeric;
  r record;
BEGIN
  SELECT m.pesaje_id, m.numero_rollo, mq.codigo INTO v_pesaje, v_numero, v_codigo
    FROM public.muestras_calidad m LEFT JOIN public.maquinas mq ON mq.id = m.maquina_id
   WHERE m.id = _muestra_id;
  IF v_pesaje IS NULL THEN
    SELECT pesaje_bobina_madre_id INTO v_pesaje FROM public.pesajes_cintas_lotes
     WHERE muestra_calidad_id = _muestra_id AND pesaje_bobina_madre_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_pesaje IS NOT NULL THEN
    SELECT peso_neto_kg INTO v_old_neto FROM public.pesajes_bobina_madre WHERE id = v_pesaje AND NOT coalesce(anulado,false);
    IF FOUND AND v_old_neto IS DISTINCT FROM _peso THEN
      PERFORM set_config('app.correccion_peso_autorizada', 'on', true);
      UPDATE public.pesajes_bobina_madre
         SET peso_bruto_anterior_kg = peso_bruto_kg,
             peso_neto_anterior_kg = peso_neto_kg,
             peso_neto_kg = _peso,
             peso_bruto_kg = _peso + coalesce(peso_eje_kg, 0),
             corregido_at = now(),
             corregido_por = _uid,
             correccion_motivo = 'Edición de peso desde Control de Calidad: ' || _motivo
       WHERE id = v_pesaje;
      PERFORM set_config('app.correccion_peso_autorizada', 'off', true);
      INSERT INTO public.qc_ediciones_rollo
        (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email)
      VALUES (_muestra_id, v_numero, v_codigo, 'pesaje_rollo:peso_neto', v_old_neto::text, _peso::text, _motivo, _uid, _email);
    END IF;
  END IF;

  FOR r IN SELECT id, peso_bobina_madre_neto_kg FROM public.pesajes_cintas_lotes
            WHERE muestra_calidad_id = _muestra_id AND anulado_at IS NULL
              AND peso_bobina_madre_neto_kg IS DISTINCT FROM _peso LOOP
    UPDATE public.pesajes_cintas_lotes
       SET peso_bobina_madre_neto_kg = _peso,
           peso_pendiente_kg = _peso - coalesce(peso_total_cintas_kg, 0),
           datos_calidad_snapshot = CASE WHEN datos_calidad_snapshot ? 'datos_origen'
             THEN jsonb_set(datos_calidad_snapshot, '{datos_origen,peso_neto_origen_kg}', to_jsonb(_peso))
             ELSE datos_calidad_snapshot END,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.qc_ediciones_rollo
      (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email)
    VALUES (_muestra_id, v_numero, v_codigo, 'cortes_bobina:peso_origen', r.peso_bobina_madre_neto_kg::text, _peso::text, _motivo, _uid, _email);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._qc_propagar_peso_rollo(uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.qc_editar_rollo(_muestra_id uuid, _cambios jsonb, _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_permiso jsonb;
  v_motivo text := trim(coalesce(_motivo, ''));
  v_obs text := trim(coalesce(_cambios->>'observaciones_generales', ''));
  v_codigo text; v_numero text; v_estado text; v_planta uuid; v_maquina uuid;
  v_cambios int := 0;
  v_item jsonb; v_clave text; v_nuevo numeric; v_old numeric;
  v_txt_old text; v_txt_new text; v_dict_old text; v_dict_new text; v_snapshot jsonb;
BEGIN
  IF v_motivo = '' OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio: describe la razón real de la corrección (mínimo 10 caracteres).';
  END IF;
  IF length(v_obs) < 10 THEN
    RAISE EXCEPTION 'Observaciones obligatorias: describe la observación del rollo (mínimo 10 caracteres).';
  END IF;
  v_permiso := public.qc_puede_editar_rollo(_muestra_id);
  IF NOT (v_permiso->>'puede')::boolean THEN
    RAISE EXCEPTION '%', coalesce(v_permiso->>'motivo', 'Edición no autorizada.');
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  SELECT m.numero_rollo, m.estado::text, m.planta_id, m.maquina_id, mq.codigo, m.dictamen::text
    INTO v_numero, v_estado, v_planta, v_maquina, v_codigo, v_dict_old
    FROM public.muestras_calidad m LEFT JOIN public.maquinas mq ON mq.id = m.maquina_id
   WHERE m.id = _muestra_id;

  IF jsonb_typeof(_cambios->'mediciones') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_cambios->'mediciones') LOOP
      v_clave := v_item->>'clave';
      IF v_clave IS NULL OR v_item->>'valor' IS NULL THEN CONTINUE; END IF;
      v_nuevo := (v_item->>'valor')::numeric;
      SELECT valor INTO v_old FROM public.mediciones_calidad
       WHERE muestra_id = _muestra_id AND variable_clave = v_clave LIMIT 1;
      IF v_old IS NULL THEN CONTINUE; END IF;
      IF v_old IS DISTINCT FROM v_nuevo THEN
        IF v_clave = 'peso' AND (v_nuevo <= 0 OR v_nuevo > 5000) THEN
          RAISE EXCEPTION 'Peso inválido: debe ser mayor a 0 y máximo 5,000 kg.';
        END IF;
        UPDATE public.mediciones_calidad SET valor = v_nuevo
         WHERE muestra_id = _muestra_id AND variable_clave = v_clave;
        INSERT INTO public.qc_ediciones_rollo
          (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email)
        VALUES (_muestra_id, v_numero, v_codigo, 'variable:' || v_clave, v_old::text, v_nuevo::text, v_motivo, v_uid, v_email);
        v_cambios := v_cambios + 1;
        IF v_clave = 'peso' THEN
          PERFORM public._qc_propagar_peso_rollo(_muestra_id, v_nuevo, v_motivo, v_uid, v_email);
        END IF;
      END IF;
    END LOOP;
  END IF;

  FOREACH v_clave IN ARRAY ARRAY['operador','jefe_maquina','analista','observaciones_generales','sku_sap'] LOOP
    IF _cambios ? v_clave THEN
      v_txt_new := nullif(trim(coalesce(_cambios->>v_clave, '')), '');
      IF v_clave = 'observaciones_generales' THEN v_txt_new := coalesce(v_txt_new, ''); END IF;
      EXECUTE format('SELECT %I::text FROM public.muestras_calidad WHERE id = $1', v_clave)
        INTO v_txt_old USING _muestra_id;
      IF v_txt_old IS DISTINCT FROM v_txt_new THEN
        EXECUTE format('UPDATE public.muestras_calidad SET %I = $1, updated_at = now() WHERE id = $2', v_clave)
          USING v_txt_new, _muestra_id;
        INSERT INTO public.qc_ediciones_rollo
          (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email)
        VALUES (_muestra_id, v_numero, v_codigo, v_clave, v_txt_old, v_txt_new, v_motivo, v_uid, v_email);
        v_cambios := v_cambios + 1;
      END IF;
    END IF;
  END LOOP;

  v_dict_new := nullif(trim(coalesce(_cambios->>'dictamen','')), '');
  IF v_dict_new IS NOT NULL AND v_dict_new IS DISTINCT FROM v_dict_old THEN
    PERFORM public.change_roll_status(_muestra_id,
      CASE v_dict_new WHEN 'liberada' THEN 'liberada' WHEN 'concesion' THEN 'concesion'
        WHEN 'rechazada' THEN 'rechazada' ELSE v_estado END,
      v_dict_new, v_motivo, NULL, NULL, NULL);
    INSERT INTO public.qc_ediciones_rollo
      (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email)
    VALUES (_muestra_id, v_numero, v_codigo, 'dictamen', v_dict_old, v_dict_new, v_motivo, v_uid, v_email);
    v_cambios := v_cambios + 1;
  END IF;

  IF v_cambios = 0 THEN
    RETURN jsonb_build_object('ok', true, 'cambios', 0, 'mensaje', 'Sin cambios que aplicar.');
  END IF;

  PERFORM public.qc_recalc_estatus_muestra(_muestra_id);

  SELECT jsonb_agg(to_jsonb(e) - 'id') INTO v_snapshot
    FROM public.qc_ediciones_rollo e
   WHERE e.muestra_id = _muestra_id AND e.motivo = v_motivo AND e.usuario_id = v_uid
     AND e.created_at > now() - interval '1 minute';

  INSERT INTO public.audit_log (
    tabla_afectada, operacion, registro_id, datos_nuevos,
    usuario_id, usuario_email, modulo, descripcion_accion,
    planta_id, maquina_id, folio_rollo, motivo
  ) VALUES (
    'muestras_calidad', 'UPDATE', _muestra_id, coalesce(v_snapshot, '[]'::jsonb),
    v_uid, v_email, 'calidad',
    'Edición autorizada de rollo ' || coalesce(v_numero,'—') || ' (' || v_cambios || ' cambio(s))',
    v_planta, v_maquina, v_numero, v_motivo
  );
  RETURN jsonb_build_object('ok', true, 'cambios', v_cambios);
END;
$function$;