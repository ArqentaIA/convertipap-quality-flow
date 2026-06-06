
-- Restore EXECUTE on RLS-helper functions. RLS predicates run as the calling
-- role, so authenticated MUST have EXECUTE on these or every policy that
-- references them silently evaluates to false / errors out, locking users
-- out of every module.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_module(uuid, app_module) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_module(uuid, app_module) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_change_roll_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_use_machine(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_allowed_machine_codes(uuid) TO authenticated;

-- Ensure Data API grants exist on every public table. Supabase requires
-- explicit GRANTs; without them PostgREST returns permission denied even
-- when RLS would allow the query. Loop covers all current and reinforces
-- after the recent migrations.
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END $$;

-- module_permissions / catalogs that need anon visibility for the login flow
-- and public lookups stay readable by anon.
GRANT SELECT ON public.module_permissions TO anon;
