-- Tighten write access on catalog tables to 'administrador' role only.
-- Reads remain open to all authenticated users.

DROP POLICY IF EXISTS cat_write_admin ON public.plantas;
CREATE POLICY cat_write_admin_only ON public.plantas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS cat_write_admin ON public.maquinas;
CREATE POLICY cat_write_admin_only ON public.maquinas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS cat_write_admin ON public.productos;
CREATE POLICY cat_write_admin_only ON public.productos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));
