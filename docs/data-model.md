# ConvertiPap · Modelo de datos (Fase 1)

> Documento **de diseño**. Aún no se crea ninguna tabla. Lo usamos para alinear
> antes de la Fase 2 (esquema base + auth/roles).

---

## 1. Convenciones

- Esquema único: `public`.
- Claves primarias `uuid` con `gen_random_uuid()` salvo catálogos cortos.
- Toda tabla con datos de operación lleva: `created_at timestamptz default now()`,
  `updated_at timestamptz default now()`, `created_by uuid references auth.users`.
- Roles en enum `app_role`: `admin`, `direccion`, `supervisor`, `analista`,
  `jefe_maquina`, `operador`. (Reproduce los 5 de `usuarios.tsx` + `direccion`
  para cubrir el permiso de edición del roster.)
- RLS **siempre habilitado**. Lectura para `authenticated`, escritura restringida
  por rol con `public.has_role()`.

---

## 2. Auth y seguridad (Fase 2)

| Tabla | Propósito | Origen actual en código |
|---|---|---|
| `auth.users` | Gestionada por Supabase Auth | — |
| `public.profiles` | Datos extendidos del usuario (nombre, planta) | mock `USUARIOS` en `usuarios.tsx` |
| `public.user_roles` | Rol por usuario (`app_role`) | mock `USUARIOS.rol` |
| Función `public.has_role(uuid, app_role)` | Security-definer para RLS | — |
| Trigger `on_auth_user_created` | Crea fila en `profiles` automáticamente | — |

### `profiles`
```
id              uuid PK references auth.users(id) on delete cascade
nombre          text not null
email           text not null
planta_id       uuid references plantas(id)
activo          boolean default true
ultimo_acceso   timestamptz
created_at, updated_at
```

### `user_roles`
```
id        uuid PK
user_id   uuid references auth.users(id) on delete cascade
role      app_role
unique(user_id, role)
```

---

## 3. Catálogos (Fase 3)

Datos maestros, lectura para todos los autenticados, escritura solo
`admin` / `direccion`.

### `plantas` (de `PLANTS` en `qc-data.ts`)
```
id          uuid PK
codigo      text unique          -- "TLX"
nombre      text                 -- "Planta Tlaxcala"
activa      boolean default true
```

### `maquinas` (de `MAQUINAS` en `catalogos.tsx` y `produccion.tsx`)
```
id              uuid PK
codigo          text unique          -- "MP-04"
planta_id       uuid references plantas(id)
tipo            text                 -- "Yankee" / "TAD"
ancho_util_m    numeric              -- 2.85
velocidad_nom   integer              -- m/min
activa          boolean default true
```

### `productos` (de `PRODUCTOS` en `catalogos.tsx` + `PRODUCT_SPECS` en `spec-catalog.ts`)
```
id              uuid PK
sku             text unique          -- "PH-201" o código fabricación "PHR01"
nombre          text                 -- "PST Higiénico 13 g/m²"
familia         text                 -- "Higiénico" / "Toalla" ...
uso             text                 -- "Doméstico" / "Institucional" / "HoReCa"
codigo_fabricacion text unique       -- "PHR01" para enlazar specs
activo          boolean default true
```

### `variables_calidad` (de `QUALITY_VARIABLES`)
```
id          uuid PK
key         text unique         -- "pesoBase", "humedad", ...
label       text                -- "Peso base"
unidad      text                -- "g/m²"
orden       integer
```

### `producto_variables` (de `PRODUCT_SPECS[i].variables`)
Spec de una variable para un producto concreto.
```
id              uuid PK
producto_id     uuid references productos(id) on delete cascade
variable_id     uuid references variables_calidad(id)
min             numeric
objetivo        numeric
max             numeric
tolerancia      text
unique(producto_id, variable_id)
```

### `operarios` (de `SHIFT_ROSTER` en `roster.ts`)
Lista de personal que puede asignarse al roster (puede o no tener login).
```
id              uuid PK
nombre          text
rol_default     app_role
planta_id       uuid references plantas(id)
user_id         uuid references auth.users(id) null   -- opcional si tiene login
activo          boolean default true
```

### `roster_turnos` (asignación máquina + turno → operario)
Reemplaza el `SHIFT_ROSTER` global por uno por máquina (la pantalla ya lo asume).
```
id                  uuid PK
maquina_id          uuid references maquinas(id) on delete cascade
turno               smallint check (turno in (1,2,3))
jefe_maquina_id     uuid references operarios(id)
operador_id         uuid references operarios(id)
prensero_id         uuid references operarios(id)
unique(maquina_id, turno)
```

---

## 4. Producción (Fase 4)

### `ordenes_fabricacion`
```
id              uuid PK
folio           text unique          -- "OF-44218"
maquina_id      uuid references maquinas(id)
producto_id     uuid references productos(id)
fecha_inicio    timestamptz
fecha_fin       timestamptz null
estado          text                 -- "abierta" | "cerrada"
```

