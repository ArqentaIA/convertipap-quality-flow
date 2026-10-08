CREATE OR REPLACE FUNCTION public.puede_ver_modulo_variables()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_admin_config() OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND lower(p.email) IN ('gcalidad@convertipap.site','msramosixt@convertipap.site'));
$$;
GRANT EXECUTE ON FUNCTION public.puede_ver_modulo_variables() TO authenticated;
DROP POLICY IF EXISTS spec_documentos_select_authenticated ON public.spec_documentos;
DROP POLICY IF EXISTS spec_documentos_insert_calidad_admin ON public.spec_documentos;
DROP POLICY IF EXISTS spec_documentos_update_calidad_admin ON public.spec_documentos;
CREATE POLICY spec_documentos_select_exclusivo ON public.spec_documentos FOR SELECT TO authenticated USING (public.puede_ver_modulo_variables());
CREATE POLICY spec_documentos_insert_exclusivo ON public.spec_documentos FOR INSERT TO authenticated WITH CHECK (public.puede_ver_modulo_variables());
CREATE POLICY spec_documentos_update_exclusivo ON public.spec_documentos FOR UPDATE TO authenticated USING (public.puede_ver_modulo_variables()) WITH CHECK (public.puede_ver_modulo_variables());