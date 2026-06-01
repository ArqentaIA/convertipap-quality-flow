-- =========================================================
-- FASE 4 — PRODUCCIÓN
-- =========================================================

-- ---------- ENUMS ----------
CREATE TYPE public.orden_estado AS ENUM (
  'borrador','programada','en_proceso','pausada','finalizada','cancelada'
);

CREATE TYPE public.maquina_estado AS ENUM (
  'libre','produciendo','paro','mantenimiento'
);

CREATE TYPE public.paro_categoria AS ENUM (
  'materiales','cambio_produccion','limpieza','mantenimiento',
  'falla_tecnica','calidad','recursos_humanos','servicios','planeado','otro'
);

CREATE TYPE public.unidad_objetivo AS ENUM ('kg','rollos','ambos');

-- ---------- TABLA: tipos_paro ----------
CREATE TABLE public.tipos_paro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria public.paro_categoria NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_paro TO authenticated;
GRANT ALL ON public.tipos_paro TO service_role;

ALTER TABLE public.tipos_paro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_paro_read" ON public.tipos_paro
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tipos_paro_write_admin" ON public.tipos_paro
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general'));

CREATE TRIGGER trg_tipos_paro_updated
  BEFORE UPDATE ON public.tipos_paro
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- TABLA: ordenes_fabricacion ----------
CREATE TABLE public.ordenes_fabricacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  especificacion_id uuid NOT NULL REFERENCES public.producto_especificaciones(id) ON DELETE RESTRICT,
  maquina_id uuid NOT NULL REFERENCES public.maquinas(id) ON DELETE RESTRICT,
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE RESTRICT,
  turno text,
  estado public.orden_estado NOT NULL DEFAULT 'borrador',
  unidad_objetivo public.unidad_objetivo NOT NULL DEFAULT 'kg',
  objetivo_kg numeric,
  objetivo_rollos integer,
  producido_kg numeric NOT NULL DEFAULT 0,
  producido_rollos integer NOT NULL DEFAULT 0,
  fecha_programada timestamptz,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  creado_por uuid REFERENCES auth.users(id),
  iniciado_por uuid REFERENCES auth.users(id),
  cerrado_por uuid REFERENCES auth.users(id),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_of_maquina ON public.ordenes_fabricacion(maquina_id);
CREATE INDEX idx_of_estado ON public.ordenes_fabricacion(estado);
CREATE INDEX idx_of_producto ON public.ordenes_fabricacion(producto_id);

-- Una máquina solo puede tener UNA orden activa (en_proceso o pausada)
CREATE UNIQUE INDEX uniq_orden_activa_por_maquina
  ON public.ordenes_fabricacion(maquina_id)
  WHERE estado IN ('en_proceso','pausada');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_fabricacion TO authenticated;
GRANT ALL ON public.ordenes_fabricacion TO service_role;

ALTER TABLE public.ordenes_fabricacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_read" ON public.ordenes_fabricacion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "of_insert" ON public.ordenes_fabricacion
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  );

CREATE POLICY "of_update" ON public.ordenes_fabricacion
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  );

CREATE POLICY "of_delete_admin" ON public.ordenes_fabricacion
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general'));

CREATE TRIGGER trg_of_updated
  BEFORE UPDATE ON public.ordenes_fabricacion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- TABLA: rollos_producidos ----------
CREATE TABLE public.rollos_producidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_fabricacion(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  peso_kg numeric,
  diametro_mm numeric,
  observaciones text,
  registrado_por uuid REFERENCES auth.users(id),
  registrado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orden_id, numero)
);

CREATE INDEX idx_rollos_orden ON public.rollos_producidos(orden_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rollos_producidos TO authenticated;
GRANT ALL ON public.rollos_producidos TO service_role;

ALTER TABLE public.rollos_producidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rollos_read" ON public.rollos_producidos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rollos_write" ON public.rollos_producidos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  );

CREATE TRIGGER trg_rollos_updated
  BEFORE UPDATE ON public.rollos_producidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- TABLA: maquina_estado_actual ----------
