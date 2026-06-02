-- Enums QC
CREATE TYPE public.qc_muestra_estado AS ENUM ('borrador','pendiente_revision','en_ajuste','reproceso','liberada','rechazada','concesion');
CREATE TYPE public.qc_medicion_estado AS ENUM ('pendiente','conforme','no_conforme','fuera_rango_critico');
CREATE TYPE public.qc_dictamen AS ENUM ('liberada','rechazada','concesion');
CREATE TYPE public.qc_tipo_muestreo AS ENUM ('por_rollo','por_tiempo');
CREATE TYPE public.qc_tipo_ajuste AS ENUM ('ajuste_calidad','ajuste_maquina','ajuste_parametros','cambio_materia_prima','reproceso','otro');
CREATE TYPE public.qc_resultado_ajuste AS ENUM ('pendiente','exitoso','parcial','fallido');
CREATE TYPE public.qc_ajuste_flujo AS ENUM ('solicitado','autorizado','en_ejecucion','cerrado','rechazado');
CREATE TYPE public.qc_spec_audit_field AS ENUM ('min','objetivo','max');

-- ============ muestras_calidad ============
CREATE TABLE public.muestras_calidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES public.ordenes_fabricacion(id) ON DELETE RESTRICT,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  maquina_id UUID NOT NULL REFERENCES public.maquinas(id),
  planta_id UUID NOT NULL REFERENCES public.plantas(id),
  turno TEXT NOT NULL,
  operario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  especificacion_id UUID NOT NULL REFERENCES public.producto_especificaciones(id),
  especificacion_version TEXT NOT NULL,
  numero_rollo INTEGER,
  hora_muestreo TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_muestreo public.qc_tipo_muestreo NOT NULL,
  observaciones_generales TEXT NOT NULL DEFAULT '',
  estado public.qc_muestra_estado NOT NULL DEFAULT 'borrador',
  capturado_por UUID NOT NULL REFERENCES auth.users(id),
  capturado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_at TIMESTAMPTZ,
  dictamen public.qc_dictamen,
  dictamen_motivo TEXT,
  dictamen_at TIMESTAMPTZ,
  dictamen_observaciones TEXT,
  autorizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rol_autorizador public.app_role,
  autorizado_at TIMESTAMPTZ,
  evidencia_url TEXT,
  mediciones_modificadas_at TIMESTAMPTZ,
  mediciones_modificadas_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mediciones_modificacion_motivo TEXT,
  variables_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_muestras_orden ON public.muestras_calidad(orden_id);
CREATE INDEX idx_muestras_estado ON public.muestras_calidad(estado);
CREATE INDEX idx_muestras_maquina ON public.muestras_calidad(maquina_id);
CREATE INDEX idx_muestras_planta ON public.muestras_calidad(planta_id);
CREATE INDEX idx_muestras_capturado_at ON public.muestras_calidad(capturado_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.muestras_calidad TO authenticated;
GRANT ALL ON public.muestras_calidad TO service_role;

ALTER TABLE public.muestras_calidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "muestras_read_all" ON public.muestras_calidad
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "muestras_insert_qc" ON public.muestras_calidad
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  );

CREATE POLICY "muestras_update_qc" ON public.muestras_calidad
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  );

CREATE POLICY "muestras_delete_admin" ON public.muestras_calidad
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gerente_general'::app_role));

CREATE TRIGGER trg_muestras_updated_at
  BEFORE UPDATE ON public.muestras_calidad
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ mediciones_calidad ============
CREATE TABLE public.mediciones_calidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muestra_id UUID NOT NULL REFERENCES public.muestras_calidad(id) ON DELETE CASCADE,
  variable_id UUID NOT NULL REFERENCES public.variables_calidad(id),
  variable_clave TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  min_snapshot NUMERIC NOT NULL,
  objetivo_snapshot NUMERIC NOT NULL,
  max_snapshot NUMERIC NOT NULL,
  estado public.qc_medicion_estado NOT NULL DEFAULT 'pendiente',
  observacion TEXT NOT NULL DEFAULT '',
  capturado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mediciones_muestra ON public.mediciones_calidad(muestra_id);
