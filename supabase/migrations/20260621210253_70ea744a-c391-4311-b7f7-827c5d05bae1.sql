
CREATE OR REPLACE FUNCTION public.muestras_autofill_uniones_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_var_id uuid;
  v_spec_id uuid;
  v_min numeric;
  v_obj numeric;
  v_max numeric;
BEGIN
  IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_var_id FROM public.variables_calidad WHERE clave = 'uniones' LIMIT 1;
  IF v_var_id IS NULL THEN RETURN NEW; END IF;

  -- Si ya existe la medición (carga simultánea o re-trigger), no duplicar.
  IF EXISTS (
    SELECT 1 FROM public.mediciones_calidad
     WHERE muestra_id = NEW.id AND variable_clave = 'uniones'
  ) THEN
    RETURN NEW;
  END IF;

  -- Especificación vigente del producto
  SELECT pe.id INTO v_spec_id
    FROM public.producto_especificaciones pe
   WHERE pe.producto_id = NEW.producto_id
   ORDER BY (pe.estado = 'vigente') DESC, pe.vigente_desde DESC NULLS LAST
   LIMIT 1;

  IF v_spec_id IS NULL THEN RETURN NEW; END IF;

  SELECT pv.min_valor, pv.objetivo, pv.max_valor
    INTO v_min, v_obj, v_max
    FROM public.producto_variables pv
   WHERE pv.especificacion_id = v_spec_id AND pv.variable_id = v_var_id;

  -- Si la variable no es aplicable a este producto, no hacer nada.
  IF v_min IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.mediciones_calidad
    (muestra_id, variable_id, variable_clave, valor,
     min_snapshot, objetivo_snapshot, max_snapshot,
     estado, observacion, capturado_por)
  VALUES (
    NEW.id, v_var_id, 'uniones', 0,
    v_min, v_obj, v_max,
    CASE WHEN 0 BETWEEN v_min AND v_max THEN 'conforme'::qc_medicion_estado
         ELSE 'no_conforme'::qc_medicion_estado END,
    'Auto-relleno: Uniones no capturada, asumida en 0',
    NEW.capturado_por
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_muestras_autofill_uniones_ins ON public.muestras_calidad;
CREATE TRIGGER trg_muestras_autofill_uniones_ins
AFTER INSERT ON public.muestras_calidad
FOR EACH ROW
EXECUTE FUNCTION public.muestras_autofill_uniones_fn();

DROP TRIGGER IF EXISTS trg_muestras_autofill_uniones_upd ON public.muestras_calidad;
CREATE TRIGGER trg_muestras_autofill_uniones_upd
AFTER UPDATE OF producto_id ON public.muestras_calidad
FOR EACH ROW
WHEN (NEW.producto_id IS DISTINCT FROM OLD.producto_id)
EXECUTE FUNCTION public.muestras_autofill_uniones_fn();
