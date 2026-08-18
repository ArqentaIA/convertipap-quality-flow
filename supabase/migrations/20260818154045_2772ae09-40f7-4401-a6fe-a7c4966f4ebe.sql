-- Trazabilidad futura del cambio de estatus. No modifica datos históricos.
DROP FUNCTION IF EXISTS public.change_roll_status(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.change_roll_status(
  p_muestra_id uuid,
  p_nuevo_estado text,
  p_dictamen text,
  p_motivo text,
  p_observaciones text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text; v_rol text;
  v_old_estado text; v_old_dictamen text; v_old_estatus text;
  v_planta uuid; v_maquina uuid; v_folio text; v_lab text;
  v_codigo text;
  v_nuevo_estatus text;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_rol_autorizador app_role;
  v_audit_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF NOT public.can_change_roll_status(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;

  -- Motivo real obligatorio: no se acepta el nombre del dictamen ni texto de sistema.
  IF length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio: escribe la razón real de la decisión (mínimo 10 caracteres).';
  END IF;
  IF lower(v_motivo) IN (
    'liberada','liberado','liberacion','liberación','concesion','concesión',
    'rechazada','rechazado','no conforme','noconforme','nc','l','c',
    'correccion_solicitada','corrección solicitada','sin motivo','(sin motivo)','n/a','na'
  ) THEN
    RAISE EXCEPTION 'Motivo no válido: describe la razón real de la decisión, no el nombre del dictamen.';
  END IF;

  IF p_dictamen IS NOT NULL AND p_dictamen NOT IN ('liberada','rechazada','concesion','correccion_solicitada') THEN
    RAISE EXCEPTION 'Dictamen no válido: %', p_dictamen;
  END IF;

  SELECT estado::text, dictamen::text, estatus_liberacion,
         planta_id, maquina_id, numero_rollo
    INTO v_old_estado, v_old_dictamen, v_old_estatus,
         v_planta, v_maquina, v_folio
    FROM public.muestras_calidad WHERE id = p_muestra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muestra no encontrada'; END IF;

  SELECT codigo INTO v_codigo FROM public.maquinas WHERE id = v_maquina;
  v_lab := CASE WHEN v_codigo IN ('MP-06','MP-07') THEN 'norte'
                WHEN v_codigo IN ('MP-04','MP-05') THEN 'sur' ELSE NULL END;

  v_nuevo_estatus := CASE p_dictamen
    WHEN 'liberada' THEN 'L'
    WHEN 'concesion' THEN 'C'
    WHEN 'rechazada' THEN 'NC'
    WHEN 'correccion_solicitada' THEN NULL
    ELSE v_old_estatus
  END;

  -- Rol autorizador derivado del rol REAL en BD, nunca del payload del cliente.
  v_rol_autorizador := CASE
    WHEN public.has_role(v_uid, 'calidad') THEN 'calidad'::app_role
    WHEN public.has_role(v_uid, 'administrador') THEN 'administrador'::app_role
    WHEN public.has_role(v_uid, 'direccion') THEN 'direccion'::app_role
    WHEN public.has_role(v_uid, 'gerente_general') THEN 'gerente_general'::app_role
    ELSE NULL
  END;

  UPDATE public.muestras_calidad
     SET estado = p_nuevo_estado::qc_muestra_estado,
         dictamen = COALESCE(p_dictamen::qc_dictamen, dictamen),
         dictamen_motivo = v_motivo,
         dictamen_observaciones = COALESCE(NULLIF(trim(coalesce(p_observaciones,'')), ''), dictamen_observaciones),
         dictamen_at = now(),
         revisado_por = v_uid,
         revisado_at = now(),
         autorizado_por = v_uid,
         autorizado_at = now(),
         rol_autorizador = COALESCE(v_rol_autorizador, rol_autorizador),
         estatus_liberacion = v_nuevo_estatus,
         updated_at = now()
   WHERE id = p_muestra_id;

  SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.audit_log (
    tabla_afectada, operacion, registro_id, datos_anteriores, datos_nuevos,
    usuario_id, usuario_email, rol, modulo, descripcion_accion,
    ip_address, user_agent, planta_id, maquina_id, laboratorio, folio_rollo,
    estatus_anterior, estatus_nuevo, motivo
  ) VALUES (
    'muestras_calidad','STATUS_CHANGE', p_muestra_id,
    jsonb_build_object('estado',v_old_estado,'dictamen',v_old_dictamen,'estatus_liberacion',v_old_estatus),
    jsonb_build_object('estado',p_nuevo_estado,'dictamen',p_dictamen,'estatus_liberacion',v_nuevo_estatus,
                       'observaciones', NULLIF(trim(coalesce(p_observaciones,'')), ''),
                       'rol_autorizador', v_rol_autorizador),
    v_uid, v_email, COALESCE(v_rol, v_rol_autorizador::text), 'control_calidad',
    'Cambio de estatus/dictamen de rollo',
    p_ip, p_user_agent, v_planta, v_maquina, v_lab, v_folio,
    v_old_estatus, v_nuevo_estatus, v_motivo
  )
  RETURNING id INTO v_audit_id;

  -- La evidencia es indivisible del cambio: sin registro de auditoría, se revierte todo.
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'No fue posible registrar la evidencia de auditoría. El cambio de estatus no fue aplicado.';
  END IF;

  RETURN p_muestra_id;
END $function$;

REVOKE ALL ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text, text) TO authenticated;