
# Regla de oro de estatus + trazabilidad total

## 1. Regla única (fuente de verdad)

Para CADA muestra se evalúan SOLO 3 variables críticas. Comparación **estricta y simétrica** (igual al límite SÍ cumple):

| Variable        | NO CUMPLE si            |
|-----------------|-------------------------|
| Peso Base       | valor < min  OR  valor > max |
| Tensión Seca MD | valor < min  OR  valor > max |
| Tensión Seca CD | valor < min  OR  valor > max |

- Si ninguna falla → **CUMPLE** → `estatus_liberacion = 'L'` automático.
- Si al menos una falla → **NO CUMPLE** → estatus por defecto `'NC'`. El capturista puede liberar marcando "Liberar con justificación" + motivo (mín. 10 caracteres). En ese caso se guarda `'L'` con `liberado_con_justificacion = true`.
- El operador NUNCA selecciona L/C/NC manualmente. El campo "Estatus de liberación" se **oculta** de la UI.
- "C" (concesión) queda como estatus reservado solo para dictamen de Gerencia de Calidad (revisión posterior), no se asigna en captura.

## 2. Cambios de BD (migración)

Tabla `muestras_calidad` — añadir columnas:
- `liberado_con_justificacion boolean NOT NULL DEFAULT false`
- `liberacion_justificacion text` (NULL salvo cuando liberado_con_justificacion = true)
- `liberado_por uuid REFERENCES auth.users(id)`
- `liberado_at timestamptz`
- `variables_fuera_spec jsonb DEFAULT '[]'` (snapshot de las fallas: variable, valor, min, max — para auditoría y reportes)

Trigger `muestras_enforce_regla_oro_fn` (BEFORE INSERT/UPDATE):
- Recalcula las 3 condiciones con `variables_snapshot_json` + mediciones.
- Si CUMPLE → fuerza `estatus_liberacion = 'L'`, limpia flags de justificación.
- Si NO CUMPLE y `liberado_con_justificacion = false` → fuerza `'NC'`.
- Si NO CUMPLE y `liberado_con_justificacion = true` → exige `liberacion_justificacion` (≥10), guarda `'L'`.
- Llena `variables_fuera_spec`, `liberado_por`, `liberado_at`.
- Sigue respetando `change_roll_status` (dictamen de Calidad sigue mandando sobre todo).

Backfill: recalcular `estatus_liberacion` y `variables_fuera_spec` para todos los rollos históricos según la nueva regla (los que ya tienen `dictamen` autorizado no se tocan).

Auditoría: cada liberación con justificación dispara `audit_log` (USER_LIBERA_NC) con las variables fuera de spec y el motivo.

## 3. Frontend

### `src/lib/qc-critical-rule.ts`
Extender a regla simétrica (min y max para las 3 variables). Devolver además `variablesFueraSpec[]` para guardar/mostrar.

### `src/routes/calidad.captura.tsx`
- Eliminar la sección "F. Cierre — Estatus de liberación" (selector L/NC/C).
- Reemplazar por un panel en vivo: **"Resultado automático"** que muestra `CUMPLE` (verde) o `NO CUMPLE` (rojo) con la lista de variables fuera de spec.
- Si NO CUMPLE: checkbox **"Liberar con justificación del capturista"** + textarea obligatoria (≥10 chars). Al activarlo, el estatus efectivo pasa a "Liberado con justificación" (amarillo).
- Validación de submit bloquea cuando NO CUMPLE sin justificación marcada (no permite guardar como NC silencioso accidentalmente — debe ser decisión explícita).

### `src/lib/qc-effective-status.ts` y `src/lib/roll-status.ts`
- Añadir nuevo key `LIBERADO_CON_JUSTIFICACION` → color amarillo (`#a16207` / `#fef3c7`), label "Liberado con justificación", `legacyCode: 'L'`.
- `getEffectiveStatus`: cuando `estatus_liberacion='L'` y `liberado_con_justificacion=true` y NO hay dictamen autorizado de Gerencia → devuelve este nuevo estatus amarillo.

