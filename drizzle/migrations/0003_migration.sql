DROP POLICY IF EXISTS "qc_edicion_permisos_select" ON public.qc_edicion_permisos;
CREATE POLICY "qc_edicion_permisos_select_own_or_admin" ON public.qc_edicion_permisos
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email','')) OR public.has_role(auth.uid(),'administrador'::app_role));

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='qc_ediciones_rollo' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.qc_ediciones_rollo', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "qc_ediciones_rollo_select_scoped" ON public.qc_ediciones_rollo
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gerente_general'::app_role)
    OR EXISTS (SELECT 1 FROM public.muestras_calidad m
               WHERE m.id = qc_ediciones_rollo.muestra_id
                 AND public.user_can_use_machine(auth.uid(), m.maquina_id))
  );

DROP POLICY IF EXISTS "rtd_select_auth" ON public.reporte_turno_destinatarios;
CREATE POLICY "rtd_select_admin" ON public.reporte_turno_destinatarios
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role));

DROP POLICY IF EXISTS "spec_docs_storage_select_authenticated" ON storage.objects;
CREATE POLICY "spec_docs_storage_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'spec-documentos' AND (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gerente_general'::app_role)
    OR public.has_role(auth.uid(),'calidad'::app_role)
    OR public.can_access_module(auth.uid(),'control_calidad'::app_module)));