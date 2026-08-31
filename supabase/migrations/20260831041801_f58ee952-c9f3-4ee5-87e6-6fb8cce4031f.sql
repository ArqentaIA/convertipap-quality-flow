DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc
   WHERE proname = 'crear_muestra_con_mediciones'
     AND pronamespace = 'public'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No se encontró public.crear_muestra_con_mediciones';
  END IF;

  -- 1) Quitar el filtro exclusivo de planta Ixtapaluca en la validación del
  --    rollo proveniente de Pesaje de Bobina Madre. La validación por
  --    máquina + número de rollo ya garantiza el aislamiento correcto.
  IF position('AND upper(pl.codigo) = ''IXT''' in v_def) = 0 THEN
    RAISE EXCEPTION 'No se encontró el filtro IXT esperado; abortando para no alterar la función.';
  END IF;
  v_def := replace(
    v_def,
    E'         AND p.maquina_id = v_maquina\n         AND upper(pl.codigo) = ''IXT''',
    E'         AND p.maquina_id = v_maquina'
  );

  -- 2) Acotar "ROLLO_YA_CAPTURADO" a la misma máquina (igual que la lista de
  --    rollos pendientes), para no bloquear folios homónimos de otra planta.
  IF position('ROLLO_YA_CAPTURADO' in v_def) = 0 THEN
    RAISE EXCEPTION 'No se encontró la validación ROLLO_YA_CAPTURADO; abortando.';
  END IF;
  v_def := replace(
    v_def,
    'IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_pendiente) THEN',
    'IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_pendiente AND maquina_id = v_maquina) THEN'
  );

  -- 3) La verificación global posterior no debe re-aplicarse al rollo que
  --    proviene de pesaje: ya fue validado por máquina en el paso anterior.
  v_def := replace(
    v_def,
    'IF NOT v_auto AND EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN',
    'IF NOT v_auto AND NOT v_desde_pesaje AND EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN'
  );

  EXECUTE v_def;
END
$mig$;