
-- =============================================================================
-- REGLA DE ORO (cutover 18-Jun-2026)
-- Estatus de liberación se calcula automáticamente desde 3 variables críticas.
-- =============================================================================

-- 1) Columnas nuevas en muestras_calidad
ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS liberado_con_justificacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberacion_justificacion text,
  ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS liberado_at timestamptz,
  ADD COLUMN IF NOT EXISTS variables_fuera_spec jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_muestras_liberado_con_justif
  ON public.muestras_calidad (liberado_con_justificacion)
  WHERE liberado_con_justificacion = true;

-- 2) Función de evaluación de la regla de oro
--    Devuelve jsonb array con las fallas: [{variable, etiqueta, valor, min, max, tipo}]
CREATE OR REPLACE FUNCTION public.qc_eval_regla_oro(_muestra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallas jsonb := '[]'::jsonb;
  r record;
  v_etiqueta text;
BEGIN
  FOR r IN
    SELECT variable_clave, valor, min_snapshot, max_snapshot
      FROM public.mediciones_calidad
     WHERE muestra_id = _muestra_id
       AND variable_clave IN ('pesoBase','tensionMD','tensionCD')
       AND valor IS NOT NULL
  LOOP
    v_etiqueta := CASE r.variable_clave
      WHEN 'pesoBase'  THEN 'Peso Base'
      WHEN 'tensionMD' THEN 'Tensión Seca MD'
      WHEN 'tensionCD' THEN 'Tensión Seca CD'
    END;

    IF r.valor > r.max_snapshot THEN
      v_fallas := v_fallas || jsonb_build_object(
        'variable', r.variable_clave,
        'etiqueta', v_etiqueta,
        'valor', r.valor,
        'min', r.min_snapshot,
        'max', r.max_snapshot,
        'tipo', 'max_excedido'
      );
    ELSIF r.valor < r.min_snapshot THEN
      v_fallas := v_fallas || jsonb_build_object(
        'variable', r.variable_clave,
        'etiqueta', v_etiqueta,
        'valor', r.valor,
        'min', r.min_snapshot,
        'max', r.max_snapshot,
        'tipo', 'min_no_alcanzado'
      );
    END IF;
  END LOOP;

  RETURN v_fallas;
END;
$$;

-- 3) Función que recalcula y persiste el estatus de una muestra según la regla.
--    Respeta el dictamen autorizado por Gerencia de Calidad (no lo pisa).
CREATE OR REPLACE FUNCTION public.qc_recalc_estatus_muestra(_muestra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallas jsonb;
  v_cumple boolean;
  v_lib_just boolean;
  v_just text;
  v_autorizado uuid;
  v_lib_por uuid;
  v_lib_at timestamptz;
  v_nuevo_estatus text;
BEGIN
  SELECT autorizado_por, liberado_con_justificacion, liberacion_justificacion,
         liberado_por, liberado_at
    INTO v_autorizado, v_lib_just, v_just, v_lib_por, v_lib_at
    FROM public.muestras_calidad WHERE id = _muestra_id;

  IF v_autorizado IS NOT NULL THEN
    -- Dictamen de Gerencia manda. Solo refrescamos variables_fuera_spec para reportes.
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
    v_nuevo_estatus := 'L';
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
      v_nuevo_estatus := 'L';
      UPDATE public.muestras_calidad
         SET estatus_liberacion = 'L',
             variables_fuera_spec = v_fallas,
             liberado_con_justificacion = true,
             liberado_por = COALESCE(v_lib_por, auth.uid()),
             liberado_at = COALESCE(v_lib_at, now()),
             updated_at = now()
       WHERE id = _muestra_id;
    ELSE
      v_nuevo_estatus := 'NC';
      UPDATE public.muestras_calidad
         SET estatus_liberacion = 'NC',
             variables_fuera_spec = v_fallas,
             liberado_con_justificacion = false,
             liberacion_justificacion = NULL,
             liberado_por = NULL,
             liberado_at = NULL,
             updated_at = now()
       WHERE id = _muestra_id;
    END IF;
  END IF;
END;
$$;

-- 4) Trigger en mediciones_calidad: cualquier cambio recalcula la muestra padre.
CREATE OR REPLACE FUNCTION public.mediciones_recalc_estatus_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_muestra uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_muestra := OLD.muestra_id;
  ELSE
    v_muestra := NEW.muestra_id;
  END IF;
  PERFORM public.qc_recalc_estatus_muestra(v_muestra);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mediciones_recalc_estatus ON public.mediciones_calidad;
CREATE TRIGGER trg_mediciones_recalc_estatus
AFTER INSERT OR UPDATE OF valor, min_snapshot, max_snapshot
   OR DELETE
ON public.mediciones_calidad
FOR EACH ROW EXECUTE FUNCTION public.mediciones_recalc_estatus_fn();

-- 5) Trigger en muestras_calidad: cuando el capturista cambia la justificación
--    o flags, validamos y recalculamos (sin recursión: only when flags change).
CREATE OR REPLACE FUNCTION public.muestras_apply_regla_oro_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallas jsonb;
  v_cumple boolean;
