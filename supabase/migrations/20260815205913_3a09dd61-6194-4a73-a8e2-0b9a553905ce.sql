ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS muestras_calidad_idempotency_key_uidx
  ON public.muestras_calidad (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crear_muestra_con_mediciones(
  _muestra jsonb,
  _mediciones jsonb,
  _idempotency uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_maquina uuid := (_muestra->>'maquina_id')::uuid;
  v_rec public.numeracion_rollos%ROWTYPE;
  v_num text;
  v_auto boolean := false;
  v_id uuid;
  v_prev record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'capturista') OR
    public.has_role(v_uid, 'calidad') OR
    public.has_role(v_uid, 'gerente_general') OR
    public.has_role(v_uid, 'administrador')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para capturar muestras de calidad';
  END IF;

  IF _idempotency IS NULL THEN
    RAISE EXCEPTION 'Clave de operación requerida';
  END IF;

  -- IDEMPOTENCIA: si esta misma operación ya se completó, devolver su resultado.
  SELECT id, numero_rollo INTO v_prev
    FROM public.muestras_calidad
   WHERE idempotency_key = _idempotency;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'muestra_id', v_prev.id,
      'numero_rollo', v_prev.numero_rollo,
      'reintento', true,
      'numeracion_automatica', true
    );
  END IF;

  -- Bloqueo exclusivo por MÁQUINA (fila). No bloquea otras máquinas.
  SELECT * INTO v_rec FROM public.numeracion_rollos
   WHERE maquina_id = v_maquina FOR UPDATE;

  IF FOUND AND v_rec.activo AND now() >= v_rec.vigente_desde THEN
    v_auto := true;
    v_num := v_rec.proximo_numero::text || '-' || v_rec.sufijo;
  ELSE
    v_num := _muestra->>'numero_rollo';
  END IF;

  IF v_num IS NULL OR length(trim(v_num)) = 0 THEN
    RAISE EXCEPTION 'Número de rollo requerido';
  END IF;

  IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN
    IF v_auto THEN
      RAISE EXCEPTION 'COLISION_NUMERACION: el número % ya está utilizado. No se asigna automáticamente otro número; reportar al administrador.', v_num;
    ELSE
      RAISE EXCEPTION 'El número de rollo ya se encuentra registrado en el sistema. Verifique la información antes de continuar.';
    END IF;
  END IF;

  INSERT INTO public.muestras_calidad (
    orden_id, especificacion_id, especificacion_version, planta_id, maquina_id,
    producto_id, turno, operario_id, numero_rollo, jefe_maquina, operador,
    prensero, analista, velocidad_maquina, velocidad_enrollador, crepado_pct,
    cumplimiento_pct, porcentaje_rupturas_pct, destino, estatus_liberacion,
    liberado_con_justificacion, liberacion_justificacion, variables_fuera_spec,
    defectos, tipo_muestreo, hora_muestreo, observaciones_generales,
    defecto_visual_conversion, variable_tecnica_dimensional, criterio_defecto,
    variables_snapshot_json, estado, capturado_por, fuera_de_turno,
    fuera_de_turno_motivo, idempotency_key
  ) VALUES (
    NULLIF(_muestra->>'orden_id','')::uuid,
    (_muestra->>'especificacion_id')::uuid,
    _muestra->>'especificacion_version',
    (_muestra->>'planta_id')::uuid,
    v_maquina,
    (_muestra->>'producto_id')::uuid,
    _muestra->>'turno',
    NULLIF(_muestra->>'operario_id','')::uuid,
    v_num,
    NULLIF(_muestra->>'jefe_maquina',''),
    NULLIF(_muestra->>'operador',''),
    NULLIF(_muestra->>'prensero',''),
    NULLIF(_muestra->>'analista',''),
    NULLIF(_muestra->>'velocidad_maquina','')::numeric,
    NULLIF(_muestra->>'velocidad_enrollador','')::numeric,
    NULLIF(_muestra->>'crepado_pct','')::numeric,
    NULLIF(_muestra->>'cumplimiento_pct','')::numeric,
    NULLIF(_muestra->>'porcentaje_rupturas_pct','')::numeric,
    NULLIF(_muestra->>'destino',''),
    NULLIF(_muestra->>'estatus_liberacion',''),
    COALESCE((_muestra->>'liberado_con_justificacion')::boolean, false),
    NULLIF(_muestra->>'liberacion_justificacion',''),
    COALESCE(_muestra->'variables_fuera_spec', '[]'::jsonb),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_muestra->'defectos','[]'::jsonb))),
    (_muestra->>'tipo_muestreo')::qc_tipo_muestreo,
    COALESCE(NULLIF(_muestra->>'hora_muestreo','')::timestamptz, now()),
    COALESCE(_muestra->>'observaciones_generales',''),
    NULLIF(_muestra->>'defecto_visual_conversion',''),
    NULLIF(_muestra->>'variable_tecnica_dimensional',''),
    NULLIF(_muestra->>'criterio_defecto',''),
    COALESCE(_muestra->'variables_snapshot_json','{}'::jsonb),
    (_muestra->>'estado')::qc_muestra_estado,
    v_uid,
    COALESCE((_muestra->>'fuera_de_turno')::boolean, false),
    NULLIF(_muestra->>'fuera_de_turno_motivo',''),
    _idempotency
  )
  RETURNING id INTO v_id;

  INSERT INTO public.mediciones_calidad (
    muestra_id, variable_id, variable_clave, valor,
    min_snapshot, objetivo_snapshot, max_snapshot,
    observacion, estado, capturado_por
  )
  SELECT
    v_id,
    (e->>'variable_id')::uuid,
    e->>'variable_clave',
    (e->>'valor')::numeric,
    (e->>'min_snapshot')::numeric,
    (e->>'objetivo_snapshot')::numeric,
    (e->>'max_snapshot')::numeric,
    COALESCE(e->>'observacion',''),
    (e->>'estado')::qc_medicion_estado,
    v_uid
  FROM jsonb_array_elements(COALESCE(_mediciones,'[]'::jsonb)) e;

  PERFORM public.qc_recalc_estatus_muestra(v_id);

  IF v_auto THEN
    UPDATE public.numeracion_rollos
       SET proximo_numero = proximo_numero + 1
     WHERE maquina_id = v_maquina;
  END IF;

  RETURN jsonb_build_object(
    'muestra_id', v_id,
    'numero_rollo', v_num,
    'reintento', false,
    'numeracion_automatica', v_auto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crear_muestra_con_mediciones(jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_muestra_con_mediciones(jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_muestra_con_mediciones(jsonb, jsonb, uuid) TO service_role;