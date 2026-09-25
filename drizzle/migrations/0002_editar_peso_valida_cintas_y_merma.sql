CREATE OR REPLACE FUNCTION public._qc_propagar_peso_rollo(_muestra_id uuid, _peso numeric, _motivo text, _uid uuid, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_pesaje uuid; v_numero text; v_codigo text; v_old_neto numeric; v_max_cintas numeric; r record;
BEGIN
  SELECT m.pesaje_id, m.numero_rollo, mq.codigo INTO v_pesaje, v_numero, v_codigo
    FROM public.muestras_calidad m LEFT JOIN public.maquinas mq ON mq.id = m.maquina_id
   WHERE m.id = _muestra_id;

  SELECT max(coalesce(peso_total_cintas_kg,0)) INTO v_max_cintas FROM public.pesajes_cintas_lotes
   WHERE muestra_calidad_id = _muestra_id AND anulado_at IS NULL;
  IF coalesce(v_max_cintas,0) > _peso THEN
    RAISE EXCEPTION 'El peso nuevo (% kg) es menor que el peso de las cintas ya cortadas de este rollo (% kg). Corrija o anule cintas en Cortes de Bobina antes de bajar el peso.', _peso, v_max_cintas
      USING ERRCODE = 'P0001';
  END IF;

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
         SET peso_bruto_anterior_kg = peso_bruto_kg, peso_neto_anterior_kg = peso_neto_kg,
             peso_neto_kg = _peso, peso_bruto_kg = _peso + coalesce(peso_eje_kg, 0),
             corregido_at = now(), corregido_por = _uid,
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
           merma_kg = CASE WHEN merma_kg IS NOT NULL THEN _peso - coalesce(peso_total_cintas_kg, 0) END,
           merma_porcentaje = CASE WHEN merma_porcentaje IS NOT NULL AND _peso > 0
             THEN ROUND(((_peso - coalesce(peso_total_cintas_kg, 0)) / _peso) * 100, 4) ELSE merma_porcentaje END,
           merma_real_kg = CASE WHEN merma_real_kg IS NOT NULL THEN _peso - coalesce(peso_total_cintas_kg, 0) END,
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
$fn$;
REVOKE ALL ON FUNCTION public._qc_propagar_peso_rollo(uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;