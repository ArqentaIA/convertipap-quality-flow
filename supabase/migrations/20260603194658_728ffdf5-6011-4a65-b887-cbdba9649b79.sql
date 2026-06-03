
DROP POLICY IF EXISTS "variables_calidad_write_quality_only" ON public.variables_calidad;

-- Read: any authenticated
DROP POLICY IF EXISTS "variables_calidad_read_all" ON public.variables_calidad;
CREATE POLICY "variables_calidad_read_all"
  ON public.variables_calidad FOR SELECT TO authenticated USING (true);

-- Write (insert/update/delete): only calidad/admin
CREATE POLICY "variables_calidad_insert_quality" ON public.variables_calidad
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'calidad'));
CREATE POLICY "variables_calidad_update_quality" ON public.variables_calidad
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'calidad'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'calidad'));
CREATE POLICY "variables_calidad_delete_quality" ON public.variables_calidad
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'calidad'));
