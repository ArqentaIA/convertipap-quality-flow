DO $do$
BEGIN
  EXECUTE replace(pg_get_functiondef('public.qc_editar_rollo'::regproc),
    E'  IF jsonb_typeof(_cambios->''mediciones'') = ''array'' THEN',
    E'  IF v_prod_cambiado THEN\n    -- El autollenado de uniones no debe duplicar una medición ya existente.\n    DELETE FROM public.mediciones_calidad d\n     WHERE d.muestra_id = _muestra_id AND d.created_at = now()\n       AND EXISTS (SELECT 1 FROM public.mediciones_calidad o\n                    WHERE o.muestra_id = _muestra_id AND o.variable_clave = d.variable_clave\n                      AND o.created_at < now());\n  END IF;\n\n  IF jsonb_typeof(_cambios->''mediciones'') = ''array'' THEN');
END
$do$;