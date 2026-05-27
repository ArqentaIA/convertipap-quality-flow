-- =====================================================================
-- Fase 2 — Auth, Roles y Profiles
-- Proyecto Supabase: wmlirxpzfrdwbtljdaae
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Idempotente: se puede correr varias veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENUM de roles de la app
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'admin',       -- acceso total, configuración
      'direccion',   -- visibilidad estratégica + reportes
      'supervisor',  -- producción / paros / asignación de roster
      'calidad',     -- registros y mediciones de calidad
      'operario',    -- captura básica en piso
      'viewer'       -- solo lectura
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. Tabla profiles (1 a 1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text,
  avatar_url  text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'direccion')
);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Tabla user_roles (1 usuario → N roles)
-- ---------------------------------------------------------------------
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

drop policy if exists "user_roles_select_self_or_admin" on public.user_roles;
create policy "user_roles_select_self_or_admin"
on public.user_roles for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
);

-- ---------------------------------------------------------------------
-- 4. has_role() — SECURITY DEFINER (evita recursión RLS)
--    Se crea ANTES de las políticas que la usan; recreate-or-replace.
-- ---------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Trigger: cuando se crea un usuario en auth.users → crear profile
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. Trigger updated_at en profiles
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- FIN Fase 2
-- =====================================================================
