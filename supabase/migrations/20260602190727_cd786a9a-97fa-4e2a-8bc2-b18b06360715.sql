-- 1) profiles.laboratorio (norte/sur), nullable porque sólo aplica a capturistas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS laboratorio text
    CHECK (laboratorio IN ('norte','sur'));

-- 2) Permitir muestras sin orden previa
ALTER TABLE public.muestras_calidad
  ALTER COLUMN orden_id DROP NOT NULL;