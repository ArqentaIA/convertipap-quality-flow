-- 1) Revocar EXECUTE a anon en funciones SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public._pc_require_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.buscar_contexto_rollo_cintas(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crear_lote_pesaje_cintas(text, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.anular_cinta(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.preparar_impresion_etiquetas(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_cinta(uuid, integer, numeric, numeric, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.corregir_cinta(uuid, integer, numeric, numeric, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.actualizar_datos_operativos_lote_cintas(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalizar_lote_cintas(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_maquina_access(text, text) FROM anon;

-- 2) muestras_calidad: dictamen/estatus solo vía autorización central
DROP POLICY IF EXISTS muestras_calidad_update_status_quality_only ON public.muestras_calidad;
CREATE POLICY muestras_calidad_update_status_quality_only
ON public.muestras_calidad
FOR UPDATE
TO authenticated
USING (public.user_can_use_machine(auth.uid(), maquina_id) AND public.can_change_roll_status(auth.uid()))
WITH CHECK (public.user_can_use_machine(auth.uid(), maquina_id));

-- 3) ordenes_produccion: negación explícita de DELETE
REVOKE DELETE ON public.ordenes_produccion FROM authenticated, anon;
DROP POLICY IF EXISTS ordenes_produccion_delete_denied ON public.ordenes_produccion;
CREATE POLICY ordenes_produccion_delete_denied
ON public.ordenes_produccion
FOR DELETE
TO authenticated
USING (false);

-- 4) pesajes_cintas: negación explícita de UPDATE y DELETE
REVOKE UPDATE, DELETE ON public.pesajes_cintas FROM authenticated, anon;
DROP POLICY IF EXISTS pesajes_cintas_update_denied ON public.pesajes_cintas;
CREATE POLICY pesajes_cintas_update_denied
ON public.pesajes_cintas
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS pesajes_cintas_delete_denied ON public.pesajes_cintas;
CREATE POLICY pesajes_cintas_delete_denied
ON public.pesajes_cintas
FOR DELETE
TO authenticated
USING (false);