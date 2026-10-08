-- Edición de bobina madre: ventana 24 h, evento único por guardado y control de concurrencia.

ALTER TABLE public.qc_ediciones_rollo ADD COLUMN IF NOT EXISTS evento_id uuid;
CREATE INDEX IF NOT EXISTS qc_ediciones_rollo_created_idx ON public.qc_ediciones_rollo (created_at DESC);
CREATE INDEX IF NOT EXISTS qc_ediciones_rollo_maquina_idx ON public.qc_ediciones_rollo (maquina_codigo);
CREATE INDEX IF NOT EXISTS qc_ediciones_rollo_evento_idx ON public.qc_ediciones_rollo (evento_id);

CREATE OR REPLACE FUNCTION public.qc_puede_editar_rollo(_muestra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_codigo text;
  v_cap timestamptz;
  v_expira timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'Sesión no válida.');
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  SELECT mq.codigo, COALESCE(m.capturado_at, m.hora_muestreo)
    INTO v_codigo, v_cap
    FROM public.muestras_calidad m
    LEFT JOIN public.maquinas mq ON mq.id = m.maquina_id
   WHERE m.id = _muestra_id;

  IF v_codigo IS NULL AND v_cap IS NULL THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'Rollo no encontrado.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.qc_edicion_permisos p
     WHERE lower(p.email) = lower(coalesce(v_email,''))
       AND p.maquina_codigo = v_codigo
       AND p.activo
  ) THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'No tiene autorización para editar rollos de esta máquina.', 'maquina', v_codigo);
  END IF;

  v_expira := v_cap + interval '24 hours';
  IF now() > v_expira THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'La ventana de edición de 24 horas ya venció.', 'expira_at', v_expira, 'maquina', v_codigo);
  END IF;

  RETURN jsonb_build_object('puede', true, 'expira_at', v_expira, 'maquina', v_codigo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.qc_editar_rollo(_muestra_id uuid, _cambios jsonb, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_permiso jsonb;
  v_motivo text := trim(coalesce(_motivo, ''));
  v_obs text := trim(coalesce(_cambios->>'observaciones_generales', ''));
  v_codigo text; v_numero text; v_estado text; v_planta uuid; v_maquina uuid;
  v_cambios int := 0;
  v_item jsonb; v_clave text; v_nuevo numeric; v_old numeric; v_esperado numeric;
  v_txt_old text; v_txt_new text; v_dict_old text; v_dict_new text; v_snapshot jsonb;
  v_evento uuid := gen_random_uuid();
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
      v_esperado := NULL;
      IF v_item->>'esperado' IS NOT NULL AND jsonb_typeof(v_item->'esperado') = 'number' THEN
        v_esperado := (v_item->>'esperado')::numeric;
      END IF;
      SELECT valor INTO v_old FROM public.mediciones_calidad
       WHERE muestra_id = _muestra_id AND variable_clave = v_clave LIMIT 1;
      IF v_old IS NULL THEN CONTINUE; END IF;
      -- Control de concurrencia: si el cliente conoce el valor que vio al abrir
      -- el formulario y ya no coincide, otro usuario modificó la bobina.
      IF v_esperado IS NOT NULL AND v_old IS DISTINCT FROM v_esperado THEN
        RAISE EXCEPTION 'La bobina fue modificada por otro usuario mientras editabas. Recarga los datos antes de guardar nuevamente.';
      END IF;
      IF v_old IS DISTINCT FROM v_nuevo THEN
        IF v_clave = 'peso' AND (v_nuevo <= 0 OR v_nuevo > 5000) THEN
          RAISE EXCEPTION 'Peso inválido: debe ser mayor a 0 y máximo 5,000 kg.';
        END IF;
        UPDATE public.mediciones_calidad SET valor = v_nuevo
         WHERE muestra_id = _muestra_id AND variable_clave = v_clave;
        INSERT INTO public.qc_ediciones_rollo
          (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
        VALUES (_muestra_id, v_numero, v_codigo, 'variable:' || v_clave, v_old::text, v_nuevo::text, v_motivo, v_uid, v_email, v_evento);
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
          (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
        VALUES (_muestra_id, v_numero, v_codigo, v_clave, v_txt_old, v_txt_new, v_motivo, v_uid, v_email, v_evento);
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
      (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
    VALUES (_muestra_id, v_numero, v_codigo, 'dictamen', v_dict_old, v_dict_new, v_motivo, v_uid, v_email, v_evento);
    v_cambios := v_cambios + 1;
  END IF;

  IF v_cambios = 0 THEN
    RETURN jsonb_build_object('ok', true, 'cambios', 0, 'mensaje', 'Sin cambios que aplicar.');
  END IF;

  PERFORM public.qc_recalc_estatus_muestra(_muestra_id);

  SELECT jsonb_agg(to_jsonb(e) - 'id') INTO v_snapshot
    FROM public.qc_ediciones_rollo e
   WHERE e.evento_id = v_evento;

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
  RETURN jsonb_build_object('ok', true, 'cambios', v_cambios, 'evento_id', v_evento);
END;
$function$;