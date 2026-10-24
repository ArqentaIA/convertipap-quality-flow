-- Real database regression; every test row and counter update rolls back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','252b6899-62c6-4096-9851-084214cdcce7',true);
DO $$
DECLARE s uuid; p uuid; b uuid:=gen_random_uuid(); v jsonb; n integer; old_count bigint; prod_count bigint;
BEGIN
SELECT count(*) INTO old_count FROM public.imp_bobinas;
SELECT count(*) INTO prod_count FROM public.muestras_calidad;
SELECT id INTO s FROM public.imp_proveedores WHERE nombre='Continental';
p:=public.imp_catalogo_guardar('producto','QA_TRANSACCION_IMP','REFERENCE',null,null);
SELECT siguiente INTO n FROM public.imp_contador;
IF n<>760 THEN RAISE EXCEPTION 'Expected first new 760, got %',n; END IF;
v:=jsonb_build_object('producto_id',p,'proveedor_id',s,'sku','TEST_OVERRIDE+SKU','analista','PRUEBA TRANSACCIONAL','observaciones','Prueba revertida automáticamente','turno','1','planta_codigo','IXT','fecha','2026-10-24','estado','concesion','valores',jsonb_build_object('peso_base',null,'a',-0.82));
PERFORM public.imp_guardar(b,v,null,null);
IF NOT EXISTS(SELECT 1 FROM public.imp_bobinas WHERE id=b AND folio='00760-00' AND maquina='MP-00' AND sku='TEST_OVERRIDE+SKU' AND sku_referencia='REFERENCE' AND estado='concesion' AND valores->'peso_base'='null'::jsonb) THEN RAISE EXCEPTION 'Persisted override/folio/state/empty values mismatch'; END IF;
PERFORM public.imp_guardar(b,v,null,null);
IF (SELECT siguiente FROM public.imp_contador)<>761 OR (SELECT count(*) FROM public.imp_bobinas)<>old_count+1 THEN RAISE EXCEPTION 'Idempotent retry consumed a number'; END IF;
BEGIN PERFORM public.imp_guardar(gen_random_uuid(),v||'{"estado":"pendiente"}'::jsonb,null,null); RAISE EXCEPTION 'Invalid state accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
IF (SELECT siguiente FROM public.imp_contador)<>761 THEN RAISE EXCEPTION 'Failed save consumed a number'; END IF;
PERFORM set_config('request.jwt.claim.sub','c17926d4-1407-40ff-8303-1d4c8bd9b4b4',true);
IF NOT public.imp_permiso('capturar') OR public.imp_permiso('editar') OR public.imp_permiso('catalogo') THEN RAISE EXCEPTION 'Capturista permission mismatch'; END IF;
BEGIN PERFORM public.imp_guardar(b,v,1,'Prueba edición sin permiso'); RAISE EXCEPTION 'Capturista could edit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
PERFORM public.imp_catalogo_guardar('proveedor','QA_PROVEEDOR_TRANSACCION',null,null,null);
PERFORM set_config('request.jwt.claim.sub','eb5b4f7b-ec1c-4208-aee0-f38cb8a35d2f',true);
IF NOT public.imp_permiso('editar') OR NOT public.imp_permiso('catalogo') OR NOT public.imp_permiso('leer') THEN RAISE EXCEPTION 'Sinay permission mismatch'; END IF;
PERFORM public.imp_guardar(b,v||'{"sku":"SKU_EDITADO","estado":"rechazada"}'::jsonb,1,'Prueba edición Calidad IXT');
IF NOT EXISTS(SELECT 1 FROM public.imp_bobinas WHERE id=b AND revision=2 AND sku='SKU_EDITADO' AND numero=760 AND estado='rechazada') THEN RAISE EXCEPTION 'Edit mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.imp_eventos WHERE bobina_id=b AND accion='edicion' AND antes->>'sku'='TEST_OVERRIDE+SKU' AND despues->>'sku'='SKU_EDITADO') THEN RAISE EXCEPTION 'Edit audit missing'; END IF;
BEGIN PERFORM public.imp_guardar(b,v,1,'Prueba conflicto edición'); RAISE EXCEPTION 'Stale edit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Stale edit accepted' THEN RAISE; END IF; END;
BEGIN PERFORM public.imp_guardar((SELECT id FROM public.imp_bobinas WHERE numero=759),v,1,'Prueba histórico sin hora'); RAISE EXCEPTION 'Historical edit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Historical edit accepted' THEN RAISE; END IF; END;
PERFORM set_config('request.jwt.claim.sub','ed274107-4b60-407c-9644-15ece4fa0232',true);
IF NOT public.imp_permiso('catalogo') THEN RAISE EXCEPTION 'Karina catalog access missing'; END IF;
IF (SELECT count(*) FROM public.muestras_calidad)<>prod_count THEN RAISE EXCEPTION 'Manufacturing rows changed'; END IF;
PERFORM set_config('request.jwt.claim.sub','',true);
IF public.imp_permiso('leer') OR public.imp_permiso('capturar') THEN RAISE EXCEPTION 'Anonymous access allowed'; END IF;
RAISE NOTICE 'PASS: 760-00, persisted SKU, states, null values, retry/failed save gapless, capturista/Calidad permissions, audit, stale edit block, historical edit block, anonymous block, manufacturing unchanged';
END $$;
ROLLBACK;
