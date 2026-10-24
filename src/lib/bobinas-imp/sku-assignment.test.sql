-- Authenticated regression of missing-SKU assignment; all changes roll back.
BEGIN;
DO $$
DECLARE b public.imp_bobinas; original jsonb; changed jsonb; viewer uuid; quality uuid; baseline text;
BEGIN
SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) INTO baseline FROM public.muestras_calidad m;
SELECT * INTO b FROM public.imp_bobinas WHERE folio='00248-00';
IF b.id IS NULL OR nullif(btrim(b.sku),'') IS NOT NULL THEN RAISE EXCEPTION 'Expected 00248-00 with missing SKU'; END IF;
original:=to_jsonb(b);
SELECT id INTO viewer FROM public.profiles WHERE lower(email)='jrivera@convertipap.site';
PERFORM set_config('request.jwt.claim.sub',viewer::text,true);
BEGIN
 PERFORM public.imp_asignar_sku(b.id,'SSK103132260',b.revision,'Prueba de acceso no autorizado');
 RAISE EXCEPTION 'Unauthorized assignment succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
FOR quality IN SELECT id FROM public.profiles WHERE lower(email) IN ('gcalidad@convertipap.site','msramosixt@convertipap.site','adgral@convertipap.site') LOOP
 PERFORM set_config('request.jwt.claim.sub',quality::text,true);
 IF NOT public.imp_permiso('editar') THEN RAISE EXCEPTION 'Authorized Quality/admin missing permission'; END IF;
END LOOP;
SELECT id INTO quality FROM public.profiles WHERE lower(email)='msramosixt@convertipap.site';
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
IF baseline IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) FROM public.muestras_calidad m) THEN RAISE EXCEPTION 'Manufacturing changed'; END IF;
RAISE NOTICE 'PASS: historic missing SKU, authorized Quality/admin, capturista denied, audit, existing SKU protected, history and manufacturing unchanged';
END $$;
ROLLBACK;