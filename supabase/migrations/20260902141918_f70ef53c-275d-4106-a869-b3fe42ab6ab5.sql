BEGIN;

DROP POLICY IF EXISTS cat_write_admin_only ON public.maquinas;

CREATE POLICY cat_insert_admin_only ON public.maquinas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY cat_update_admin_only ON public.maquinas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY cat_delete_admin_only ON public.maquinas
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

COMMIT;