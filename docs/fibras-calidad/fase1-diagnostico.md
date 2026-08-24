# Fibras Calidad — Fase 1: Diagnóstico técnico (solo lectura)

> **Alcance**: inspección. No se modificó código, base de datos, migraciones, RLS, triggers ni datos.
> Todo lo listado como "existente" fue verificado contra el esquema real y el código del repo.
> Todo lo listado como "propuesto" es **conceptual y no ejecutado**.
> Fecha: 24-ago-2026

---

## 0. Aviso de frontera de sistemas — Báscula

**La fuente oficial de Báscula reside en el proyecto separado "Sistema de Pesaje".**
No debe asumirse acceso directo (ni de red, ni de base de datos, ni de storage) desde ConvertiPap
hacia ese sistema.

Evidencia en este repo:

- No existe ningún import, cliente HTTP, secret, config ni referencia a un proyecto/servicio externo
  llamado "Sistema de Pesaje". La búsqueda no arrojó integración alguna.
- Lo que sí existe internamente es un **submódulo propio de pesaje**, no la báscula oficial:
  - `src/routes/pesaje.bobina-madre.tsx` (captura con OCR de la foto del display, módulo `pesaje_bobina_madre`).
  - `src/routes/pesaje.cintas.tsx` y `src/routes/lote-cintas.$id.tsx` (módulo `pesaje_cintas`).
  - `supabase/functions/analizar-peso-bobina-v2` (OCR), probado desde la ruta no productiva
    `src/routes/diagnostico.pesaje-v2.tsx`.
- Existe una **regla de negocio ya vigente y explícita**: el peso oficial nunca proviene de báscula,
  sino de la variable `peso` de Control de Calidad —
  `src/lib/trace.functions.ts:101`, `src/lib/etiqueta-liberacion.ts:188`, `src/routes/muestra.$id.tsx:81`
  ("sin fallback a báscula").

**Implicación para Fibras Calidad**: cualquier dato de báscula debe entrar por un contrato explícito
(export/API/archivo del Sistema de Pesaje), versionado y auditable, nunca por lectura directa.
Esto es una **pregunta bloqueante** (§7).

---

## 1. Inventario real reutilizable

### 1.1 Catálogo de producto (jerarquía existente)

`familias_producto` (3) → `tipos_producto` (6) → `productos` (32)

- `productos`: `id, tipo_id, codigo, nombre, descripcion, capas, gramaje, activo, created_at, updated_at`.
- FK: `productos.tipo_id → tipos_producto.id`; `tipos_producto.familia_id → familias_producto.id`.
- Reutilizable tal cual para clasificar materia prima/fibra **si** la fibra se modela como una familia más;
  ver riesgo en §6.

### 1.2 Especificaciones y variables (núcleo reutilizable)

- `variables_calidad` (15 activas): `clave, etiqueta, unidad, min_default, objetivo_default, max_default, orden, activo`.
  Claves actuales: `calibre, blancuraR457, blancuraA, blancuraB, tensionMD, tensionCD, relMDCD, elongMD,
  humedad, pesoBase, anchoUtil, diametro, peso, uniones, tensionRH`.
- `producto_especificaciones` (37; 33 vigentes): `producto_id, version, estado (spec_status: borrador|
  en_revision|vigente|obsoleta|descartada), vigente_desde/hasta, aprobado_por/at, publicado_por/at,
  motivo_cambio, perfil_key, caracteristicas_atributos, borrador_de`.
- `producto_variables` (543): `especificacion_id, variable_id, min_valor, objetivo, max_valor, tolerancia`.
- `producto_especificacion_maquinas`: asigna la spec a máquinas.
- Ciclo de vida ya implementado en DB: `crear_borrador_especificacion`, `enviar_a_revision`,
  `publicar_especificacion`, `descartar_borrador`, `spec_tiene_evidencia_vigente`.
- Evidencia documental: `spec_documentos` + `src/lib/spec-documentos.functions.ts` y
  `src/components/spec/EvidenciaDocumentalPanel.tsx`.
- **Este es el activo más reutilizable**: el patrón producto → spec versionada → variables con
  min/objetivo/max ya resuelve versionado, vigencia y trazabilidad histórica.

