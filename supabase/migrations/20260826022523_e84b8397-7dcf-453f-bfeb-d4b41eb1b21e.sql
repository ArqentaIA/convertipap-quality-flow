ALTER FUNCTION public.estado_numeracion_rollo(uuid) SECURITY INVOKER;

GRANT SELECT ON public.numeracion_rollos TO authenticated;
REVOKE ALL ON FUNCTION public.estado_numeracion_rollo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_numeracion_rollo(uuid) TO authenticated, service_role;