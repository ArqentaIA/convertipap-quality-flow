# Propuesta: Aislar Cortes de Bobina por planta

## Diagnóstico

El módulo **Cortes de Bobina** identifica el rollo únicamente por `numero_rollo`, sin considerar la planta. Esto colisiona cuando Tlaxcala e Ixtapaluca tienen rollos con el mismo número.

Evidencia en base de datos:

- `muestras_calidad` sí está aislada: índice único `(planta_id, maquina_id, numero_rollo)`.
- `rollos_cintas` tiene índice único global `(numero_rollo)`.
- `pesajes_cintas_lotes` tiene índice único global `(numero_rollo) WHERE estado = 'abierto'`.
- Los RPCs `buscar_contexto_rollo_cintas`, `pc_bajadas_rollo`, `crear_lote_pesaje_cintas`, `crear_lote_pesaje_cintas_manual_v2`, `cerrar_rollo_cintas` y `pc_get_or_create_rollo` operan solo con `numero_rollo`.

Consecuencias actuales:

- Un usuario de Ixtapaluca que busca `11319-4` ve los cortes de Tlaxcala.
- Si Ixtapaluca intenta crear cortes, reutiliza el mismo registro maestro de Tlaxcala, mezclando bajadas, cierres y posiciones.

## Solución recomendada

Agregar `planta_id` a las entidades de Cortes de Bobina y cambiar la unicidad de `(numero_rollo)` a `(planta_id, numero_rollo)`, igual que en Control de Calidad.

### Cambios en base de datos

1. Agregar `planta_id uuid` a `rollos_cintas`.
2. Rellenar `planta_id` de registros existentes a partir de `pesajes_cintas_lotes.muestra_calidad_id -> muestras_calidad.planta_id`.
3. Si un mismo `numero_rollo` en `rollos_cintas` tiene cortes de ambas plantas, crear un segundo registro `rollos_cintas` para la segunda planta y reasignar `pesajes_cintas_lotes.rollo_id`.
4. Cambiar índice único de `rollos_cintas` a `(planta_id, numero_rollo)`.
5. Agregar `planta_id uuid` a `pesajes_cintas_lotes`.
6. Rellenar `planta_id` de `pesajes_cintas_lotes` desde `muestra_calidad_id` o, para manuales, desde la planta del registro `rollos_cintas` relacionado.
7. Cambiar `uq_pcl_abierto_por_rollo` a `(planta_id, numero_rollo) WHERE estado = 'abierto'`.

### Cambios en funciones RPC

Actualizar estas funciones para recibir `_planta_id uuid` y filtrar/crear por planta:

- `buscar_contexto_rollo_cintas(_numero_rollo, _planta_id)`
- `pc_bajadas_rollo(_numero_rollo, _planta_id)`
- `pc_get_or_create_rollo(_numero_rollo, _planta_id)`
- `crear_lote_pesaje_cintas(..., _planta_id)`
- `crear_lote_pesaje_cintas_manual_v2(..., _planta_id)`
- `cerrar_rollo_cintas(_numero_rollo, _motivo, _planta_id)`

Reglas de comportamiento:

- Buscar solo dentro de la planta activa del usuario.
- Si no hay muestra de Calidad en esa planta, permitir captura manual como hasta ahora.
- Cierre de rollo y límite de 7 bajadas / 350 posiciones se cuentan por planta.

### Cambios en frontend

- `src/lib/pesaje-cintas.functions.ts`: agregar `planta_id` a los server functions expuestos.
- `src/routes/pesaje.cintas.tsx`: enviar `plantaActiva.id` (de `useMaquinasVisibles`) en cada llamada.

### Validación

- Reimprimir/reimprimir etiquetas de Cortes de Bobina en ambas plantas.
- Verificar que un rollo con el mismo número en TLX e IXT se maneje como dos rollos independientes.
- Confirmar que los cortes históricos de Tlaxcala no aparecen en Ixtapaluca.

## Alcance

- Aplica a **ambas plantas**: Tlaxcala e Ixtapaluca.
- No afecta Control de Calidad ni Pesaje de Rollo, que ya están aislados.
- No elimina datos; solo reasigna registros maestro cuando sea necesario.

## Riesgo principal

La migración debe dividir registros de `rollos_cintas` que actualmente comparten número entre plantas. Se hará en SQL con trazabilidad completa y sin borrar registros.
