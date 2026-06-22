ALTER TABLE public.maquinas ADD COLUMN IF NOT EXISTS access_code text;

UPDATE public.maquinas SET access_code = '0404' WHERE codigo = 'MP-04' AND access_code IS NULL;
UPDATE public.maquinas SET access_code = '0505' WHERE codigo = 'MP-05' AND access_code IS NULL;
UPDATE public.maquinas SET access_code = '0606' WHERE codigo = 'MP-06' AND access_code IS NULL;
UPDATE public.maquinas SET access_code = '0707' WHERE codigo = 'MP-07' AND access_code IS NULL;

CREATE OR REPLACE FUNCTION public.validate_maquina_access(_codigo text, _pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.maquinas
    WHERE codigo = _codigo
      AND activo = true
      AND access_code IS NOT NULL
      AND access_code = _pin
  );
$$;

REVOKE ALL ON FUNCTION public.validate_maquina_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_maquina_access(text, text) TO anon, authenticated;