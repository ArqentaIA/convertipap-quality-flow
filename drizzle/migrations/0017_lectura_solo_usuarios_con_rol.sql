CREATE OR REPLACE FUNCTION public.tiene_rol_asignado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.tiene_rol_asignado() TO authenticated;

DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated USING (public.tiene_rol_asignado());

DROP POLICY IF EXISTS "lectura autenticada perfil-maquina" ON public.producto_especificacion_maquinas;
CREATE POLICY "lectura autenticada perfil-maquina" ON public.producto_especificacion_maquinas FOR SELECT TO authenticated USING (public.tiene_rol_asignado());

DROP POLICY IF EXISTS cat_read ON public.variables_calidad;
DROP POLICY IF EXISTS variables_calidad_read_all ON public.variables_calidad;
CREATE POLICY variables_calidad_read_all ON public.variables_calidad FOR SELECT TO authenticated USING (public.tiene_rol_asignado());