REVOKE ALL ON FUNCTION public.pc_get_or_create_rollo(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.pc_bajadas_rollo(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.cerrar_rollo_cintas(text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.registrar_cinta_v2(uuid, integer, numeric, numeric, text, text, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.pc_bajadas_rollo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_rollo_cintas(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cinta_v2(uuid, integer, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pc_get_or_create_rollo(text) TO service_role;