
-- =====================================================================
-- Fase 2 — Auth, Roles, Profiles, Module Permissions
-- =====================================================================

-- 1. Enum de roles
drop type if exists public.app_role cascade;
create type public.app_role as enum (
  'administrador',
  'gerente_general',
  'direccion',
  'calidad',
  'capturista'
);

-- 2. Enum de módulos
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_module') then
    create type public.app_module as enum (
      'dashboard',
      'produccion',
      'control_calidad',
      'variables_calidad',
      'reportes',
      'configuracion',
      'usuarios_permisos'
    );
  end if;
end $$;

-- 3. profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nombre      text not null,
  rol_visible text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, rol_visible)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'rol_visible'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. user_roles
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- 5. module_permissions
create table if not exists public.module_permissions (
  role    public.app_role   not null,
  module  public.app_module not null,
  primary key (role, module)
);
grant select on public.module_permissions to authenticated;
grant all on public.module_permissions to service_role;
alter table public.module_permissions enable row level security;

insert into public.module_permissions (role, module) values
  ('administrador','dashboard'),
  ('administrador','produccion'),
  ('administrador','control_calidad'),
  ('administrador','variables_calidad'),
  ('administrador','reportes'),
  ('administrador','configuracion'),
  ('administrador','usuarios_permisos'),
  ('gerente_general','dashboard'),
  ('gerente_general','produccion'),
  ('gerente_general','control_calidad'),
  ('gerente_general','variables_calidad'),
  ('gerente_general','reportes'),
  ('gerente_general','configuracion'),
  ('gerente_general','usuarios_permisos'),
  ('direccion','dashboard'),
  ('direccion','reportes'),
  ('direccion','variables_calidad'),
  ('direccion','produccion'),
  ('calidad','dashboard'),
  ('calidad','reportes'),
  ('calidad','variables_calidad'),
  ('calidad','produccion'),
  ('calidad','control_calidad'),
  ('capturista','control_calidad')
on conflict do nothing;

create or replace function public.can_access_module(_user_id uuid, _module public.app_module)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.module_permissions mp on mp.role = ur.role
    where ur.user_id = _user_id and mp.module = _module
  )
$$;
grant execute on function public.can_access_module(uuid, public.app_module) to authenticated, service_role;

-- 6. RLS Policies

-- profiles
create policy "profiles_select_self_or_admin"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.has_role(auth.uid(),'administrador')
  or public.has_role(auth.uid(),'gerente_general')
);

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_admin_all"
on public.profiles for all to authenticated
using (public.has_role(auth.uid(),'administrador'))
with check (public.has_role(auth.uid(),'administrador'));

-- user_roles
create policy "user_roles_select_self_or_admin"
on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'administrador'));

create policy "user_roles_admin_all"
on public.user_roles for all to authenticated
using (public.has_role(auth.uid(),'administrador'))
with check (public.has_role(auth.uid(),'administrador'));

-- module_permissions
create policy "modperm_read_all"
on public.module_permissions for select to authenticated
using (true);

create policy "modperm_admin_all"
on public.module_permissions for all to authenticated
using (public.has_role(auth.uid(),'administrador'))
with check (public.has_role(auth.uid(),'administrador'));
