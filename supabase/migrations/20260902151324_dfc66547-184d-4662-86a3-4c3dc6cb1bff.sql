CREATE TABLE public.catalogo_sku_sap_cintas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  producto_codigo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_sku_sap_cintas TO authenticated;
GRANT ALL ON public.catalogo_sku_sap_cintas TO service_role;
ALTER TABLE public.catalogo_sku_sap_cintas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sku_sap_cintas_select" ON public.catalogo_sku_sap_cintas FOR SELECT TO authenticated USING (true);
CREATE POLICY "sku_sap_cintas_admin_insert" ON public.catalogo_sku_sap_cintas FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE POLICY "sku_sap_cintas_admin_update" ON public.catalogo_sku_sap_cintas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE POLICY "sku_sap_cintas_admin_delete" ON public.catalogo_sku_sap_cintas FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE INDEX idx_sku_sap_cintas_producto ON public.catalogo_sku_sap_cintas(producto_codigo) WHERE activo;
CREATE TRIGGER trg_sku_sap_cintas_updated BEFORE UPDATE ON public.catalogo_sku_sap_cintas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pesajes_cintas ADD COLUMN IF NOT EXISTS sku_sap text;

CREATE OR REPLACE FUNCTION public.registrar_cinta_v3(_lote_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _lote_logistico_pza text, _sku_sap text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cinta_id uuid;
  v_lote record;
  v_next_pos smallint;
  v_cnt int;
  v_total numeric;
  v_pendiente numeric;
  v_norm text;
  v_pza text := NULLIF(btrim(COALESCE(_lote_logistico_pza,'')), '');
  v_sku text := NULLIF(btrim(upper(COALESCE(_sku_sap,''))), '');
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_cinta_id FROM public.pesajes_cintas WHERE idempotency_key = _idempotency;
  IF v_cinta_id IS NOT NULL THEN
    RETURN jsonb_build_object('cinta_id', v_cinta_id, 'idempotent', true);
  END IF;

  IF _uniones IS NULL OR _peso_cinta_kg IS NULL OR _ancho_util IS NULL OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;
  IF _uniones < 0 THEN RAISE EXCEPTION 'Uniones no puede ser negativo.' USING ERRCODE='22023'; END IF;
  IF _peso_cinta_kg <= 0 THEN RAISE EXCEPTION 'El peso real de la cinta debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF _ancho_util <= 0 THEN RAISE EXCEPTION 'Ancho útil debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF v_pza IS NOT NULL AND length(v_pza) > 10 THEN
    RAISE EXCEPTION 'N° de ID SAP admite máximo 10 caracteres.' USING ERRCODE='22023';
  END IF;
  IF v_sku IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalogo_sku_sap_cintas WHERE clave = v_sku AND activo) THEN
    RAISE EXCEPTION 'SKU SAP no válido.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  v_norm := upper(btrim(v_lote.numero_rollo));

  PERFORM pg_advisory_xact_lock(hashtext('rollo:'||v_norm));
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'La bajada no está abierta para registrar cintas.' USING ERRCODE='22023';
  END IF;

  IF v_lote.rollo_id IS NOT NULL AND v_pza IS NULL THEN
    RAISE EXCEPTION 'Capture el N° de ID SAP de la cinta.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_cnt >= 50 THEN
    RAISE EXCEPTION 'Ya se registraron las 50 cintas permitidas para esta bajada.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(MAX(c.posicion), 0)::int + 1 INTO v_next_pos
    FROM public.pesajes_cintas c
    JOIN public.pesajes_cintas_lotes l ON l.id = c.lote_id
   WHERE upper(btrim(l.numero_rollo)) = v_norm AND c.estado = 'registrada';

  IF v_next_pos > 350 THEN
    RAISE EXCEPTION 'Se alcanzó la posición máxima de cintas (350) para este rollo.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pesajes_cintas (
    lote_id, posicion, uniones, peso_cinta_kg, ancho_util,
    observaciones, idempotency_key, creado_por, rollo_id, lote_logistico_pza, sku_sap
  ) VALUES (
    _lote_id, v_next_pos, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''), _idempotency, v_uid,
    v_lote.rollo_id, v_pza, v_sku
  ) RETURNING id INTO v_cinta_id;

  v_cnt := v_cnt + 1;
  v_total := v_total + _peso_cinta_kg;
  v_pendiente := v_lote.peso_bobina_madre_neto_kg - v_total;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_cnt,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_pendiente,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, v_cinta_id, 'CINTA_REGISTRADA',
    jsonb_build_object('posicion', v_next_pos, 'peso_real_kg', _peso_cinta_kg,
                       'uniones', _uniones, 'ancho_util', _ancho_util,
                       'lote_logistico_pza', v_pza,
                       'sku_sap', v_sku,
                       'numero_bajada', v_lote.numero_bajada,
                       'idempotency_key', _idempotency),
    v_uid);

  RETURN jsonb_build_object('cinta_id', v_cinta_id, 'posicion', v_next_pos,
    'peso_total_cintas_kg', v_total, 'peso_pendiente_kg', v_pendiente,
    'cantidad_cintas', v_cnt);
