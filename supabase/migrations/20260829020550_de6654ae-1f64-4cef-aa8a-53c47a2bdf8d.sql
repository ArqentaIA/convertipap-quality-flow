CREATE OR REPLACE FUNCTION public.validar_pesaje_bobina_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.peso_bruto_kg IS NULL OR NEW.peso_bruto_kg <= 300 OR NEW.peso_bruto_kg > 5000 THEN
    RAISE EXCEPTION 'PESO_INVALIDO: el peso bruto debe ser mayor a 300 y no exceder 5000 kg';
  END IF;
  IF NEW.peso_neto_kg IS NULL OR NEW.peso_neto_kg <= 0 OR NEW.peso_neto_kg > 5000 THEN
    RAISE EXCEPTION 'PESO_NETO_INVALIDO: el peso neto debe ser mayor a 0 y no exceder 5000 kg';
  END IF;
  IF NEW.evidencia_path IS NULL OR btrim(NEW.evidencia_path) = '' THEN
    RAISE EXCEPTION 'EVIDENCIA_REQUERIDA: el pesaje debe conservar una referencia de evidencia';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_medicion_peso_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(btrim(NEW.variable_clave)) = 'peso' AND (NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 5000) THEN
    RAISE EXCEPTION 'PESO_CALIDAD_INVALIDO: el Peso del rollo debe ser mayor a 0 y no exceder 5000 kg; no se asignó ningún número';
  END IF;
  RETURN NEW;
END;
$function$;