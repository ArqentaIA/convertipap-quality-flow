## Alcance

Reemplazar el campo libre `observaciones_generales` por 3 selects controlados en Captura de Calidad, persistirlos en BD, auditar creación y edición, y propagar el formato concatenado (con color rojo si es CRÍTICO) al visor, modal de antecedentes y reportes.

---

## 1. Migración de base de datos

Tabla `muestras_calidad` — agregar 3 columnas nullable:

```sql
ALTER TABLE public.muestras_calidad
  ADD COLUMN defecto_visual_conversion text,
  ADD COLUMN variable_tecnica_dimensional text,
  ADD COLUMN criterio_defecto text
    CHECK (criterio_defecto IN ('MENOR','MAYOR','CRÍTICO'));
```

- No se borra `observaciones_generales` (compatibilidad histórica), pero deja de escribirse desde la UI.
- Las 3 columnas se incluyen en el trigger `audit_trigger_fn` existente (ya audita UPDATE/INSERT sobre la tabla → cubre el requisito de auditar ediciones automáticamente).
- Adicional: un audit_action explícito al guardar/editar con módulo `control_calidad` para registrar `muestra_id, numero_rollo, maquina_id, turno, usuario, defecto_visual_conversion, variable_tecnica_dimensional, criterio_defecto`.

## 2. Captura (`src/routes/calidad.captura.tsx`)

Debajo de "Mediciones por Variable", **reemplazar** el textarea actual de observaciones por una nueva sección "Hallazgos del rollo" con 3 selects opcionales:

- **Defectos Visuales y de Conversión** (17 opciones: Uniones, Desfases, Pintos, Área sucia, Picado, Oscilación de la hoja, Gomas, Hoyos, Adherencia, Porosidad, Embobinado flojo, Tonalidad rosa, Tonalidad verde, Tonalidad azul, Suciedad, Arrugas, Grumos).
- **Variables Técnicas y Dimensionales** (Blancura, RH, Diámetro <, Ancho, Largo, Tensión Húmeda, Stretch, Suavidad, Otros — confirmar lista exacta en implementación leyendo el prompt original).
- **Criterio de defecto** (MENOR, MAYOR, CRÍTICO).

Cada select tiene opción "— Sin hallazgo —" (null). Estado en `useState`. Se envían al server fn `upsertMuestraConMediciones` y `dictaminarMuestra`/update path. Eliminar `observaciones` textarea actual; `observaciones_generales` se envía siempre como `""`.

## 3. Server functions (`src/lib/qc.functions.ts`)

- Extender el `inputValidator` de `upsertMuestraConMediciones` con los 3 campos opcionales.
- Persistir en INSERT y UPDATE.
- Tras el upsert, llamar `audit_action('control_calidad', 'Captura/edición de hallazgos del rollo', muestra_id, { numero_rollo, maquina, turno, defecto_visual_conversion, variable_tecnica_dimensional, criterio_defecto })`.
- Extender el SELECT de `listMisMuestrasRecientes` y demás lectores para incluir las 3 columnas.

## 4. Helper de formato (`src/lib/roll-label.ts` o nuevo `src/lib/hallazgo.ts`)

```ts
export function formatHallazgo(m): string | null
export function isHallazgoCritico(m): boolean
```

Formato: `[Defecto] | [Variable] | [Criterio]` omitiendo segmentos vacíos. Devuelve null si los 3 están vacíos.

## 5. Visor — solo encabezado del **rollo actual**

`src/routes/operator-vision.tsx` (y el card del rollo en curso): donde se muestren observaciones del rollo actual, sustituir por `formatHallazgo(rolloActual)`. Si `isHallazgoCritico` → clase `text-red-600 font-semibold`. El historial de rollos del visor NO cambia color (solo encabezado del actual, según tu respuesta 1).

También extender el payload de `getOperatorVisionData` (`src/lib/operator-vision.functions.ts`) para incluir los 3 campos en cada muestra.

## 6. Antecedentes / Modal de detalle

`src/components/qc/DetalleCalidadModal.tsx` — agregar fila "Hallazgos" con el texto concatenado en rojo si es CRÍTICO.

`src/routes/muestra.$id.tsx` — idem.

## 7. Reportes (todos)

Reemplazar columna "Observaciones" por "Hallazgos" en:

- `src/lib/reporte-turno-export.ts`
- `src/lib/consolidado-export.ts`
- `src/lib/reporte-mensual-export.ts`
- `src/lib/ceo-report.functions.ts`
- `src/lib/roll-report.ts` (QR/etiqueta detalle)

Para los Excel: si es CRÍTICO, aplicar `font: { color: { rgb: 'FFFF0000' }, bold: true }` en esa celda.

## 8. Lo que NO se toca

- `observaciones_generales` columna en BD (se conserva por historial).
- Otros indicadores del visor.
- Estados de liberación / dictamen.
- Captura de mediciones por variable.
- Lógica de `capturado_at` ni `hora_muestreo`.

---

## Riesgos / supuestos

1. La lista exacta de "Variables Técnicas y Dimensionales" del prompt original se truncó en el contexto. La leeré completa antes de implementar; si hay ambigüedad pregunto.
2. Los registros históricos tendrán las 3 nuevas columnas en NULL → en reportes mostrarán vacío (esperado).
3. Reportes mensuales/CEO ya generados no se re-procesan.

¿Procedo con la migración + los cambios de UI/server fn/exportadores tal cual o ajustamos algo?
