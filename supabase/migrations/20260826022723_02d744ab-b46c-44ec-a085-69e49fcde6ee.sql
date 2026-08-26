CREATE OR REPLACE FUNCTION public.registrar_pesaje_bobina_numerado(_registro jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_maquina_id uuid := (_registro->>'maquina_id')::uuid;
  v_numero_solicitado text := trim(_registro->>'numero_rollo');
  v_rec public.numeracion_rollos%ROWTYPE;
  v_numero_esperado text;
  v_base text;
  v_insertado public.pesajes_bobina_madre%ROWTYPE;
BEGIN
  IF v_maquina_id IS NULL OR v_numero_solicitado IS NULL OR v_numero_solicitado = '' THEN
    RAISE EXCEPTION 'Máquina y número de rollo son requeridos';
  END IF;

  SELECT * INTO v_rec
  FROM public.numeracion_rollos
  WHERE maquina_id = v_maquina_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_rec.activo OR now() < v_rec.vigente_desde THEN
    RAISE EXCEPTION 'La máquina no tiene una numeración automática activa';
  END IF;

  v_base := v_rec.proximo_numero::text;
  IF COALESCE(v_rec.relleno_digitos, 0) > 0 THEN
    v_base := lpad(v_base, v_rec.relleno_digitos, '0');
  END IF;
  v_numero_esperado := v_base || '-' || v_rec.sufijo;

  IF v_numero_solicitado <> v_numero_esperado THEN
    RAISE EXCEPTION 'CONSECUTIVO_CAMBIO: el siguiente número disponible es %', v_numero_esperado;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pesajes_bobina_madre WHERE numero_rollo = v_numero_esperado
  ) OR EXISTS (
    SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_numero_esperado
  ) THEN
    RAISE EXCEPTION 'COLISION_NUMERACION: el número % ya está utilizado; reportar al administrador', v_numero_esperado;
  END IF;

  INSERT INTO public.pesajes_bobina_madre (
    numero_rollo, maquina_id, maquina_codigo, orden_produccion_id, numero_orden,
    peso_bruto_kg, peso_eje_kg, peso_neto_kg, fecha_hora_pesaje,
    evidencia_path, ocr_confianza, ocr_raw, capturado_por
  ) VALUES (
    v_numero_esperado,
    v_maquina_id,
    _registro->>'maquina_codigo',
    NULLIF(_registro->>'orden_produccion_id', '')::uuid,
    NULLIF(_registro->>'numero_orden', ''),
    (_registro->>'peso_bruto_kg')::numeric,
    (_registro->>'peso_eje_kg')::numeric,
    (_registro->>'peso_neto_kg')::numeric,
    COALESCE(NULLIF(_registro->>'fecha_hora_pesaje', '')::timestamptz, now()),
    _registro->>'evidencia_path',
    NULLIF(_registro->>'ocr_confianza', '')::numeric,
    COALESCE(_registro->'ocr_raw', '{}'::jsonb),
    (_registro->>'capturado_por')::uuid
  ) RETURNING * INTO v_insertado;

  UPDATE public.numeracion_rollos
  SET proximo_numero = proximo_numero + 1,
      updated_at = now()
  WHERE maquina_id = v_maquina_id;

  RETURN to_jsonb(v_insertado);
END;
$fn$;

REVOKE ALL ON FUNCTION public.registrar_pesaje_bobina_numerado(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pesaje_bobina_numerado(jsonb) TO service_role;