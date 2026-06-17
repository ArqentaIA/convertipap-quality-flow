DROP POLICY IF EXISTS audit_log_select_admins ON public.audit_log;
CREATE POLICY audit_log_select_admins ON public.audit_log FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gerente_general'::app_role)
  OR has_role(auth.uid(), 'reportes_consulta'::app_role)
);