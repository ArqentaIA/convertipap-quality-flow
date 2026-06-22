# Fase 1 — Diagnóstico de consumidores de especificaciones

> Solo lectura. No se modificó código ni base de datos.
> Fecha: 22-jun-2026

## 1. Lectores identificados de `producto_especificaciones` / `producto_variables`

### 1.1 Server functions (TypeScript)

| Archivo | Línea | Acción | Filtro `estado='vigente'` | Notas |
|---|---|---|---|---|
| `src/lib/qc.functions.ts` | 167 | Lista productos con spec (catálogo de captura) | NO (no filtra; usa para mostrar “tiene spec o no”) | Solo lectura; no afecta resolución de límites. |
| `src/lib/qc.functions.ts` | 198 | `getSpecPorProducto` — spec de captura MP-04…MP-07 | **SÍ** `eq('estado','vigente')` + orden `vigente_desde desc` | Crítico. OK. |
| `src/lib/qc.functions.ts` | 209 | join a `producto_variables` por `especificacion_id` de la spec vigente | hereda filtro | OK. |
| `src/lib/qc.functions.ts` | 235 | `getOrdenSpec` — spec ya enlazada a orden por `especificacion_id` exacto | N/A (lookup directo por id de la spec que ya quedó congelada en la orden) | OK. |
| `src/lib/qc.functions.ts` | 242 | join `producto_variables` por la spec de la orden | N/A | OK. |
| `src/lib/qc.functions.ts` | 1077 | `registrarSpecAuditByCode` — busca última spec del producto para escribirla | NO (orden por `created_at desc`) | **Mutación. Aquí se introducirá el guard de evidencia.** |
| `src/lib/qc.functions.ts` | 1108 / 1118 | UPDATE de `producto_variables.{min_valor,objetivo,max_valor}` | N/A | **Mutación cubierta por el mismo guard.** |
| `src/lib/qc.functions.ts` | 1164 | `listEspecsActivasConVariables` — catálogo de Variables de Calidad UI | NO (toma la spec más reciente por producto) | Solo lectura para la UI del catálogo. |
| `src/lib/qc.functions.ts` | 1197 | join `producto_variables` para la UI | N/A | OK. |
| `src/lib/qc.functions.ts` | 1270 / 1285 | `updateCaracteristicasByCode` — actualiza texto libre `caracteristicas_atributos` | NO | **Mutación. También se cubrirá con guard de evidencia en Fase 2.** |
| `src/lib/operator-vision.functions.ts` | 231 / 240 | Lectura de spec vigente para tablero | **SÍ** `eq('estado','vigente')` | OK. |
| `src/lib/reportes.functions.ts` | 488 / 495 | Reportes — lista todas las specs por producto | NO (es reporte histórico) | OK; cruza por `id`. |
| `src/lib/consolidado.functions.ts` | 138 / 147 | Consolidado histórico | NO (idem) | OK. |
| `src/lib/produccion.functions.ts` | 87 | Spec vigente para producción | **SÍ** | OK. |

### 1.2 Funciones SQL (DB)

| Función | Filtro | Notas |
|---|---|---|
| `ensure_orden_auto` | `estado='vigente'` primero, **fallback** a la más reciente sin filtro | Punto sensible documentado para Fase 4. **No se toca en Fase 2.** |
| `muestras_autofill_uniones_fn` | toma la primera spec ordenada por `(estado='vigente') desc, vigente_desde desc` | OK. |
| Vistas `vw_*` | Ninguna lee `producto_especificaciones` directamente | OK. |

### 1.3 Triggers

`information_schema.triggers` no devuelve ningún trigger sobre `producto_especificaciones` ni `producto_variables`. La auditoría se hace desde código.

## 2. Snapshot histórico

`mediciones_calidad` guarda `min_snapshot`, `objetivo_snapshot`, `max_snapshot` capturados al momento del rollo. **Reportes y bitácoras históricas no dependen de cambios futuros en specs.**

## 3. UI editable (`src/routes/variables-calidad.tsx`)

Acciones que mutan el catálogo y por lo tanto serán **bloqueadas en Fase 2** cuando el feature flag `spec_evidencia_obligatoria=true` esté activo y la spec no tenga documento vigente:

| Acción UI | Server fn | Estado actual |
|---|---|---|
| Editar `min` / `objetivo` / `max` de una variable | `registrarSpecAuditByCode` | Existe. **Se gateará.** |
| Editar `caracteristicas_atributos` | `updateCaracteristicasByCode` | Existe. **Se gateará** (forma parte del catálogo de la spec). |
| Agregar variable a la spec | _No existe aún en UI ni server fn_ | Cuando se implemente, deberá llamar al mismo guard. |
| Inactivar variable de la spec | _No existe aún en UI ni server fn_ | Cuando se implemente, deberá llamar al mismo guard. |

> Aclaración: en la fase actual del producto, la única mutación operativa sobre los rangos vive en `registrarSpecAuditByCode`. Las acciones “Agregar” e “Inactivar variable” se gatean cuando se introduzcan. La obligación de evidencia queda enforced server-side mediante la función SQL `spec_tiene_evidencia_vigente`, que cualquier futura mutación deberá invocar.

## 4. Conclusión Fase 1

- Todos los lectores **operativos** de las máquinas MP-04, MP-05, MP-06, MP-07 ya filtran por `estado='vigente'`.
- Reportes históricos están protegidos por snapshots inmutables.
- El **único** punto de mutación de rangos hoy es `registrarSpecAuditByCode` (más `updateCaracteristicasByCode` para texto libre).
- Es seguro introducir el flujo de evidencia documental de Fase 2 sin tocar formularios de captura ni APIs existentes.

**Pendientes para fases posteriores (NO incluidos en esta entrega):**
- Endurecer fallback de `ensure_orden_auto` (Fase 4).
- Flujo de aprobación multi-firma (Fase 3).
- Publicación atómica de spec y único parcial (Fase 4).
