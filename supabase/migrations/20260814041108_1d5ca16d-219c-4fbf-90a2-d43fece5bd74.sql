REVOKE ALL ON FUNCTION public.asignar_numero_rollo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estado_numeracion_rollo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_numero_rollo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estado_numeracion_rollo(uuid) TO authenticated, service_role;