REVOKE EXECUTE ON FUNCTION public.spec_tiene_evidencia_vigente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spec_tiene_evidencia_vigente(uuid) TO authenticated, service_role;