CREATE OR REPLACE FUNCTION public.imp_sku_pendientes(_producto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer; v_token text;
BEGIN
 IF NOT public.imp_permiso('editar') THEN RAISE EXCEPTION 'SKU solo Calidad y adgral' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.imp_productos WHERE id=_producto_id) THEN RAISE EXCEPTION 'Producto importado no encontrado'; END IF;
 SELECT count(*)::integer, md5(coalesce(string_agg(id::text||':'||revision::text,',' ORDER BY id),'')) INTO v_count,v_token FROM public.imp_bobinas WHERE producto_id=_producto_id AND nullif(btrim(sku),'') IS NULL;
 RETURN jsonb_build_object('cantidad',v_count,'esperado',v_token);
END $$;
REVOKE ALL ON FUNCTION public.imp_sku_pendientes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.imp_sku_pendientes(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.imp_sku_confirmado(_producto_id uuid,_sku text,_esperado text,_motivo text,_bobina_id uuid DEFAULT NULL,_revision integer DEFAULT NULL,_codigo text DEFAULT NULL,_catalogo_revision integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.imp_bobinas; anterior jsonb; v_token text; v_count integer:=0; v_sku text:=btrim(coalesce(_sku,''));
BEGIN
 IF NOT public.imp_permiso('editar') THEN RAISE EXCEPTION 'SKU solo Calidad y adgral' USING ERRCODE='42501'; END IF;
 IF length(v_sku) NOT BETWEEN 1 AND 64 OR v_sku !~ '^[[:graph:] ]+$' OR length(btrim(coalesce(_motivo,'')))<10 THEN RAISE EXCEPTION 'SKU válido y motivo de mínimo 10 caracteres obligatorios'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('imp-sku-producto:'||_producto_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.imp_productos WHERE id=_producto_id) THEN RAISE EXCEPTION 'Producto importado no encontrado'; END IF;
 IF _bobina_id IS NOT NULL THEN
  SELECT * INTO b FROM public.imp_bobinas WHERE id=_bobina_id FOR UPDATE;
  IF NOT FOUND OR b.producto_id IS DISTINCT FROM _producto_id OR b.revision IS DISTINCT FROM _revision OR nullif(btrim(b.sku),'') IS NOT NULL THEN RAISE EXCEPTION 'La bobina cambió. Actualice y confirme nuevamente.'; END IF;
 END IF;
 PERFORM id FROM public.imp_bobinas WHERE producto_id=_producto_id AND nullif(btrim(sku),'') IS NULL ORDER BY id FOR UPDATE;
 SELECT md5(coalesce(string_agg(id::text||':'||revision::text,',' ORDER BY id),'')) INTO v_token FROM public.imp_bobinas WHERE producto_id=_producto_id AND nullif(btrim(sku),'') IS NULL;
 IF _esperado IS DISTINCT FROM v_token THEN RAISE EXCEPTION 'Los rollos pendientes cambiaron. Revise el conteo y confirme nuevamente.'; END IF;
 IF _codigo IS NOT NULL THEN PERFORM public.imp_catalogo_guardar('producto',_codigo,v_sku,_producto_id,_catalogo_revision); END IF;
 FOR b IN SELECT * FROM public.imp_bobinas WHERE producto_id=_producto_id AND nullif(btrim(sku),'') IS NULL ORDER BY id FOR UPDATE LOOP
  anterior:=to_jsonb(b);
  UPDATE public.imp_bobinas SET sku=v_sku,revision=revision+1 WHERE id=b.id AND nullif(btrim(sku),'') IS NULL RETURNING * INTO b;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rollo cambió; ninguna asignación fue aplicada'; END IF;
  INSERT INTO public.imp_eventos(bobina_id,accion,usuario_id,motivo,antes,despues) VALUES(b.id,'sku_asignado',auth.uid(),btrim(_motivo),anterior,to_jsonb(b));
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.imp_sku_confirmado(uuid,text,text,text,uuid,integer,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.imp_sku_confirmado(uuid,text,text,text,uuid,integer,text,integer) TO authenticated;