END $function$;

CREATE OR REPLACE FUNCTION public.corregir_cinta(_cinta_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _motivo text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_ant record;
  v_lote record;
  v_total numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;
  IF _peso_cinta_kg IS NULL OR _peso_cinta_kg <= 0 THEN
    RAISE EXCEPTION 'El peso real de la cinta debe ser mayor a 0.' USING ERRCODE='22023';
  END IF;

  SELECT id INTO v_new_id FROM public.pesajes_cintas WHERE idempotency_key = _idempotency;
  IF v_new_id IS NOT NULL THEN RETURN jsonb_build_object('cinta_id', v_new_id, 'idempotent', true); END IF;

  SELECT * INTO v_ant FROM public.pesajes_cintas WHERE id = _cinta_id FOR UPDATE;
  IF v_ant.id IS NULL THEN RAISE EXCEPTION 'Cinta no encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_ant.estado <> 'registrada' THEN
    RAISE EXCEPTION 'Sólo se pueden corregir cintas registradas.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||v_ant.lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = v_ant.lote_id FOR UPDATE;
  IF v_lote.estado = 'anulado' THEN
    RAISE EXCEPTION 'Lote anulado.' USING ERRCODE='22023';
  END IF;
  IF v_lote.estado = 'finalizado'
     AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'calidad')) THEN
    RAISE EXCEPTION 'Lote finalizado: corrección restringida a rol autorizado.' USING ERRCODE='42501';
  END IF;

  UPDATE public.pesajes_cintas
     SET estado = 'sustituida', motivo_anulacion = _motivo,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = _cinta_id;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas
    WHERE lote_id = v_ant.lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pesajes_cintas (
    lote_id, posicion, uniones, peso_cinta_kg, ancho_util,
    observaciones, sustituye_a_cinta_id, idempotency_key, creado_por, version_etiqueta,
    lote_logistico_pza, rollo_id, sku_sap
  ) VALUES (
    v_ant.lote_id, v_ant.posicion, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''),
    v_ant.id, _idempotency, v_uid, COALESCE(v_ant.version_etiqueta,1) + 1,
    v_ant.lote_logistico_pza, v_ant.rollo_id, v_ant.sku_sap
  ) RETURNING id INTO v_new_id;

  v_total := v_total + _peso_cinta_kg;
  UPDATE public.pesajes_cintas_lotes
     SET peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_lote.peso_bobina_madre_neto_kg - v_total,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = v_ant.lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (v_ant.lote_id, v_new_id, 'CINTA_CORREGIDA',
    jsonb_build_object('peso_real_kg', v_ant.peso_cinta_kg, 'uniones', v_ant.uniones, 'ancho_util', v_ant.ancho_util, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1), 'lote_logistico_pza', v_ant.lote_logistico_pza, 'sku_sap', v_ant.sku_sap),
    jsonb_build_object('peso_real_kg', _peso_cinta_kg, 'uniones', _uniones, 'ancho_util', _ancho_util, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1)+1, 'lote_logistico_pza', v_ant.lote_logistico_pza, 'sku_sap', v_ant.sku_sap, 'idempotency_key', _idempotency),
    _motivo, v_uid);

  RETURN jsonb_build_object('cinta_id', v_new_id, 'posicion', v_ant.posicion, 'version_etiqueta', COALESCE(v_ant.version_etiqueta,1)+1);
END
$function$;