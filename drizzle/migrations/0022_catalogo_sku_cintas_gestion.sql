ALTER TABLE public.catalogo_sku_sap_cintas
  ADD COLUMN IF NOT EXISTS ancho_corte_cm numeric NULL,
  ADD COLUMN IF NOT EXISTS planta_codigo text NULL,
  ADD COLUMN IF NOT EXISTS creado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid NULL;
COMMENT ON COLUMN public.catalogo_sku_sap_cintas.planta_codigo IS 'TLX / IXT; NULL = ambas plantas';

CREATE TABLE IF NOT EXISTS public.catalogo_sku_sap_cintas_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL,
  accion text NOT NULL,
  valores_anteriores jsonb,
  valores_nuevos jsonb,
  motivo text NOT NULL,
  realizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_sku_sap_cintas_auditoria TO authenticated;
GRANT ALL ON public.catalogo_sku_sap_cintas_auditoria TO service_role;
ALTER TABLE public.catalogo_sku_sap_cintas_auditoria ENABLE ROW LEVEL SECURITY;

-- Planta que administra el usuario: 'ALL' (administrador), 'TLX', 'IXT' o NULL (sin permiso).
CREATE OR REPLACE FUNCTION public.sku_cintas_planta_gestion()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF public.has_role(v_uid, 'administrador') THEN RETURN 'ALL'; END IF;
  SELECT lower(email) INTO v_email FROM public.profiles WHERE id = v_uid;
  IF v_email = 'gcalidad@convertipap.site' THEN RETURN 'TLX'; END IF;
  IF v_email = 'msramosixt@convertipap.site' THEN RETURN 'IXT'; END IF;
  RETURN NULL;
END $$;

