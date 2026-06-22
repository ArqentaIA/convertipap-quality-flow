
# Fase 3 — Flujo de Borrador / Revisión / Publicación

Objetivo: que ningún cambio en Variables de Calidad afecte QR, reportes ni los formularios MP-04…MP-07 hasta que un usuario autorizado publique una nueva versión.

## Principio rector

- `producto_especificaciones.estado='vigente'` sigue siendo la **única** fuente que leen QC, reportes, QR y formularios MP-04…MP-07. **No se toca esa lectura.**
- Todas las ediciones (agregar / modificar / inactivar variables) ocurren sobre una **nueva fila** de `producto_especificaciones` en estado `borrador` (o `en_revision`), con su propio set de `producto_variables` clonado.
- La publicación es una operación atómica que cambia estados: `vigente → obsoleta` y `borrador → vigente`.

---

## Cambios de base de datos (1 migración)

1. **Enum `spec_estado`**: añadir valores `borrador`, `en_revision`, `obsoleta`.
   (Hoy solo hay `vigente`; los demás valores son nuevos, no rompen datos.)
2. **`producto_especificaciones`**: nuevas columnas
   - `borrador_de uuid REFERENCES producto_especificaciones(id)` — vínculo borrador → vigente origen.
   - `enviado_revision_por uuid`, `enviado_revision_at timestamptz`.
   - `publicado_por uuid`, `publicado_at timestamptz`.
   - `motivo_cambio text`.
3. **Índice único parcial**: una sola `vigente` y un solo `borrador` activo por producto.
   ```text
   UNIQUE (producto_id) WHERE estado='vigente'
   UNIQUE (producto_id) WHERE estado IN ('borrador','en_revision')
   ```
4. **RPC `crear_borrador_especificacion(_producto_id uuid, _motivo text)`** (SECURITY DEFINER):
   - Verifica rol (`calidad` o `administrador`) y, si el flag `spec_evidencia_obligatoria` está ON, exige evidencia vigente en la spec vigente origen.
   - Si ya existe borrador → devuelve su id (idempotente).
   - Inserta nueva fila copiando `caracteristicas_atributos`, `notas`, `version` (autoincrementada: `v{n+1}`).
   - Clona todas las `producto_variables` de la vigente al nuevo `especificacion_id`.
   - Registra en `spec_audit_log` (`campo='estado'`, motivo).
5. **RPC `enviar_a_revision(_spec_id uuid, _motivo text)`**:
   - Solo el borrador del producto; cambia `borrador → en_revision`; auditoría.
6. **RPC `publicar_especificacion(_spec_id uuid, _motivo text)`**:
   - Solo `calidad` o `administrador`.
   - Exige `estado IN ('borrador','en_revision')` y (si flag ON) evidencia vigente asociada al borrador.
   - En transacción: vigente actual → `obsoleta` (set `vigente_hasta=now()`); borrador → `vigente` (set `vigente_desde=now()`, `aprobado_por`, `aprobado_at`, `publicado_por`, `publicado_at`).
   - **Re-apunta** los `spec_documentos` vigentes de la spec origen al nuevo `especificacion_id` (mantiene historial; los archivados quedan en la obsoleta).
   - Registra auditoría `campo='publicacion'`.
7. **RPC `descartar_borrador(_spec_id uuid, _motivo text)`**: solo admin/calidad; borra el borrador y sus `producto_variables`. Auditoría.
8. GRANTs + RLS: `EXECUTE` a `authenticated` en los 4 RPCs; las políticas existentes de `producto_especificaciones` / `producto_variables` siguen igual (los RPCs son SECURITY DEFINER).

**No se modifican** tablas/policies de `muestras_calidad`, `mediciones_calidad`, `productos`, `variables_calidad`, ni la función `ensure_orden_auto` (sigue resolviendo `estado='vigente'`).

---

## Cambios en server functions

