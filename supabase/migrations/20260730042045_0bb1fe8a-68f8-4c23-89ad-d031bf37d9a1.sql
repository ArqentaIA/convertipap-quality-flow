-- 1) Contexto: exigir pesaje formal de bobina madre (sin fallback de Calidad)
CREATE OR REPLACE FUNCTION public.buscar_contexto_rollo_cintas(_numero_rollo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rollo text := trim(_numero_rollo);
  v_muestras int;
  v_pesajes int;
  v_m record;
  v_p record;
  v_mediciones jsonb;
  v_producto record;
  v_lote record;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF v_rollo IS NULL OR length(v_rollo) = 0 THEN
    RAISE EXCEPTION 'Número de rollo requerido.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*) INTO v_muestras FROM public.muestras_calidad WHERE numero_rollo = v_rollo;
  IF v_muestras = 0 THEN
    RAISE EXCEPTION 'No se encontró información de Control de Calidad para este número de rollo.' USING ERRCODE='P0002';
  END IF;
  IF v_muestras > 1 THEN
    RAISE EXCEPTION 'Existen varias muestras con el mismo número de rollo. Corrija en Control de Calidad antes de continuar.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_m FROM public.muestras_calidad WHERE numero_rollo = v_rollo LIMIT 1;

  SELECT COUNT(*) INTO v_pesajes FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id;
  IF v_pesajes > 1 THEN
    RAISE EXCEPTION 'Existen varios pesajes con el mismo número de rollo. Contacte al administrador.' USING ERRCODE='22023';
  END IF;
  IF v_pesajes = 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='P0002';
  END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  IF v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='P0002';
  END IF;

  SELECT id, codigo, nombre INTO v_producto FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
   WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado' LIMIT 1;

  RETURN jsonb_build_object(
    'muestra', jsonb_build_object(
      'id', v_m.id,
      'numero_rollo', v_m.numero_rollo,
      'fabricacion', COALESCE(v_producto.codigo, ''),
      'producto_id', v_m.producto_id,
      'producto_codigo', v_producto.codigo,
      'producto_nombre', v_producto.nombre,
      'turno', v_m.turno,
      'jefe_maquina', v_m.jefe_maquina,
      'operador', v_m.operador,
      'prensero', v_m.prensero,
      'analista', v_m.analista,
      'capturado_at', v_m.capturado_at,
      'observaciones', v_m.observaciones_generales,
      'mediciones', COALESCE(v_mediciones, '{}'::jsonb)
    ),
    'pesaje', jsonb_build_object(
      'id', v_p.id,
      'peso_neto_kg', v_p.peso_neto_kg,
      'fecha_hora_pesaje', v_p.fecha_hora_pesaje,
      'orden_produccion_id', v_p.orden_produccion_id,
      'numero_orden', v_p.numero_orden,
      'maquina_id', v_p.maquina_id,
      'maquina_codigo', v_p.maquina_codigo,
      'origen_peso', 'pesaje_bobina_madre'
    ),
    'lote', CASE WHEN v_lote.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_lote.id,
      'estado', v_lote.estado,
      'cantidad_cintas', v_lote.cantidad_cintas,
      'peso_total_cintas_kg', v_lote.peso_total_cintas_kg,
      'peso_pendiente_kg', v_lote.peso_pendiente_kg,
      'merma_kg', v_lote.merma_kg,
      'merma_porcentaje', v_lote.merma_porcentaje,
      'conductor_id', v_lote.conductor_id,
      'conductor_nombre_snapshot', v_lote.conductor_nombre_snapshot,
      'bobinadora_id', v_lote.bobinadora_id,
      'bobinadora_nombre_snapshot', v_lote.bobinadora_nombre_snapshot
    ) END
  );
END;
$function$;

