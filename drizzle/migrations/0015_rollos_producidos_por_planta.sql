DROP POLICY IF EXISTS rollos_read ON public.rollos_producidos;
CREATE POLICY rollos_read ON public.rollos_producidos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.ordenes_fabricacion o WHERE o.id = rollos_producidos.orden_id AND public.user_sees_maquina(auth.uid(), o.maquina_id)));