Archivo nuevo `src/lib/spec-publicacion.functions.ts` con:
- `obtenerEstadoEspecificacion({ producto_codigo })` → `{ vigente, borrador, evidencia }`.
- `crearBorrador({ producto_codigo, motivo })` → llama RPC.
- `enviarARevision({ spec_id, motivo })`.
- `publicarVersion({ spec_id, motivo })`.
- `descartarBorrador({ spec_id, motivo })`.

Ajustes mínimos en `src/lib/qc.functions.ts`:
- Las mutaciones existentes (`upsertProductoVariable`, alta/baja de variable, etc.) deben **rechazar** si el `especificacion_id` recibido tiene `estado='vigente'` y existe un borrador del mismo producto — forzar a editar el borrador. Si no existe borrador, devolver error claro indicando que primero hay que crearlo desde la UI.
- Lectura para captura / reportes / QR: **sin cambios** (siguen leyendo `vigente`).

`spec-documentos.functions.ts`:
- `resolveSpecIdByProductCode` se reemplaza por un selector explícito: por defecto resuelve la `vigente`; nuevos parámetros opcionales `incluir_borrador=true` para que la UI pueda subir evidencia al borrador.
- `subirDocumento` acepta `target: 'vigente' | 'borrador'` (default `vigente` por compatibilidad). El bloqueo de edición exige evidencia vigente en el **borrador** para poder publicar.

---

## Cambios en UI (`src/routes/variables-calidad.tsx`)

- Encabezado muestra dos tarjetas: **Versión vigente** (read-only) y **Versión borrador** (editable o "Sin borrador activo").
- Acciones nuevas en la barra:
  - `Crear borrador` (visible si no hay borrador y el usuario es calidad/admin; requiere motivo).
  - `Subir evidencia al borrador` (reutiliza `EvidenciaDocumentalPanel` apuntando al borrador).
  - `Enviar a revisión` (habilitado solo con borrador + evidencia si flag ON).
  - `Publicar versión` (solo admin/calidad; requiere `en_revision` o `borrador` + evidencia).
  - `Descartar borrador` (admin/calidad).
- La tabla editable de variables opera **siempre sobre el borrador**. Si no hay borrador, la tabla está en modo solo-lectura mostrando la vigente.
- Banner: "Los cambios no impactan producción hasta publicar".

**No se tocan** MP-04, MP-05, MP-06, MP-07, QR ni reportes.

---

## Auditoría

Toda transición (`crear_borrador`, `enviar_a_revision`, `publicar`, `descartar`) genera fila en `spec_audit_log` con `campo='estado'` o `campo='publicacion'`, `valor_anterior_texto`/`valor_nuevo_texto` con los estados, y el motivo del usuario. Las ediciones de variables ya generan auditoría hoy y se mantienen.

---

## Restricciones respetadas

- No se eliminan tablas ni filas históricas (la vigente pasa a `obsoleta`, no se borra).
- No se modifican MP-04…MP-07, QR ni reportes.
- No se cambian APIs existentes de lectura; las de escritura solo añaden validación "edita el borrador, no la vigente".
- No se duplican productos ni variables (`variables_calidad`).
- Reutiliza `producto_especificaciones`, `producto_variables`, `spec_documentos`, `spec_audit_log`.
- `ensure_orden_auto` queda intacto.

---

## Entregables por orden de ejecución

1. Migración SQL (enum + columnas + índices únicos + 4 RPCs + GRANTs).
2. `src/lib/spec-publicacion.functions.ts` (nuevo).
3. Ajustes mínimos en `spec-documentos.functions.ts` (selector vigente/borrador).
4. Guard en mutaciones de `qc.functions.ts` (rechazar escritura sobre vigente cuando exista borrador).
5. UI: rediseño del encabezado y acciones en `variables-calidad.tsx` + componente `VersionesPanel.tsx`.
6. Pruebas manuales: crear borrador → editar → subir evidencia → enviar a revisión → publicar → verificar que captura MP-04 ve la nueva spec y la anterior quedó `obsoleta`.

Espero aprobación antes de implementar.
