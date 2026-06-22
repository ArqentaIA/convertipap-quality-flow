# Fase 3 — Flujo Borrador / Revisión / Publicación (APROBADO con ajustes)

## Principio rector
- `producto_especificaciones.estado='vigente'` sigue siendo la única fuente leída por QC, reportes, QR y MP-04…MP-07.
- Edición SIEMPRE sobre una fila `borrador` (o `en_revision`); nunca sobre la `vigente`.
- Publicar = `vigente → obsoleta` y `borrador → vigente`, atómico. Cada versión conserva SUS propios `spec_documentos` (no se re-apuntan).
- Descartar = `borrador → descartada` (UPDATE, sin DELETE). No se borra historial.

## Migración (un solo archivo)
1. Enum `spec_status`: `ADD VALUE 'en_revision'`, `ADD VALUE 'descartada'`. (Ya existen `borrador`, `vigente`, `obsoleta`.)
2. `producto_especificaciones`: nuevas columnas
   - `borrador_de uuid REFERENCES producto_especificaciones(id)`
   - `enviado_revision_por uuid`, `enviado_revision_at timestamptz`
   - `publicado_por uuid`, `publicado_at timestamptz`
   - `motivo_cambio text`
   - `descartado_por uuid`, `descartado_at timestamptz`, `motivo_descarte text`
3. Índices únicos parciales:
   - una sola `vigente` por producto
   - un solo `borrador|en_revision` activo por producto (excluye `descartada` y `obsoleta`)
4. RPCs SECURITY DEFINER (rol calidad/administrador):
   - `crear_borrador_especificacion(_producto_id uuid, _motivo text)` → clona caracteristicas + producto_variables; idempotente.
   - `enviar_a_revision(_spec_id uuid, _motivo text)`
   - `publicar_especificacion(_spec_id uuid, _motivo text)` → si flag ON exige evidencia vigente en el BORRADOR; vigente→obsoleta, borrador→vigente. NO re-apunta documentos.
   - `descartar_borrador(_spec_id uuid, _motivo text)` → estado='descartada'; conserva producto_variables y documentos.
5. GRANT EXECUTE a `authenticated` en las 4 RPCs.

## Server functions
- Nuevo `src/lib/spec-publicacion.functions.ts`: `obtenerEstadoEspecificacion`, `crearBorrador`, `enviarARevision`, `publicarVersion`, `descartarBorrador`.
- `qc.functions.ts` (mínimo):
  - `registrarSpecAuditByCode` y `updateCaracteristicasByCode`: resolver SIEMPRE a la spec borrador/en_revision; si la única que existe es `vigente`, rechazar con "Primero crea un borrador para modificar esta especificación."
  - Guard de evidencia (flag ON) ahora se evalúa sobre la spec borrador.
  - `listEspecsActivasConVariables`: devuelve la spec `vigente` (read-only) y, si existe, datos del `borrador` (id, version, variables, caracteristicas, evidencia).
  - Lecturas QC/QR/MP-04…07: SIN CAMBIOS, siguen leyendo `vigente`.
- `spec-documentos.functions.ts`:
  - `subirDocumento` y `getEvidenciaEstado` aceptan `target: 'vigente' | 'borrador'`.
  - `resolveSpecIdByProductCode` explícita el filtro `estado='vigente'`; nuevo overload por target.

## UI `src/routes/variables-calidad.tsx`
- Panel "Versiones" con dos tarjetas: Vigente (read-only) y Borrador (editable o "Sin borrador").
- Botones: `Crear borrador`, `Enviar a revisión`, `Publicar versión`, `Descartar borrador`, `Subir evidencia al borrador`.
- Tabla de variables editable SOLO cuando hay borrador; sin borrador, tabla en modo solo-lectura mostrando la vigente.
- Banner: "Los cambios no impactan producción hasta publicar."
- Indicador "Evidencia obligatoria: Activa/Inactiva" se mantiene.

## Restricciones
- Cero cambios en MP-04, MP-05, MP-06, MP-07, QR, reportes, `ensure_orden_auto`, `productos`, `variables_calidad`, `muestras_calidad`, `mediciones_calidad`.
- No se elimina ningún registro histórico.
- RLS existente sin tocar (RPCs son SECURITY DEFINER).
