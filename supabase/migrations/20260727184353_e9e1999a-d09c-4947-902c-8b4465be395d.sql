
DO $mig$
DECLARE
  v_producto uuid := (SELECT id FROM productos WHERE codigo='PHR02');
  v_spec_unif uuid := '07270291-19bb-44c5-b5af-07708fba4861'; -- PHR02-MP05_06_07 (a conservar)
  v_spec_mp04 uuid := 'b76d4bf9-85b2-40d9-91c5-543983f70de8'; -- PHR02-MP04 (a desactivar)
  v_mp04 uuid := (SELECT id FROM maquinas WHERE codigo='MP-04');
  v_batch uuid;
  v_before jsonb;
  v_after  jsonb;
  v_rel_before jsonb;
BEGIN
  -- 1) Batch de trazabilidad
  INSERT INTO catalog_import_batches(
    source_file, status, started_at, completed_at,
    created_products, updated_products, created_profiles, created_specifications,
    skipped_records, conflicts, errors, notes
  ) VALUES (
    'unificacion_phr02.sql', 'completed', now(), now(),
    0, 1, 0, 0, 0, 0, 0,
    'Unificación autorizada del perfil PHR02 para las máquinas MP-04, MP-05, MP-06 y MP-07.'
  ) RETURNING id INTO v_batch;

  -- 2) Snapshot ANTES
  SELECT to_jsonb(pe.*) INTO v_before
    FROM producto_especificaciones pe WHERE id = v_spec_unif;

  -- 3) Renombrar/re-perfilar el spec conservado a "UNIFICADO"
  UPDATE producto_especificaciones
     SET version = 'PHR02-UNIFICADO',
         perfil_key = 'UNIFICADO',
         notas = COALESCE(notas,'') ||
                 E'\n[Unificación PHR02] Perfil aplicable a MP-04, MP-05, MP-06 y MP-07. Batch: ' || v_batch::text,
         updated_at = now()
   WHERE id = v_spec_unif;

  SELECT to_jsonb(pe.*) INTO v_after
    FROM producto_especificaciones pe WHERE id = v_spec_unif;

  INSERT INTO quality_catalog_audit(
    batch_id, entity_type, entity_id, product_key, action,
    before_data, after_data, changed_at, reason, source_file
  ) VALUES (
    v_batch, 'producto_especificacion', v_spec_unif, 'PHR02', 'unify_rename',
    v_before, v_after, now(),
    'Renombrado a PHR02-UNIFICADO (perfil único vigente para las 4 máquinas).',
    'unificacion_phr02.sql'
  );

  -- 4) Desactivar el spec específico de MP-04 (obsoleta)
  SELECT to_jsonb(pe.*) INTO v_before
    FROM producto_especificaciones pe WHERE id = v_spec_mp04;

  UPDATE producto_especificaciones
     SET estado = 'obsoleta',
         vigente_hasta = now(),
         motivo_cambio = 'Perfil desactivado por unificación de especificaciones de PHR02 para MP-04, MP-05, MP-06 y MP-07.',
         updated_at = now()
   WHERE id = v_spec_mp04;

  SELECT to_jsonb(pe.*) INTO v_after
    FROM producto_especificaciones pe WHERE id = v_spec_mp04;

  INSERT INTO quality_catalog_audit(
    batch_id, entity_type, entity_id, product_key, action,
    before_data, after_data, changed_at, reason, source_file
  ) VALUES (
    v_batch, 'producto_especificacion', v_spec_mp04, 'PHR02', 'deactivate',
    v_before, v_after, now(),
    'Perfil PHR02-MP04 marcado obsoleto por unificación.',
    'unificacion_phr02.sql'
  );

  -- 5) Reasignar relación de MP-04 al perfil unificado
  SELECT jsonb_agg(to_jsonb(pem.*))
    INTO v_rel_before
    FROM producto_especificacion_maquinas pem
   WHERE pem.especificacion_id = v_spec_mp04 AND pem.maquina_id = v_mp04;

  DELETE FROM producto_especificacion_maquinas
   WHERE especificacion_id = v_spec_mp04 AND maquina_id = v_mp04;

  INSERT INTO producto_especificacion_maquinas(especificacion_id, maquina_id)
  VALUES (v_spec_unif, v_mp04)
  ON CONFLICT (especificacion_id, maquina_id) DO NOTHING;

  INSERT INTO quality_catalog_audit(
    batch_id, entity_type, entity_id, product_key, action,
    before_data, after_data, changed_at, reason, source_file
  ) VALUES (
    v_batch, 'producto_especificacion_maquinas', v_mp04, 'PHR02', 'reassign_machine',
    v_rel_before,
    jsonb_build_object('especificacion_id', v_spec_unif, 'maquina_id', v_mp04),
    now(),
    'MP-04 reasignada al perfil unificado PHR02-UNIFICADO.',
    'unificacion_phr02.sql'
  );
END $mig$;
