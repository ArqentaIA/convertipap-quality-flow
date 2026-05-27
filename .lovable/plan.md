## Objetivo

Añadir persistencia real (Lovable Cloud / Supabase) a la app **ConvertiPap** sin romper ninguna pantalla actual (`/produccion`, `/control-calidad`, `/catalogos`, `/configuracion`, `/usuarios`, `/reportes`, `/historial/:maquina`).

## Principio rector

**No reemplazar nada de golpe.** La app hoy funciona contra estado local / mocks. Vamos a añadir backend en capas, manteniendo los componentes existentes intactos hasta que cada tabla esté lista y probada.

---

## Fase 0 — Decisión de backend (bloqueante)

Antes de tocar SQL, fijar UNA opción:

- **A. Lovable Cloud (recomendado):** activar con un click, integra auth, storage, server functions y RLS. Migrar después a tu cuenta `wmlirxpzfrdwbtljdaae` es posible exportando el schema.
- **B. Tu Supabase propio (`wmlirxpzfrdwbtljdaae`):** guardamos credenciales en secretos con nombres NO reservados (`MY_SUPABASE_URL`, etc.) y creamos un cliente manual. Pierdes integraciones automáticas.

→ **Necesito que elijas A o B antes de continuar.**

---

## Fase 1 — Inventario de datos (sin tocar código)

Recorrer cada ruta y listar qué entidades necesita persistir. Borrador inicial:

| Módulo | Entidad | Notas |
|---|---|---|
| Catálogos | `maquinas`, `productos`, `clientes`, `operarios`, `tipos_papel` | Datos maestros |
| Producción | `ordenes_produccion`, `produccion_eventos` | Registro por turno/máquina |
| Control Calidad | `inspecciones`, `defectos`, `inspeccion_defectos` | Ligado a orden |
| Historial | (vistas sobre producción + calidad) | Solo lectura |
| Reportes | (agregados SQL) | Solo lectura |
| Usuarios | `profiles`, `user_roles` (enum `app_role`) | Auth + roles |
| Configuración | `app_settings` (key/value por usuario u org) | Opcional |

Entregable: documento `docs/data-model.md` con tablas, columnas, FKs y qué módulo las consume. **No se crea aún ninguna tabla.**

---

## Fase 2 — Esquema base + seguridad

Migración SQL única que crea:

1. `profiles` (id = auth.uid()) + trigger `handle_new_user`.
2. Enum `app_role` (`admin`, `supervisor`, `operario`) + tabla `user_roles` + función `has_role()` security-definer.
3. RLS habilitado en todas las tablas + GRANTs explícitos (`authenticated`, `service_role`).

Sin esto, ninguna otra tabla puede existir de forma segura.

---

## Fase 3 — Catálogos (primera migración funcional)

- Crear tablas maestras (`maquinas`, `productos`, `clientes`, `tipos_papel`, `operarios`).
- RLS: lectura para `authenticated`, escritura solo `admin`/`supervisor`.
- Crear server functions (`*.functions.ts`) para listar/crear/editar/eliminar.
- En la UI de `/catalogos`: añadir un **toggle/feature flag** que use server fns si la tabla existe, o el mock actual si no. Así nada se rompe.
- Validar visualmente que `/catalogos` sigue funcionando.

---

## Fase 4 — Producción

- Tablas `ordenes_produccion`, `produccion_eventos` con FKs a catálogos.
- Server functions con `requireSupabaseAuth`.
- Migrar `/produccion` componente a usar `useQuery` + server fn.
- `/historial/:maquina` pasa a leer de la BD.

---

## Fase 5 — Control de calidad

- Tablas `inspecciones`, `defectos`, `inspeccion_defectos`.
- Server functions + UI conectada.
- `/control-calidad` migrado.

---

## Fase 6 — Reportes y configuración

- Vistas SQL o RPCs agregadas para `/reportes`.
- Tabla `app_settings` para `/configuracion`.

---

## Fase 7 — Auth real

- Página `/login` (email+password) + protección con layout `_authenticated`.
- `/usuarios` conectado a `profiles` + `user_roles`.

---

## Reglas para no romper nada

1. **Una migración = una fase.** Nunca mezclar tablas de fases distintas.
2. **Nunca eliminar mocks** hasta que la pantalla equivalente esté probada con BD.
3. **Cada nueva tabla** lleva en la misma migración: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY`.
4. **Cada server fn protegida** se llama desde componente (no desde loader público) para no romper el prerender.
5. Después de cada fase: revisar `/produccion` y rutas previas siguen funcionando antes de pasar a la siguiente.

---

## Próximo paso que necesito de ti

1. Elige **A (Lovable Cloud)** o **B (tu Supabase)**.
2. Confirma o ajusta la tabla de entidades de la **Fase 1**.

Con eso arranco por la Fase 2 (esquema base + auth/roles) sin tocar todavía ninguna pantalla.
