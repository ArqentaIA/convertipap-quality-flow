CREATE OR REPLACE FUNCTION public.puede_gestionar_catalogo_calidad(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_uid, 'administrador'::app_role)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid
                  AND lower(p.email) IN ('gcalidad@convertipap.site','msramosixt@convertipap.site'))
$$;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_catalogo_calidad(uuid) TO authenticated;

-- Editar producto: ajusta versión del borrador (crea uno si no existe) y asigna SKU SAP.
CREATE OR REPLACE FUNCTION public.catalogo_editar_producto(_producto_id uuid, _version text, _sku text, _descripcion_sku text, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_spec uuid; v_ver_old text; v_ver text := nullif(trim(coalesce(_version,'')),'');
  v_sku text := nullif(upper(trim(coalesce(_sku,''))),''); v_cambios int := 0;
BEGIN
  IF NOT public.puede_gestionar_catalogo_calidad(v_uid) THEN
    RAISE EXCEPTION 'Sin autorización para gestionar el catálogo de productos.' USING ERRCODE='42501';
  END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = _producto_id AND activo) THEN
    RAISE EXCEPTION 'Producto no encontrado o inactivo.';
  END IF;

  IF v_ver IS NOT NULL THEN
    IF length(v_ver) > 20 OR v_ver !~ '^[0-9A-Za-z.\-]+$' THEN
      RAISE EXCEPTION 'Versión inválida (solo números, letras, punto o guion; máx. 20).';
    END IF;
    SELECT id, version INTO v_spec, v_ver_old FROM public.producto_especificaciones
     WHERE producto_id = _producto_id AND estado IN ('borrador','en_revision') LIMIT 1;
    IF v_spec IS NULL THEN
      v_spec := public.crear_borrador_especificacion(_producto_id, _motivo);
      SELECT version INTO v_ver_old FROM public.producto_especificaciones WHERE id = v_spec;
    END IF;
    IF (SELECT estado FROM public.producto_especificaciones WHERE id = v_spec) = 'en_revision' THEN
      RAISE EXCEPTION 'El borrador está en revisión; descártalo o publícalo antes de cambiar la versión.';
    END IF;
    IF v_ver IS DISTINCT FROM v_ver_old THEN
      IF EXISTS (SELECT 1 FROM public.producto_especificaciones
                  WHERE producto_id = _producto_id AND id <> v_spec AND version = v_ver) THEN
        RAISE EXCEPTION 'La versión % ya existe para este producto.', v_ver;
      END IF;
      UPDATE public.producto_especificaciones SET version = v_ver, motivo_cambio = trim(_motivo), updated_at = now() WHERE id = v_spec;
      v_cambios := v_cambios + 1;
    END IF;
  END IF;

  IF v_sku IS NOT NULL THEN
    IF length(v_sku) > 64 THEN RAISE EXCEPTION 'SKU SAP demasiado largo (máx. 64).'; END IF;
    IF EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE clave_sku_sap = v_sku AND producto_id <> _producto_id) THEN
      RAISE EXCEPTION 'El SKU SAP % ya está asignado a otro producto.', v_sku;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE clave_sku_sap = v_sku AND producto_id = _producto_id) THEN
      INSERT INTO public.producto_skus_sap (producto_id, clave_sku_sap, descripcion_sap, es_principal)
      VALUES (_producto_id, v_sku, nullif(trim(coalesce(_descripcion_sku,'')),''),
              NOT EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE producto_id = _producto_id));
      v_cambios := v_cambios + 1;
    END IF;
  END IF;

  IF v_cambios > 0 THEN
    PERFORM public.audit_action('variables_calidad', 'Edición de producto: ' || coalesce(v_ver_old,'—') || ' → ' || coalesce(v_ver, v_ver_old, '—')
      || coalesce(' · SKU ' || v_sku, '') || ' · Motivo: ' || trim(_motivo), _producto_id,
      jsonb_build_object('version_anterior', v_ver_old, 'version_nueva', v_ver, 'sku', v_sku, 'spec_id', v_spec));
  END IF;
  RETURN jsonb_build_object('ok', true, 'cambios', v_cambios, 'spec_id', v_spec);
END $$;
GRANT EXECUTE ON FUNCTION public.catalogo_editar_producto(uuid, text, text, text, text) TO authenticated;

