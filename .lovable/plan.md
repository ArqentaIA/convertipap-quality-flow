# Plan: RBAC centralizado + Calidad como único editor de estatus

## 1. Permisos por rol (base de datos)

Recalibrar `module_permissions` para que coincida exactamente con la matriz solicitada:

| Rol | Módulos |
|---|---|
| administrador | dashboard, produccion, control_calidad, variables_calidad, catalogos, reportes, auditoria, configuracion, usuarios_permisos |
| gerente_general | dashboard, produccion, control_calidad (read), variables_calidad (read), reportes, auditoria |
| direccion | dashboard, produccion, control_calidad (read), variables_calidad (read), reportes, auditoria |
| calidad | dashboard, produccion, control_calidad, variables_calidad, reportes, auditoria |
| capturista | control_calidad |

Cambios concretos:
- Agregar `catalogos` al enum `app_module` (falta).
- Agregar permiso de `auditoria` a `direccion` y `calidad`.
- Quitar `configuracion` y `usuarios_permisos` de `gerente_general`.
- Agregar `control_calidad` a `direccion`.

## 2. Modo solo-lectura (frontend + backend)

Nueva tabla/columna o función `can_edit_module(user, module)`:
- `gerente_general` y `direccion`: pueden ver `control_calidad` y `variables_calidad` pero **no** editar.
- En UI: ocultar botones de captura/guardar/editar cuando el usuario no tiene edición.
- En RLS de `variables_calidad` y `mediciones_calidad`/`muestras_calidad`: solo `calidad`, `administrador`, `capturista` (cuando aplique) pueden `INSERT/UPDATE/DELETE`.

## 3. Restricción por laboratorio (capturistas)

- Hoy `lab.ts` ya filtra UI por `profile.laboratorio`. Reforzar en backend con función `user_allowed_machines(uid)` que devuelva los IDs/códigos permitidos:
  - `capturista norte` → MP-06, MP-07
  - `capturista sur` → MP-04, MP-05
  - Otros roles → todas
- Aplicar a RLS de `muestras_calidad`, `mediciones_calidad`, `rollos_producidos`, `ajustes_calidad`, `paros_maquina`, `maquina_estado_actual` para SELECT/INSERT/UPDATE.

## 4. Estatus de rollo: solo Calidad + doble validación

- Centralizar **toda** mutación de estatus (`muestras_calidad.estado`/`dictamen`, `rollos_producidos.estatus`) en un `createServerFn` único `changeRollStatus` que:
  - Verifica `has_role(uid, 'calidad') OR has_role(uid, 'administrador')`.
  - Requiere `motivo` (string mínimo 5 chars).
  - Re-valida credenciales: el frontend pide email+password al usuario y llama `supabase.auth.signInWithPassword` contra **el mismo usuario** antes de invocar la serverFn; la serverFn recibe un token recién emitido y lo verifica.
  - Inserta en `audit_log` con: usuario, rol, planta, máquina, lab, folio/ID, estatus anterior, estatus nuevo, motivo, IP (`x-forwarded-for`), user-agent.
- Bloquear en RLS: solo `service_role` o roles `calidad/administrador` pueden hacer `UPDATE` sobre columnas de estatus.
- Mensaje estándar cuando un usuario sin permiso intente: *"Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo."*

## 5. Frontend: ocultar lo no autorizado

- `AppLayout` ya filtra el menú por `auth.canAccess` ✓ — agregar entry `catalogos`.
- En `calidad.captura.tsx` y selectores de máquina, filtrar opciones con `useLabFilter` (ya existe). Asegurar que las consultas de máquinas también pasen por el filtro.
- Botones de cambio de estatus en `calidad.revision.tsx`, `muestra.$id.tsx`, `control-calidad.tsx`, `produccion.tsx`, `historial.$maquina.tsx`: ocultarlos para usuarios no-calidad/no-admin; mostrarlos detrás de un modal "Confirmar identidad" para los autorizados.
- En módulos solo-lectura (gerente/dirección): ocultar todos los botones de acción (capturar, editar, guardar) en `control-calidad`, `calidad.*`, `variables-calidad`.

## 6. Auditoría enriquecida

- Agregar columnas a `audit_log`: `ip_address text`, `user_agent text`, `planta_id`, `maquina_id`, `laboratorio`, `folio_rollo`, `estatus_anterior`, `estatus_nuevo`, `motivo`.
- Nueva RPC `audit_status_change(...)` que recibe todo el contexto.
- RLS de `audit_log` SELECT: solo `administrador`, `calidad`, `direccion`, `gerente_general` (ya existe, validar).
- Bloquear `UPDATE`/`DELETE` en `audit_log` para todos (inmutable).

## 7. Detalles técnicos

- Nuevo archivo `src/lib/roll-status.functions.ts` con `changeRollStatus` (serverFn protegido).
- Nuevo componente `src/components/qc/ReautenticarModal.tsx` para doble validación.
- Hook `useCanEditModule(module)` en `src/lib/auth.tsx`.
- Migración SQL única que: actualiza `app_module` enum, reescribe `module_permissions`, crea `can_edit_module`, `user_allowed_machines`, endurece RLS y extiende `audit_log`.
- No se tocan: `src/integrations/supabase/*` autogenerados, `auth.users`, schema `auth`.

## 8. Riesgos / preguntas abiertas

- **Doble validación**: confirmar que aceptas re-login con email+password del MISMO usuario (no de un supervisor distinto).
- **Capturistas y cambio de estatus**: en la definición actual no editan estatus, solo capturan mediciones. Lo dejo así.
- **Catálogos**: hoy ningún rol salvo admin lo tendrá. Confirmar.
- **Reversión de cambios**: lo trato como otro `changeRollStatus` con motivo, no como acción separada.

¿Procedo con esta implementación o quieres ajustar algo (especialmente puntos 4 y 8)?
