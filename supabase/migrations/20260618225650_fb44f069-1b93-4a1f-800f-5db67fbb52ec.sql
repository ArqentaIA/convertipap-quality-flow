CREATE OR REPLACE FUNCTION public.qc_eval_regla_oro(_muestra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fallas jsonb := '[]'::jsonb;
  r record;
  v_etiqueta text;
  v_sin_tope_superior boolean;
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

    -- Regla operativa: Tensión Seca MD/CD NO tienen tope superior crítico.
    -- Rebasar el MAX no degrada calidad; solo el mínimo es vinculante.
    v_sin_tope_superior := r.variable_clave IN ('tensionMD','tensionCD');

    IF (NOT v_sin_tope_superior) AND r.valor > r.max_snapshot THEN
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
$function$;

-- Recalcular el estatus de todas las muestras existentes para que reflejen la nueva regla.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.muestras_calidad LOOP
    PERFORM public.qc_recalc_estatus_muestra(r.id);
  END LOOP;
END $$;