-- 2) Crear lote: solo con peso neto oficial de bobina madre
CREATE OR REPLACE FUNCTION public.crear_lote_pesaje_cintas(_numero_rollo text, _conductor_id uuid, _bobinadora_id uuid, _idempotency uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m record; v_p record; v_prod record;
  v_cond record; v_bob record;
  v_lote_id uuid;
  v_snapshot jsonb;
  v_mediciones jsonb;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_lote_id FROM public.pesajes_cintas_lotes WHERE idempotency_key = _idempotency;
  IF v_lote_id IS NOT NULL THEN RETURN v_lote_id; END IF;

  IF _numero_rollo IS NULL OR _bobinadora_id IS NULL OR _conductor_id IS NULL OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_m FROM public.muestras_calidad WHERE numero_rollo = trim(_numero_rollo) LIMIT 1;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Muestra no encontrada.' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_m.numero_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  IF v_p.id IS NULL OR v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pcl:'||v_p.id::text));
  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado') THEN
    RAISE EXCEPTION 'Ya existe un lote activo o finalizado para esta bobina madre.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_cond FROM public.operarios WHERE id = _conductor_id AND activo = true;
  IF v_cond.id IS NULL THEN RAISE EXCEPTION 'Conductor inválido o inactivo.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_bob FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo = true;
  IF v_bob.id IS NULL THEN RAISE EXCEPTION 'Bobinadora inválida o inactiva.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prod FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  v_snapshot := jsonb_build_object(
    'numero_rollo', v_m.numero_rollo,
    'fecha', (v_m.capturado_at AT TIME ZONE 'America/Mexico_City')::date,
    'fabricacion', COALESCE(v_prod.codigo, ''),
    'producto_codigo', v_prod.codigo,
    'producto_nombre', v_prod.nombre,
    'turno', v_m.turno,
    'jefe_maquina', v_m.jefe_maquina,
    'operador', v_m.operador,
    'prensero', v_m.prensero,
    'analista', v_m.analista,
    'observaciones_calidad', v_m.observaciones_generales,
    'mediciones', COALESCE(v_mediciones, '{}'::jsonb),
    'origen_peso', 'pesaje_bobina_madre'
  );

  INSERT INTO public.pesajes_cintas_lotes (
    pesaje_bobina_madre_id, muestra_calidad_id,
    orden_produccion_id, numero_orden,
    numero_rollo, fabricacion, fecha_produccion,
    producto_id, producto_codigo, producto_nombre,
    conductor_id, conductor_nombre_snapshot,
    bobinadora_id, bobinadora_nombre_snapshot,
    peso_bobina_madre_neto_kg, peso_pendiente_kg,
    datos_calidad_snapshot,
    idempotency_key, creado_por
  ) VALUES (
    v_p.id, v_m.id,
    v_p.orden_produccion_id, v_p.numero_orden,
    v_m.numero_rollo, COALESCE(v_prod.codigo,''),
    (v_m.capturado_at AT TIME ZONE 'America/Mexico_City')::date,
    v_m.producto_id, v_prod.codigo, v_prod.nombre,
    v_cond.id, v_cond.nombre,
    v_bob.id, v_bob.nombre,
    v_p.peso_neto_kg, v_p.peso_neto_kg,
    v_snapshot,
    _idempotency, v_uid
  ) RETURNING id INTO v_lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (v_lote_id, 'LOTE_CREADO',
    jsonb_build_object('conductor', v_cond.nombre, 'bobinadora', v_bob.nombre,
                       'peso_neto_kg', v_p.peso_neto_kg, 'origen_peso', 'pesaje_bobina_madre'),
    v_uid);

  RETURN v_lote_id;
END $function$;

