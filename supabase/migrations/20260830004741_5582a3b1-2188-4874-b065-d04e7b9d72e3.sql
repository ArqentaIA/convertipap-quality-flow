-- =============================================================
-- CONVERTIPAP — Ampliación por Bajadas (Cintas). 100% aditiva.
-- =============================================================

-- 1) Entidad ancla del rollo -----------------------------------
CREATE TABLE IF NOT EXISTS public.rollos_cintas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_rollo text NOT NULL,
  cerrado boolean NOT NULL DEFAULT false,
  cerrado_por uuid REFERENCES auth.users(id),
  cerrado_at timestamptz,
  motivo_cierre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rollos_cintas_numero_rollo_norm_chk CHECK (numero_rollo = upper(btrim(numero_rollo)) AND length(numero_rollo) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rollos_cintas_numero ON public.rollos_cintas (numero_rollo);

GRANT SELECT ON public.rollos_cintas TO authenticated;
GRANT ALL ON public.rollos_cintas TO service_role;

ALTER TABLE public.rollos_cintas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rollos_cintas_select" ON public.rollos_cintas;
CREATE POLICY "rollos_cintas_select" ON public.rollos_cintas
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(), 'pesaje_cintas'));

DROP TRIGGER IF EXISTS trg_rollos_cintas_updated ON public.rollos_cintas;
CREATE TRIGGER trg_rollos_cintas_updated BEFORE UPDATE ON public.rollos_cintas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Bajadas ---------------------------------------------------
ALTER TABLE public.pesajes_cintas_lotes
  ADD COLUMN IF NOT EXISTS rollo_id uuid REFERENCES public.rollos_cintas(id),
  ADD COLUMN IF NOT EXISTS numero_bajada smallint;

ALTER TABLE public.pesajes_cintas_lotes
  DROP CONSTRAINT IF EXISTS pesajes_cintas_lotes_numero_bajada_chk;
ALTER TABLE public.pesajes_cintas_lotes
  ADD CONSTRAINT pesajes_cintas_lotes_numero_bajada_chk
  CHECK (numero_bajada IS NULL OR (numero_bajada >= 1 AND numero_bajada <= 7));

ALTER TABLE public.pesajes_cintas_lotes
  DROP CONSTRAINT IF EXISTS pesajes_cintas_lotes_cantidad_cintas_check;
ALTER TABLE public.pesajes_cintas_lotes
  ADD CONSTRAINT pesajes_cintas_lotes_cantidad_cintas_check
  CHECK (cantidad_cintas >= 0 AND cantidad_cintas <= 50);

-- Se retiran los índices que impedían más de una bajada por rollo
DROP INDEX IF EXISTS public.uq_pcl_pesaje_activo;
DROP INDEX IF EXISTS public.uq_pcl_muestra_sin_pesaje_activo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pcl_rollo_bajada
  ON public.pesajes_cintas_lotes (rollo_id, numero_bajada)
  WHERE rollo_id IS NOT NULL AND numero_bajada IS NOT NULL AND estado <> 'anulado';

-- Máximo una bajada abierta por rollo (cubre históricos por numero_rollo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcl_abierto_por_rollo
  ON public.pesajes_cintas_lotes (numero_rollo)
  WHERE estado = 'abierto';

CREATE INDEX IF NOT EXISTS idx_pcl_rollo_id ON public.pesajes_cintas_lotes (rollo_id);

-- 3) Cintas ----------------------------------------------------
ALTER TABLE public.pesajes_cintas
  ADD COLUMN IF NOT EXISTS rollo_id uuid REFERENCES public.rollos_cintas(id),
  ADD COLUMN IF NOT EXISTS lote_logistico_pza text;

ALTER TABLE public.pesajes_cintas DROP CONSTRAINT IF EXISTS pesajes_cintas_posicion_check;
ALTER TABLE public.pesajes_cintas
  ADD CONSTRAINT pesajes_cintas_posicion_check CHECK (posicion >= 1 AND posicion <= 350);

ALTER TABLE public.pesajes_cintas DROP CONSTRAINT IF EXISTS pesajes_cintas_lote_logistico_pza_chk;
ALTER TABLE public.pesajes_cintas
  ADD CONSTRAINT pesajes_cintas_lote_logistico_pza_chk
  CHECK (lote_logistico_pza IS NULL OR (lote_logistico_pza = btrim(lote_logistico_pza) AND length(lote_logistico_pza) BETWEEN 1 AND 10));

CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_rollo_pos_vigente
  ON public.pesajes_cintas (rollo_id, posicion)
  WHERE rollo_id IS NOT NULL AND estado = 'registrada';

CREATE INDEX IF NOT EXISTS idx_pc_rollo_id ON public.pesajes_cintas (rollo_id);

-- 4) Helper: ancla lazy ---------------------------------------
CREATE OR REPLACE FUNCTION public.pc_get_or_create_rollo(_numero_rollo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := upper(btrim(COALESCE(_numero_rollo, '')));
  v_id uuid;
BEGIN
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Número de rollo requerido.' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_id FROM public.rollos_cintas WHERE numero_rollo = v_norm;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.rollos_cintas (numero_rollo) VALUES (v_norm)
  ON CONFLICT (numero_rollo) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- 5) Consulta de bajadas del rollo ----------------------------
CREATE OR REPLACE FUNCTION public.pc_bajadas_rollo(_numero_rollo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text := upper(btrim(COALESCE(_numero_rollo, '')));
  v_rollo record;
  v_bajadas jsonb;
  v_max_pos int;
  v_total int;
  v_abierta uuid;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT * INTO v_rollo FROM public.rollos_cintas WHERE numero_rollo = v_norm;

  SELECT COALESCE(jsonb_agg(x ORDER BY x_orden), '[]'::jsonb), COUNT(*)::int
    INTO v_bajadas, v_total
  FROM (
    SELECT
      COALESCE(l.numero_bajada, 1) AS x_orden,
      jsonb_build_object(
        'lote_id', l.id,
        'numero_bajada', COALESCE(l.numero_bajada, 1),
        'historica', (l.numero_bajada IS NULL),
        'estado', l.estado,
        'cantidad_cintas', l.cantidad_cintas,
        'peso_total_cintas_kg', l.peso_total_cintas_kg,
        'peso_mermas_kg', l.peso_mermas_kg,
        'es_manual', l.es_manual,
        'created_at', l.created_at,
        'finalizado_at', l.finalizado_at,
        'posicion_min', (SELECT MIN(c.posicion) FROM public.pesajes_cintas c WHERE c.lote_id = l.id AND c.estado = 'registrada'),
        'posicion_max', (SELECT MAX(c.posicion) FROM public.pesajes_cintas c WHERE c.lote_id = l.id AND c.estado = 'registrada')
      ) AS x
    FROM public.pesajes_cintas_lotes l
    WHERE upper(btrim(l.numero_rollo)) = v_norm AND l.estado <> 'anulado'
  ) s;

  SELECT COALESCE(MAX(c.posicion), 0) INTO v_max_pos
    FROM public.pesajes_cintas c
    JOIN public.pesajes_cintas_lotes l ON l.id = c.lote_id
   WHERE upper(btrim(l.numero_rollo)) = v_norm AND c.estado = 'registrada';

  SELECT l.id INTO v_abierta FROM public.pesajes_cintas_lotes l
   WHERE upper(btrim(l.numero_rollo)) = v_norm AND l.estado = 'abierto' LIMIT 1;

  RETURN jsonb_build_object(
    'numero_rollo', v_norm,
    'rollo_id', v_rollo.id,
    'cerrado', COALESCE(v_rollo.cerrado, false),
    'cerrado_at', v_rollo.cerrado_at,
    'motivo_cierre', v_rollo.motivo_cierre,
    'bajadas', v_bajadas,
    'total_bajadas', v_total,
    'lote_abierto_id', v_abierta,
    'ultima_posicion', v_max_pos,
    'proxima_posicion', v_max_pos + 1,
    'puede_nueva_bajada', (NOT COALESCE(v_rollo.cerrado,false)) AND v_abierta IS NULL AND v_total < 7 AND v_max_pos < 350
  );
END $function$;

-- 6) Cierre definitivo del rollo ------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_rollo_cintas(_numero_rollo text, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text := upper(btrim(COALESCE(_numero_rollo,'')));
  v_rollo_id uuid;
  v_abiertas int;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Debe indicar un motivo (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rollo:'||v_norm));

  SELECT COUNT(*)::int INTO v_abiertas FROM public.pesajes_cintas_lotes
   WHERE upper(btrim(numero_rollo)) = v_norm AND estado = 'abierto';
  IF v_abiertas > 0 THEN
    RAISE EXCEPTION 'Existe una bajada abierta. Finalícela antes de cerrar el rollo.' USING ERRCODE='22023';
  END IF;

  v_rollo_id := public.pc_get_or_create_rollo(v_norm);

  UPDATE public.rollos_cintas
     SET cerrado = true, cerrado_por = v_uid, cerrado_at = now(), motivo_cierre = btrim(_motivo)
   WHERE id = v_rollo_id AND cerrado = false;

  INSERT INTO public.pesajes_cintas_auditoria(accion, valores_nuevos, motivo, realizado_por)
  VALUES ('ROLLO_CERRADO_DEFINITIVO',
          jsonb_build_object('numero_rollo', v_norm, 'rollo_id', v_rollo_id),
          btrim(_motivo), v_uid);

  RETURN jsonb_build_object('rollo_id', v_rollo_id, 'numero_rollo', v_norm, 'cerrado', true);
END $function$;

-- 7) Creación de bajada (origen sistema) ----------------------
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
  v_new_id uuid;
  v_origen text := 'pesaje_rollo';
  v_diam record; v_uni record;
  v_norm text;
  v_rollo record;
  v_rollo_id uuid;
  v_bajadas int;
  v_bajada smallint;
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

  IF v_p.id IS NULL THEN
    v_new_id := public._pc_pesaje_desde_calidad(v_m.id);
    IF v_new_id IS NOT NULL THEN
      SELECT * INTO v_p FROM public.pesajes_bobina_madre WHERE id = v_new_id;
    END IF;
  END IF;

  IF v_p.id IS NULL OR v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
  END IF;

  IF v_p.evidencia_path = 'MIGRADO_DESDE_CALIDAD' THEN
    v_origen := 'migrado_calidad';
  END IF;

  v_norm := upper(btrim(v_m.numero_rollo));
  PERFORM pg_advisory_xact_lock(hashtext('rollo:'||v_norm));

  SELECT * INTO v_rollo FROM public.rollos_cintas WHERE numero_rollo = v_norm;
  IF COALESCE(v_rollo.cerrado, false) THEN
    RAISE EXCEPTION 'El rollo fue cerrado definitivamente. No se permiten nuevas bajadas.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE upper(btrim(numero_rollo)) = v_norm AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Ya existe una bajada abierta para este rollo. Finalícela antes de iniciar otra.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_bajadas FROM public.pesajes_cintas_lotes
   WHERE upper(btrim(numero_rollo)) = v_norm AND estado <> 'anulado';
  IF v_bajadas >= 7 THEN
    RAISE EXCEPTION 'El rollo alcanzó el máximo de 7 bajadas.' USING ERRCODE='22023';
  END IF;
  v_bajada := (v_bajadas + 1)::smallint;
  v_rollo_id := public.pc_get_or_create_rollo(v_norm);

  SELECT * INTO v_cond FROM public.operarios WHERE id = _conductor_id AND activo = true;
  IF v_cond.id IS NULL THEN RAISE EXCEPTION 'Conductor inválido o inactivo.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_bob FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo = true;
  IF v_bob.id IS NULL THEN RAISE EXCEPTION 'Bobinadora inválida o inactiva.' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prod FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  SELECT id, valor INTO v_diam FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'diametro' AND valor IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  SELECT id, valor INTO v_uni FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'uniones' AND valor IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

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
    'origen_peso', v_origen,
    'numero_bajada', v_bajada,
    'datos_origen', jsonb_build_object(
      'origen', 'sistema',
      'peso_neto_origen_kg', v_p.peso_neto_kg,
      'peso_origen', 'pesaje_rollo',
      'peso_pesaje_id', v_p.id,
      'diametro_origen_cm', v_diam.valor,
      'diametro_origen', CASE WHEN v_diam.id IS NULL THEN NULL ELSE 'control_calidad' END,
      'diametro_medicion_id', v_diam.id,
      'uniones_origen', v_uni.valor,
      'uniones_origen_fuente', CASE WHEN v_uni.id IS NULL THEN NULL ELSE 'control_calidad' END,
      'uniones_medicion_id', v_uni.id,
      'muestra_id', v_m.id,
      'recuperado_at', now(),
      'capturado_por', v_uid
    )
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
    idempotency_key, creado_por,
    rollo_id, numero_bajada
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
    _idempotency, v_uid,
    v_rollo_id, v_bajada
  ) RETURNING id INTO v_lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (v_lote_id, 'LOTE_CREADO',
    jsonb_build_object('conductor', v_cond.nombre, 'bobinadora', v_bob.nombre,
                       'peso_neto_kg', v_p.peso_neto_kg, 'origen_peso', v_origen,
                       'diametro_cm', v_diam.valor, 'uniones', v_uni.valor,
                       'origen_datos', 'sistema', 'numero_bajada', v_bajada),
    v_uid);

  RETURN v_lote_id;
