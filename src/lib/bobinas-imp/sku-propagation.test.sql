-- Transactional regression: fixtures, assignments and audits all roll back.
BEGIN;
DO $$
DECLARE p uuid; other_p uuid; fixture jsonb; seed public.imp_bobinas; n integer; first_id uuid:=gen_random_uuid(); token text; c integer; old_sku_id uuid:=gen_random_uuid(); baseline jsonb; production bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','252b6899-62c6-4096-9851-084214cdcce7',true);
 PERFORM set_config('request.jwt.claims','{"sub":"252b6899-62c6-4096-9851-084214cdcce7","role":"authenticated"}',true);
 SELECT count(*) INTO production FROM public.muestras_calidad;
 p:=public.imp_catalogo_guardar('producto','QA_SKU_PROPAGATION',null,null,null);
 other_p:=public.imp_catalogo_guardar('producto','QA_SKU_OTHER',null,null,null);
 SELECT * INTO seed FROM public.imp_bobinas ORDER BY numero LIMIT 1;
 SELECT max(numero)+100 INTO n FROM public.imp_bobinas;
 fixture:=to_jsonb(seed)||jsonb_build_object('producto_id',p,'producto_codigo','QA_SKU_PROPAGATION','sku',null,'revision',1,'fuente_sha256',null,'fuente_fila',null);
 INSERT INTO public.imp_bobinas SELECT (jsonb_populate_record(NULL::public.imp_bobinas,fixture||jsonb_build_object('id',first_id,'numero',n,'folio',n::text||'-00'))).*;
 INSERT INTO public.imp_bobinas SELECT (jsonb_populate_record(NULL::public.imp_bobinas,fixture||jsonb_build_object('id',gen_random_uuid(),'numero',n+1,'folio',(n+1)::text||'-00','sku','  '))).*;
 INSERT INTO public.imp_bobinas SELECT (jsonb_populate_record(NULL::public.imp_bobinas,fixture||jsonb_build_object('id',old_sku_id,'numero',n+2,'folio',(n+2)::text||'-00','sku','EXISTING_SKU'))).*;
 INSERT INTO public.imp_bobinas SELECT (jsonb_populate_record(NULL::public.imp_bobinas,fixture||jsonb_build_object('id',gen_random_uuid(),'numero',n+3,'folio',(n+3)::text||'-00','producto_id',other_p))).*;
 SELECT jsonb_object_agg(id::text,to_jsonb(b)-'sku'-'revision') INTO baseline FROM public.imp_bobinas b WHERE producto_id=p;
 IF (public.imp_sku_pendientes(p)->>'cantidad')::int<>2 THEN RAISE EXCEPTION 'Wrong pending count'; END IF;
 token:=public.imp_sku_pendientes(p)->>'esperado';
 BEGIN
  PERFORM public.imp_sku_confirmado(p,'SSK103132260',repeat('0',32),'Prueba de confirmación obsoleta',first_id,1);
  RAISE EXCEPTION 'Stale confirmation accepted' USING ERRCODE='PZ002';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 c:=public.imp_sku_confirmado(p,'SSK103132260',token,'Prueba autorizada con reversión',first_id,1,'QA_SKU_PROPAGATION',1);
 IF c<>2 OR (public.imp_sku_pendientes(p)->>'cantidad')::int<>0 THEN RAISE EXCEPTION 'Missing-only assignment failed'; END IF;
 IF (SELECT sku FROM public.imp_bobinas WHERE id=old_sku_id)<>'EXISTING_SKU' THEN RAISE EXCEPTION 'Existing SKU replaced'; END IF;
 IF (SELECT count(*) FROM public.imp_bobinas WHERE producto_id=other_p AND sku IS NULL)<>1 THEN RAISE EXCEPTION 'Other product changed'; END IF;
 IF baseline IS DISTINCT FROM (SELECT jsonb_object_agg(id::text,to_jsonb(b)-'sku'-'revision') FROM public.imp_bobinas b WHERE producto_id=p) THEN RAISE EXCEPTION 'Historic fields modified'; END IF;
 IF (SELECT count(*) FROM public.imp_eventos WHERE bobina_id IN(SELECT id FROM public.imp_bobinas WHERE producto_id=p) AND accion='sku_asignado')<>2 THEN RAISE EXCEPTION 'Missing per-roll audit'; END IF;
 IF (SELECT count(*) FROM public.muestras_calidad)<>production THEN RAISE EXCEPTION 'Production changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','c17926d4-1407-40ff-8303-1d4c8bd9b4b4',true);
 PERFORM set_config('request.jwt.claims','{"sub":"c17926d4-1407-40ff-8303-1d4c8bd9b4b4","role":"authenticated"}',true);
 BEGIN
  PERFORM public.imp_sku_confirmado(p,'NOT_ALLOWED',token,'Prueba permiso capturista');
  RAISE EXCEPTION 'Unauthorized assignment accepted' USING ERRCODE='PZ002';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: count, stale confirmation, blank-only fill, existing SKU, other product, immutable fields, audit and permissions';
END $$;
ROLLBACK;