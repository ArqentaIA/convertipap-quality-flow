
DO $$
DECLARE
  v_user uuid := 'abdeacd8-460a-481a-8e82-c954abe19010';
  v_ids uuid[];
  v_med_count int;
  v_mu_count int;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM public.muestras_calidad
  WHERE capturado_por = v_user
    AND (created_at AT TIME ZONE 'America/Mexico_City')::date
      = (now() AT TIME ZONE 'America/Mexico_City')::date;

  IF v_ids IS NULL THEN
    RAISE NOTICE 'No hay registros para eliminar.';
    RETURN;
  END IF;

  DELETE FROM public.mediciones_calidad WHERE muestra_id = ANY(v_ids);
  GET DIAGNOSTICS v_med_count = ROW_COUNT;

  DELETE FROM public.muestras_calidad WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_mu_count = ROW_COUNT;

  RAISE NOTICE 'Muestras eliminadas: %, mediciones eliminadas: %', v_mu_count, v_med_count;
END $$;
