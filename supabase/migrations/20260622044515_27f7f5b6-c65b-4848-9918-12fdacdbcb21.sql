
ALTER TABLE public.producto_especificaciones
  ADD COLUMN IF NOT EXISTS borrador_de uuid REFERENCES public.producto_especificaciones(id),
  ADD COLUMN IF NOT EXISTS enviado_revision_por uuid,
  ADD COLUMN IF NOT EXISTS enviado_revision_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_por uuid,
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cambio text,
  ADD COLUMN IF NOT EXISTS descartado_por uuid,
  ADD COLUMN IF NOT EXISTS descartado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_descarte text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_esp_vigente
  ON public.producto_especificaciones (producto_id)
  WHERE estado = 'vigente';

CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_esp_borrador_activo
  ON public.producto_especificaciones (producto_id)
  WHERE estado IN ('borrador','en_revision');
