# Plan: Control documental en Catálogo Maestro de Especificaciones

Objetivo: introducir control documental (PDF/evidencia) y, posteriormente, flujo de aprobación sobre `producto_especificaciones`, sin tocar formularios de captura MP-04…MP-07 ni la lógica de resolución de spec vigente.

## Restricciones (vinculantes en todas las fases)

- No eliminar ni renombrar tablas/columnas existentes.
- No modificar formularios MP-04, MP-05, MP-06, MP-07 ni su lógica de captura.
- No modificar APIs existentes (`qc.functions.ts`, triggers, funciones SQL).
- No crear duplicados de `productos` ni `variables_calidad`.
- Solo migraciones aditivas.
- Sin publicación automática (eso es Fase 4, fuera de alcance de esta entrega).

---

## FASE 1 — Diagnóstico (solo lectura, sin migraciones)

**Entregable:** informe en `docs/spec-control-documental/fase1-diagnostico.md`.

Pasos:

1. Grep exhaustivo de lectores de `producto_especificaciones` y `producto_variables` en:
   - `src/lib/qc.functions.ts`
   - `src/lib/reportes.functions.ts`, `consolidado.functions.ts`, `reporte-mensual.functions.ts`, `reporte-no-conforme.functions.ts`, `produccion.functions.ts`, `operator-vision.functions.ts`, `trace.functions.ts`
   - Funciones SQL: `ensure_orden_auto`, `muestras_autofill_uniones_fn`, vistas `vw_*`.
2. Por cada lector, confirmar que filtra por `estado='vigente'`.
3. Documentar el único punto sensible ya identificado: el fallback de `ensure_orden_auto` que toma la spec más reciente cuando no hay `vigente`. Marcar como “a endurecer en Fase 4”, NO tocar ahora.
4. Confirmar que `mediciones_calidad` usa `min_snapshot`/`max_snapshot` (snapshot inmutable) → reportes históricos no se ven afectados por cambios futuros.
5. Inventariar la UI editable de `variables-calidad.tsx`: identificar exactamente las acciones que dispararán el bloqueo por evidencia en Fase 2 (editar valor min/objetivo/max, agregar variable a producto, inactivar variable).

**Criterio de aceptación Fase 1:** informe entregado y revisado. No hay cambios en código ni en base.

---

## FASE 2 — Almacenamiento documental con evidencia obligatoria

**Alcance:** subir, ver y descargar PDF/evidencia ligada a una especificación, y bloquear ediciones del catálogo sin evidencia. **No** introduce estados de flujo nuevos ni toca el enum `spec_estado`.

### 2.1 Backend — recursos nuevos

Migración aditiva (un solo archivo):

- **Tabla `public.spec_documentos`**
  - `id uuid PK`
  - `especificacion_id uuid NOT NULL REFERENCES producto_especificaciones(id) ON DELETE CASCADE`
  - `bucket_path text NOT NULL` (ruta dentro del bucket)
  - `nombre_archivo text NOT NULL`
  - `mime_type text NOT NULL`
  - `tamano_bytes bigint NOT NULL`
  - `hash_sha256 text` (deduplicación opcional)
  - `descripcion text` (motivo / referencia del documento)
  - `subido_por uuid NOT NULL REFERENCES auth.users(id)`
  - `subido_at timestamptz NOT NULL DEFAULT now()`
  - `vigente boolean NOT NULL DEFAULT true` (soft-archive; nunca DELETE de filas)
  - `created_at`, `updated_at` + trigger `set_updated_at`
  - Índice `(especificacion_id, vigente)`
- **GRANTs**: `authenticated` SELECT/INSERT/UPDATE; `service_role` ALL. Sin `anon`.
- **RLS**: 
  - SELECT: cualquier `authenticated` (los límites de spec ya son visibles para roles consumidores).
  - INSERT/UPDATE: `has_role(auth.uid(),'calidad')` OR `has_role(auth.uid(),'administrador')`.
  - DELETE: prohibido (no policy).

- **Bucket privado `spec-documentos`** vía `supabase--storage_create_bucket` (public=false).
- **Políticas RLS sobre `storage.objects` para `bucket_id='spec-documentos'`**:
  - SELECT: `authenticated`.
  - INSERT/UPDATE/DELETE: solo `calidad` / `administrador`.
  - Convención de ruta: `{especificacion_id}/{uuid}-{nombre-saneado}.pdf`.

- **Función `public.spec_tiene_evidencia_vigente(_spec_id uuid) RETURNS boolean`** (SECURITY DEFINER, STABLE):
  - `SELECT EXISTS(SELECT 1 FROM spec_documentos WHERE especificacion_id=_spec_id AND vigente=true)`.
  - Sirve para gates server-side en server functions de edición.

### 2.2 Server functions — bloqueo por evidencia

Sin tocar las funciones existentes de captura. Crear en `src/lib/spec-documentos.functions.ts`:

