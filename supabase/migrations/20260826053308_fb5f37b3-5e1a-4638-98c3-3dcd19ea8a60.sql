ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS lote_logistico text;

ALTER TABLE public.muestras_calidad
  DROP CONSTRAINT IF EXISTS muestras_calidad_lote_logistico_chk;

ALTER TABLE public.muestras_calidad
  ADD CONSTRAINT muestras_calidad_lote_logistico_chk
  CHECK (lote_logistico IS NULL OR lote_logistico ~ '^[0-9]{9}$');

COMMENT ON COLUMN public.muestras_calidad.lote_logistico IS 'Lote Logístico (9 dígitos). Uso exclusivo Planta Ixtapaluca.';