-- 3) Registrar cinta: mensaje de exceso más explícito
CREATE OR REPLACE FUNCTION public.registrar_cinta(_lote_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _idempotency uuid)
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
  v_total numeric;
  v_pendiente numeric;
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

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto para registrar cintas.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(MAX(posicion), 0)::smallint + 1 INTO v_next_pos
    FROM public.pesajes_cintas
    WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_next_pos > 12 THEN
    RAISE EXCEPTION 'Ya se registraron las 12 cintas permitidas.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pesajes_cintas (
    lote_id, posicion, uniones, peso_cinta_kg, ancho_util,
    observaciones, idempotency_key, creado_por
  ) VALUES (
    _lote_id, v_next_pos, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''), _idempotency, v_uid
  ) RETURNING id INTO v_cinta_id;

  v_total := v_total + _peso_cinta_kg;
  v_pendiente := v_lote.peso_bobina_madre_neto_kg - v_total;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_next_pos,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_pendiente,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, v_cinta_id, 'CINTA_REGISTRADA',
    jsonb_build_object('posicion', v_next_pos, 'peso_real_kg', _peso_cinta_kg,
                       'uniones', _uniones, 'ancho_util', _ancho_util,
                       'idempotency_key', _idempotency),
    v_uid);

  RETURN jsonb_build_object('cinta_id', v_cinta_id, 'posicion', v_next_pos,
    'peso_total_cintas_kg', v_total, 'peso_pendiente_kg', v_pendiente);
END $function$;

-- 4) Corregir cinta: mensaje y auditoría con peso real
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
    observaciones, sustituye_a_cinta_id, idempotency_key, creado_por
  ) VALUES (
    v_ant.lote_id, v_ant.posicion, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''),
    v_ant.id, _idempotency, v_uid
  ) RETURNING id INTO v_new_id;

  v_total := v_total + _peso_cinta_kg;
  UPDATE public.pesajes_cintas_lotes
     SET peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_lote.peso_bobina_madre_neto_kg - v_total,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = v_ant.lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (v_ant.lote_id, v_new_id, 'CINTA_CORREGIDA',
    jsonb_build_object('peso_real_kg', v_ant.peso_cinta_kg, 'uniones', v_ant.uniones, 'ancho_util', v_ant.ancho_util, 'posicion', v_ant.posicion),
    jsonb_build_object('peso_real_kg', _peso_cinta_kg, 'uniones', _uniones, 'ancho_util', _ancho_util, 'posicion', v_ant.posicion, 'idempotency_key', _idempotency),
    _motivo, v_uid);

  RETURN jsonb_build_object('cinta_id', v_new_id, 'posicion', v_ant.posicion);
END $function$;

-- 5) Finalizar lote: auditoría con neto de bobina madre y merma real
CREATE OR REPLACE FUNCTION public.finalizar_lote_cintas(_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_total numeric; v_cnt int;
  v_merma numeric; v_pct numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto.' USING ERRCODE='22023';
  END IF;
  IF v_lote.pesaje_bobina_madre_id IS NULL OR v_lote.peso_bobina_madre_neto_kg IS NULL
     OR v_lote.peso_bobina_madre_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(SUM(peso_cinta_kg),0), COUNT(*)::int INTO v_total, v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';

  IF v_cnt < 1 THEN RAISE EXCEPTION 'Debe registrar al menos una cinta.' USING ERRCODE='22023'; END IF;
  IF v_cnt > 12 THEN RAISE EXCEPTION 'Máximo 12 cintas.' USING ERRCODE='22023'; END IF;
  IF v_total > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso neto de la bobina madre. Revise los pesos capturados.' USING ERRCODE='22023';
  END IF;

  v_merma := v_lote.peso_bobina_madre_neto_kg - v_total;
  v_pct := CASE WHEN v_lote.peso_bobina_madre_neto_kg > 0
                THEN ROUND((v_merma / v_lote.peso_bobina_madre_neto_kg) * 100, 4)
                ELSE 0 END;

  UPDATE public.pesajes_cintas_lotes
     SET cantidad_cintas = v_cnt,
         peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_merma,
         merma_kg = v_merma,
         merma_porcentaje = v_pct,
         estado = 'finalizado',
         finalizado_por = v_uid,
         finalizado_at = now(),
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, 'LOTE_FINALIZADO',
    jsonb_build_object('peso_bobina_madre_neto_kg', v_lote.peso_bobina_madre_neto_kg,
                       'cintas_vigentes', v_cnt,
                       'peso_total_real_cintas_kg', v_total,
                       'merma_real_kg', v_merma,
                       'merma_real_pct', v_pct),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'merma_kg', v_merma, 'merma_porcentaje', v_pct);
END $function$;