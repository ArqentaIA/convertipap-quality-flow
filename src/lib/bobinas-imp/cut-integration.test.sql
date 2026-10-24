-- Regression against the connected database; rolls back every cut and weight.
BEGIN;
SELECT set_config('request.jwt.claim.sub','252b6899-62c6-4096-9851-084214cdcce7',true);
DO $$
DECLARE l uuid; result jsonb;
BEGIN
l:=public.imp_crear_lote_cintas('3c2fedc4-3f1f-4895-a173-9308e7693b6b','9dfc3f46-aedc-49a3-a88e-4d5f0b1bffd4','41d47c1e-91dd-4952-b85e-f508257fcea2',gen_random_uuid());
result:=public.registrar_cinta_v3(l,0,10,20,'Prueba revertida','QAIMP1','SSC101101232',gen_random_uuid());
IF (SELECT sku_sap FROM public.pesajes_cintas WHERE id=(result->>'cinta_id')::uuid)<>'SSC101101232' THEN RAISE EXCEPTION 'Cut SKU changed'; END IF;
IF (SELECT datos_calidad_snapshot->>'sku' FROM public.pesajes_cintas_lotes WHERE id=l)<>'SSM103133260' THEN RAISE EXCEPTION 'Mother SKU changed'; END IF;
PERFORM public.finalizar_lote_cintas(l);
IF (SELECT estado FROM public.pesajes_cintas_lotes WHERE id=l)<>'finalizado' THEN RAISE EXCEPTION 'finish failed'; END IF;
PERFORM set_config('request.jwt.claim.sub','eb5b4f7b-ec1c-4208-aee0-f38cb8a35d2f',true);
IF public.user_sees_planta(auth.uid(),(SELECT planta_corte_id FROM public.pesajes_cintas_lotes WHERE id=l)) THEN RAISE EXCEPTION 'test requires opposite plant'; END IF;
BEGIN PERFORM public.imp_lote_access(l); RAISE EXCEPTION 'plant access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
IF (public.pc_puede_editar_corte(l)->>'puede')::boolean THEN RAISE EXCEPTION 'cross plant edit allowed'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.pc_bajadas_rollo('00756-00')->'bajadas') x WHERE x->>'lote_id'=l::text) THEN RAISE EXCEPTION 'cross plant read allowed'; END IF;
END $$;
ROLLBACK;