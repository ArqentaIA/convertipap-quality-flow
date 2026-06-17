ALTER TABLE public._excepciones_sufijo_numero_rollo
  ADD COLUMN IF NOT EXISTS estatus_revision text NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  ADD COLUMN IF NOT EXISTS motivo_revision  text,
  ADD COLUMN IF NOT EXISTS revisado_por     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revisado_at      timestamptz;

UPDATE public._excepciones_sufijo_numero_rollo
   SET estatus_revision = 'PENDIENTE_VALIDACION',
       motivo_revision  = 'Colisión de numero_rollo'
 WHERE motivo_revision IS NULL;