- `listarDocumentos(spec_id)` — lista metadatos.
- `subirDocumento(spec_id, file, descripcion)` — sube al bucket + inserta fila.
- `urlFirmadaDescarga(documento_id)` — devuelve signed URL (TTL corto).
- `archivarDocumento(documento_id)` — set `vigente=false` (no borra).

Endurecer **solo** los servers de mutación del catálogo en `qc.functions.ts` (las funciones que hoy escriben `producto_variables` / `spec_audit_log` desde la UI de Variables de Calidad). Añadir guard inicial:

```ts
const ok = await supabase.rpc('spec_tiene_evidencia_vigente', { _spec_id: especificacion_id });
if (!ok.data) throw new Error('Se requiere cargar evidencia documental antes de modificar la especificación.');
```

Esto NO afecta a MP-04…MP-07: ellos no editan specs, solo las leen.

### 2.3 UI

En `src/routes/variables-calidad.tsx`, pestaña/sección nueva **“Evidencia documental”** por especificación:

- Listado de documentos vigentes (nombre, tamaño, quién subió, fecha, descargar, archivar).
- Botón “Subir documento” (drag & drop, valida mime PDF/PNG/JPG, máx N MB).
- Visor in-app (iframe a signed URL) para PDFs.

Banner de bloqueo: si `spec_tiene_evidencia_vigente=false`, deshabilitar acciones de:
- editar min/objetivo/max de una variable
- agregar variable al producto
- inactivar variable
…mostrando tooltip “Carga evidencia documental para habilitar cambios”.

### 2.4 Auditoría

Reutilizar `spec_audit_log` ya existente para registrar `documento_cargado` y `documento_archivado` (sin schema nuevo; usar el campo `campo` con valor descriptivo o `audit_action('variables_calidad', ...)`).

### 2.5 Criterios de aceptación Fase 2

- Bucket privado existe y solo `calidad`/`administrador` pueden escribir.
- Sin documento vigente → ediciones del catálogo bloqueadas tanto en UI como en server.
- Con documento vigente → flujo de edición existente funciona idéntico.
- MP-04…MP-07 sin cambios de comportamiento (verificación manual de captura).
- Lectores históricos (reportes) sin cambios.

---

## FASES POSTERIORES (no se implementan en esta entrega)

- **FASE 3 — Flujo de aprobación**: ampliar enum `spec_estado` (`borrador`, `en_revision`, `aprobada`, `obsoleta`), tabla `spec_aprobaciones`, UI de transiciones. Las máquinas siguen viendo solo `vigente`.
- **FASE 4 — Publicación atómica**: función `publicar_especificacion(spec_id)`, índice único parcial `(producto_id) WHERE estado='vigente'`, endurecimiento del fallback de `ensure_orden_auto`.
- **FASE 5 — Pruebas de regresión y RLS**: suite manual + automatizada sobre captura, reportes y bucket.

---

## Detalles técnicos (resumen para revisión técnica)

- Stack server: TanStack `createServerFn` + `requireSupabaseAuth`; sin Edge Functions.
- Bucket creado con tool `supabase--storage_create_bucket` (no SQL).
- Migración única para Fase 2 contiene: CREATE TABLE → GRANT → ENABLE RLS → POLICIES → función `spec_tiene_evidencia_vigente` → políticas en `storage.objects`.
- Storage signed URLs vía `supabase.storage.from('spec-documentos').createSignedUrl(path, 300)`.
- Tamaño máximo sugerido: 20 MB por archivo; mime allow-list: `application/pdf`, `image/png`, `image/jpeg`.

## Riesgos y mitigación (Fase 2)

| Riesgo | Mitigación |
|---|---|
| Usuario sube archivo y no aparece la fila en `spec_documentos` (subida parcial) | Subir primero al bucket; si éxito, insertar fila; si la inserción falla, borrar el objeto. Envolver en server fn. |
| Bloqueo de edición rompe flujos en producción al desplegar | Feature flag en `app_settings` (`spec_evidencia_obligatoria` boolean, default `false`). Activar después de cargar evidencia de las specs vigentes existentes. |
| Specs vigentes ya existentes sin documento | Script de seed opcional para insertar un “documento placeholder” marcado `vigente=false` para que la UI muestre el estado correctamente; o mantener flag apagado hasta que Calidad cargue evidencia inicial. |
| Confusión entre `producto_especificaciones.vigente_desde` y `spec_documentos.vigente` | Nombrar la columna como `vigente` con comentario SQL claro; alternativamente `activo`. |

## Pendiente de confirmación antes de empezar Fase 2

1. Tipos de archivo permitidos (¿solo PDF, o también imágenes?).
2. Tamaño máximo por archivo.
3. ¿Debe el bloqueo aplicar también a `productos` (alta/baja/edición de SKU) o solo a variables de la spec?
4. ¿Usamos feature flag `spec_evidencia_obligatoria` para activación gradual?

Espero aprobación para ejecutar Fase 1 (sin migraciones) y, tras revisar el informe, proceder con la migración de Fase 2.
