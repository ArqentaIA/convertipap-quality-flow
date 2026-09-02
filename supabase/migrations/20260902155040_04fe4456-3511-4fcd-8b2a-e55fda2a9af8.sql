create table if not exists public.user_module_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module public.app_module not null,
  action text not null check (action in ('grant','deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module)
);

grant select on public.user_module_overrides to authenticated;
grant insert, update, delete on public.user_module_overrides to authenticated;
grant all on public.user_module_overrides to service_role;

alter table public.user_module_overrides enable row level security;

create policy umo_read on public.user_module_overrides
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'administrador'));

create policy umo_admin_write on public.user_module_overrides
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

drop trigger if exists set_updated_at on public.user_module_overrides;
create trigger set_updated_at before update on public.user_module_overrides
  for each row execute function public.set_updated_at();

create or replace function public.can_access_module(_user_id uuid, _module public.app_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case o.action when 'grant' then true when 'deny' then false end
      from public.user_module_overrides o
      where o.user_id = _user_id and o.module = _module
      limit 1
    ),
    exists (
      select 1
      from public.user_roles ur
      join public.module_permissions mp on mp.role = ur.role
      where ur.user_id = _user_id and mp.module = _module
    )
  );
$$;