### `maquina_estado_actual` (snapshot en vivo de cada máquina)
Alimenta las tarjetas de `/produccion`.
```
maquina_id              uuid PK references maquinas(id)
orden_id                uuid references ordenes_fabricacion(id)
estado                  text   -- "operando" | "paro" | "ajuste"
velocidad               numeric
velocidad_objetivo      numeric
oee                     numeric
turno_actual            smallint
turno_horas             numeric
rollos_turno            integer
operador_actual_id      uuid references operarios(id)
minutos_desde_inicio    integer
tiene_registro_turno    boolean
updated_at              timestamptz
```

### `paros_maquina` (modal "Registrar causa de paro")
```
id              uuid PK
maquina_id      uuid references maquinas(id)
orden_id        uuid references ordenes_fabricacion(id) null
causa           text                 -- de la lista CAUSAS_PARO
observaciones   text
inicio          timestamptz
fin             timestamptz null
registrado_por  uuid references auth.users(id)
```

---

## 5. Control de calidad (Fase 5)

### `registros_calidad` (cabecera = `GeneralInfo`)
```
id                      uuid PK
folio                   text unique     -- "CAL-2026-04830"
planta_id               uuid references plantas(id)
maquina_id              uuid references maquinas(id)
producto_id             uuid references productos(id)
orden_id                uuid references ordenes_fabricacion(id) null
fecha                   date
turno                   smallint
hora_inicio             time
hora_fin                time
jefe_maquina_id         uuid references operarios(id)
operador_id             uuid references operarios(id)
prensero_id             uuid references operarios(id) null
analista_id             uuid references operarios(id)
velocidad_maquina       numeric
velocidad_enrollador    numeric
crepado                 numeric
cumplimiento            numeric           -- calculado al guardar
notas                   text
estatus_liberacion      text              -- "L" | "NC" | "C"
created_by              uuid references auth.users(id)
created_at, updated_at
```

### `mediciones_calidad` (filas por hora = `Measurement`)
Columnas dinámicas se modelan como JSON para no atarse a las 12 variables actuales.
```
id              uuid PK
registro_id     uuid references registros_calidad(id) on delete cascade
hora            time
rollo           text
peso_rollo      numeric
uniones         integer
notas           text
estatus         text                  -- "L" | "NC" | "C"
valores         jsonb                 -- { "pesoBase": 13.07, "humedad": 7.1, ... }
created_at
```

> Alternativa normalizada: tabla `medicion_variable (medicion_id, variable_id,
> valor)`. Recomiendo **jsonb** por simplicidad y porque las pantallas ya
> trabajan así.

---

## 6. Configuración (Fase 6)

### `maquina_config`
Parámetros por máquina de la pantalla `/configuracion`.
```
maquina_id                  uuid PK references maquinas(id)
tolerancia_advertencia_pct  numeric default 10
hora_corte_turno_1          time default '07:00'
hora_corte_turno_2          time default '15:00'
hora_corte_turno_3          time default '23:00'
frecuencia_muestreo_min     integer default 30
updated_at
```

### `notificaciones_config`
```
maquina_id                  uuid PK references maquinas(id)
alerta_fuera_rango          boolean default true
resumen_diario_correo       boolean default true
notificar_no_conformidades  boolean default true
resumen_semanal_direccion   boolean default false
```

### `app_settings` (preferencias regionales globales)
```
key text PK, value text
```

---

## 7. Reportes (Fase 6)

No crea tablas nuevas. Son **vistas / funciones** sobre lo anterior:

- `vw_cumplimiento_diario(planta_id, dia, cumpl)`
- `vw_desempeno_planta(planta_id, cumpl, rollos, no_conformes, delta_mes)`
- `vw_variables_top_incidencias(variable, incidencias, impacto)`

---

## 8. Mapeo módulo → tablas

| Ruta | Lee | Escribe |
|---|---|---|
| `/produccion` | `maquina_estado_actual`, `maquinas`, `ordenes_fabricacion` | `paros_maquina` |
| `/historial/:maquina` | `registros_calidad` (por máquina) | — |
| `/control-calidad` | catálogos + `producto_variables` + `roster_turnos` | `registros_calidad`, `mediciones_calidad` |
| `/catalogos` | `plantas`, `maquinas`, `productos`, `variables_calidad` | mismas (admin) |
| `/configuracion` | `maquina_config`, `notificaciones_config`, `roster_turnos`, `operarios` | mismas (direccion) |
| `/usuarios` | `profiles`, `user_roles` | mismas (admin) |
| `/reportes` | vistas `vw_*` | — |

---

## 9. Decisiones que necesito confirmar

1. **Roles**: ¿incluyo `direccion` además de los 5 de la pantalla `/usuarios`?
   (Lo necesita el roster.)
2. **Mediciones**: ¿usamos `jsonb` (flexible) o normalizado `medicion_variable`
   (estricto, mejor para reportes SQL)? Recomiendo `jsonb`.
3. **Roster por máquina o global**: hoy `roster.ts` es global, pero
   `/configuracion` ya selecciona máquina. ¿Lo dejo por máquina como propongo?
4. **Operarios vs usuarios**: ¿Todos los operarios del roster tendrán login
   eventualmente o algunos quedarán como "personas referenciables sin cuenta"?
   Si lo segundo, mantenemos tabla `operarios` separada de `profiles` (es mi
   propuesta).
