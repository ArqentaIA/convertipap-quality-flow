REVOKE ALL ON FUNCTION public.qc_editar_rollo(uuid, jsonb, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.qc_puede_editar_rollo(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.qc_editar_rollo(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qc_puede_editar_rollo(uuid) TO authenticated;