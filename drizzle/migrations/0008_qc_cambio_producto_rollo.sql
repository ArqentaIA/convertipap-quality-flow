CREATE TABLE public.qc_cambios_producto_rollo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  muestra_id uuid NOT NULL REFERENCES public.muestras_calidad(id) ON DELETE CASCADE,
  numero_rollo text,
  producto_anterior_id uuid,
  producto_nuevo_id uuid NOT NULL,
  especificacion_anterior_id uuid,
  especificacion_nueva_id uuid,
  especificacion_version_anterior text,
  especificacion_version_nueva text,
  sku_sap_anterior text,
  variables_snapshot_anterior jsonb NOT NULL DEFAULT '{}'::jsonb,
  mediciones_originales jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivo text NOT NULL,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qc_cambios_producto_rollo TO authenticated;
GRANT ALL ON public.qc_cambios_producto_rollo TO service_role;
ALTER TABLE public.qc_cambios_producto_rollo ENABLE ROW LEVEL SECURITY;
CREATE POLICY qc_cambios_producto_select_scoped ON public.qc_cambios_producto_rollo
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role)
      OR public.has_role(auth.uid(), 'gerente_general'::app_role)
      OR EXISTS (SELECT 1 FROM public.muestras_calidad m
                 WHERE m.id = qc_cambios_producto_rollo.muestra_id
                   AND public.user_can_use_machine(auth.uid(), m.maquina_id)));
CREATE INDEX idx_qc_cambios_producto_muestra ON public.qc_cambios_producto_rollo(muestra_id, created_at DESC);
COMMENT ON TABLE public.qc_cambios_producto_rollo IS 'Respaldo inmodificable de los datos originales del rollo antes de un cambio de producto.';

-- Resolver especificación vigente de un producto para una máquina (misma regla que la captura).
CREATE OR REPLACE FUNCTION public.qc_resolver_spec_producto(_producto_id uuid, _maquina_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT s.id FROM public.producto_especificaciones s
       JOIN public.producto_especificacion_maquinas pm ON pm.especificacion_id = s.id AND pm.maquina_id = _maquina_id
      WHERE s.producto_id = _producto_id AND s.estado = 'vigente'
      ORDER BY s.vigente_desde DESC NULLS LAST LIMIT 1),
    (SELECT s.id FROM public.producto_especificaciones s
      WHERE s.producto_id = _producto_id AND s.estado = 'vigente' AND s.perfil_key IS NULL
      ORDER BY s.vigente_desde DESC NULLS LAST LIMIT 1),
    (SELECT s.id FROM public.producto_especificaciones s
      WHERE s.producto_id = _producto_id AND s.estado = 'vigente'
      ORDER BY s.vigente_desde DESC NULLS LAST LIMIT 1)
  )
$$;
GRANT EXECUTE ON FUNCTION public.qc_resolver_spec_producto(uuid, uuid) TO authenticated;

-- Mismo criterio de evaluación que el formulario de captura.
CREATE OR REPLACE FUNCTION public._qc_eval_medicion(_v numeric, _min numeric, _max numeric, _clave text)
RETURNS qc_medicion_estado LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  k text := regexp_replace(lower(coalesce(_clave,'')), '[\s_-]', '', 'g');
  sin_tope boolean := k IN ('tensionmd','tensioncd') OR k LIKE '%blancura%' OR k LIKE '%r457%';
  tol numeric := abs(_max - _min) * 0.2;
BEGIN
  IF _v IS NULL THEN RETURN 'pendiente'; END IF;
  IF _v < _min - tol THEN RETURN 'fuera_rango_critico'; END IF;
  IF NOT sin_tope AND _v > _max + tol THEN RETURN 'fuera_rango_critico'; END IF;
  IF _v < _min THEN RETURN 'no_conforme'; END IF;
  IF NOT sin_tope AND _v > _max THEN RETURN 'no_conforme'; END IF;
  RETURN 'conforme';