CREATE POLICY sku_cintas_aud_select ON public.catalogo_sku_sap_cintas_auditoria
  FOR SELECT TO authenticated USING (public.sku_cintas_planta_gestion() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.sku_cintas_guardar(
  _id uuid, _clave text, _descripcion text, _producto_codigo text, _ancho_corte_cm numeric,
  _planta_codigo text, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_g text := public.sku_cintas_planta_gestion();
  v_ant record; v_clave text := upper(trim(coalesce(_clave,''))); v_prod text := upper(trim(coalesce(_producto_codigo,'')));
  v_planta text; v_id uuid;
BEGIN
  IF v_g IS NULL THEN RAISE EXCEPTION 'No tiene autorización para administrar el catálogo SKU de cintas.' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).' USING ERRCODE='22023'; END IF;
  IF v_clave !~ '^[A-Z0-9-]{4,30}$' THEN RAISE EXCEPTION 'SKU inválido: 4 a 30 caracteres, solo letras, números o guiones (sin espacios).' USING ERRCODE='22023'; END IF;
  IF length(trim(coalesce(_descripcion,''))) < 3 THEN RAISE EXCEPTION 'Descripción obligatoria.' USING ERRCODE='22023'; END IF;
  IF _ancho_corte_cm IS NULL OR _ancho_corte_cm <= 0 OR _ancho_corte_cm > 1000 THEN RAISE EXCEPTION 'Ancho de corte inválido (cm).' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE upper(codigo) = v_prod AND activo) THEN
    RAISE EXCEPTION 'Producto no válido o inactivo.' USING ERRCODE='22023'; END IF;

  IF v_g = 'ALL' THEN
    v_planta := NULLIF(upper(trim(coalesce(_planta_codigo,''))),'');
    IF v_planta IS NOT NULL AND v_planta NOT IN ('TLX','IXT') THEN RAISE EXCEPTION 'Planta inválida.'; END IF;
  ELSE
    v_planta := v_g;
  END IF;

  IF EXISTS (SELECT 1 FROM public.catalogo_sku_sap_cintas WHERE clave = v_clave AND id IS DISTINCT FROM _id) THEN
    RAISE EXCEPTION 'El SKU % ya existe en el catálogo.', v_clave USING ERRCODE='23505'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.catalogo_sku_sap_cintas (clave, descripcion, producto_codigo, ancho_corte_cm, planta_codigo, activo, creado_por, actualizado_por)
    VALUES (v_clave, trim(_descripcion), v_prod, _ancho_corte_cm, v_planta, true, v_uid, v_uid) RETURNING id INTO v_id;
    INSERT INTO public.catalogo_sku_sap_cintas_auditoria (sku_id, accion, valores_nuevos, motivo, realizado_por)
    VALUES (v_id, 'ALTA', jsonb_build_object('clave',v_clave,'descripcion',trim(_descripcion),'producto_codigo',v_prod,'ancho_corte_cm',_ancho_corte_cm,'planta_codigo',v_planta), trim(_motivo), v_uid);
  ELSE
    SELECT * INTO v_ant FROM public.catalogo_sku_sap_cintas WHERE id = _id FOR UPDATE;
    IF v_ant.id IS NULL THEN RAISE EXCEPTION 'SKU no encontrado.'; END IF;
    IF v_g <> 'ALL' AND v_ant.planta_codigo IS DISTINCT FROM v_g THEN
      RAISE EXCEPTION 'Solo puede modificar SKU de su planta. Los SKU compartidos por ambas plantas los modifica el administrador.' USING ERRCODE='42501'; END IF;
    IF v_ant.clave <> v_clave AND EXISTS (SELECT 1 FROM public.pesajes_cintas WHERE sku_sap = v_ant.clave) THEN
      RAISE EXCEPTION 'El SKU ya se usó en cintas registradas: no se puede cambiar la clave; desactívelo y dé de alta uno nuevo.' USING ERRCODE='22023'; END IF;
    UPDATE public.catalogo_sku_sap_cintas SET clave = v_clave, descripcion = trim(_descripcion), producto_codigo = v_prod,
      ancho_corte_cm = _ancho_corte_cm, planta_codigo = v_planta, actualizado_por = v_uid, updated_at = now() WHERE id = _id;
    v_id := _id;
    INSERT INTO public.catalogo_sku_sap_cintas_auditoria (sku_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
    VALUES (v_id, 'EDICION',
      jsonb_build_object('clave',v_ant.clave,'descripcion',v_ant.descripcion,'producto_codigo',v_ant.producto_codigo,'ancho_corte_cm',v_ant.ancho_corte_cm,'planta_codigo',v_ant.planta_codigo),
      jsonb_build_object('clave',v_clave,'descripcion',trim(_descripcion),'producto_codigo',v_prod,'ancho_corte_cm',_ancho_corte_cm,'planta_codigo',v_planta), trim(_motivo), v_uid);
  END IF;
  RETURN jsonb_build_object('id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.sku_cintas_set_activo(_id uuid, _activo boolean, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_g text := public.sku_cintas_planta_gestion(); v_ant record;
BEGIN
  IF v_g IS NULL THEN RAISE EXCEPTION 'No tiene autorización para administrar el catálogo SKU de cintas.' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Motivo obligatorio (mínimo 10 caracteres).' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_ant FROM public.catalogo_sku_sap_cintas WHERE id = _id FOR UPDATE;
  IF v_ant.id IS NULL THEN RAISE EXCEPTION 'SKU no encontrado.'; END IF;
  IF v_g <> 'ALL' AND v_ant.planta_codigo IS DISTINCT FROM v_g THEN
    RAISE EXCEPTION 'Solo puede modificar SKU de su planta. Los SKU compartidos por ambas plantas los modifica el administrador.' USING ERRCODE='42501'; END IF;
  UPDATE public.catalogo_sku_sap_cintas SET activo = _activo, actualizado_por = v_uid, updated_at = now() WHERE id = _id;
  INSERT INTO public.catalogo_sku_sap_cintas_auditoria (sku_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (_id, CASE WHEN _activo THEN 'REACTIVACION' ELSE 'DESACTIVACION' END,
    jsonb_build_object('activo', v_ant.activo), jsonb_build_object('activo', _activo), trim(_motivo), v_uid);
END $$;

REVOKE ALL ON FUNCTION public.sku_cintas_planta_gestion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sku_cintas_guardar(uuid,text,text,text,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sku_cintas_set_activo(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sku_cintas_planta_gestion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sku_cintas_guardar(uuid,text,text,text,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sku_cintas_set_activo(uuid,boolean,text) TO authenticated;