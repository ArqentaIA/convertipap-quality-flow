CREATE OR REPLACE FUNCTION public.can_change_roll_status(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id,'calidad')
      OR public.has_role(_user_id,'administrador')
      OR public.has_role(_user_id,'capturista')
$function$;