END $$;

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
  -- cambio de producto
  v_prod_old uuid; v_prod_new uuid; v_prod_cambiado boolean := false;
  v_spec_old uuid; v_spec_new uuid; v_ver_old text; v_ver_new text;
  v_snap_old jsonb; v_snap_new jsonb; v_sku_old text; v_meds_orig jsonb;
  v_cod_old text; v_cod_new text; v_r record; v_pv record;
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
  SELECT m.numero_rollo, m.estado::text, m.planta_id, m.maquina_id, mq.codigo, m.dictamen::text,
         m.producto_id, m.especificacion_id, m.especificacion_version, m.variables_snapshot_json, m.sku_sap
    INTO v_numero, v_estado, v_planta, v_maquina, v_codigo, v_dict_old,
         v_prod_old, v_spec_old, v_ver_old, v_snap_old, v_sku_old
    FROM public.muestras_calidad m LEFT JOIN public.maquinas mq ON mq.id = m.maquina_id
   WHERE m.id = _muestra_id
   FOR UPDATE OF m;

  -- ===== Cambio de producto (respaldo íntegro de los datos originales) =====
  IF nullif(_cambios->>'producto_id','') IS NOT NULL THEN
    v_prod_new := (_cambios->>'producto_id')::uuid;
    IF nullif(_cambios->>'producto_esperado','') IS NOT NULL
       AND (_cambios->>'producto_esperado')::uuid IS DISTINCT FROM v_prod_old THEN
      RAISE EXCEPTION 'La bobina fue modificada por otro usuario mientras editabas. Recarga los datos antes de guardar nuevamente.';
    END IF;
    IF v_prod_new IS DISTINCT FROM v_prod_old THEN
      IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = v_prod_new AND activo) THEN
        RAISE EXCEPTION 'Producto inválido o inactivo.';
      END IF;
      v_spec_new := public.qc_resolver_spec_producto(v_prod_new, v_maquina);
      IF v_spec_new IS NULL THEN
        RAISE EXCEPTION 'El producto seleccionado no tiene especificación vigente.';
      END IF;
      v_prod_cambiado := true;
      SELECT version INTO v_ver_new FROM public.producto_especificaciones WHERE id = v_spec_new;
      SELECT codigo INTO v_cod_old FROM public.productos WHERE id = v_prod_old;
      SELECT codigo INTO v_cod_new FROM public.productos WHERE id = v_prod_new;

      SELECT coalesce(jsonb_agg(to_jsonb(mc) ORDER BY mc.created_at), '[]'::jsonb)
        INTO v_meds_orig FROM public.mediciones_calidad mc WHERE mc.muestra_id = _muestra_id;

      INSERT INTO public.qc_cambios_producto_rollo
        (evento_id, muestra_id, numero_rollo, producto_anterior_id, producto_nuevo_id,
         especificacion_anterior_id, especificacion_nueva_id, especificacion_version_anterior,
         especificacion_version_nueva, sku_sap_anterior, variables_snapshot_anterior,
         mediciones_originales, motivo, usuario_id, usuario_email)
      VALUES (v_evento, _muestra_id, v_numero, v_prod_old, v_prod_new, v_spec_old, v_spec_new,
              v_ver_old, v_ver_new, v_sku_old, coalesce(v_snap_old,'{}'::jsonb), v_meds_orig,
              v_motivo, v_uid, v_email);

      SELECT coalesce(jsonb_object_agg(pv.variable_id::text, jsonb_build_object(
               'min', pv.min_valor, 'obj', pv.objetivo, 'max', pv.max_valor,
               'unidad', coalesce(vc.unidad,''), 'etiqueta', vc.etiqueta)), '{}'::jsonb)
        INTO v_snap_new
        FROM public.producto_variables pv JOIN public.variables_calidad vc ON vc.id = pv.variable_id
       WHERE pv.especificacion_id = v_spec_new;

      UPDATE public.muestras_calidad
         SET producto_id = v_prod_new, especificacion_id = v_spec_new,
             especificacion_version = v_ver_new, variables_snapshot_json = v_snap_new,
             updated_at = now()
       WHERE id = _muestra_id;

      INSERT INTO public.qc_ediciones_rollo
        (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
      VALUES (_muestra_id, v_numero, v_codigo, 'producto', v_cod_old, v_cod_new, v_motivo, v_uid, v_email, v_evento);
      v_cambios := v_cambios + 1;

      -- Variables existentes: se conservan con los límites del nuevo producto o se retiran.
      FOR v_r IN SELECT * FROM public.mediciones_calidad WHERE muestra_id = _muestra_id LOOP
        SELECT pv.min_valor, pv.objetivo, pv.max_valor INTO v_pv
          FROM public.producto_variables pv
         WHERE pv.especificacion_id = v_spec_new AND pv.variable_id = v_r.variable_id LIMIT 1;
        IF FOUND THEN
          UPDATE public.mediciones_calidad
             SET min_snapshot = v_pv.min_valor, objetivo_snapshot = v_pv.objetivo, max_snapshot = v_pv.max_valor,
                 estado = public._qc_eval_medicion(v_r.valor, v_pv.min_valor, v_pv.max_valor, v_r.variable_clave)
           WHERE id = v_r.id;
        ELSE
          DELETE FROM public.mediciones_calidad WHERE id = v_r.id;
          INSERT INTO public.qc_ediciones_rollo
            (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
          VALUES (_muestra_id, v_numero, v_codigo, 'variable:' || v_r.variable_clave, v_r.valor::text,
                  'No aplica al nuevo producto', v_motivo, v_uid, v_email, v_evento);
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF jsonb_typeof(_cambios->'mediciones') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_cambios->'mediciones') LOOP
      v_clave := v_item->>'clave';
      IF v_clave IS NULL OR v_item->>'valor' IS NULL THEN CONTINUE; END IF;
      v_nuevo := (v_item->>'valor')::numeric;
      v_esperado := NULL;
      IF v_item->>'esperado' IS NOT NULL AND jsonb_typeof(v_item->'esperado') = 'number' THEN
        v_esperado := (v_item->>'esperado')::numeric;
      END IF;
      v_old := NULL;
      SELECT valor INTO v_old FROM public.mediciones_calidad
       WHERE muestra_id = _muestra_id AND variable_clave = v_clave LIMIT 1;
      IF v_old IS NULL THEN
        -- Variable nueva del producto seleccionado (opcional).
        IF v_prod_cambiado THEN
          SELECT pv.variable_id, pv.min_valor, pv.objetivo, pv.max_valor INTO v_pv
            FROM public.producto_variables pv JOIN public.variables_calidad vc ON vc.id = pv.variable_id
           WHERE pv.especificacion_id = v_spec_new AND vc.clave = v_clave LIMIT 1;
          IF FOUND THEN
            IF v_clave = 'peso' AND (v_nuevo <= 0 OR v_nuevo > 5000) THEN
              RAISE EXCEPTION 'Peso inválido: debe ser mayor a 0 y máximo 5,000 kg.';
            END IF;
            INSERT INTO public.mediciones_calidad
              (muestra_id, variable_id, variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, capturado_por)
            VALUES (_muestra_id, v_pv.variable_id, v_clave, v_nuevo, v_pv.min_valor, v_pv.objetivo, v_pv.max_valor,
                    public._qc_eval_medicion(v_nuevo, v_pv.min_valor, v_pv.max_valor, v_clave), v_uid);
            INSERT INTO public.qc_ediciones_rollo
              (muestra_id, numero_rollo, maquina_codigo, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_email, evento_id)
            VALUES (_muestra_id, v_numero, v_codigo, 'variable:' || v_clave, NULL, v_nuevo::text, v_motivo, v_uid, v_email, v_evento);
            v_cambios := v_cambios + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;
      IF v_esperado IS NOT NULL AND v_old IS DISTINCT FROM v_esperado THEN
        RAISE EXCEPTION 'La bobina fue modificada por otro usuario mientras editabas. Recarga los datos antes de guardar nuevamente.';
      END IF;
      IF v_old IS DISTINCT FROM v_nuevo THEN
        IF v_clave = 'peso' AND (v_nuevo <= 0 OR v_nuevo > 5000) THEN
          RAISE EXCEPTION 'Peso inválido: debe ser mayor a 0 y máximo 5,000 kg.';
        END IF;
        UPDATE public.mediciones_calidad
           SET valor = v_nuevo,
               estado = public._qc_eval_medicion(v_nuevo, min_snapshot, max_snapshot, variable_clave)
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

  -- SKU SAP debe corresponder al nuevo producto.
  IF v_prod_cambiado THEN
    SELECT sku_sap INTO v_txt_new FROM public.muestras_calidad WHERE id = _muestra_id;
    IF v_txt_new IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE producto_id = v_prod_new)
       AND NOT EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE producto_id = v_prod_new AND sku_sap = v_txt_new) THEN
      RAISE EXCEPTION 'El SKU SAP % no corresponde al nuevo producto. Selecciona un SKU válido o déjalo vacío.', v_txt_new;
    END IF;
  END IF;

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
    'Edición autorizada de rollo ' || coalesce(v_numero,'—') || ' (' || v_cambios || ' cambio(s))'
      || CASE WHEN v_prod_cambiado THEN ' · cambio de producto ' || coalesce(v_cod_old,'—') || ' → ' || coalesce(v_cod_new,'—') ELSE '' END,
    v_planta, v_maquina, v_numero, v_motivo
  );
  RETURN jsonb_build_object('ok', true, 'cambios', v_cambios, 'evento_id', v_evento);
END;
$function$;