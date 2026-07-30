REVOKE EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) TO service_role;