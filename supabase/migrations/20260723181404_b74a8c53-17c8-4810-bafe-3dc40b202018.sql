
-- 1) Tabla de pesajes
CREATE TABLE IF NOT EXISTS public.pesajes_bobina_madre (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_rollo TEXT NOT NULL,
  maquina_id UUID NOT NULL REFERENCES public.maquinas(id),
  maquina_codigo TEXT NOT NULL,
  orden_produccion_id UUID REFERENCES public.ordenes_produccion(id),
  numero_orden TEXT,
  peso_bruto_kg NUMERIC(10,2) NOT NULL CHECK (peso_bruto_kg > 300),
  peso_eje_kg NUMERIC(10,2) NOT NULL DEFAULT 300,
  peso_neto_kg NUMERIC(10,2) NOT NULL CHECK (peso_neto_kg > 0),
  fecha_hora_pesaje TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidencia_path TEXT NOT NULL,
  ocr_confianza NUMERIC(5,2),
  ocr_raw JSONB,
  capturado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pesajes_bobina_madre_rollo_maquina_uk
  ON public.pesajes_bobina_madre (maquina_id, numero_rollo);

CREATE INDEX IF NOT EXISTS pesajes_bobina_madre_orden_idx
  ON public.pesajes_bobina_madre (orden_produccion_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pesajes_bobina_madre TO authenticated;
GRANT ALL ON public.pesajes_bobina_madre TO service_role;

ALTER TABLE public.pesajes_bobina_madre ENABLE ROW LEVEL SECURITY;

-- Nuevo módulo de permisos
DO $$ BEGIN
  ALTER TYPE app_module ADD VALUE IF NOT EXISTS 'pesaje_bobina_madre';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
