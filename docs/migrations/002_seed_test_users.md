# Fase 2 — Crear 6 usuarios de prueba (uno por rol)

Después de correr `001_auth_roles_profiles.sql`, da de alta los 6 usuarios de prueba.

## Paso 1 — Crear usuarios en Supabase Auth

Ve a **Supabase Dashboard → Authentication → Users → Add user → Create new user**.

Marca **"Auto Confirm User"** para los 6 (así no piden verificar email).

| # | Email                          | Password         | Rol         |
|---|--------------------------------|------------------|-------------|
| 1 | admin@convertipap.test         | `Admin123!`      | admin       |
| 2 | direccion@convertipap.test     | `Direccion123!`  | direccion   |
| 3 | supervisor@convertipap.test    | `Supervisor123!` | supervisor  |
| 4 | calidad@convertipap.test       | `Calidad123!`    | calidad     |
| 5 | operario@convertipap.test      | `Operario123!`   | operario    |
| 6 | viewer@convertipap.test        | `Viewer123!`     | viewer      |

> El trigger `on_auth_user_created` les creará automáticamente su fila en `public.profiles`.

## Paso 2 — Asignar rol a cada usuario

Ve a **SQL Editor → New query** y corre este bloque una sola vez:

```sql
-- Asigna rol a cada usuario de prueba.
-- Se apoya en el email para encontrar el user_id.
insert into public.user_roles (user_id, role)
select u.id, r.role::public.app_role
from auth.users u
join (values
  ('admin@convertipap.test',      'admin'),
  ('direccion@convertipap.test',  'direccion'),
  ('supervisor@convertipap.test', 'supervisor'),
  ('calidad@convertipap.test',    'calidad'),
  ('operario@convertipap.test',   'operario'),
  ('viewer@convertipap.test',     'viewer')
) as r(email, role) on r.email = u.email
on conflict (user_id, role) do nothing;
```

## Paso 3 — Verificar

```sql
select p.email, ur.role
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
order by p.email;
```

Debes ver 6 filas, una por usuario con su rol asignado.

---

## Tabla de permisos esperados (resumen, se aplicará en Fases 3-7)

| Pantalla          | admin | direccion | supervisor | calidad | operario | viewer |
|-------------------|-------|-----------|------------|---------|----------|--------|
| Producción        |  RW   |    R      |    RW      |   R     |   RW*    |   R    |
| Catálogos         |  RW   |    R      |    R       |   R     |   -      |   R    |
| Control calidad   |  RW   |    R      |    R       |   RW    |   R      |   R    |
| Usuarios          |  RW   |    R      |    -       |   -     |   -      |   -    |
| Configuración     |  RW   |    -      |    -       |   -     |   -      |   -    |
| Reportes          |  RW   |    RW     |    R       |   R     |   -      |   R    |

\* Operario: solo paros y captura básica, no edita órdenes.
