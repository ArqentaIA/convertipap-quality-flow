# Auditoría de trazabilidad — Registro de rollos, cambio de estatus y liberación

Auditoría READ ONLY del proceso global (captura en Control de Calidad y en Captura fuera de turno, dictamen/liberación, etiquetas/QR y bitácora). Datos verificados sobre la base productiva: 4,853 muestras, 225,800 registros de bitácora.

## Lo que SÍ está correcto (no se toca)

- Numeración consecutiva por máquina: transacción única con bloqueo de fila, idempotente, igual en ambos módulos de captura. 0 números duplicados.
- Coherencia estado/estatus: 100% consistente (liberada/L, rechazada/NC, concesion/C, pendiente/NULL).
- Sin mediciones huérfanas, sin muestras sin mediciones.
- Bitácora automática por disparador de base de datos sobre muestras y mediciones (208 mil eventos): toda alta y edición sí queda registrada a nivel base.

## Hallazgos (con evidencia)

### H1 — CRÍTICO: el evento "cambio de estatus" casi nunca se registra con su motivo
La bitácora de dictamen se escribe desde el servidor con una inserción directa envuelta en un `try/catch` mudo, pero la política de seguridad de `audit_log` solo permite insertar a `administrador`. Resultado real: **1,506 dictámenes emitidos y solo 3 eventos `STATUS_CHANGE` registrados**. Todo lo demás falló en silencio.
Consecuencia: no hay evidencia formal de quién liberó/rechazó, con qué IP, dispositivo ni motivo. Es exactamente el registro que exige una auditoría de calidad.

### H2 — CRÍTICO: el motivo del dictamen no es un motivo
`dictamen_motivo` guarda literalmente la palabra del dictamen ("concesion", "liberada"). **0 de 1,506 dictámenes tienen un motivo real de al menos 10 caracteres.** La pantalla envía el propio dictamen como motivo; las observaciones del gerente sí se guardan aparte, pero el campo de motivo —el que consultan los reportes y la bitácora— está vacío de contenido.

### H3 — ALTO: existe una función de base de datos oficial para cambio de estatus que nadie usa
`change_roll_status` implementa lo correcto: verificación de rol, motivo obligatorio ≥10 caracteres, bloqueo de la fila, y escritura garantizada de la bitácora con IP, dispositivo, planta, máquina, laboratorio, folio y estatus anterior/nuevo. El código de la aplicación la ignora y hace una actualización directa sin bloqueo ni garantía de bitácora. De ahí nacen H1 y H2.

### H4 — ALTO: el resolvedor de estatus puede devolver "indefinido"
`src/lib/roll-status.ts` decide el estatus para QR/etiqueta/reportes leyendo `dictamen`/`estado`, y su bloque final no contempla `pendiente_dictamen`. Hoy hay **394 muestras en ese estado**: al consultarlas por QR el resolvedor no devuelve valor. Además usa una fuente distinta a `qc-estado-oficial.ts` (que usa `estatus_liberacion`), y la etiqueta de impresión lee los campos crudos por su cuenta: **cuatro caminos distintos para el mismo dato**.

### H5 — MEDIO: dictamen y autorización se ejecutan en un solo paso
La pantalla llama dictaminar y autorizar en la misma acción y el mismo rol firma ambos. La regla documentada (dictamen técnico + autorización gerencial) no se cumple, y la propia función marca `autorizado_por` automáticamente.

### H6 — MEDIO: liberación automática sin evento propio
2,281 rollos tienen estatus L asignado automáticamente por la regla de especificación (sin firma humana). Es correcto por diseño, pero no existe un evento explícito "liberación automática por cumplimiento de especificación" en la bitácora, así que en una auditoría externa no se distingue de una liberación firmada.

### H7 — MEDIO: acciones sin registro
No se registran: vinculación de pesaje a muestra, impresión del PDF de detalle de rollo, ni la autorización cuando se invoca sola.

### H8 — MEDIO: trazabilidad de autoría en ediciones
Al editar una muestra se sobrescribe `capturado_por` con el último editor: se pierde el capturista original. El motivo de edición posterior a dictamen es un texto fijo genérico, no el motivo real del usuario.

### H9 — INFORMATIVO: 4,816 de 4,853 muestras sin pesaje vinculado
La cadena rollo → peso físico está prácticamente sin enlazar.

## Soluciones propuestas

Aplican por igual a **Control de Calidad** y a **Captura fuera de turno** (comparten componente y servidor).

1. **Enrutar todo cambio de estatus por `change_roll_status`** (H1, H2, H3, H5).
   Reescribir `dictaminarMuestra` para invocar la función de base de datos en vez de actualizar la tabla: bloqueo de fila, motivo obligatorio real, bitácora garantizada por función privilegiada (ya no depende de la política de inserción). Se extiende la función para recibir también `observaciones` y el rol autorizador, conservando el comportamiento actual de estatus. Se elimina la inserción directa a `audit_log` con `try/catch` mudo.

2. **Motivo real obligatorio** (H2).
   La pantalla de cambio de estatus deja de enviar el dictamen como motivo: envía el texto escrito por el gerente, validado en cliente y servidor con mínimo 10 caracteres. Sin motivo, no hay cambio de estatus.

3. **Bitácora que no puede fallar en silencio** (H1).
   Toda escritura de bitácora pasa por la función `audit_action` (privilegiada). Si falla, el error se propaga en las acciones críticas (cambio de estatus) en lugar de descartarse.

4. **Fuente única de verdad del estatus** (H4).
   `estatus_liberacion` queda como único origen. `roll-status.ts` se reescribe para derivar de ese campo con caso por defecto explícito (nunca devuelve indefinido) y `pendiente_dictamen` mapeado a "Pendiente de dictamen". La etiqueta de impresión y el visor QR consumen la misma función. Se conservan las advertencias de inconsistencia (edición posterior al dictamen, ajustes abiertos).

5. **Evento explícito de liberación automática** (H6).
   La función que recalcula el estatus registra en bitácora `LIBERACION_AUTOMATICA` con las variables evaluadas, para distinguir liberación por especificación de liberación firmada.

6. **Registrar las acciones faltantes** (H7): vinculación de pesaje, impresión de PDF de detalle y autorización individual.

7. **Preservar autoría original** (H8): `capturado_por` deja de sobrescribirse en edición; se añade motivo real de edición capturado del usuario cuando la muestra ya tiene dictamen.

8. **Reporte de integridad** (verificación): consulta administrativa que lista rollos con estatus sin evento de bitácora asociado, dictámenes sin motivo válido y muestras en estado indefinido, para cierre documental.

## Sin cambios retroactivos automáticos

Los 1,506 dictámenes históricos sin motivo y sin evento no se reescriben: alterarlos destruiría la evidencia real. Se propone dejarlos identificados en el reporte de integridad del punto 8 y, si Dirección lo requiere, registrar una nota de regularización fechada.

## Alcance técnico

- Base de datos: extender `change_roll_status`, añadir evento de liberación automática en `qc_recalc_estatus_muestra`, función de reporte de integridad.
- Servidor: `src/lib/qc.functions.ts` (dictaminar, autorizar, upsert), `src/lib/pesajes.functions.ts`.
- Cliente: `src/routes/calidad.captura.tsx`, `src/routes/calidad.revision.tsx`, `src/components/qc/DetalleCalidadModal.tsx`, `src/lib/roll-status.ts`, `src/lib/etiqueta-liberacion.ts`.