-- Alta de producto nuevo con borrador de especificación (solo variables que apliquen).
CREATE OR REPLACE FUNCTION public.catalogo_crear_producto(_codigo text, _nombre text, _tipo_id uuid, _version text, _sku text, _variables jsonb, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_cod text := upper(trim(coalesce(_codigo,''))); v_nom text := trim(coalesce(_nombre,''));
  v_ver text := coalesce(nullif(trim(coalesce(_version,'')),''), '1.0'); v_sku text := nullif(upper(trim(coalesce(_sku,''))),'');
  v_prod uuid; v_spec uuid; v_item jsonb; v_n int := 0; v_min numeric; v_obj numeric; v_max numeric;
BEGIN
  IF NOT public.puede_gestionar_catalogo_calidad(v_uid) THEN
    RAISE EXCEPTION 'Sin autorización para gestionar el catálogo de productos.' USING ERRCODE='42501';
  END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).'; END IF;
  IF v_cod !~ '^[A-Z0-9\-]{2,30}$' THEN RAISE EXCEPTION 'Código inválido (2 a 30 caracteres: letras, números o guion).'; END IF;
  IF length(v_nom) < 3 OR length(v_nom) > 200 THEN RAISE EXCEPTION 'Nombre obligatorio (3 a 200 caracteres).'; END IF;
  IF v_ver !~ '^[0-9A-Za-z.\-]{1,20}$' THEN RAISE EXCEPTION 'Versión inválida.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tipos_producto WHERE id = _tipo_id AND activo) THEN RAISE EXCEPTION 'Selecciona una familia/tipo válido.'; END IF;
  IF EXISTS (SELECT 1 FROM public.productos WHERE upper(codigo) = v_cod) THEN RAISE EXCEPTION 'Ya existe un producto con el código %.', v_cod; END IF;
  IF jsonb_typeof(_variables) <> 'array' OR jsonb_array_length(_variables) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una variable para el producto.';
  END IF;
  IF v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM public.producto_skus_sap WHERE clave_sku_sap = v_sku) THEN
    RAISE EXCEPTION 'El SKU SAP % ya está asignado a otro producto.', v_sku;
  END IF;

  INSERT INTO public.productos (codigo, nombre, tipo_id, activo) VALUES (v_cod, v_nom, _tipo_id, true) RETURNING id INTO v_prod;
  INSERT INTO public.producto_especificaciones (producto_id, version, estado, motivo_cambio)
  VALUES (v_prod, v_ver, 'borrador', trim(_motivo)) RETURNING id INTO v_spec;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_variables) LOOP
    v_min := (v_item->>'min')::numeric; v_obj := (v_item->>'objetivo')::numeric; v_max := (v_item->>'max')::numeric;
    IF v_min IS NULL OR v_obj IS NULL OR v_max IS NULL THEN RAISE EXCEPTION 'Cada variable requiere mínimo, objetivo y máximo.'; END IF;
    IF NOT (v_min <= v_obj AND v_obj <= v_max) THEN
      RAISE EXCEPTION 'Rango inválido en una variable: debe cumplirse mínimo ≤ objetivo ≤ máximo.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.variables_calidad WHERE id = (v_item->>'variable_id')::uuid AND activo) THEN
      RAISE EXCEPTION 'Variable inválida.';
    END IF;
    INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
    VALUES (v_spec, (v_item->>'variable_id')::uuid, v_min, v_obj, v_max);
    v_n := v_n + 1;
  END LOOP;

  IF v_sku IS NOT NULL THEN
    INSERT INTO public.producto_skus_sap (producto_id, clave_sku_sap, es_principal) VALUES (v_prod, v_sku, true);
  END IF;

  PERFORM public.audit_action('variables_calidad', 'Alta de producto ' || v_cod || ' (' || v_n || ' variables, versión ' || v_ver || ' en borrador) · Motivo: ' || trim(_motivo),
    v_prod, jsonb_build_object('codigo', v_cod, 'nombre', v_nom, 'version', v_ver, 'sku', v_sku, 'variables', _variables));
  RETURN jsonb_build_object('ok', true, 'producto_id', v_prod, 'spec_id', v_spec);
END $$;
GRANT EXECUTE ON FUNCTION public.catalogo_crear_producto(text, text, uuid, text, text, jsonb, text) TO authenticated;

-- Eliminar = desactivar a partir de ahora; rollos ya capturados conservan su producto.
CREATE OR REPLACE FUNCTION public.catalogo_desactivar_producto(_producto_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_cod text;
BEGIN
  IF NOT public.puede_gestionar_catalogo_calidad(v_uid) THEN
    RAISE EXCEPTION 'Sin autorización para gestionar el catálogo de productos.' USING ERRCODE='42501';
  END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).'; END IF;
  UPDATE public.productos SET activo = false, updated_at = now() WHERE id = _producto_id AND activo RETURNING codigo INTO v_cod;
  IF v_cod IS NULL THEN RAISE EXCEPTION 'Producto no encontrado o ya eliminado.'; END IF;
  PERFORM public.audit_action('variables_calidad', 'Eliminación (desactivación) de producto ' || v_cod || ' · Motivo: ' || trim(_motivo), _producto_id, NULL);
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.catalogo_desactivar_producto(uuid, text) TO authenticated;