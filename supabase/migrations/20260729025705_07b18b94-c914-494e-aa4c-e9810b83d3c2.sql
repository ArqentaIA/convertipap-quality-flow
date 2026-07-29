DO $$
DECLARE
  v_spec_std uuid := '1d5dfee5-ac01-4d76-a102-fe458f7991fa';
  v_prod uuid := '1d66e1ea-f6aa-4402-b014-d49d75d97a5e';
  v_mp04 uuid := '244e77e1-2079-479a-9d24-bdd1d3cfa5b8';
  v_mp05 uuid := '223be525-5ffc-47b1-8347-bddd79fa52b1';
  v_mp06 uuid := '95013e31-bc02-40eb-845d-260c89922b55';
  v_mp07 uuid := 'e1dd6aec-40ff-457d-9e49-6d89608cd99e';
  v_spec_mp04 uuid := gen_random_uuid();
  v_batch uuid;
  v_ancho_var uuid;
  v_old_ancho numeric;
BEGIN
  INSERT INTO public.catalog_import_batches (source_file, status, started_at, completed_at, notes)
  VALUES ('manual:split_PSC01_MP04', 'completed', now(), now(),
          'Split PSC01: STANDARD (MP-05/06/07) + MP-04 (ancho 220-286)')
  RETURNING id INTO v_batch;

  -- 1) Marcar spec estándar con perfil y asignarla a MP-05/06/07
  UPDATE public.producto_especificaciones
     SET perfil_key = 'PSC01-STANDARD',
         motivo_cambio = COALESCE(motivo_cambio,'') || ' | Split por máquina: STANDARD para MP-05/06/07',
         updated_at = now()
   WHERE id = v_spec_std;

  INSERT INTO public.producto_especificacion_maquinas (especificacion_id, maquina_id)
  VALUES (v_spec_std, v_mp05), (v_spec_std, v_mp06), (v_spec_std, v_mp07)
  ON CONFLICT DO NOTHING;

  -- 2) Crear nueva spec vigente PSC01-MP04 clonando la estándar
  INSERT INTO public.producto_especificaciones
    (id, producto_id, version, estado, perfil_key, vigente_desde, aprobado_at,
     notas, caracteristicas_atributos, publicado_at, motivo_cambio)
  SELECT v_spec_mp04, producto_id, '1.0-MP04', 'vigente', 'PSC01-MP04', now(), now(),
         notas, caracteristicas_atributos, now(),
         'Perfil dedicado para MP-04: ancho útil ampliado a 220–286 cm'
  FROM public.producto_especificaciones WHERE id = v_spec_std;

  INSERT INTO public.producto_especificacion_maquinas (especificacion_id, maquina_id)
  VALUES (v_spec_mp04, v_mp04);

  -- 3) Clonar TODAS las variables al nuevo perfil
  INSERT INTO public.producto_variables
    (especificacion_id, variable_id, min_valor, objetivo, max_valor, tolerancia)
  SELECT v_spec_mp04, variable_id, min_valor, objetivo, max_valor, tolerancia
  FROM public.producto_variables WHERE especificacion_id = v_spec_std;

  -- 4) Ajustar Ancho útil en el perfil MP-04: 220 / 285 / 286
  SELECT id INTO v_ancho_var FROM public.variables_calidad WHERE clave = 'anchoUtil' LIMIT 1;
  IF v_ancho_var IS NULL THEN
    RAISE EXCEPTION 'No se encontró la variable anchoUtil';
  END IF;

  SELECT min_valor INTO v_old_ancho FROM public.producto_variables
    WHERE especificacion_id = v_spec_mp04 AND variable_id = v_ancho_var;

  UPDATE public.producto_variables
     SET min_valor = 220, objetivo = 285, max_valor = 286, updated_at = now()
   WHERE especificacion_id = v_spec_mp04 AND variable_id = v_ancho_var;

  -- 5) Auditoría (catalog audit)
  INSERT INTO public.quality_catalog_audit
    (batch_id, entity_type, entity_id, product_key, action, before_data, after_data, reason)
  VALUES
    (v_batch, 'producto_especificaciones', v_spec_std, 'PSC01', 'update',
     jsonb_build_object('perfil_key', NULL, 'maquinas', '[]'::jsonb),
     jsonb_build_object('perfil_key','PSC01-STANDARD','maquinas', jsonb_build_array('MP-05','MP-06','MP-07')),
     'Split de perfil PSC01 por máquina'),
    (v_batch, 'producto_especificaciones', v_spec_mp04, 'PSC01', 'create',
     NULL,
     jsonb_build_object('perfil_key','PSC01-MP04','maquinas', jsonb_build_array('MP-04'),'version','1.0-MP04','estado','vigente'),
     'Nuevo perfil dedicado MP-04'),
    (v_batch, 'producto_variables', v_spec_mp04, 'PSC01', 'update',
     jsonb_build_object('variable','anchoUtil','min',v_old_ancho,'objetivo',285,'max',286),
     jsonb_build_object('variable','anchoUtil','min',220,'objetivo',285,'max',286),
     'Ampliar ancho útil MP-04 tras hallazgo operativo (rollo capturado con 230 cm bloqueado)');
END $$;