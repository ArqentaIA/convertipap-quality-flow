-- app_settings: lectura para usuarios autenticados (la usan dashboard, reportes y calidad
-- para costo de no calidad, horarios de turno y evidencia obligatoria);
-- escritura exclusiva de adgral@convertipap.site.
DROP POLICY IF EXISTS app_settings_adgral_all ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY app_settings_write_adgral ON public.app_settings
  FOR ALL TO authenticated
  USING (public.es_admin_config())
  WITH CHECK (public.es_admin_config());