END;
$function$;

-- 8) Creación de bajada manual --------------------------------
CREATE OR REPLACE FUNCTION public.crear_lote_pesaje_cintas_manual_v2(_numero_rollo text, _peso_neto_kg numeric, _diametro_cm numeric, _uniones integer, _orden_manual text, _idempotency uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote_id uuid;
  v_rollo text := trim(_numero_rollo);
  v_norm text;
  v_orden text := NULLIF(trim(COALESCE(_orden_manual,'')), '');
  v_rollo_rec record;
  v_rollo_id uuid;
  v_bajadas int;
  v_bajada smallint;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  SELECT id INTO v_lote_id FROM public.pesajes_cintas_lotes WHERE idempotency_key = _idempotency;
  IF v_lote_id IS NOT NULL THEN RETURN v_lote_id; END IF;

  IF v_rollo IS NULL OR length(v_rollo) = 0 OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Capture el número de rollo.' USING ERRCODE='22023';
  END IF;
  IF _peso_neto_kg IS NULL OR _peso_neto_kg <= 0 OR _peso_neto_kg > 3000 THEN
    RAISE EXCEPTION 'Capture el peso neto del rollo.' USING ERRCODE='22023';
  END IF;
  IF _diametro_cm IS NULL OR _diametro_cm <= 0 THEN
    RAISE EXCEPTION 'Capture el diámetro del rollo.' USING ERRCODE='22023';
  END IF;
  IF _uniones IS NULL OR _uniones < 0 THEN
    RAISE EXCEPTION 'Las uniones deben ser un número entero igual o mayor que cero.' USING ERRCODE='22023';
  END IF;

  v_norm := upper(v_rollo);
  PERFORM pg_advisory_xact_lock(hashtext('rollo:'||v_norm));

  SELECT * INTO v_rollo_rec FROM public.rollos_cintas WHERE numero_rollo = v_norm;
  IF COALESCE(v_rollo_rec.cerrado, false) THEN
    RAISE EXCEPTION 'El rollo fue cerrado definitivamente. No se permiten nuevas bajadas.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE upper(btrim(numero_rollo)) = v_norm AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Ya existe una bajada abierta para este rollo. Finalícela antes de iniciar otra.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_bajadas FROM public.pesajes_cintas_lotes
   WHERE upper(btrim(numero_rollo)) = v_norm AND estado <> 'anulado';
  IF v_bajadas >= 7 THEN
    RAISE EXCEPTION 'El rollo alcanzó el máximo de 7 bajadas.' USING ERRCODE='22023';
  END IF;
  v_bajada := (v_bajadas + 1)::smallint;
  v_rollo_id := public.pc_get_or_create_rollo(v_norm);

  INSERT INTO public.pesajes_cintas_lotes (
    numero_rollo, fabricacion, fecha_produccion, numero_orden,
    conductor_nombre_snapshot, bobinadora_nombre_snapshot,
    peso_bobina_madre_neto_kg, peso_pendiente_kg,
    datos_calidad_snapshot, es_manual,
    idempotency_key, creado_por,
    rollo_id, numero_bajada
  ) VALUES (
    v_rollo, '', (now() AT TIME ZONE 'America/Mexico_City')::date, v_orden,
    'SIN DATOS REGISTRADOS', 'SIN DATOS REGISTRADOS',
    round(_peso_neto_kg, 2), round(_peso_neto_kg, 2),
    jsonb_build_object(
      'numero_rollo', v_rollo,
      'origen_peso', 'manual',
      'mediciones', '{}'::jsonb,
      'numero_bajada', v_bajada,
      'datos_origen', jsonb_build_object(
        'origen', 'captura_manual',
        'orden_produccion_manual', v_orden,
        'peso_neto_origen_kg', round(_peso_neto_kg,2),
        'peso_origen', 'captura_manual',
        'diametro_origen_cm', _diametro_cm,
        'diametro_origen', 'captura_manual',
        'uniones_origen', _uniones,
        'uniones_origen_fuente', 'captura_manual',
        'capturado_por', v_uid,
        'capturado_at', now()
      )
    ),
    true,
    _idempotency, v_uid,
    v_rollo_id, v_bajada
  ) RETURNING id INTO v_lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, realizado_por)
  VALUES (v_lote_id, 'LOTE_CREADO_MANUAL',
    jsonb_build_object('peso_neto_kg', round(_peso_neto_kg,2), 'diametro_cm', _diametro_cm,
                       'uniones', _uniones, 'orden_produccion_manual', v_orden,
                       'origen_datos', 'captura_manual', 'numero_bajada', v_bajada),
    v_uid);

  RETURN v_lote_id;
