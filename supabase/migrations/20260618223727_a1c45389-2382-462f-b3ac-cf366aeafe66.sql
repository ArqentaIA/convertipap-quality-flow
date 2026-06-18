ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS fuera_de_turno boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuera_de_turno_motivo text;

CREATE INDEX IF NOT EXISTS idx_muestras_fuera_de_turno
  ON public.muestras_calidad (fuera_de_turno)
  WHERE fuera_de_turno = true;

COMMENT ON COLUMN public.muestras_calidad.fuera_de_turno IS
  'Marca registros capturados desde el módulo "Captura fuera de turno" (retroactivos). Estos registros se excluyen de las pantallas de visores operativos.';
COMMENT ON COLUMN public.muestras_calidad.fuera_de_turno_motivo IS
  'Motivo / justificación obligatoria cuando fuera_de_turno = true.';