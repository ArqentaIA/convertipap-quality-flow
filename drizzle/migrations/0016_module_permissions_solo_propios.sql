DROP POLICY IF EXISTS modperm_read_all ON public.module_permissions;
DROP POLICY IF EXISTS modperm_admin_all ON public.module_permissions;
DROP POLICY IF EXISTS module_permissions_admin_write ON public.module_permissions;
CREATE POLICY modperm_read_own_roles ON public.module_permissions FOR SELECT TO authenticated
USING (public.es_admin_config() OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = module_permissions.role));
CREATE POLICY modperm_adgral_all ON public.module_permissions FOR ALL TO authenticated
USING (public.es_admin_config()) WITH CHECK (public.es_admin_config());