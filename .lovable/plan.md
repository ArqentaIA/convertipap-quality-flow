# Colisión de números de rollo entre Tlaxcala e Ixtapaluca (Cortes de Bobina)

## Qué está pasando

Los rollos 11319-4 y 11357-4 existen únicamente en **Tlaxcala (MP-04)**. Cuando en Ixtapaluca se abre ese mismo número, el módulo de Cortes de Bobina lo toma como si fuera el rollo de Tlaxcala y muestra los cortes ya registrados allá, impidiendo capturar los de Ixtapaluca.

La causa es que Cortes de Bobina identifica el rollo **solo por su número**, sin considerar planta ni máquina:

- La búsqueda de contexto localiza la captura de Calidad por número de rollo, sin filtrar por planta.
- El registro maestro de rollos de cintas tiene el número como valor **único global**, así que un mismo número no puede existir dos veces aunque pertenezca a plantas distintas.
- El cierre de rollo y el listado de bajadas siguen la misma lógica por número.

En cambio, Calidad y Pesaje de Rollo ya están correctos: cada uno permite el mismo número en plantas o máquinas distintas.

## Riesgo actual

- Ixtapaluca no puede capturar cortes de rollos cuyo número ya se usó en Tlaxcala.
- Peor: si alguien lograra capturar, los cortes se colgarían del rollo equivocado y contaminarían reportes y trazabilidad de la otra planta.

## Propuesta de solución

1. **Identificar el rollo por planta y máquina, no solo por número.**
   Se agrega la máquina (y su planta) al registro maestro de rollos de cintas y se reemplaza la unicidad global por unicidad **por máquina + número**, igual que ya funciona Pesaje de Rollo.

2. **Acotar la búsqueda a la planta del usuario.**
   Al buscar un rollo en Cortes de Bobina, la plataforma considerará únicamente los rollos de las plantas a las que el usuario tiene acceso y de la planta activa seleccionada. Si el número existe en otra planta, simplemente no se toma.

3. **Ambigüedad controlada.**
   Si dentro de la misma planta el número existiera en más de una máquina, se pedirá elegir la máquina en lugar de fallar o adivinar.

4. **Regularizar los datos existentes.**
   Los rollos de cintas ya creados se asocian a la máquina de su captura de Calidad correspondiente. No se borra ni se reasigna ningún corte ya registrado en Tlaxcala.

5. **Verificación.**
   Se comprueba que 11319-4 y 11357-4 conserven intactos sus cortes en Tlaxcala y que Ixtapaluca pueda abrir esos mismos números y capturar sus propios cortes de forma independiente.

## Detalle técnico

- `rollos_cintas`: nuevas columnas `maquina_id` / `planta_id`; se elimina `uq_rollos_cintas_numero` y se crea único `(maquina_id, numero_rollo)`. Backfill desde `muestras_calidad`.
- `pc_get_or_create_rollo`, `cerrar_rollo_cintas`, `pc_bajadas_rollo`, `buscar_contexto_rollo_cintas`: reciben/resuelven máquina y filtran por `user_allowed_planta_ids(auth.uid())`; la selección de `muestras_calidad` deja de usar solo `numero_rollo`.
- `crear_lote_pesaje_cintas*` reutiliza el rollo resuelto por máquina.
- Frontend (`src/routes/pesaje.cintas.tsx`, `src/lib/pesaje-cintas.functions.ts`): envía la planta/máquina activa y maneja el caso de máquina ambigua.
