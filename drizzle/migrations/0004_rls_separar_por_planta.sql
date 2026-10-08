CREATE OR REPLACE FUNCTION public.user_sees_planta(_uid uuid, _planta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'administrador'::app_role)
      OR public.has_role(_uid,'gerente_general'::app_role)
      OR public.user_allowed_planta_ids(_uid) IS NULL
      OR _planta_id IS NULL
      OR _planta_id = ANY(public.user_allowed_planta_ids(_uid))
$$;
CREATE OR REPLACE FUNCTION public.user_sees_maquina(_uid uuid, _maquina_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _maquina_id IS NULL OR EXISTS (
    SELECT 1 FROM public.maquinas m WHERE m.id = _maquina_id
      AND (m.codigo = 'MP-10' OR public.user_sees_planta(_uid, m.planta_id)))
$$;
REVOKE EXECUTE ON FUNCTION public.user_sees_planta(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_sees_maquina(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_sees_planta(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_sees_maquina(uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS muestras_read_all ON public.muestras_calidad;
CREATE POLICY muestras_read_planta ON public.muestras_calidad FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));

DROP POLICY IF EXISTS mediciones_read_all ON public.mediciones_calidad;
CREATE POLICY mediciones_read_planta ON public.mediciones_calidad FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.muestras_calidad m WHERE m.id = muestra_id AND public.user_sees_maquina(auth.uid(), m.maquina_id)));

DROP POLICY IF EXISTS ajustes_read_all ON public.ajustes_calidad;
CREATE POLICY ajustes_read_planta ON public.ajustes_calidad FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));

DROP POLICY IF EXISTS mea_read ON public.maquina_estado_actual;
CREATE POLICY mea_read_planta ON public.maquina_estado_actual FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));

DROP POLICY IF EXISTS numeracion_rollos_select_auth ON public.numeracion_rollos;
CREATE POLICY numeracion_rollos_select_planta ON public.numeracion_rollos FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
    AND tablename IN ('ordenes_fabricacion','paros_maquina','roster_turnos','operarios','spec_audit_log') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
CREATE POLICY of_read_planta ON public.ordenes_fabricacion FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));
CREATE POLICY paros_read_planta ON public.paros_maquina FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));
CREATE POLICY roster_read_planta ON public.roster_turnos FOR SELECT TO authenticated
  USING (public.user_sees_maquina(auth.uid(), maquina_id));
CREATE POLICY operarios_read_planta ON public.operarios FOR SELECT TO authenticated
  USING (public.user_sees_planta(auth.uid(), planta_id));
CREATE POLICY spec_audit_read_planta ON public.spec_audit_log FOR SELECT TO authenticated
  USING (public.user_sees_planta(auth.uid(), planta_id));