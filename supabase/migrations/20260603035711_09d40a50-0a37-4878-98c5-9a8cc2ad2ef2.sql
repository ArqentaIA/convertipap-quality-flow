
-- Replace permissive INSERT policy with a restrictive one (triggers/audit_action are SECURITY DEFINER and bypass RLS)
DROP POLICY IF EXISTS audit_log_insert_authenticated ON public.audit_log;
CREATE POLICY audit_log_insert_admins ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));

-- Lock down trigger function from API
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM authenticated;
