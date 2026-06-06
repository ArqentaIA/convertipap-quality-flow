
-- 1) Tighten roll-status authorization: only Calidad and Administrador may change status/dictamen.
--    Removes 'capturista' from can_change_roll_status; the existing
--    muestras_protect_status_cols_fn trigger will then reject direct
--    UPDATEs to estado/dictamen/* from capturistas via RLS as well.
CREATE OR REPLACE FUNCTION public.can_change_roll_status(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id,'calidad')
      OR public.has_role(_user_id,'administrador')
$$;

-- 2) Lock down SECURITY DEFINER helpers: revoke direct RPC access from
--    anon/authenticated. They remain callable from RLS policies and other
--    SECURITY DEFINER functions because PostgreSQL checks EXECUTE rights of
--    the function owner in that path, not the calling role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_module(uuid, app_module) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_module(uuid, app_module) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_change_roll_status(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_can_use_machine(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_allowed_machine_codes(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.muestras_protect_status_cols_fn() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

-- audit_action and change_roll_status are intentional RPC entry points,
-- but should never be callable anonymously. Allow authenticated only.
REVOKE EXECUTE ON FUNCTION public.audit_action(text, text, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.audit_action(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text) TO authenticated;

-- 3) Realtime channel authorization: restrict broadcast subscriptions on
--    operational tables. Capturistas keep their query-level scoping via
--    user_can_use_machine(); they do not need realtime fanout.
--    Only roles with full read access (admin/calidad/gerente/direccion)
--    can receive realtime payloads.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='realtime_subscribe_full_access_roles') THEN
    DROP POLICY "realtime_subscribe_full_access_roles" ON realtime.messages;
  END IF;
END$$;

CREATE POLICY "realtime_subscribe_full_access_roles"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'calidad')
  OR public.has_role(auth.uid(), 'gerente_general')
  OR public.has_role(auth.uid(), 'direccion')
);
