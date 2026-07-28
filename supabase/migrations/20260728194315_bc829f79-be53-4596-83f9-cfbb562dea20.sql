
-- ============================================================================
-- Módulo Pesaje de Cintas — Fase 1 (tablas + RLS + RPC)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Permisos de módulo
-- ---------------------------------------------------------------------------
INSERT INTO public.module_permissions(role, module) VALUES
  ('administrador'::app_role,    'pesaje_cintas'::app_module),
  ('gerente_general'::app_role,  'pesaje_cintas'::app_module),
  ('calidad'::app_role,          'pesaje_cintas'::app_module),
  ('calidad_operativo'::app_role,'pesaje_cintas'::app_module),
  ('planeacion'::app_role,       'pesaje_cintas'::app_module)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Catálogo de bobinadoras
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_bobinadoras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL UNIQUE,
  nombre          text NOT NULL,
  activo          boolean NOT NULL DEFAULT true,
  creado_por      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_bobinadoras TO authenticated;
GRANT ALL ON public.catalogo_bobinadoras TO service_role;
ALTER TABLE public.catalogo_bobinadoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bobinadoras_read" ON public.catalogo_bobinadoras
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bobinadoras_write_admin" ON public.catalogo_bobinadoras
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general'));

DROP TRIGGER IF EXISTS trg_catalogo_bobinadoras_updated ON public.catalogo_bobinadoras;
CREATE TRIGGER trg_catalogo_bobinadoras_updated
  BEFORE UPDATE ON public.catalogo_bobinadoras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.catalogo_bobinadoras (codigo, nombre) VALUES
  ('RECARD','RECARD'),('ACCELI','ACCELI'),('ULTRA','ULTRA')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.pesaje_cintas_lote_estado AS ENUM ('abierto','finalizado','anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pesaje_cinta_estado AS ENUM ('registrada','sustituida','anulada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.impresion_cinta_tipo AS ENUM ('ORIGINAL','REIMPRESION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. Tabla pesajes_cintas_lotes (maestro)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pesajes_cintas_lotes (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pesaje_bobina_madre_id        uuid NOT NULL REFERENCES public.pesajes_bobina_madre(id),
  muestra_calidad_id            uuid NOT NULL REFERENCES public.muestras_calidad(id),
  orden_produccion_id           uuid REFERENCES public.ordenes_produccion(id),
  numero_orden                  text,
  numero_rollo                  text NOT NULL,
  fabricacion                   text NOT NULL,
  fecha_produccion              date,
  producto_id                   uuid REFERENCES public.productos(id),
  producto_codigo               text,
  producto_nombre               text,
  conductor_id                  uuid REFERENCES public.operarios(id),
  conductor_nombre_snapshot     text NOT NULL,
  bobinadora_id                 uuid NOT NULL REFERENCES public.catalogo_bobinadoras(id),
  bobinadora_nombre_snapshot    text NOT NULL,
  peso_bobina_madre_neto_kg     numeric(12,2) NOT NULL CHECK (peso_bobina_madre_neto_kg > 0),
  cantidad_cintas               integer NOT NULL DEFAULT 0 CHECK (cantidad_cintas BETWEEN 0 AND 12),
  peso_total_cintas_kg          numeric(12,2) NOT NULL DEFAULT 0 CHECK (peso_total_cintas_kg >= 0),
  peso_pendiente_kg             numeric(12,2) NOT NULL CHECK (peso_pendiente_kg >= 0),
  merma_kg                      numeric(12,2),
  merma_porcentaje              numeric(8,4),
  datos_calidad_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado                        pesaje_cintas_lote_estado NOT NULL DEFAULT 'abierto',
  idempotency_key               uuid NOT NULL UNIQUE,
  creado_por                    uuid NOT NULL REFERENCES auth.users(id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  actualizado_por               uuid REFERENCES auth.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  finalizado_por                uuid REFERENCES auth.users(id),
  finalizado_at                 timestamptz,
  anulado_por                   uuid REFERENCES auth.users(id),
  anulado_at                    timestamptz,
  motivo_anulacion              text
);

CREATE INDEX IF NOT EXISTS idx_pcl_numero_rollo   ON public.pesajes_cintas_lotes(numero_rollo);
CREATE INDEX IF NOT EXISTS idx_pcl_pesaje         ON public.pesajes_cintas_lotes(pesaje_bobina_madre_id);
CREATE INDEX IF NOT EXISTS idx_pcl_muestra        ON public.pesajes_cintas_lotes(muestra_calidad_id);
CREATE INDEX IF NOT EXISTS idx_pcl_estado_creado  ON public.pesajes_cintas_lotes(estado, created_at DESC);

-- Un solo lote NO anulado por bobina madre
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcl_pesaje_activo
  ON public.pesajes_cintas_lotes(pesaje_bobina_madre_id)
  WHERE estado <> 'anulado';

GRANT SELECT ON public.pesajes_cintas_lotes TO authenticated;
GRANT ALL ON public.pesajes_cintas_lotes TO service_role;
ALTER TABLE public.pesajes_cintas_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcl_select_autorizados" ON public.pesajes_cintas_lotes
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(),'pesaje_cintas'::app_module));

