-- Forzar capturado_at = now() en INSERT (ignora valor cliente) y bloquear cambios en UPDATE.
CREATE OR REPLACE FUNCTION public.muestras_enforce_capturado_at_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.capturado_at := now();
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.capturado_at IS DISTINCT FROM OLD.capturado_at THEN
      RAISE EXCEPTION 'capturado_at es inmutable y representa el reloj oficial del sistema.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muestras_enforce_capturado_at ON public.muestras_calidad;
CREATE TRIGGER muestras_enforce_capturado_at
BEFORE INSERT OR UPDATE ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_enforce_capturado_at_fn();