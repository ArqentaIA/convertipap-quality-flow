-- 1) Campo canónico
ALTER TABLE public.pesajes_cintas_lotes
  ADD COLUMN IF NOT EXISTS peso_mermas_kg numeric;

ALTER TABLE public.pesajes_cintas_lotes
  DROP CONSTRAINT IF EXISTS pesajes_cintas_lotes_peso_mermas_kg_check;
ALTER TABLE public.pesajes_cintas_lotes
  ADD CONSTRAINT pesajes_cintas_lotes_peso_mermas_kg_check
  CHECK (peso_mermas_kg IS NULL OR peso_mermas_kg >= 0);

-- 2) Migración única desde merma_real_kg
UPDATE public.pesajes_cintas_lotes
   SET peso_mermas_kg = merma_real_kg
 WHERE peso_mermas_kg IS NULL AND merma_real_kg IS NOT NULL;

-- 3) Documentación
COMMENT ON COLUMN public.pesajes_cintas_lotes.peso_mermas_kg IS 'Campo operativo canónico vigente: Peso de Mermas (kg) = Merma Capa + Merma Proceso + Merma Gallo. El porcentaje se calcula solo para presentación.';
COMMENT ON COLUMN public.pesajes_cintas_lotes.merma_kg IS 'LEGADO: Merma por Sistema (kg). No usar en cálculos ni UI vigentes.';
COMMENT ON COLUMN public.pesajes_cintas_lotes.merma_porcentaje IS 'LEGADO: porcentaje de Merma por Sistema. No usar en cálculos ni UI vigentes.';
COMMENT ON COLUMN public.pesajes_cintas_lotes.merma_real_kg IS 'LEGADO: nombre anterior de Peso de Mermas. Sustituido por peso_mermas_kg.';

-- 4) Finalización canónica
DROP FUNCTION IF EXISTS public.finalizar_lote_cintas(uuid, numeric);

CREATE OR REPLACE FUNCTION public.finalizar_lote_cintas(_lote_id uuid, _peso_mermas_kg numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_total numeric; v_cnt int;
  v_pendiente numeric; v_pct numeric; v_peso numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  IF _peso_mermas_kg IS NULL THEN
    RAISE EXCEPTION 'Debe registrar el Peso de Mermas antes de finalizar el lote.' USING ERRCODE='22023';
  END IF;
  IF _peso_mermas_kg < 0 THEN
    RAISE EXCEPTION 'El Peso de Mermas no puede ser negativo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto.' USING ERRCODE='22023';
  END IF;

  IF NOT COALESCE(v_lote.es_manual, false) AND v_lote.pesaje_bobina_madre_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;
  IF v_lote.peso_bobina_madre_neto_kg IS NULL OR v_lote.peso_bobina_madre_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;
  IF _peso_mermas_kg > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El Peso de Mermas no puede superar el peso neto del rollo de origen.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0), COUNT(*)::int INTO v_total, v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';

  IF v_cnt < 1 THEN RAISE EXCEPTION 'Debe registrar al menos una cinta.' USING ERRCODE='22023'; END IF;
  IF v_cnt > 20 THEN RAISE EXCEPTION 'Máximo 20 cintas.' USING ERRCODE='22023'; END IF;
  IF v_total > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  v_peso := ROUND(_peso_mermas_kg, 2);
  v_pendiente := v_lote.peso_bobina_madre_neto_kg - v_total;
  v_pct := CASE WHEN v_lote.peso_bobina_madre_neto_kg > 0
                THEN ROUND((v_peso / v_lote.peso_bobina_madre_neto_kg) * 100, 4) ELSE NULL END;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_cnt,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_pendiente,
         peso_mermas_kg = v_peso,
         estado = 'finalizado',
         finalizado_por = v_uid,
         finalizado_at = now(),
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, 'LOTE_FINALIZADO',
    jsonb_build_object('peso_bobina_madre_neto_kg', v_lote.peso_bobina_madre_neto_kg,
                       'origen_peso', CASE WHEN COALESCE(v_lote.es_manual,false) THEN 'manual' ELSE 'bobina_madre' END,
                       'cintas_vigentes', v_cnt,
                       'peso_total_real_cintas_kg', v_total,
                       'peso_mermas_kg', v_peso,
                       'porcentaje_peso_mermas', v_pct),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'peso_mermas_kg', v_peso, 'porcentaje_peso_mermas', v_pct);
END;
$function$;

-- 5) Etiquetas/QR: incluir Peso de Mermas en snapshot y QR (sin tocar el resto de la lógica)
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'preparar_impresion_etiquetas';

  v_def := replace(
    v_def,
    '''lote_id'', v_lote.id,',
    '''lote_id'', v_lote.id, ''peso_mermas_kg'', v_lote.peso_mermas_kg, ''porcentaje_peso_mermas'', CASE WHEN COALESCE(v_lote.peso_bobina_madre_neto_kg,0) > 0 AND v_lote.peso_mermas_kg IS NOT NULL THEN ROUND((v_lote.peso_mermas_kg / v_lote.peso_bobina_madre_neto_kg) * 100, 4) ELSE NULL END,'
  );

  EXECUTE v_def;
END
$do$;
