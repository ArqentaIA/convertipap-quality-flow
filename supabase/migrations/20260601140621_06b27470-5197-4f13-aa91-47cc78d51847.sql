
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.can_access_module(uuid, public.app_module) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.can_access_module(uuid, public.app_module) to authenticated, service_role;
