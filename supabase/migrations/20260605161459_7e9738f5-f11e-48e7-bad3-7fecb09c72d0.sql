ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS porcentaje_rupturas_pct numeric(5,2) NULL
    CHECK (porcentaje_rupturas_pct IS NULL OR (porcentaje_rupturas_pct >= 0 AND porcentaje_rupturas_pct <= 100)),
  ADD COLUMN IF NOT EXISTS destino text NULL
    CHECK (destino IS NULL OR length(destino) <= 200);