-- Inserts/updates SOLO via RPC SECURITY DEFINER (service_role bypass; usuarios normales bloqueados)
-- Sin DELETE.

DROP TRIGGER IF EXISTS trg_pcl_updated ON public.pesajes_cintas_lotes;
CREATE TRIGGER trg_pcl_updated
  BEFORE UPDATE ON public.pesajes_cintas_lotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Tabla pesajes_cintas (detalle)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pesajes_cintas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id               uuid NOT NULL REFERENCES public.pesajes_cintas_lotes(id) ON DELETE RESTRICT,
  posicion              smallint NOT NULL CHECK (posicion BETWEEN 1 AND 12),
  uniones               integer NOT NULL DEFAULT 0 CHECK (uniones >= 0),
  peso_cinta_kg         numeric(12,2) NOT NULL CHECK (peso_cinta_kg > 0),
  ancho_util            numeric(12,3) NOT NULL CHECK (ancho_util > 0),
  ancho_util_unidad     text DEFAULT 'cm',
  observaciones         text,
  estado                pesaje_cinta_estado NOT NULL DEFAULT 'registrada',
  idempotency_key       uuid NOT NULL UNIQUE,
  sustituye_a_cinta_id  uuid REFERENCES public.pesajes_cintas(id),
  creado_por            uuid NOT NULL REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_por       uuid REFERENCES auth.users(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  anulado_por           uuid REFERENCES auth.users(id),
  anulado_at            timestamptz,
  motivo_anulacion      text
);

CREATE INDEX IF NOT EXISTS idx_pc_lote       ON public.pesajes_cintas(lote_id);
CREATE INDEX IF NOT EXISTS idx_pc_lote_pos   ON public.pesajes_cintas(lote_id, posicion);

-- Una sola cinta VIGENTE (registrada) por lote+posición
CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_lote_pos_vigente
  ON public.pesajes_cintas(lote_id, posicion)
  WHERE estado = 'registrada';

GRANT SELECT ON public.pesajes_cintas TO authenticated;
GRANT ALL ON public.pesajes_cintas TO service_role;
ALTER TABLE public.pesajes_cintas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select_autorizados" ON public.pesajes_cintas
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(),'pesaje_cintas'::app_module));

