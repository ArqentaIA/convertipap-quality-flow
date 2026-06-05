ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS velocidad_maquina numeric(10,2),
  ADD COLUMN IF NOT EXISTS velocidad_enrollador numeric(10,2),
  ADD COLUMN IF NOT EXISTS crepado_pct numeric(6,2);