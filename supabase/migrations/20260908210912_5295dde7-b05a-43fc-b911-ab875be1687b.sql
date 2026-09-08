ALTER TABLE public.pesajes_bobina_madre
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS peso_bruto_anterior_kg numeric,
  ADD COLUMN IF NOT EXISTS peso_neto_anterior_kg numeric,
  ADD COLUMN IF NOT EXISTS correccion_motivo text,
  ADD COLUMN IF NOT EXISTS corregido_por uuid,
  ADD COLUMN IF NOT EXISTS corregido_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pesajes_bobina_madre_anulado
  ON public.pesajes_bobina_madre (anulado);

-- Anulación lógica (no se borran registros, no se reutilizan números)
ALTER TABLE public.pesajes_bobina_madre DISABLE TRIGGER USER;

UPDATE public.pesajes_bobina_madre
SET anulado = true,
    anulado_motivo = 'Solicitud de corrección operativa MP-01 (08-sep-2026): registro retirado por captura errónea. No se reutiliza el número de rollo.',
    anulado_por = '252b6899-62c6-4096-9851-084214cdcce7',
    anulado_at = now(),
    updated_at = now()
WHERE numero_rollo IN ('00099-1','00106-1','00107-1')
  AND maquina_codigo = 'MP-01';

-- Corrección de pesos: se elimina el descuento de tara de 300 kg
UPDATE public.pesajes_bobina_madre
SET peso_bruto_anterior_kg = peso_bruto_kg,
    peso_neto_anterior_kg  = peso_neto_kg,
    peso_eje_kg            = 0,
    peso_neto_kg           = peso_bruto_kg,
    correccion_motivo      = 'Corrección autorizada MP-01 (08-sep-2026): el peso capturado ya era neto; se retira el descuento de 300 kg de tara.',
    corregido_por          = '252b6899-62c6-4096-9851-084214cdcce7',
    corregido_at           = now(),
    updated_at             = now()
WHERE numero_rollo IN ('00108-1','00109-1','00110-1','00111-1','00112-1')
  AND maquina_codigo = 'MP-01'
  AND anulado = false;

ALTER TABLE public.pesajes_bobina_madre ENABLE TRIGGER USER;