### 1.3 Captura y resultados de calidad

- `muestras_calidad` (cabecera; incluye `variables_snapshot_json`, `especificacion_id` + `especificacion_version`
  congelados, `estatus_liberacion`, `dictamen`, `secuencia_captura`, `idempotency_key`).
- `mediciones_calidad` (detalle por variable, con `min_snapshot/objetivo_snapshot/max_snapshot` inmutables).
- Escritura atómica vía `crear_muestra_con_mediciones(_muestra, _mediciones, _idempotency)`.
- Cambio de estatus **unificado** vía `change_roll_status(...)` (SECURITY DEFINER, exige motivo).
- Evaluaciones: `qc_eval_liberacion`, `qc_eval_regla_oro`, `qc_recalc_estatus_muestra`,
  `fn_cumplimiento_variables_rollo_v2`, `fn_cumplimiento_turno_v2`.
- **El patrón snapshot (spec congelada en la muestra) es el mecanismo que protege el histórico** y debe
  replicarse en Fibras Calidad.

### 1.4 Perfiles, roles y permisos

- `profiles` (62): `id → auth.users.id, email, nombre, rol_visible, activo, laboratorio`.
- `user_roles` (64) con enum `app_role`: `administrador, direccion_general, gerente_general, direccion,
  calidad, calidad_operativo, capturista, reportes_consulta, planeacion`.
- `module_permissions` (69): pares `(role, module)` con enum `app_module`: `dashboard, produccion,
  control_calidad, variables_calidad, reportes, configuracion, usuarios_permisos, auditoria, catalogos,
  ordenes_produccion, pesaje_bobina_madre, pesaje_cintas`.
- Funciones: `has_role`, `can_access_module`, `can_edit_module`, `user_can_use_machine`,
  `user_allowed_machine_codes` (todas SECURITY DEFINER).
- Cliente: `src/lib/auth.tsx:65-77` carga perfil + roles + módulos y expone `hasRole/canAccess/canEdit`.
- UI: `src/components/layout/AppLayout.tsx` mapa `ROUTE_MODULE` (:49-64), filtrado de menú (:129-141),
  redirección por falta de permiso (:108-127), pantalla "Sin acceso" (:333-350).
- **Deuda observada**: reglas hardcodeadas en frontend — pesaje bobina madre limitado a
  `administrador`/`gerente_general` (`AppLayout.tsx:100-113`) y `/usuarios` limitado al email literal
  `adgral@convertipap.site` (`AppLayout.tsx:17`, `src/lib/usuarios-roles.functions.ts:9`).

### 1.5 Auditoría

- `audit_log`: genérico, con `modulo, descripcion_accion, tabla_afectada, registro_id, datos_anteriores/
  nuevos, usuario_id/email, rol, planta_id, maquina_id, folio_rollo, estatus_anterior/nuevo, motivo`.
  Escritura por RPC `audit_action` (`src/lib/audit.ts:16-33`); lectura en `src/routes/auditoria.tsx`.
  Trigger reutilizable: `audit_trigger_fn()`.
- `spec_audit_log`: auditoría específica de cambios min/objetivo/max/características de spec
  (`qc.functions.ts:397,1099,1137,1256,1526`). Inmutable (DELETE/UPDATE denegados).
- **`audit_log` admite un nuevo `modulo` sin cambio de esquema** — vía natural para Fibras Calidad.

### 1.6 Otros reutilizables

`plantas` (1), `maquinas` (4), `operarios`, `roster_turnos`, `app_settings` (parámetros globales:
tolerancia, frecuencia de muestreo, horarios de turno, notificaciones), `shift_op_date()` para fecha
operativa por turno.

---

## 2. Rutas / pantallas existentes

Calidad: `calidad.captura`, `calidad.captura-fuera-turno`, `calidad.revision`, `calidad.ajustes`,
`calidad.dashboard`, `control-calidad` (redirect), `variables-calidad`, `muestra.$id`, `t.$folio` (público QR).
Producción: `produccion`, `historial.$maquina`, `ordenes-produccion`, `pantallas-operativas`, `operator-vision`.
Pesaje interno: `pesaje.bobina-madre`, `pesaje.cintas`, `lote-cintas.$id`, `diagnostico.pesaje-v2` (no productiva).
Reportes/admin: `reportes`, `reporte-mensual`, `catalogos` (oculta), `configuracion`, `usuarios`, `auditoria` (oculta), `index`, `login`.

