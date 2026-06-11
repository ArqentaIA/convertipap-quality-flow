
-- 1) New text column on producto_especificaciones (max 700 chars)
ALTER TABLE public.producto_especificaciones
  ADD COLUMN IF NOT EXISTS caracteristicas_atributos text;

ALTER TABLE public.producto_especificaciones
  DROP CONSTRAINT IF EXISTS producto_especificaciones_caracteristicas_len_chk;
ALTER TABLE public.producto_especificaciones
  ADD CONSTRAINT producto_especificaciones_caracteristicas_len_chk
  CHECK (caracteristicas_atributos IS NULL OR char_length(caracteristicas_atributos) <= 700);

-- 2) Extend audit enum and table to support text-valued audits
ALTER TYPE public.qc_spec_audit_field ADD VALUE IF NOT EXISTS 'caracteristicas';

ALTER TABLE public.spec_audit_log
  ADD COLUMN IF NOT EXISTS valor_anterior_texto text,
  ADD COLUMN IF NOT EXISTS valor_nuevo_texto text;