DROP TRIGGER IF EXISTS trg_pc_updated ON public.pesajes_cintas;
CREATE TRIGGER trg_pc_updated
  BEFORE UPDATE ON public.pesajes_cintas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Tabla pesajes_cintas_auditoria
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pesajes_cintas_auditoria (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id             uuid REFERENCES public.pesajes_cintas_lotes(id),
  cinta_id            uuid REFERENCES public.pesajes_cintas(id),
  accion              text NOT NULL,
  valores_anteriores  jsonb,
  valores_nuevos      jsonb,
  motivo              text,
  realizado_por       uuid REFERENCES auth.users(id),
  realizado_en        timestamptz NOT NULL DEFAULT now(),
  contexto            jsonb
);
CREATE INDEX IF NOT EXISTS idx_pca_lote ON public.pesajes_cintas_auditoria(lote_id, realizado_en DESC);
GRANT SELECT ON public.pesajes_cintas_auditoria TO authenticated;
GRANT ALL ON public.pesajes_cintas_auditoria TO service_role;
ALTER TABLE public.pesajes_cintas_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pca_select_autorizados" ON public.pesajes_cintas_auditoria
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(),'pesaje_cintas'::app_module));

-- ---------------------------------------------------------------------------
-- 6. Tabla impresiones_etiquetas_cintas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.impresiones_etiquetas_cintas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id                     uuid NOT NULL REFERENCES public.pesajes_cintas_lotes(id),
  folio_impresion             text NOT NULL UNIQUE,
  cantidad_etiquetas          integer NOT NULL CHECK (cantidad_etiquetas > 0),
  posiciones_impresas         smallint[] NOT NULL,
  datos_impresion_snapshot    jsonb NOT NULL,
  tipo                        impresion_cinta_tipo NOT NULL,
  motivo_reimpresion          text,
  impreso_por                 uuid NOT NULL REFERENCES auth.users(id),
  impreso_en                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iec_lote ON public.impresiones_etiquetas_cintas(lote_id, impreso_en DESC);
GRANT SELECT ON public.impresiones_etiquetas_cintas TO authenticated;
GRANT ALL ON public.impresiones_etiquetas_cintas TO service_role;
ALTER TABLE public.impresiones_etiquetas_cintas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iec_select_autorizados" ON public.impresiones_etiquetas_cintas
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(),'pesaje_cintas'::app_module));

-- ============================================================================
-- 7. FUNCIONES RPC
-- ============================================================================

