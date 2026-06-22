-- =============================================================================
-- Fase 2 - Control documental de especificaciones
-- =============================================================================

-- 1. Tabla spec_documentos ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spec_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  especificacion_id uuid NOT NULL
    REFERENCES public.producto_especificaciones(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL,
  bucket_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  hash_sha256 text,
  descripcion text,
  subido_por uuid NOT NULL REFERENCES auth.users(id),
  subido_at timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT true,
  archivado_por uuid REFERENCES auth.users(id),
  archivado_at timestamptz,
  motivo_archivado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.spec_documentos IS
  'Evidencia documental (PDF/JPG/PNG) asociada a cada producto_especificaciones. Solo Calidad/Administrador cargan o archivan; nadie borra.';
COMMENT ON COLUMN public.spec_documentos.vigente IS
  'true = documento activo (cuenta como evidencia obligatoria). false = archivado por superseder. Sin DELETE permitido.';

CREATE INDEX IF NOT EXISTS spec_documentos_spec_vigente_idx
  ON public.spec_documentos (especificacion_id, vigente);
CREATE INDEX IF NOT EXISTS spec_documentos_subido_por_idx
  ON public.spec_documentos (subido_por);

-- 2. GRANTs ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.spec_documentos TO authenticated;
GRANT ALL ON public.spec_documentos TO service_role;

-- 3. RLS ---------------------------------------------------------------------
ALTER TABLE public.spec_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spec_documentos_select_authenticated"
  ON public.spec_documentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "spec_documentos_insert_calidad_admin"
  ON public.spec_documentos FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'calidad')
    OR public.has_role(auth.uid(), 'administrador')
  );

CREATE POLICY "spec_documentos_update_calidad_admin"
  ON public.spec_documentos FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'calidad')
    OR public.has_role(auth.uid(), 'administrador')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'calidad')
    OR public.has_role(auth.uid(), 'administrador')
  );

-- (Sin policy de DELETE => DELETE prohibido)

-- 4. Trigger updated_at ------------------------------------------------------
CREATE TRIGGER spec_documentos_set_updated_at
  BEFORE UPDATE ON public.spec_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Función helper para gates server-side ----------------------------------
CREATE OR REPLACE FUNCTION public.spec_tiene_evidencia_vigente(_spec_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.spec_documentos
    WHERE especificacion_id = _spec_id AND vigente = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.spec_tiene_evidencia_vigente(uuid)
  TO authenticated, service_role;

-- 6. Feature flag en app_settings -------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS spec_evidencia_obligatoria boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.spec_evidencia_obligatoria IS
  'Si true, bloquea Modificar/Agregar/Inactivar variables de una spec sin documento de evidencia vigente. Default false (activación gradual).';
