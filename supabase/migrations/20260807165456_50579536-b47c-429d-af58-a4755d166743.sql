-- =============================================================
-- Regla canónica única de liberación (backend/BD)
-- =============================================================

CREATE OR REPLACE FUNCTION public.qc_tiene_defecto(_muestra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.muestras_calidad m
    WHERE m.id = _muestra_id
      AND (
        upper(coalesce(nullif(btrim(m.defecto_visual_conversion), ''), 'SIN DEFECTO')) <> 'SIN DEFECTO'
        OR upper(coalesce(nullif(btrim(m.variable_tecnica_dimensional), ''), 'SIN DEFECTO')) <> 'SIN DEFECTO'
        OR upper(coalesce(nullif(btrim(m.criterio_defecto), ''), 'SIN DEFECTO')) <> 'SIN DEFECTO'
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(m.defectos, '{}'::text[])) d
          WHERE upper(btrim(d)) NOT IN ('', 'SIN DEFECTO')
        )
      )
  )
$$;

-- Evaluación canónica: variables (regla de oro) + hallazgos
CREATE OR REPLACE FUNCTION public.qc_eval_liberacion(_muestra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fallas jsonb;
  v_cumple boolean;
  v_defecto boolean;
BEGIN
  v_fallas  := public.qc_eval_regla_oro(_muestra_id);
  v_cumple  := (jsonb_array_length(v_fallas) = 0);
  v_defecto := public.qc_tiene_defecto(_muestra_id);

  RETURN jsonb_build_object(
    'fallas', v_fallas,
    'cumple_variables', v_cumple,
    'tiene_defecto', v_defecto,
    'estatus', CASE WHEN v_cumple AND NOT v_defecto THEN 'L' ELSE NULL END,
    'estado',  CASE WHEN v_cumple AND NOT v_defecto THEN 'liberable' ELSE 'pendiente_dictamen' END,
    'motivo',  CASE
                 WHEN NOT v_cumple THEN 'variables_fuera_especificacion'
                 WHEN v_defecto THEN 'hallazgo_registrado'
                 ELSE 'conforme_sin_defecto'
               END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.qc_recalc_estatus_muestra(_muestra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eval jsonb;
  v_fallas jsonb;
  v_autorizado uuid;
  v_estado text;
BEGIN
  SELECT autorizado_por, estado::text
    INTO v_autorizado, v_estado
    FROM public.muestras_calidad WHERE id = _muestra_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_eval   := public.qc_eval_liberacion(_muestra_id);
  v_fallas := v_eval->'fallas';

  -- Dictamen ya emitido por Calidad: manda el dictamen, sólo refrescamos snapshot.
  IF v_autorizado IS NOT NULL THEN
    UPDATE public.muestras_calidad
       SET variables_fuera_spec = v_fallas, updated_at = now()
     WHERE id = _muestra_id;
    RETURN;
  END IF;

  IF (v_eval->>'estatus') = 'L' THEN
    UPDATE public.muestras_calidad
       SET estatus_liberacion = 'L',
           estado = CASE WHEN v_estado = 'pendiente_dictamen'
                         THEN 'borrador'::qc_muestra_estado
                         ELSE estado END,
           variables_fuera_spec = v_fallas,
           liberado_con_justificacion = false,
           liberacion_justificacion = NULL,
           liberado_por = NULL,
           liberado_at = NULL,
           updated_at = now()
     WHERE id = _muestra_id;
  ELSE
    UPDATE public.muestras_calidad
       SET estatus_liberacion = NULL,
           estado = 'pendiente_dictamen'::qc_muestra_estado,
           variables_fuera_spec = v_fallas,
           liberado_con_justificacion = false,
           liberado_por = NULL,
           liberado_at = NULL,
           updated_at = now()
     WHERE id = _muestra_id;
  END IF;
END;
$$;

-- Recalcular también cuando cambian los hallazgos de la muestra
CREATE OR REPLACE FUNCTION public.muestras_recalc_liberacion_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  PERFORM public.qc_recalc_estatus_muestra(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muestras_recalc_liberacion_ins ON public.muestras_calidad;
CREATE TRIGGER muestras_recalc_liberacion_ins
AFTER INSERT ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_recalc_liberacion_fn();

DROP TRIGGER IF EXISTS muestras_recalc_liberacion_upd ON public.muestras_calidad;
CREATE TRIGGER muestras_recalc_liberacion_upd
AFTER UPDATE OF defecto_visual_conversion, variable_tecnica_dimensional, criterio_defecto, defectos
ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_recalc_liberacion_fn();

-- Concesión debe quedar como 'C' (Liberado con concesión), no 'L'
CREATE OR REPLACE FUNCTION public.change_roll_status(p_muestra_id uuid, p_nuevo_estado text, p_dictamen text, p_motivo text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
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
    p_ip, p_user_agent, v_planta, v_maquina, v_lab, v_folio,
    v_old_estatus, v_nuevo_estatus, p_motivo
  );

  RETURN p_muestra_id;
END $function$;