CREATE INDEX idx_mediciones_variable ON public.mediciones_calidad(variable_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mediciones_calidad TO authenticated;
GRANT ALL ON public.mediciones_calidad TO service_role;

ALTER TABLE public.mediciones_calidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mediciones_read_all" ON public.mediciones_calidad
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mediciones_write_qc" ON public.mediciones_calidad
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  );

-- ============ ajustes_calidad ============
CREATE TABLE public.ajustes_calidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muestra_id UUID REFERENCES public.muestras_calidad(id) ON DELETE SET NULL,
  orden_id UUID NOT NULL REFERENCES public.ordenes_fabricacion(id),
  maquina_id UUID NOT NULL REFERENCES public.maquinas(id),
  planta_id UUID NOT NULL REFERENCES public.plantas(id),
  tipo_ajuste public.qc_tipo_ajuste NOT NULL,
  motivo TEXT NOT NULL,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  solicitado_por UUID NOT NULL REFERENCES auth.users(id),
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  autorizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  autorizado_at TIMESTAMPTZ,
  ajustado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ajustado_at TIMESTAMPTZ,
  accion_realizada TEXT,
  resultado public.qc_resultado_ajuste NOT NULL DEFAULT 'pendiente',
  evidencia_url TEXT,
  observacion_ajuste TEXT,
  muestra_verificacion_id UUID REFERENCES public.muestras_calidad(id) ON DELETE SET NULL,
  sla_objetivo_horas NUMERIC NOT NULL DEFAULT 4,
  estado_flujo public.qc_ajuste_flujo NOT NULL DEFAULT 'solicitado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ajustes_orden ON public.ajustes_calidad(orden_id);
CREATE INDEX idx_ajustes_maquina ON public.ajustes_calidad(maquina_id);
CREATE INDEX idx_ajustes_flujo ON public.ajustes_calidad(estado_flujo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes_calidad TO authenticated;
GRANT ALL ON public.ajustes_calidad TO service_role;

ALTER TABLE public.ajustes_calidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ajustes_read_all" ON public.ajustes_calidad
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ajustes_write_qc" ON public.ajustes_calidad
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'capturista'::app_role) OR has_role(auth.uid(),'calidad'::app_role)
    OR has_role(auth.uid(),'gerente_general'::app_role) OR has_role(auth.uid(),'administrador'::app_role)
  );

CREATE TRIGGER trg_ajustes_updated_at
  BEFORE UPDATE ON public.ajustes_calidad
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ spec_audit_log (append-only) ============
CREATE TABLE public.spec_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  especificacion_id UUID NOT NULL REFERENCES public.producto_especificaciones(id),
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  variable_id UUID REFERENCES public.variables_calidad(id),
  variable_clave TEXT NOT NULL,
  variable_etiqueta TEXT NOT NULL,
  campo public.qc_spec_audit_field NOT NULL,
  valor_anterior NUMERIC,
  valor_nuevo NUMERIC,
  motivo TEXT NOT NULL,
  modificado_por UUID NOT NULL REFERENCES auth.users(id),
  modificado_por_nombre TEXT,
  modificado_por_rol public.app_role,
  planta_id UUID REFERENCES public.plantas(id),
  modificado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spec_audit_spec ON public.spec_audit_log(especificacion_id);
CREATE INDEX idx_spec_audit_producto ON public.spec_audit_log(producto_id);
CREATE INDEX idx_spec_audit_at ON public.spec_audit_log(modificado_at DESC);

GRANT SELECT, INSERT ON public.spec_audit_log TO authenticated;
GRANT ALL ON public.spec_audit_log TO service_role;

ALTER TABLE public.spec_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spec_audit_read_all" ON public.spec_audit_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "spec_audit_insert_authorized" ON public.spec_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    modificado_por = auth.uid() AND (
      has_role(auth.uid(),'administrador'::app_role)
      OR has_role(auth.uid(),'gerente_general'::app_role)
      OR has_role(auth.uid(),'direccion'::app_role)
      OR has_role(auth.uid(),'calidad'::app_role)
    )
  );
-- No UPDATE / DELETE policies → append-only por diseño