END;
$function$;

-- 9) Registro de cinta (posición global + lote logístico pza.) -
CREATE OR REPLACE FUNCTION public.registrar_cinta_v2(
  _lote_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric,
  _observaciones text, _lote_logistico_pza text, _idempotency uuid)
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
    RAISE EXCEPTION 'Lote Logístico pza. admite máximo 10 caracteres.' USING ERRCODE='22023';
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

  -- Lote Logístico pza. obligatorio para bajadas nuevas (con rollo ancla)
  IF v_lote.rollo_id IS NOT NULL AND v_pza IS NULL THEN
    RAISE EXCEPTION 'Capture el Lote Logístico pza. de la cinta.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_cnt >= 50 THEN
    RAISE EXCEPTION 'Ya se registraron las 50 cintas permitidas para esta bajada.' USING ERRCODE='22023';
  END IF;

  -- Posición continua por rollo (incluye bajadas históricas del mismo número)
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
    observaciones, idempotency_key, creado_por, rollo_id, lote_logistico_pza
  ) VALUES (
    _lote_id, v_next_pos, _uniones, _peso_cinta_kg, _ancho_util,
    NULLIF(trim(COALESCE(_observaciones,'')),''), _idempotency, v_uid,
    v_lote.rollo_id, v_pza
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
                       'numero_bajada', v_lote.numero_bajada,
                       'idempotency_key', _idempotency),
    v_uid);

  RETURN jsonb_build_object('cinta_id', v_cinta_id, 'posicion', v_next_pos,
    'peso_total_cintas_kg', v_total, 'peso_pendiente_kg', v_pendiente,
    'cantidad_cintas', v_cnt);
