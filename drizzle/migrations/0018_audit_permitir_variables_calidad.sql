CREATE OR REPLACE FUNCTION public.audit_action(p_modulo text, p_descripcion text, p_registro_id uuid DEFAULT NULL::uuid, p_datos jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_rol TEXT;
  v_id UUID;
  v_allowed_modules text[] := ARRAY[
    'auth','etiqueta','qr','reportes','muestra',
    'auditoria','configuracion','control_calidad','calidad','variables_calidad'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_modulo IS NULL OR NOT (p_modulo = ANY(v_allowed_modules)) THEN
    RAISE EXCEPTION 'Módulo de auditoría no permitido: %', p_modulo USING ERRCODE = '22023';
  END IF;
  IF p_descripcion IS NULL OR length(p_descripcion) = 0 THEN
    RAISE EXCEPTION 'Descripción de auditoría requerida.' USING ERRCODE = '22023';
  END IF;
  IF length(p_descripcion) > 500 THEN
    RAISE EXCEPTION 'Descripción de auditoría excede 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.audit_log
    (tabla_afectada, operacion, registro_id, datos_nuevos,
     usuario_id, usuario_email, rol, modulo, descripcion_accion)
  VALUES
    (NULL, 'ACTION', p_registro_id, p_datos,
     v_user_id, v_email, v_rol, p_modulo, p_descripcion)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;