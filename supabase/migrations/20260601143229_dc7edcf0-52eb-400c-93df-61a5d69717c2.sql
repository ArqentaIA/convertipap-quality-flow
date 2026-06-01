
-- =========================================================
-- FASE 3 — CATÁLOGOS
-- =========================================================

create type public.shift_code as enum ('1','2','3');
create type public.spec_status as enum ('borrador','vigente','obsoleta');

-- 1. PLANTAS
create table public.plantas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  nombre      text not null,
  ubicacion   text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. MAQUINAS
create table public.maquinas (
  id          uuid primary key default gen_random_uuid(),
  planta_id   uuid not null references public.plantas(id) on delete restrict,
  codigo      text not null,
  nombre      text not null,
  area        text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (planta_id, codigo)
);

-- 3. FAMILIAS_PRODUCTO
create table public.familias_producto (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4. TIPOS_PRODUCTO
create table public.tipos_producto (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid not null references public.familias_producto(id) on delete restrict,
  codigo      text not null,
  nombre      text not null,
  descripcion text,
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (familia_id, codigo)
);

-- 5. PRODUCTOS
create table public.productos (
  id          uuid primary key default gen_random_uuid(),
  tipo_id     uuid not null references public.tipos_producto(id) on delete restrict,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  capas       int,
  gramaje     numeric,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 6. VARIABLES_CALIDAD
create table public.variables_calidad (
  id                uuid primary key default gen_random_uuid(),
  clave             text not null unique,
  etiqueta          text not null,
  unidad            text,
  min_default       numeric,
  objetivo_default  numeric,
  max_default       numeric,
  orden             int not null default 0,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 7. PRODUCTO_ESPECIFICACIONES (versiones)
create table public.producto_especificaciones (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references public.productos(id) on delete cascade,
  version         text not null,
  estado          public.spec_status not null default 'borrador',
  vigente_desde   timestamptz,
  vigente_hasta   timestamptz,
  aprobado_por    uuid,
  aprobado_at     timestamptz,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (producto_id, version)
);

create unique index uq_spec_vigente_por_producto
  on public.producto_especificaciones(producto_id)
  where estado = 'vigente';

-- 8. PRODUCTO_VARIABLES (líneas de una versión)
create table public.producto_variables (
  id                uuid primary key default gen_random_uuid(),
  especificacion_id uuid not null references public.producto_especificaciones(id) on delete cascade,
  variable_id       uuid not null references public.variables_calidad(id) on delete restrict,
  min_valor         numeric not null,
  objetivo          numeric not null,
  max_valor         numeric not null,
  tolerancia        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (especificacion_id, variable_id),
  check (min_valor <= objetivo and objetivo <= max_valor)
);

-- 9. OPERARIOS
create table public.operarios (
  id          uuid primary key default gen_random_uuid(),
  planta_id   uuid references public.plantas(id) on delete set null,
  nombre      text not null,
  puesto      text,
  user_id     uuid,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 10. ROSTER_TURNOS
create table public.roster_turnos (
  id              uuid primary key default gen_random_uuid(),
  maquina_id      uuid not null references public.maquinas(id) on delete cascade,
  turno           public.shift_code not null,
  jefe_maquina_id uuid references public.operarios(id) on delete set null,
  operador_id     uuid references public.operarios(id) on delete set null,
  prensero_id     uuid references public.operarios(id) on delete set null,
  vigente_desde   date not null default current_date,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (maquina_id, turno, vigente_desde)
);

-- ÍNDICES
create index idx_maquinas_planta       on public.maquinas(planta_id)            where activo;
create index idx_tipos_familia         on public.tipos_producto(familia_id)     where activo;
create index idx_productos_tipo        on public.productos(tipo_id)             where activo;
create index idx_spec_producto         on public.producto_especificaciones(producto_id);
create index idx_prodvar_spec          on public.producto_variables(especificacion_id);
create index idx_prodvar_variable      on public.producto_variables(variable_id);
create index idx_operarios_planta      on public.operarios(planta_id)           where activo;
create index idx_roster_maquina_turno  on public.roster_turnos(maquina_id, turno) where activo;

-- GRANTS
grant select, insert, update, delete on
  public.plantas, public.maquinas,
  public.familias_producto, public.tipos_producto, public.productos,
  public.variables_calidad, public.producto_especificaciones, public.producto_variables,
  public.operarios, public.roster_turnos
  to authenticated;

grant all on
  public.plantas, public.maquinas,
  public.familias_producto, public.tipos_producto, public.productos,
  public.variables_calidad, public.producto_especificaciones, public.producto_variables,
  public.operarios, public.roster_turnos
  to service_role;

-- TRIGGERS updated_at
create trigger trg_plantas_updated      before update on public.plantas               for each row execute function public.set_updated_at();
create trigger trg_maquinas_updated     before update on public.maquinas              for each row execute function public.set_updated_at();
create trigger trg_familias_updated     before update on public.familias_producto     for each row execute function public.set_updated_at();
create trigger trg_tipos_updated        before update on public.tipos_producto        for each row execute function public.set_updated_at();
create trigger trg_productos_updated    before update on public.productos             for each row execute function public.set_updated_at();
create trigger trg_variables_updated    before update on public.variables_calidad     for each row execute function public.set_updated_at();
create trigger trg_spec_updated         before update on public.producto_especificaciones for each row execute function public.set_updated_at();
create trigger trg_prodvar_updated      before update on public.producto_variables    for each row execute function public.set_updated_at();
create trigger trg_operarios_updated    before update on public.operarios             for each row execute function public.set_updated_at();
create trigger trg_roster_updated       before update on public.roster_turnos         for each row execute function public.set_updated_at();

-- RLS
alter table public.plantas                   enable row level security;
alter table public.maquinas                  enable row level security;
alter table public.familias_producto         enable row level security;
alter table public.tipos_producto            enable row level security;
alter table public.productos                 enable row level security;
alter table public.variables_calidad         enable row level security;
alter table public.producto_especificaciones enable row level security;
alter table public.producto_variables        enable row level security;
alter table public.operarios                 enable row level security;
alter table public.roster_turnos             enable row level security;

-- READ todos autenticados
create policy "cat_read" on public.plantas                   for select to authenticated using (true);
create policy "cat_read" on public.maquinas                  for select to authenticated using (true);
create policy "cat_read" on public.familias_producto         for select to authenticated using (true);
create policy "cat_read" on public.tipos_producto            for select to authenticated using (true);
create policy "cat_read" on public.productos                 for select to authenticated using (true);
create policy "cat_read" on public.variables_calidad         for select to authenticated using (true);
create policy "cat_read" on public.producto_especificaciones for select to authenticated using (true);
create policy "cat_read" on public.producto_variables        for select to authenticated using (true);
create policy "cat_read" on public.operarios                 for select to authenticated using (true);
create policy "cat_read" on public.roster_turnos             for select to authenticated using (true);

-- WRITE administrador + gerente_general
create policy "cat_write_admin" on public.plantas for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.maquinas for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.familias_producto for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.tipos_producto for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.productos for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.variables_calidad for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.producto_especificaciones for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.producto_variables for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));
create policy "cat_write_admin" on public.operarios for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general'));

create policy "roster_write" on public.roster_turnos for all to authenticated
  using (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general') or has_role(auth.uid(),'direccion'))
  with check (has_role(auth.uid(),'administrador') or has_role(auth.uid(),'gerente_general') or has_role(auth.uid(),'direccion'));