END $function$;

-- Compatibilidad: firma vigente delega en v2 (sin lote logístico pza.)
CREATE OR REPLACE FUNCTION public.registrar_cinta(_lote_id uuid, _uniones integer, _peso_cinta_kg numeric, _ancho_util numeric, _observaciones text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.registrar_cinta_v2(_lote_id, _uniones, _peso_cinta_kg, _ancho_util, _observaciones, NULL, _idempotency);
$function$;

-- 10) Finalizar bajada / reabrir: límite 50 -------------------
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
    RAISE EXCEPTION 'Debe registrar el Peso de Mermas antes de finalizar la bajada.' USING ERRCODE='22023';
  END IF;
  IF _peso_mermas_kg < 0 THEN
    RAISE EXCEPTION 'El Peso de Mermas no puede ser negativo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'La bajada no está abierta.' USING ERRCODE='22023';
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
  IF v_cnt > 50 THEN RAISE EXCEPTION 'Máximo 50 cintas por bajada.' USING ERRCODE='22023'; END IF;
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
                       'numero_bajada', v_lote.numero_bajada,
                       'peso_total_real_cintas_kg', v_total,
                       'peso_mermas_kg', v_peso,
                       'porcentaje_peso_mermas', v_pct),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'peso_mermas_kg', v_peso, 'porcentaje_peso_mermas', v_pct);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_lote_cintas(_lote_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_cnt int;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Debe indicar un motivo (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'finalizado' THEN
    RAISE EXCEPTION 'Solo se puede reabrir una bajada finalizada.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pesajes_cintas_lotes
              WHERE upper(btrim(numero_rollo)) = upper(btrim(v_lote.numero_rollo))
                AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Ya existe una bajada abierta para este rollo.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rollos_cintas
              WHERE numero_rollo = upper(btrim(v_lote.numero_rollo)) AND cerrado = true) THEN
    RAISE EXCEPTION 'El rollo fue cerrado definitivamente.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_cnt >= 50 THEN
    RAISE EXCEPTION 'La bajada ya tiene el máximo de 50 cintas.' USING ERRCODE='22023';
  END IF;

  UPDATE public.pesajes_cintas_lotes
     SET estado = 'abierto',
         merma_kg = NULL,
         merma_porcentaje = NULL,
         finalizado_por = NULL,
         finalizado_at = NULL,
         actualizado_por = v_uid,
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id, 'LOTE_REABIERTO',
    jsonb_build_object('estado','finalizado','merma_kg',v_lote.merma_kg,'cintas_vigentes',v_cnt),
    jsonb_build_object('estado','abierto'),
    btrim(_motivo), v_uid);

  RETURN jsonb_build_object('estado','abierto','cintas_vigentes', v_cnt);
