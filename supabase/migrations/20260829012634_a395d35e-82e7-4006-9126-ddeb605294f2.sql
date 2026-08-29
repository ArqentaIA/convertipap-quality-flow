CREATE OR REPLACE FUNCTION public.validar_pesaje_bobina_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.peso_bruto_kg IS NULL OR NEW.peso_bruto_kg <= 300 OR NEW.peso_bruto_kg > 3000 THEN
    RAISE EXCEPTION 'PESO_INVALIDO: el peso bruto debe ser mayor a 300 y no exceder 3000 kg';
  END IF;
  IF NEW.peso_neto_kg IS NULL OR NEW.peso_neto_kg <= 0 OR NEW.peso_neto_kg > 3000 THEN
    RAISE EXCEPTION 'PESO_NETO_INVALIDO: el peso neto debe ser mayor a 0 y no exceder 3000 kg';
  END IF;
  IF NEW.evidencia_path IS NULL OR btrim(NEW.evidencia_path) = '' THEN
    RAISE EXCEPTION 'EVIDENCIA_REQUERIDA: el pesaje debe conservar una referencia de evidencia';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_pesaje_bobina ON public.pesajes_bobina_madre;
CREATE TRIGGER trg_validar_pesaje_bobina
BEFORE INSERT OR UPDATE OF peso_bruto_kg, peso_neto_kg, evidencia_path
ON public.pesajes_bobina_madre
FOR EACH ROW EXECUTE FUNCTION public.validar_pesaje_bobina_fn();

CREATE OR REPLACE FUNCTION public.validar_medicion_peso_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(btrim(NEW.variable_clave)) = 'peso' AND (NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 3000) THEN
    RAISE EXCEPTION 'PESO_CALIDAD_INVALIDO: el Peso del rollo debe ser mayor a 0 y no exceder 3000 kg; no se asignó ningún número';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_medicion_peso ON public.mediciones_calidad;
CREATE TRIGGER trg_validar_medicion_peso
BEFORE INSERT OR UPDATE OF variable_clave, valor
ON public.mediciones_calidad
FOR EACH ROW EXECUTE FUNCTION public.validar_medicion_peso_fn();