-- Helper interno: exige acceso al módulo pesaje_cintas
CREATE OR REPLACE FUNCTION public._pc_require_access(_uid uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_module(_uid, 'pesaje_cintas'::app_module) THEN
    RAISE EXCEPTION 'Sin permiso para el módulo Pesaje de Cintas.' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._pc_require_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._pc_require_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.1 buscar_contexto_rollo_cintas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_contexto_rollo_cintas(_numero_rollo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
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

  SELECT COUNT(*) INTO v_pesajes FROM public.pesajes_bobina_madre WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id;
  IF v_pesajes = 0 THEN
    RAISE EXCEPTION 'No se encontró el peso neto de la bobina madre. Registre primero el Pesaje de Bobina Madre.' USING ERRCODE='P0002';
  END IF;
  IF v_pesajes > 1 THEN
    RAISE EXCEPTION 'Existen varios pesajes con el mismo número de rollo. Contacte al administrador.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_rollo AND maquina_id = v_m.maquina_id LIMIT 1;

  SELECT id, codigo, nombre INTO v_producto FROM public.productos WHERE id = v_m.producto_id;

  -- Recopilar mediciones vigentes
  SELECT jsonb_object_agg(variable_clave, jsonb_build_object(
    'valor', valor, 'min', min_snapshot, 'obj', objetivo_snapshot, 'max', max_snapshot
  )) INTO v_mediciones
    FROM public.mediciones_calidad WHERE muestra_id = v_m.id;

  -- Lote existente (si lo hay)
  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes
   WHERE pesaje_bobina_madre_id = v_p.id AND estado <> 'anulado'
   LIMIT 1;

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
      'maquina_codigo', v_p.maquina_codigo
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
END $$;
REVOKE ALL ON FUNCTION public.buscar_contexto_rollo_cintas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_contexto_rollo_cintas(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.2 crear_lote_pesaje_cintas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_lote_pesaje_cintas(
  _numero_rollo   text,
  _conductor_id   uuid,
  _bobinadora_id  uuid,
  _idempotency    uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m record; v_p record; v_prod record;
  v_cond record; v_bob record;
  v_lote_id uuid;
  v_snapshot jsonb;
  v_mediciones jsonb;
BEGIN
  PERFORM public._pc_require_access(v_uid);

  -- Idempotencia
  SELECT id INTO v_lote_id FROM public.pesajes_cintas_lotes WHERE idempotency_key = _idempotency;
  IF v_lote_id IS NOT NULL THEN RETURN v_lote_id; END IF;

  IF _numero_rollo IS NULL OR _bobinadora_id IS NULL OR _conductor_id IS NULL OR _idempotency IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_m FROM public.muestras_calidad WHERE numero_rollo = trim(_numero_rollo) LIMIT 1;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Muestra no encontrada.' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_p FROM public.pesajes_bobina_madre
   WHERE numero_rollo = v_m.numero_rollo AND maquina_id = v_m.maquina_id LIMIT 1;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pesaje de bobina madre no encontrado.' USING ERRCODE='P0002'; END IF;

  -- Lock por bobina madre
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
    'mediciones', COALESCE(v_mediciones, '{}'::jsonb)
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
                       'peso_neto_kg', v_p.peso_neto_kg),
    v_uid);

  RETURN v_lote_id;
END $$;
REVOKE ALL ON FUNCTION public.crear_lote_pesaje_cintas(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_lote_pesaje_cintas(text,uuid,uuid,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.3 registrar_cinta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_cinta(
  _lote_id        uuid,
  _uniones        integer,
  _peso_cinta_kg  numeric,
  _ancho_util     numeric,
  _observaciones  text,
  _idempotency    uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
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
  IF _peso_cinta_kg <= 0 THEN RAISE EXCEPTION 'Peso debe ser mayor a 0.' USING ERRCODE='22023'; END IF;
  IF _ancho_util <= 0 THEN RAISE EXCEPTION 'Ancho útil debe ser mayor a 0.' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_lote.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El lote no está abierto para registrar cintas.' USING ERRCODE='22023';
  END IF;

  -- Siguiente posición server-side
  SELECT COALESCE(MAX(posicion), 0)::smallint + 1 INTO v_next_pos
    FROM public.pesajes_cintas
    WHERE lote_id = _lote_id AND estado = 'registrada';
  IF v_next_pos > 12 THEN
    RAISE EXCEPTION 'Ya se registraron las 12 cintas permitidas.' USING ERRCODE='22023';
  END IF;

  -- Validar que el peso no exceda
  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso acumulado de las cintas supera el peso disponible de la bobina madre.' USING ERRCODE='22023';
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
    jsonb_build_object('posicion', v_next_pos, 'peso', _peso_cinta_kg,
                       'uniones', _uniones, 'ancho', _ancho_util),
    v_uid);

  RETURN jsonb_build_object('cinta_id', v_cinta_id, 'posicion', v_next_pos,
    'peso_total_cintas_kg', v_total, 'peso_pendiente_kg', v_pendiente);
END $$;
REVOKE ALL ON FUNCTION public.registrar_cinta(uuid,integer,numeric,numeric,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_cinta(uuid,integer,numeric,numeric,text,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.4 corregir_cinta (crea nueva versión, marca anterior como sustituida)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corregir_cinta(
  _cinta_id       uuid,
  _uniones        integer,
  _peso_cinta_kg  numeric,
  _ancho_util     numeric,
  _observaciones  text,
  _motivo         text,
  _idempotency    uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
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

  -- Marcar anterior como sustituida
  UPDATE public.pesajes_cintas
     SET estado = 'sustituida', motivo_anulacion = _motivo,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = _cinta_id;

  -- Verificar que el nuevo peso no exceda tras excluir la sustituida
  SELECT COALESCE(SUM(peso_cinta_kg),0) INTO v_total
    FROM public.pesajes_cintas
    WHERE lote_id = v_ant.lote_id AND estado = 'registrada';
  IF (v_total + _peso_cinta_kg) > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso corregido supera el peso disponible de la bobina madre.' USING ERRCODE='22023';
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
    jsonb_build_object('peso', v_ant.peso_cinta_kg, 'uniones', v_ant.uniones, 'ancho', v_ant.ancho_util),
    jsonb_build_object('peso', _peso_cinta_kg, 'uniones', _uniones, 'ancho', _ancho_util),
    _motivo, v_uid);

  RETURN jsonb_build_object('cinta_id', v_new_id, 'posicion', v_ant.posicion);
END $$;
REVOKE ALL ON FUNCTION public.corregir_cinta(uuid,integer,numeric,numeric,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_cinta(uuid,integer,numeric,numeric,text,text,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.5 anular_cinta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_cinta(_cinta_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c record; v_lote record; v_total numeric;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_c FROM public.pesajes_cintas WHERE id = _cinta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Cinta no encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_c.estado <> 'registrada' THEN
    RAISE EXCEPTION 'Sólo se pueden anular cintas registradas.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lote:'||v_c.lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = v_c.lote_id FOR UPDATE;
  IF v_lote.estado = 'finalizado'
     AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'calidad')) THEN
    RAISE EXCEPTION 'Lote finalizado: anulación restringida a rol autorizado.' USING ERRCODE='42501';
  END IF;

  UPDATE public.pesajes_cintas
     SET estado = 'anulada', anulado_por = v_uid, anulado_at = now(),
         motivo_anulacion = _motivo, updated_at = now(), actualizado_por = v_uid
   WHERE id = _cinta_id;

  SELECT COALESCE(SUM(peso_cinta_kg),0),
         COUNT(*)::int
    INTO v_total, v_c.uniones -- reutilizo campo temporal
    FROM public.pesajes_cintas WHERE lote_id = v_lote.id AND estado = 'registrada';

  UPDATE public.pesajes_cintas_lotes
     SET peso_total_cintas_kg = v_total,
         peso_pendiente_kg = v_lote.peso_bobina_madre_neto_kg - v_total,
         cantidad_cintas = v_c.uniones,
         actualizado_por = v_uid, updated_at = now()
   WHERE id = v_lote.id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, cinta_id, accion, motivo, realizado_por)
  VALUES (v_lote.id, _cinta_id, 'CINTA_ANULADA', _motivo, v_uid);
END $$;
REVOKE ALL ON FUNCTION public.anular_cinta(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_cinta(uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.6 finalizar_lote_cintas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_lote_cintas(_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
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

  SELECT COALESCE(SUM(peso_cinta_kg),0), COUNT(*)::int INTO v_total, v_cnt
    FROM public.pesajes_cintas WHERE lote_id = _lote_id AND estado = 'registrada';

  IF v_cnt < 1 THEN RAISE EXCEPTION 'Debe registrar al menos una cinta.' USING ERRCODE='22023'; END IF;
  IF v_cnt > 12 THEN RAISE EXCEPTION 'Máximo 12 cintas.' USING ERRCODE='22023'; END IF;
  IF v_total > v_lote.peso_bobina_madre_neto_kg THEN
    RAISE EXCEPTION 'El peso total de cintas excede el peso neto.' USING ERRCODE='22023';
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
    jsonb_build_object('cintas', v_cnt, 'peso_total', v_total,
                       'merma_kg', v_merma, 'merma_pct', v_pct),
    v_uid);

  RETURN jsonb_build_object('cantidad_cintas', v_cnt, 'peso_total_cintas_kg', v_total,
                            'merma_kg', v_merma, 'merma_porcentaje', v_pct);
END $$;
REVOKE ALL ON FUNCTION public.finalizar_lote_cintas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_lote_cintas(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7.7 preparar_impresion_etiquetas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preparar_impresion_etiquetas(
  _lote_id  uuid,
  _motivo   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lote record;
  v_cnt_prev int;
  v_tipo impresion_cinta_tipo;
  v_cintas jsonb;
  v_cnt int;
  v_pos smallint[];
  v_folio text;
  v_snapshot jsonb;
  v_imp_id uuid;
BEGIN
  PERFORM public._pc_require_access(v_uid);
  PERFORM pg_advisory_xact_lock(hashtext('lote:'||_lote_id::text));

  SELECT * INTO v_lote FROM public.pesajes_cintas_lotes WHERE id = _lote_id;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE='P0002'; END IF;

  SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.posicion), COUNT(*)::int, array_agg(t.posicion ORDER BY t.posicion)
    INTO v_cintas, v_cnt, v_pos
    FROM (
      SELECT id, posicion, uniones, peso_cinta_kg, ancho_util, ancho_util_unidad, observaciones
        FROM public.pesajes_cintas
       WHERE lote_id = _lote_id AND estado = 'registrada'
       ORDER BY posicion
    ) t;

  IF v_cnt = 0 OR v_cintas IS NULL THEN
    RAISE EXCEPTION 'No hay cintas registradas para imprimir.' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*) INTO v_cnt_prev FROM public.impresiones_etiquetas_cintas WHERE lote_id = _lote_id;
  v_tipo := CASE WHEN v_cnt_prev = 0 THEN 'ORIGINAL'::impresion_cinta_tipo ELSE 'REIMPRESION'::impresion_cinta_tipo END;

  IF v_tipo = 'REIMPRESION' AND (_motivo IS NULL OR length(trim(_motivo)) < 5) THEN
    RAISE EXCEPTION 'Motivo obligatorio para reimpresión.' USING ERRCODE='22023';
  END IF;

  v_folio := 'IMP-' || to_char(now() AT TIME ZONE 'America/Mexico_City','YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text,1,8);

  v_snapshot := jsonb_build_object(
    'lote_id', v_lote.id,
    'numero_rollo', v_lote.numero_rollo,
    'fabricacion', v_lote.fabricacion,
    'producto_codigo', v_lote.producto_codigo,
    'producto_nombre', v_lote.producto_nombre,
    'fecha_produccion', v_lote.fecha_produccion,
    'conductor', v_lote.conductor_nombre_snapshot,
    'bobinadora', v_lote.bobinadora_nombre_snapshot,
    'datos_calidad', v_lote.datos_calidad_snapshot,
    'cintas', v_cintas
  );

  INSERT INTO public.impresiones_etiquetas_cintas(
    lote_id, folio_impresion, cantidad_etiquetas, posiciones_impresas,
    datos_impresion_snapshot, tipo, motivo_reimpresion, impreso_por
  ) VALUES (
    _lote_id, v_folio, v_cnt, v_pos, v_snapshot, v_tipo,
    CASE WHEN v_tipo = 'REIMPRESION' THEN _motivo ELSE NULL END, v_uid
  ) RETURNING id INTO v_imp_id;

  INSERT INTO public.pesajes_cintas_auditoria(lote_id, accion, valores_nuevos, motivo, realizado_por)
  VALUES (_lote_id,
          CASE WHEN v_tipo='ORIGINAL' THEN 'ETIQUETAS_IMPRESAS' ELSE 'ETIQUETAS_REIMPRESAS' END,
          jsonb_build_object('folio', v_folio, 'cantidad', v_cnt, 'posiciones', v_pos),
          _motivo, v_uid);

  RETURN jsonb_build_object(
    'impresion_id', v_imp_id,
    'folio', v_folio,
    'tipo', v_tipo,
    'cantidad_etiquetas', v_cnt,
    'snapshot', v_snapshot
  );
END $$;
REVOKE ALL ON FUNCTION public.preparar_impresion_etiquetas(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preparar_impresion_etiquetas(uuid,text) TO authenticated;