END $function$;

-- 11) Contexto de rollo: se agregan datos de bajadas (aditivo) -
CREATE OR REPLACE FUNCTION public.buscar_contexto_rollo_cintas(_numero_rollo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_new_id uuid;
  v_origen text := 'pesaje_rollo';
  v_diam record;
  v_uni record;
  v_diam_dups int := 0;
  v_uni_dups int := 0;
  v_bajadas jsonb;
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
    v_new_id := public._pc_pesaje_desde_calidad(v_m.id);
    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
    END IF;
  END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  IF v_p.peso_neto_kg IS NULL OR v_p.peso_neto_kg <= 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto del rollo. Registre primero el Pesaje de Rollo.' USING ERRCODE='P0002';
  END IF;

  IF v_p.evidencia_path = 'MIGRADO_DESDE_CALIDAD' THEN
    v_origen := 'migrado_calidad';
  END IF;

  SELECT id, codigo, nombre INTO v_producto FROM public.productos WHERE id = v_m.producto_id;

  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  SELECT id, valor, created_at INTO v_diam
    FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'diametro' AND valor IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  SELECT id, valor, created_at INTO v_uni
    FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'uniones' AND valor IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  SELECT COUNT(*) INTO v_diam_dups FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'diametro' AND valor IS NOT NULL;
  SELECT COUNT(*) INTO v_uni_dups FROM public.mediciones_calidad
   WHERE muestra_id = v_m.id AND variable_clave = 'uniones' AND valor IS NOT NULL;

  -- Compatibilidad: bajada abierta si existe; si no, la última no anulada.
  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
   WHERE pesaje_bobina_madre_id = v_p.id AND estado = 'abierto' LIMIT 1;
  IF v_lote.id IS NULL THEN
    SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
     WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado'
     ORDER BY COALESCE(numero_bajada, 1) DESC, created_at DESC LIMIT 1;
  END IF;

  v_bajadas := public.pc_bajadas_rollo(v_m.numero_rollo);

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
      'origen_peso', v_origen
    ),
    'datos_origen', jsonb_build_object(
      'peso_neto_kg', v_p.peso_neto_kg,
      'peso_origen', 'pesaje_rollo',
      'peso_pesaje_id', v_p.id,
      'diametro_cm', v_diam.valor,
      'diametro_medicion_id', v_diam.id,
      'diametro_origen', CASE WHEN v_diam.id IS NULL THEN NULL ELSE 'control_calidad' END,
      'diametro_duplicados', v_diam_dups,
      'uniones', v_uni.valor,
      'uniones_medicion_id', v_uni.id,
      'uniones_origen', CASE WHEN v_uni.id IS NULL THEN NULL ELSE 'control_calidad' END,
      'uniones_duplicados', v_uni_dups,
      'muestra_id', v_m.id,
      'recuperado_at', now()
    ),
    'rollo', v_bajadas,
    'lote', CASE WHEN v_lote.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_lote.id,
      'estado', v_lote.estado,
      'numero_bajada', COALESCE(v_lote.numero_bajada, 1),
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