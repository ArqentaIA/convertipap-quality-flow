ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS defecto_visual_conversion text,
  ADD COLUMN IF NOT EXISTS variable_tecnica_dimensional text,
  ADD COLUMN IF NOT EXISTS criterio_defecto text;

ALTER TABLE public.muestras_calidad
  DROP CONSTRAINT IF EXISTS muestras_calidad_criterio_defecto_chk;

ALTER TABLE public.muestras_calidad
  ADD CONSTRAINT muestras_calidad_criterio_defecto_chk
  CHECK (criterio_defecto IS NULL OR criterio_defecto IN ('MENOR','MAYOR','CRÍTICO'));