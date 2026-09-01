CREATE OR REPLACE FUNCTION public.crear_muestra_con_mediciones(_muestra jsonb, _mediciones jsonb, _idempotency uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_maquina uuid := (_muestra->>'maquina_id')::uuid;
  v_rec public.numeracion_rollos%ROWTYPE;
  v_num text;
  v_base text;
  v_auto boolean := false;
  v_id uuid;
  v_prev record;
  v_pendiente text := NULLIF(trim(_muestra->>'numero_rollo_pesaje'), '');
  v_desde_pesaje boolean := false;
  v_cand bigint;
  v_saltos int := 0;
  v_num_solicitado text;
  v_sku text;
  v_sku_desc text;
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

  IF v_maquina IS NULL THEN
    RAISE EXCEPTION 'Máquina requerida';
  END IF;

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

  SELECT * INTO v_rec FROM public.numeracion_rollos
   WHERE maquina_id = v_maquina FOR UPDATE;

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

  IF v_pendiente IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.pesajes_bobina_madre p
        JOIN public.maquinas m ON m.id = p.maquina_id
        JOIN public.plantas pl ON pl.id = m.planta_id
       WHERE p.numero_rollo = v_pendiente
         AND p.maquina_id = v_maquina
    ) THEN
      RAISE EXCEPTION 'ROLLO_PESAJE_INVALIDO: el rollo % no corresponde a un pesaje pendiente de esta máquina', v_pendiente;
    END IF;

    IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_pendiente AND maquina_id = v_maquina) THEN
      RAISE EXCEPTION 'ROLLO_YA_CAPTURADO: el rollo % ya fue capturado en calidad', v_pendiente;
    END IF;

    v_num := v_pendiente;
    v_desde_pesaje := true;
  ELSIF v_rec.maquina_id IS NOT NULL AND v_rec.activo AND now() >= v_rec.vigente_desde THEN
    v_auto := true;
    v_cand := v_rec.proximo_numero;
    v_base := CASE WHEN COALESCE(v_rec.relleno_digitos,0) > 0
                   THEN lpad(v_cand::text, v_rec.relleno_digitos, '0')
                   ELSE v_cand::text END;
    v_num := v_base || '-' || v_rec.sufijo;
    v_num_solicitado := v_num;

    -- SALTO AUTOMÁTICO: si el consecutivo ya está ocupado por una muestra
    -- histórica, avanza al siguiente número libre en lugar de bloquear.
    WHILE EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) LOOP
      v_cand := v_cand + 1;
      v_saltos := v_saltos + 1;
      IF v_saltos > 10000 THEN
        RAISE EXCEPTION 'COLISION_NUMERACION: no se encontró un número libre para la máquina. Reportar al administrador.';
      END IF;
      v_base := CASE WHEN COALESCE(v_rec.relleno_digitos,0) > 0
                     THEN lpad(v_cand::text, v_rec.relleno_digitos, '0')
                     ELSE v_cand::text END;
      v_num := v_base || '-' || v_rec.sufijo;
    END LOOP;
  ELSE
    v_num := _muestra->>'numero_rollo';
  END IF;

  IF v_num IS NULL OR length(trim(v_num)) = 0 THEN
    RAISE EXCEPTION 'Número de rollo requerido';
  END IF;

  IF NOT v_auto AND NOT v_desde_pesaje AND EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN
    RAISE EXCEPTION 'El número de rollo ya se encuentra registrado en el sistema. Verifique la información antes de continuar.';
  END IF;

  -- SKU SAP: si el capturista eligió una clave (productos con varios anchos),
  -- se valida contra el catálogo del producto y se usa tal cual.
  -- Si no viene clave, se conserva el autollenado SOLO en planta TLX:
  -- SKU principal si existe; en caso contrario el primero en orden alfabético.
  v_sku := NULLIF(trim(_muestra->>'sku_sap'), '');
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
  ) THEN
    SELECT s.clave_sku_sap, s.descripcion_sap
      INTO v_sku, v_sku_desc
      FROM public.producto_skus_sap s
     WHERE s.producto_id = (_muestra->>'producto_id')::uuid
     ORDER BY s.es_principal DESC, s.clave_sku_sap
     LIMIT 1;
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
    fuera_de_turno_motivo, lote_logistico, idempotency_key,
    sku_sap, descripcion_sap
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
    COALESCE(_muestra->>'variables_snapshot_json','{}'::jsonb),
    (_muestra->>'estado')::qc_muestra_estado,
    v_uid,
    COALESCE((_muestra->>'fuera_de_turno')::boolean, false),
    NULLIF(_muestra->>'fuera_de_turno_motivo',''),
    NULLIF(trim(_muestra->>'lote_logistico'),''),
    _idempotency,
    v_sku,
    v_sku_desc
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
       SET proximo_numero = v_cand + 1
     WHERE maquina_id = v_maquina;

    IF v_saltos > 0 THEN
      BEGIN
        INSERT INTO public.audit_log (
          tabla_afectada, operacion, registro_id, usuario_id, modulo,
          descripcion_accion, maquina_id, folio_rollo, motivo, datos_nuevos
        ) VALUES (
          'numeracion_rollos', 'UPDATE', v_id, v_uid, 'calidad',
          format('Salto automático de numeración: %s ocupado, se asignó %s (%s número(s) omitido(s))',
                 v_num_solicitado, v_num, v_saltos),
          v_maquina, v_num, 'COLISION_NUMERACION resuelta por salto automático',
          jsonb_build_object(
            'numero_solicitado', v_num_solicitado,
            'numero_asignado', v_num,
            'numeros_omitidos', v_saltos
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'muestra_id', v_id,
    'numero_rollo', v_num,
    'reintento', false,
    'numeracion_automatica', v_auto,
    'desde_pesaje', v_desde_pesaje,
    'numero_solicitado', v_num_solicitado,
    'numeros_omitidos', v_saltos
  );
END;
$func$;