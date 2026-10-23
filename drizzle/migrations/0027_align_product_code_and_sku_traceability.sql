CREATE OR REPLACE FUNCTION public.catalogo_validar_sku_version(_producto_id uuid, _sku text, _version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sku text := nullif(upper(trim(coalesce(_sku,''))),'');
BEGIN
  IF NOT public.puede_gestionar_catalogo_calidad(auth.uid()) THEN RAISE EXCEPTION 'Sin autorización.' USING ERRCODE='42501'; END IF;
  IF v_sku IS NULL THEN RETURN; END IF;
  IF length(v_sku)>64 OR v_sku !~ '^[[:graph:] ]+$' THEN RAISE EXCEPTION 'SKU inválido (máximo 64 caracteres imprimibles).'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('catalogo-sku:' || v_sku, 0));
  IF EXISTS (
    SELECT 1 FROM public.producto_skus_sap k
    JOIN public.producto_especificaciones s ON s.producto_id=k.producto_id
    WHERE upper(trim(k.clave_sku_sap))=v_sku
      AND (_producto_id IS NULL OR k.producto_id<>_producto_id)
      AND s.estado IN ('vigente','borrador','en_revision')
      AND upper(trim(s.version))=upper(trim(_version))
  ) THEN RAISE EXCEPTION 'SKU_VERSION_DUPLICADA: El SKU % ya existe con la versión %. Solo se permite compartir entre versiones distintas.', v_sku, _version; END IF;
END $$;
REVOKE ALL ON FUNCTION public.catalogo_validar_sku_version(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_validar_sku_version(uuid,text,text) TO authenticated, service_role;
DO $migration$
DECLARE d text; old text;
BEGIN
  d := pg_get_functiondef('public.catalogo_crear_producto(text,text,uuid,text,text,jsonb,text,text)'::regprocedure);
  old := $old$IF v_cod !~ '^[A-Z0-9\-]{2,30}$' THEN RAISE EXCEPTION 'Código inválido (2 a 30 caracteres: letras, números o guion).'; END IF;$old$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Validación de código inesperada'; END IF;
  d := replace(d,old,$new$IF length(v_cod) NOT BETWEEN 2 AND 30 OR v_cod !~ '^[[:graph:] ]+$' THEN RAISE EXCEPTION 'Código inválido (2 a 30 caracteres imprimibles).'; END IF;$new$);
  old := substring(d from '  IF v_sku IS NOT NULL THEN[\s\S]*?\n  END IF;');
  IF old IS NULL THEN RAISE EXCEPTION 'Validación SKU de alta no encontrada'; END IF;
  d := replace(d,old,'  PERFORM public.catalogo_validar_sku_version(NULL, v_sku, v_ver);');
  EXECUTE d;

  d := pg_get_functiondef('public.catalogo_editar_producto(uuid,text,text,text,text)'::regprocedure);
  old := substring(d from '    FOR v_otro IN SELECT DISTINCT producto_id[\s\S]*?    END LOOP;');
  IF old IS NULL THEN RAISE EXCEPTION 'Validación SKU de edición no encontrada'; END IF;
  d := replace(d,old,'    PERFORM public.catalogo_validar_sku_version(_producto_id, v_sku, v_ver_efectiva);');
  old := '  IF v_ver IS NOT NULL THEN';
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Validación versión de edición no encontrada'; END IF;
  d := replace(d,old,$new$  IF v_ver IS NOT NULL THEN
    FOR v_otro IN SELECT clave_sku_sap FROM public.producto_skus_sap WHERE producto_id=_producto_id LOOP
      PERFORM public.catalogo_validar_sku_version(_producto_id, v_otro.clave_sku_sap, v_ver);
    END LOOP;$new$);
  EXECUTE d;

  d := pg_get_functiondef('public.crear_muestra_con_mediciones(jsonb,jsonb,uuid)'::regprocedure);
  old := $old$  v_sku := NULLIF(trim(_muestra->>'sku_sap'), '');
  IF v_sku IS NOT NULL THEN
    SELECT s.clave_sku_sap, s.descripcion_sap
      INTO v_sku, v_sku_desc
      FROM public.producto_skus_sap s
     WHERE s.producto_id = (_muestra->>'producto_id')::uuid
       AND s.clave_sku_sap = v_sku;
    IF v_sku IS NULL THEN
      RAISE EXCEPTION 'SKU_INVALIDO: la clave % no corresponde al producto seleccionado', _muestra->>'sku_sap';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.plantas
     WHERE id = (_muestra->>'planta_id')::uuid AND codigo = 'TLX'
  ) THEN$old$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Validación SKU de captura inesperada'; END IF;
  d := replace(d,old,$new$  v_sku := NULLIF(trim(_muestra->>'sku_sap'), '');
  IF v_sku IS NOT NULL THEN
    IF length(v_sku)>64 OR v_sku !~ '^[[:graph:] ]+$' THEN RAISE EXCEPTION 'SKU_INVALIDO: máximo 64 caracteres imprimibles'; END IF;
    IF EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE producto_id=(_muestra->>'producto_id')::uuid) THEN
      SELECT s.clave_sku_sap, s.descripcion_sap INTO v_sku, v_sku_desc
      FROM public.producto_skus_sap s
      WHERE s.producto_id=(_muestra->>'producto_id')::uuid AND s.clave_sku_sap=v_sku;
      IF v_sku IS NULL THEN RAISE EXCEPTION 'SKU_INVALIDO: la clave % no corresponde al producto seleccionado', _muestra->>'sku_sap'; END IF;
    END IF;
  ELSE$new$);
  EXECUTE d;
END $migration$;