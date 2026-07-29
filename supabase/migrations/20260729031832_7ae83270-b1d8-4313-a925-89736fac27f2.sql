-- 1. Nuevos valores de enum (deben ir en migración separada de su uso)
ALTER TYPE public.qc_muestra_estado ADD VALUE IF NOT EXISTS 'pendiente_dictamen';
ALTER TYPE public.qc_dictamen ADD VALUE IF NOT EXISTS 'correccion_solicitada';

-- 2. Endurecer autorización de dictamen: solo admin, gerente_general y calidad
CREATE OR REPLACE FUNCTION public.can_change_roll_status(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id,'administrador')
      OR public.has_role(_user_id,'gerente_general')
      OR public.has_role(_user_id,'calidad')
$function$;

-- 3. change_roll_status: aceptar dictamen "correccion_solicitada" y estado "pendiente_dictamen".
--    Los nuevos valores de enum ya existen (paso 1); su cast se hará al invocarse por primera vez
--    en una transacción posterior. Aquí sólo actualizamos el cuerpo textual — sin literales de enum
--    nuevos — para evitar el error "unsafe use of new value of enum type".
CREATE OR REPLACE FUNCTION public.change_roll_status(
  p_muestra_id uuid,
  p_nuevo_estado text,
  p_dictamen text,
  p_motivo text,
  p_ip text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF NOT public.can_change_roll_status(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).';
  END IF;

  -- Validar dictamen soportado
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

  -- Derivar estatus_liberacion desde el dictamen
  v_nuevo_estatus := CASE p_dictamen
    WHEN 'liberada' THEN 'L'
    WHEN 'concesion' THEN 'L'
    WHEN 'rechazada' THEN 'NC'
    WHEN 'correccion_solicitada' THEN NULL
    ELSE v_old_estatus
  END;

  UPDATE public.muestras_calidad
     SET estado = p_nuevo_estado::qc_muestra_estado,
         dictamen = COALESCE(p_dictamen::qc_dictamen, dictamen),
         dictamen_motivo = p_motivo,
         dictamen_at = now(),
         autorizado_por = v_uid,
         autorizado_at = now(),
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
    jsonb_build_object('estado',p_nuevo_estado,'dictamen',p_dictamen,'estatus_liberacion',v_nuevo_estatus),
    v_uid, v_email, v_rol, 'control_calidad',
    'Cambio de estatus/dictamen de rollo',
    NULL, NULL, v_planta, v_maquina, v_lab, v_folio,
    v_old_estatus, v_nuevo_estatus, p_motivo
  );

  RETURN p_muestra_id;
END $function$;

-- 4. qc_recalc_estatus_muestra: cuando hay variables fuera de spec y no hay dictamen ni
--    liberación con justificación, dejar estatus_liberacion=NULL (pendiente de dictamen).
CREATE OR REPLACE FUNCTION public.qc_recalc_estatus_muestra(_muestra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fallas jsonb;
  v_cumple boolean;
  v_lib_just boolean;
  v_just text;
  v_autorizado uuid;
  v_lib_por uuid;
  v_lib_at timestamptz;
BEGIN
  SELECT autorizado_por, liberado_con_justificacion, liberacion_justificacion,
         liberado_por, liberado_at
    INTO v_autorizado, v_lib_just, v_just, v_lib_por, v_lib_at
    FROM public.muestras_calidad WHERE id = _muestra_id;

  IF v_autorizado IS NOT NULL THEN
    v_fallas := public.qc_eval_regla_oro(_muestra_id);
    UPDATE public.muestras_calidad
       SET variables_fuera_spec = v_fallas,
           updated_at = now()
     WHERE id = _muestra_id;
    RETURN;
  END IF;

  v_fallas := public.qc_eval_regla_oro(_muestra_id);
  v_cumple := (jsonb_array_length(v_fallas) = 0);

  IF v_cumple THEN
    UPDATE public.muestras_calidad
       SET estatus_liberacion = 'L',
           variables_fuera_spec = v_fallas,
           liberado_con_justificacion = false,
           liberacion_justificacion = NULL,
           liberado_por = NULL,
           liberado_at = NULL,
           updated_at = now()
     WHERE id = _muestra_id;
  ELSE
    IF v_lib_just AND v_just IS NOT NULL AND length(trim(v_just)) >= 10 THEN
      -- Sólo posible cuando Calidad ya emitió dictamen (autorizado_por),
      -- pero por defensa en profundidad se conserva la rama.
      UPDATE public.muestras_calidad
         SET estatus_liberacion = 'L',
             variables_fuera_spec = v_fallas,
             liberado_por = COALESCE(v_lib_por, auth.uid()),
             liberado_at = COALESCE(v_lib_at, now()),
             updated_at = now()
       WHERE id = _muestra_id;
    ELSE
      -- Nueva política: pendiente de dictamen — sin estatus L/NC.
      UPDATE public.muestras_calidad
         SET estatus_liberacion = NULL,
             variables_fuera_spec = v_fallas,
             liberado_con_justificacion = false,
             liberacion_justificacion = COALESCE(v_just, liberacion_justificacion),
             liberado_por = NULL,
             liberado_at = NULL,
             updated_at = now()
       WHERE id = _muestra_id;
    END IF;
  END IF;
END;
$function$;