Convención: rutas planas con punto (`calidad.captura.tsx`), módulo asociado en `ROUTE_MODULE`.

---

## 3. Patrón técnico vigente (a respetar)

- Server functions: `createServerFn({method}).middleware([requireSupabaseAuth]).inputValidator(zod).handler()`,
  usando `context.supabase` (RLS como usuario) y `context.userId`.
  `src/integrations/supabase/auth-middleware.ts` (autogenerado, no editar).
- Operaciones privilegiadas: `supabaseAdmin` importado **dentro** del handler tras validar al llamante
  (`src/lib/usuarios-roles.functions.ts:40`).
- Lógica crítica/atómica: RPC SECURITY DEFINER en la base (patrón `crear_muestra_con_mediciones`,
  `change_roll_status`, `registrar_cinta`), no en el cliente.
- Idempotencia por `idempotency_key` en captura y lotes.

---

## 4. RLS aplicable (verificado en `pg_policies`)

| Tabla | Lectura | Escritura |
|---|---|---|
| `productos`, `plantas`, `maquinas` | `cat_read` (authenticated) | `cat_write_admin_only` |
| `familias_producto`, `tipos_producto`, `operarios`, `producto_especificaciones`, `producto_variables`, `variables_calidad` | `cat_read` (authenticated) | `cat_write_admin` (+ políticas extra de calidad en `variables_calidad`) |
| `profiles` | self o admin | self (UPDATE) / admin (ALL) |
| `user_roles` | self o admin | admin |
| `module_permissions` | todos los autenticados | admin |
| `audit_log` | admins | INSERT admins; UPDATE/DELETE denegados |
| `spec_audit_log` | todos los autenticados | INSERT autorizado; UPDATE/DELETE denegados |

Patrón dominante: **lectura amplia para `authenticated`, escritura por rol vía `has_role`/`can_edit_module`,
inmutabilidad para tablas de auditoría.** Cualquier tabla nueva debe replicarlo, incluidos los `GRANT`
explícitos a `authenticated`/`service_role`.

---

## 5. Propuesta conceptual de migraciones (aditivas y reversibles) — NO EJECUTADA

Principio: **cero cambios destructivos**. Ninguna columna existente se altera, renombra ni elimina;
ningún trigger o policy actual se modifica. Todo lo nuevo debe poder revertirse con `DROP` de lo creado.

1. **Enum `app_module`: valor adicional** (p. ej. `fibras_calidad`).
   Aditivo (`ALTER TYPE ... ADD VALUE`), **pero no reversible en Postgres** (no existe `DROP VALUE`).
   Alternativa reversible: no tocar el enum y colgar Fibras del módulo `control_calidad` o
   `variables_calidad` existente. Decisión bloqueante (§7).
2. **Catálogo propio de fibras** en tabla nueva, en lugar de forzar `productos`, si la fibra no es un
   producto terminado. Reversible por `DROP TABLE`.
3. **Especificaciones de fibra**: reutilizar el patrón `especificacion (versionada) + variables
   (min/objetivo/max)` en tablas nuevas paralelas, o —si las variables son las mismas 15— reutilizar
   `variables_calidad` por FK sin alterarla.
4. **Captura de resultados de fibra**: tabla nueva con snapshot de límites (`min_snapshot/objetivo_snapshot/
   max_snapshot`) al momento de captura, igual que `mediciones_calidad`, para blindar el histórico.
5. **Ingesta de báscula**: tabla nueva de *staging* que recibe el export del Sistema de Pesaje
   (origen, folio externo, payload crudo, hash, fecha de ingesta), tratada como dato externo no confiable
   y conciliada explícitamente. Nunca como fuente del peso oficial de calidad (regla vigente §0).