BEGIN
  -- No tocar cuando el cambio viene del propio recalc (mismas columnas escritas).
  -- Detectamos por: alguien fija liberado_con_justificacion = true sin justificación válida.
  IF NEW.liberado_con_justificacion = true THEN
    IF NEW.liberacion_justificacion IS NULL OR length(trim(NEW.liberacion_justificacion)) < 10 THEN
      RAISE EXCEPTION 'Para liberar un rollo NO CUMPLE se requiere una justificación de al menos 10 caracteres.'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.liberado_por IS NULL THEN
      NEW.liberado_por := auth.uid();
    END IF;
    IF NEW.liberado_at IS NULL THEN
      NEW.liberado_at := now();
    END IF;
  END IF;

  -- En INSERT: si no hay mediciones aún, dejar estatus tal cual; el trigger de
  -- mediciones lo recalculará al guardarlas. En UPDATE: ídem, basta con la
  -- evaluación si ya hay mediciones.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_muestras_apply_regla_oro ON public.muestras_calidad;
CREATE TRIGGER trg_muestras_apply_regla_oro
BEFORE INSERT OR UPDATE OF liberado_con_justificacion, liberacion_justificacion
ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_apply_regla_oro_fn();

-- 6) Auditoría: log cuando se libera con justificación
CREATE OR REPLACE FUNCTION public.muestras_audit_liberacion_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text; v_rol text;
BEGIN
  IF NEW.liberado_con_justificacion = true
     AND (TG_OP = 'INSERT' OR OLD.liberado_con_justificacion IS DISTINCT FROM true) THEN

    SELECT email, rol_visible INTO v_email, v_rol
      FROM public.profiles WHERE id = COALESCE(NEW.liberado_por, auth.uid());

    INSERT INTO public.audit_log
      (tabla_afectada, operacion, registro_id, datos_nuevos,
       usuario_id, usuario_email, rol, modulo, descripcion_accion,
       planta_id, maquina_id, folio_rollo, motivo)
    VALUES
      ('muestras_calidad','LIBERA_CON_JUSTIFICACION', NEW.id,
       jsonb_build_object(
         'variables_fuera_spec', NEW.variables_fuera_spec,
         'justificacion', NEW.liberacion_justificacion
       ),
       COALESCE(NEW.liberado_por, auth.uid()), v_email, v_rol,
       'control_calidad',
       'Capturista liberó rollo NO CUMPLE con justificación',
       NEW.planta_id, NEW.maquina_id, NEW.numero_rollo,
       NEW.liberacion_justificacion);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_muestras_audit_liberacion ON public.muestras_calidad;
CREATE TRIGGER trg_muestras_audit_liberacion
AFTER INSERT OR UPDATE OF liberado_con_justificacion
ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_audit_liberacion_fn();

-- 7) BACKFILL — recalcular todos los rollos históricos según nueva regla.
--    Marcar como "liberado con justificación (histórico)" los que estaban 'L'
--    pero ahora la nueva regla los marcaría NC, para no romper continuidad.
DO $$
DECLARE
  m record;
  v_fallas jsonb;
  v_cumple boolean;
BEGIN
  FOR m IN
    SELECT id, estatus_liberacion, autorizado_por
      FROM public.muestras_calidad
  LOOP
    v_fallas := public.qc_eval_regla_oro(m.id);
    v_cumple := (jsonb_array_length(v_fallas) = 0);

    IF m.autorizado_por IS NOT NULL THEN
      -- Solo refrescar variables_fuera_spec
      UPDATE public.muestras_calidad
         SET variables_fuera_spec = v_fallas
       WHERE id = m.id;
      CONTINUE;
    END IF;

    IF v_cumple THEN
      UPDATE public.muestras_calidad
         SET estatus_liberacion = 'L',
             variables_fuera_spec = v_fallas,
             liberado_con_justificacion = false,
             liberacion_justificacion = NULL
       WHERE id = m.id;
    ELSE
      -- NO CUMPLE según la nueva regla.
      IF m.estatus_liberacion = 'L' OR m.estatus_liberacion = 'C' THEN
        -- Estaba liberado antes → respetar la decisión histórica como "liberado con justificación".
        UPDATE public.muestras_calidad
           SET estatus_liberacion = 'L',
               variables_fuera_spec = v_fallas,
               liberado_con_justificacion = true,
               liberacion_justificacion = 'Migración 18-Jun-2026: liberación histórica previa a la regla de oro. Estatus anterior: ' || COALESCE(m.estatus_liberacion,'(sin estatus)'),
               liberado_por = NULL,
               liberado_at = COALESCE((SELECT capturado_at FROM public.muestras_calidad WHERE id = m.id), now())
         WHERE id = m.id;
      ELSE
        UPDATE public.muestras_calidad
           SET estatus_liberacion = 'NC',
               variables_fuera_spec = v_fallas,
               liberado_con_justificacion = false,
               liberacion_justificacion = NULL
         WHERE id = m.id;
      END IF;
    END IF;
  END LOOP;
END $$;
