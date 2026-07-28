-- Grants a authenticated (RLS + RPCs SECURITY DEFINER siguen protegiendo)
GRANT SELECT ON public.pesajes_cintas_lotes TO authenticated;
GRANT SELECT ON public.pesajes_cintas TO authenticated;
GRANT SELECT ON public.pesajes_cintas_auditoria TO authenticated;
GRANT SELECT ON public.impresiones_etiquetas_cintas TO authenticated;
GRANT SELECT ON public.catalogo_bobinadoras TO authenticated;

-- service_role completo
GRANT ALL ON public.pesajes_cintas_lotes TO service_role;
GRANT ALL ON public.pesajes_cintas TO service_role;
GRANT ALL ON public.pesajes_cintas_auditoria TO service_role;
GRANT ALL ON public.impresiones_etiquetas_cintas TO service_role;
GRANT ALL ON public.catalogo_bobinadoras TO service_role;

-- EXECUTE en RPCs
GRANT EXECUTE ON FUNCTION public.buscar_contexto_rollo_cintas(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_lote_pesaje_cintas(text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cinta(uuid, integer, numeric, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_cinta(uuid, integer, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_cinta(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_lote_cintas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_impresion_etiquetas(uuid, text) TO authenticated;