CREATE OR REPLACE FUNCTION public.change_roll_status(
  p_muestra_id uuid,
  p_nuevo_estado text,
  p_dictamen text,
  p_motivo text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text; v_rol text;
  v_old_estado text; v_old_dictamen text;
  v_planta uuid; v_maquina uuid; v_folio text; v_lab text;
  v_codigo text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF NOT public.can_change_roll_status(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).';
  END IF;

  SELECT estado::text, dictamen::text, planta_id, maquina_id, numero_rollo
    INTO v_old_estado, v_old_dictamen, v_planta, v_maquina, v_folio
    FROM public.muestras_calidad WHERE id = p_muestra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muestra no encontrada'; END IF;

  SELECT codigo INTO v_codigo FROM public.maquinas WHERE id = v_maquina;
  v_lab := CASE WHEN v_codigo IN ('MP-06','MP-07') THEN 'norte'
                WHEN v_codigo IN ('MP-04','MP-05') THEN 'sur' ELSE NULL END;

  UPDATE public.muestras_calidad
     SET estado = p_nuevo_estado::muestra_estado,
         dictamen = COALESCE(p_dictamen::dictamen_calidad, dictamen),
         dictamen_motivo = p_motivo,
         dictamen_at = now(),
         autorizado_por = v_uid,
         autorizado_at = now(),
         updated_at = now()
   WHERE id = p_muestra_id;

  SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_uid;

  -- SECURITY: never trust client-supplied p_ip / p_user_agent — they could be
  -- forged to poison the audit log. Record NULL until a server-side capture is wired in.
  INSERT INTO public.audit_log (
    tabla_afectada, operacion, registro_id, datos_anteriores, datos_nuevos,
    usuario_id, usuario_email, rol, modulo, descripcion_accion,
    ip_address, user_agent, planta_id, maquina_id, laboratorio, folio_rollo,
    estatus_anterior, estatus_nuevo, motivo
  ) VALUES (
    'muestras_calidad','STATUS_CHANGE', p_muestra_id,
    jsonb_build_object('estado',v_old_estado,'dictamen',v_old_dictamen),
    jsonb_build_object('estado',p_nuevo_estado,'dictamen',p_dictamen),
    v_uid, v_email, v_rol, 'control_calidad',
    'Cambio de estatus de rollo',
    NULL, NULL, v_planta, v_maquina, v_lab, v_folio,
    v_old_estado, p_nuevo_estado, p_motivo
  );

  RETURN p_muestra_id;
END $$;