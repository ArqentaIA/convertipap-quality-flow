
-- Secuencia global de captura para muestras_calidad
CREATE SEQUENCE IF NOT EXISTS public.muestras_calidad_secuencia_seq;

ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS secuencia_captura BIGINT;

-- Backfill respetando el orden real de captura existente
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY capturado_at ASC, created_at ASC, id ASC) AS rn
  FROM public.muestras_calidad
  WHERE secuencia_captura IS NULL
)
UPDATE public.muestras_calidad m
   SET secuencia_captura = o.rn
  FROM ordered o
 WHERE m.id = o.id;

-- Avanzar la secuencia para que los próximos INSERT sigan al backfill
SELECT setval(
  'public.muestras_calidad_secuencia_seq',
  GREATEST(COALESCE((SELECT MAX(secuencia_captura) FROM public.muestras_calidad), 0), 1),
  true
);

-- Default desde la secuencia (asignado SOLO por la base)
ALTER TABLE public.muestras_calidad
  ALTER COLUMN secuencia_captura SET DEFAULT nextval('public.muestras_calidad_secuencia_seq');

ALTER SEQUENCE public.muestras_calidad_secuencia_seq OWNED BY public.muestras_calidad.secuencia_captura;

ALTER TABLE public.muestras_calidad
  ALTER COLUMN secuencia_captura SET NOT NULL;

-- Unicidad
CREATE UNIQUE INDEX IF NOT EXISTS muestras_calidad_secuencia_captura_uidx
  ON public.muestras_calidad(secuencia_captura);

-- Índice para ordenar listados en DESC
CREATE INDEX IF NOT EXISTS muestras_calidad_secuencia_captura_desc_idx
  ON public.muestras_calidad(secuencia_captura DESC);

-- Trigger que impide alterar la secuencia desde el cliente (incluye INSERT con valor explícito)
CREATE OR REPLACE FUNCTION public.muestras_protect_secuencia_captura_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Forzar siempre el valor desde la secuencia, ignorando cualquier input
    NEW.secuencia_captura := nextval('public.muestras_calidad_secuencia_seq');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.secuencia_captura IS DISTINCT FROM OLD.secuencia_captura THEN
      RAISE EXCEPTION 'secuencia_captura es inmutable y solo la base de datos puede asignarla.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.muestras_protect_secuencia_captura_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS muestras_protect_secuencia_captura_trg ON public.muestras_calidad;
CREATE TRIGGER muestras_protect_secuencia_captura_trg
  BEFORE INSERT OR UPDATE ON public.muestras_calidad
  FOR EACH ROW
  EXECUTE FUNCTION public.muestras_protect_secuencia_captura_fn();
