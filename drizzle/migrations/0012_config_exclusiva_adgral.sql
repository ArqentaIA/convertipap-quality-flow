-- Configuración, códigos de acceso y destinatarios de reportes: acceso exclusivo de adgral@convertipap.site
CREATE OR REPLACE FUNCTION public.es_admin_config()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = '252b6899-62c6-4096-9851-084214cdcce7'::uuid
$$;

-- app_settings: lectura y escritura solo para adgral@
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
DROP POLICY IF EXISTS app_settings_write_admin ON public.app_settings;
CREATE POLICY app_settings_adgral_all ON public.app_settings
  FOR ALL TO authenticated
  USING (public.es_admin_config())
  WITH CHECK (public.es_admin_config());

-- maquina_access_codes: solo adgral@
DROP POLICY IF EXISTS mac_admin_all ON public.maquina_access_codes;
CREATE POLICY mac_adgral_all ON public.maquina_access_codes
  FOR ALL TO authenticated
  USING (public.es_admin_config())
  WITH CHECK (public.es_admin_config());

-- monitor_access_codes: solo adgral@
DROP POLICY IF EXISTS moc_admin_all ON public.monitor_access_codes;
CREATE POLICY moc_adgral_all ON public.monitor_access_codes
  FOR ALL TO authenticated
  USING (public.es_admin_config())
  WITH CHECK (public.es_admin_config());

-- reporte_turno_destinatarios: solo adgral@
DROP POLICY IF EXISTS rtd_admin_write ON public.reporte_turno_destinatarios;
DROP POLICY IF EXISTS rtd_select_admin ON public.reporte_turno_destinatarios;
CREATE POLICY rtd_adgral_all ON public.reporte_turno_destinatarios
  FOR ALL TO authenticated
  USING (public.es_admin_config())
  WITH CHECK (public.es_admin_config());