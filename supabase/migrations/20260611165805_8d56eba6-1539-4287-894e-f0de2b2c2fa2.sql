
CREATE OR REPLACE FUNCTION public.user_allowed_machine_codes(_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_capt boolean;
  v_sees_all boolean;
BEGIN
  v_sees_all := public.has_role(_user_id,'administrador')
             OR public.has_role(_user_id,'gerente_general')
             OR public.has_role(_user_id,'direccion')
             OR public.has_role(_user_id,'calidad');
  IF v_sees_all THEN
    RETURN NULL; -- NULL = todas
  END IF;

  v_is_capt := public.has_role(_user_id,'capturista');
  IF v_is_capt THEN
    -- Capturistas: acceso a las 4 máquinas de producción
    RETURN ARRAY['MP-04','MP-05','MP-06','MP-07'];
  END IF;

  RETURN ARRAY[]::text[];
END $function$;