### Visores, reportes, etiqueta, QR
- `roll-label.ts`, `roll-report.ts`, `etiqueta-liberacion.ts`: cuando estatus efectivo es `LIBERADO_CON_JUSTIFICACION` → banda amarilla con texto "LIBERADO CON JUSTIFICACIÓN — <motivo>".
- `operator-vision.functions.ts`, `reportes.functions.ts`, `reporte-mensual.functions.ts`, `consolidado.functions.ts`, `produccion-centro.functions.ts`, `cumplimiento.functions.ts`: incluir conteo separado `rollos_liberados_con_justificacion` y mostrar columna/badge amarillo en cada visor que liste rollos.
- KPI cumplimiento: los liberados con justificación siguen contando como "L" (cumplen para entrega) pero se reportan en columna aparte para que Gerencia los vea.

### Detalle de rollo / modal de antecedentes
Mostrar bloque: usuario que liberó, fecha/hora, justificación, lista de variables fuera de spec con su valor y límites.

## 4. Backend / server functions

### `src/lib/qc.functions.ts` (`upsertMuestraConMediciones`)
- Quitar la lectura de `estatus_liberacion` del input (ya no se envía desde UI).
- Aplicar regla de oro server-side (defensa en profundidad, aunque el trigger también la aplica).
- Aceptar `liberado_con_justificacion` + `liberacion_justificacion` del payload; validar que cuando NO CUMPLE y no hay justificación → error 422 con detalle de las variables fuera de spec.
- Guardar `liberado_por = userId`, `liberado_at = now()` cuando aplica.

## 5. Trazabilidad / auditoría

- Cada liberación con justificación → `audit_log` (operación `LIBERA_CON_JUSTIFICACION`, datos: variables fuera de spec, motivo, usuario, rol).
- Edición posterior que cambie alguna medición crítica → invalida `liberado_con_justificacion` y vuelve a evaluar (el trigger lo hace automático), registra cambio en audit_log.
- La pantalla de auditoría (`/auditoria`) ya muestra `audit_log`; añadiremos filtro/badge para esta operación.

## 6. Backfill histórico

Migración corre al final un UPDATE masivo:
- Recalcula `estatus_liberacion` y `variables_fuera_spec` para todas las muestras según la nueva regla.
- NO toca muestras con `autorizado_por IS NOT NULL` (dictamen de Gerencia es soberano).
- Las muestras históricas que tenían `'L'` con variables fuera de spec quedan marcadas con `liberado_con_justificacion = true` y `liberacion_justificacion = 'Migración: liberación histórica previa a regla de oro 18-Jun-2026'` para que aparezcan en amarillo y queden auditables.

## 7. Detalles técnicos

```text
captura (UI) ── payload sin estatus ──▶ upsertMuestraConMediciones
                                              │
                                              ▼
                                  evaluateRegolaOro() ──▶ persistencia
                                              │
                                              ▼
                                      trigger BD valida
                                              │
                                              ▼
                                      audit_log + visores
```

- Componentes shadcn existentes (Checkbox, Textarea, Alert) — sin nuevas deps.
- Los cambios de visores/reportes son derivaciones del nuevo estatus efectivo, sin tocar lógica de paginación/filtros existentes.

## 8. Orden de entrega

1. Migración BD (nuevas columnas + trigger + backfill).
2. Tras aprobación, actualizar `qc-critical-rule`, `qc-effective-status`, `roll-status` (estatus amarillo).
3. Refactor captura: ocultar selector, panel CUMPLE/NO CUMPLE + checkbox justificación.
4. `qc.functions.ts` regla server-side + auditoría.
5. Visores/reportes/etiqueta para reflejar amarillo y columna nueva.
6. Verificar en preview con un rollo CUMPLE, uno NC y uno liberado-con-justificación.

¿Te parece bien así? Si lo apruebas, arranco con la migración.