CREATE TABLE public.maquina_estado_actual (
  maquina_id uuid PRIMARY KEY REFERENCES public.maquinas(id) ON DELETE CASCADE,
  estado public.maquina_estado NOT NULL DEFAULT 'libre',
  orden_activa_id uuid REFERENCES public.ordenes_fabricacion(id) ON DELETE SET NULL,
  paro_activo_id uuid,
  ultimo_cambio timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquina_estado_actual TO authenticated;
GRANT ALL ON public.maquina_estado_actual TO service_role;

ALTER TABLE public.maquina_estado_actual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mea_read" ON public.maquina_estado_actual
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mea_write" ON public.maquina_estado_actual
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  );

CREATE TRIGGER trg_mea_updated
  BEFORE UPDATE ON public.maquina_estado_actual
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- TABLA: paros_maquina ----------
CREATE TABLE public.paros_maquina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina_id uuid NOT NULL REFERENCES public.maquinas(id) ON DELETE RESTRICT,
  orden_id uuid REFERENCES public.ordenes_fabricacion(id) ON DELETE SET NULL,
  tipo_paro_id uuid NOT NULL REFERENCES public.tipos_paro(id) ON DELETE RESTRICT,
  inicio timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  duracion_min numeric GENERATED ALWAYS AS (
    CASE WHEN fin IS NOT NULL THEN EXTRACT(EPOCH FROM (fin - inicio))/60 ELSE NULL END
  ) STORED,
  descripcion text,
  abierto_por uuid REFERENCES auth.users(id),
  cerrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paros_maquina ON public.paros_maquina(maquina_id);
CREATE INDEX idx_paros_orden ON public.paros_maquina(orden_id);

-- Una máquina solo puede tener UN paro abierto a la vez
CREATE UNIQUE INDEX uniq_paro_abierto_por_maquina
  ON public.paros_maquina(maquina_id)
  WHERE fin IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paros_maquina TO authenticated;
GRANT ALL ON public.paros_maquina TO service_role;

ALTER TABLE public.paros_maquina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paros_read" ON public.paros_maquina
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "paros_write" ON public.paros_maquina
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'capturista') OR
    public.has_role(auth.uid(),'calidad') OR
    public.has_role(auth.uid(),'gerente_general') OR
    public.has_role(auth.uid(),'administrador')
  );

CREATE TRIGGER trg_paros_updated
  BEFORE UPDATE ON public.paros_maquina
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FK diferida de maquina_estado_actual.paro_activo_id
ALTER TABLE public.maquina_estado_actual
  ADD CONSTRAINT fk_mea_paro_activo
  FOREIGN KEY (paro_activo_id) REFERENCES public.paros_maquina(id) ON DELETE SET NULL;

-- ---------- SEMILLA: 18 tipos de paro ----------
INSERT INTO public.tipos_paro (codigo, nombre, categoria, orden) VALUES
  ('falta_materia_prima',     'Falta de materia prima',        'materiales',         10),
  ('cambio_de_orden',         'Cambio de orden',               'cambio_produccion',  20),
  ('cambio_de_producto',      'Cambio de producto',            'cambio_produccion',  30),
  ('cambio_de_especificacion','Cambio de especificación',      'cambio_produccion',  40),
  ('limpieza',                'Limpieza',                      'limpieza',           50),
  ('mantenimiento_preventivo','Mantenimiento preventivo',      'mantenimiento',      60),
  ('mantenimiento_correctivo','Mantenimiento correctivo',      'mantenimiento',      70),
  ('falla_mecanica',          'Falla mecánica',                'falla_tecnica',      80),
  ('falla_electrica',         'Falla eléctrica',               'falla_tecnica',      90),
  ('falla_instrumentacion',   'Falla de instrumentación',      'falla_tecnica',     100),
  ('ajuste_calidad',          'Ajuste por calidad',            'calidad',           110),
  ('espera_laboratorio',      'Espera de laboratorio',         'calidad',           120),
  ('falta_operador',          'Falta de operador',             'recursos_humanos',  130),
  ('falta_energia',           'Falta de energía',              'servicios',         140),
  ('falta_aire',              'Falta de aire',                 'servicios',         150),
  ('falta_vapor',             'Falta de vapor',                'servicios',         160),
  ('paro_programado',         'Paro programado',               'planeado',          170),
  ('otro',                    'Otro',                          'otro',              999);

-- Inicializar maquina_estado_actual para todas las máquinas existentes
INSERT INTO public.maquina_estado_actual (maquina_id, estado)
SELECT id, 'libre' FROM public.maquinas
ON CONFLICT (maquina_id) DO NOTHING;