DROP INDEX IF EXISTS public.muestras_calidad_numero_rollo_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS muestras_calidad_planta_maquina_rollo_uidx
  ON public.muestras_calidad (planta_id, maquina_id, numero_rollo)
  WHERE numero_rollo IS NOT NULL;