6. **RLS y GRANT** por tabla nueva, siguiendo §4; sin tocar policies existentes.
7. **Auditoría**: reutilizar `audit_action` con un `modulo` nuevo (string libre, sin migración) y/o
   `audit_trigger_fn()` sobre las tablas nuevas. Reversible por `DROP TRIGGER`.
8. **Permisos**: filas nuevas en `module_permissions` (datos, no esquema) — reversibles por `DELETE`.

---

## 6. Riesgos y faltantes

- **Enum `app_module` no reversible**: agregar valor es permanente; condiciona el punto 5.1.
- **Reutilizar `productos` para fibra** contaminaría el catálogo de producto terminado y afectaría
  reportes, órdenes y specs existentes. Riesgo alto si se hace sin discriminador.
- **Modificar `variables_calidad`** (agregar variables de fibra) impacta a las 33 specs vigentes y a la UI
  de captura, que itera el catálogo activo. Requiere discriminar por ámbito.
- **Controles hardcodeados en frontend** (email `adgral@convertipap.site`, restricción de pesaje):
  cualquier módulo nuevo que copie ese patrón nace con deuda; debe ir por `module_permissions`.
- **Autorización dispersa**: cada `*.functions.ts` implementa su propio `requireAdmin`/`requireAnyRole`
  contra `user_roles` en lugar de `has_role`. Sin middleware de rol central, la consistencia depende de disciplina.
- **Faltantes de información**: no existe en el repo contrato, esquema ni credencial del Sistema de Pesaje;
  no existe definición funcional de "Fibras Calidad" (qué se mide, quién captura, con qué frecuencia,
  contra qué se dictamina).
- Una sola planta y 4 máquinas en datos reales: si Fibras opera en otra ubicación/línea, faltan datos maestros.

---

## 7. Preguntas técnicas bloqueantes

1. **Báscula / Sistema de Pesaje**: ¿cuál es el mecanismo de intercambio acordado (API REST, export CSV/XLSX,
   réplica de solo lectura, webhook)? ¿Quién es el dueño del contrato y cuál es la llave de correlación
   (folio de rollo, folio externo, lote)? Sin esto no se puede diseñar la ingesta.
2. **Naturaleza de "fibra"**: ¿es materia prima (entrada) o un producto del catálogo actual? De esto depende
   si se reutiliza `productos` o se crea catálogo propio.
3. **Variables**: ¿las mediciones de fibra usan las 15 `variables_calidad` actuales, un subconjunto, o un
   set nuevo? ¿Deben compartir catálogo con producto terminado o quedar aisladas?
4. **Unidad de muestreo**: ¿la muestra de fibra se asocia a rollo, a lote de materia prima, a pacas, a orden
   de producción o a turno/máquina?
5. **Dictamen**: ¿aplica el mismo modelo L / C / NC / Pendiente y el mismo flujo `change_roll_status`, o
   Fibras tiene su propio ciclo de aprobación?
6. **Roles**: ¿se reutilizan `calidad` / `calidad_operativo` / `capturista`, o se requiere un rol nuevo?
   ¿Módulo propio en `app_module` (irreversible) o reutilizar uno existente?
7. **Trazabilidad**: ¿el resultado de fibra debe impactar la liberación del rollo terminado (bloqueo aguas
   abajo) o es informativo/paralelo?
8. **Retención e inmutabilidad**: ¿los resultados de fibra son corregibles con motivo (como mediciones) o
   estrictamente inmutables?

---

## 8. Conclusión de Fase 1

El proyecto ya tiene resueltos, con calidad productiva, los cimientos que Fibras Calidad necesita:
catálogo jerárquico, especificaciones versionadas con vigencia y evidencia documental, captura con
snapshot inmutable de límites, permisos por rol/módulo y auditoría inmutable. La ruta de menor riesgo es
**extender por adición** (tablas nuevas que reutilizan `variables_calidad`, `profiles`, `user_roles`,
`module_permissions` y `audit_log` por FK/RPC) y **no tocar** el catálogo de producto terminado ni las
specs vigentes. La báscula queda fuera de frontera: se integra por contrato explícito, no por acceso directo.

Fase 2 no debe iniciarse hasta cerrar las preguntas 1-6 de §7.
