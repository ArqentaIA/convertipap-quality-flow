-- Authenticated regression of missing-SKU assignment; all changes roll back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','252b6899-62c6-4096-9851-084214cdcce7',true);
DO $$
DECLARE b public.imp_bobinas; original jsonb; changed jsonb; viewer uuid; quality uuid; baseline text;
BEGIN
SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) INTO baseline FROM public.muestras_calidad m;
SELECT * INTO b FROM public.imp_bobinas WHERE folio='00248-00';
IF b.id IS NULL OR nullif(btrim(b.sku),'') IS NOT NULL THEN RAISE EXCEPTION 'Expected 00248-00 with missing SKU'; END IF;
original:=to_jsonb(b);
viewer:='c17926d4-1407-40ff-8303-1d4c8bd9b4b4';
PERFORM set_config('request.jwt.claim.sub',viewer::text,true);
BEGIN
 PERFORM public.imp_asignar_sku(b.id,'SSK103132260',b.revision,'Prueba de acceso no autorizado');
 RAISE EXCEPTION 'Unauthorized assignment succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
FOR quality IN SELECT unnest(ARRAY['ed274107-4b60-407c-9644-15ece4fa0232','eb5b4f7b-ec1c-4208-aee0-f38cb8a35d2f','252b6899-62c6-4096-9851-084214cdcce7']::uuid[]) LOOP
 PERFORM set_config('request.jwt.claim.sub',quality::text,true);
 IF NOT public.imp_permiso('editar') THEN RAISE EXCEPTION 'Authorized Quality/admin missing permission'; END IF;
END LOOP;
quality:='eb5b4f7b-ec1c-4208-aee0-f38cb8a35d2f';
PERFORM set_config('request.jwt.claim.sub',quality::text,true);
PERFORM public.imp_asignar_sku(b.id,'SSK103132260',b.revision,'Prueba revertida SKU confirmado PSK32');
SELECT to_jsonb(i) INTO changed FROM public.imp_bobinas i WHERE id=b.id;
IF changed->>'sku'<>'SSK103132260' THEN RAISE EXCEPTION 'SKU not persisted'; END IF;
IF (changed-'sku'-'revision') IS DISTINCT FROM (original-'sku'-'revision') THEN RAISE EXCEPTION 'Other historical values changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.imp_eventos WHERE bobina_id=b.id AND accion='sku_asignado' AND usuario_id=quality AND despues->>'sku'='SSK103132260') THEN RAISE EXCEPTION 'Audit missing'; END IF;
BEGIN
 PERFORM public.imp_asignar_sku(b.id,'OTHER',b.revision+1,'Prueba bloqueo SKU ya registrado');
 RAISE EXCEPTION 'Assigned SKU replaced';
EXCEPTION WHEN raise_exception THEN IF SQLERRM='Assigned SKU replaced' THEN RAISE; END IF;
END;
PERFORM set_config('request.jwt.claim.sub','252b6899-62c6-4096-9851-084214cdcce7',true);
IF baseline IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) FROM public.muestras_calidad m) THEN RAISE EXCEPTION 'Manufacturing changed'; END IF;
RAISE NOTICE 'PASS: historic missing SKU, authorized Quality/admin, capturista denied, audit, existing SKU protected, history and manufacturing unchanged';
END $$;
ROLLBACK;