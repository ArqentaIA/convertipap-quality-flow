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

  -- El administrador tiene acceso libre a cualquier área del sistema:
  -- omite la restricción por máquina, pero conserva la ventana de 24 h.
  IF NOT public.has_role(v_uid, 'admin') AND NOT EXISTS (
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