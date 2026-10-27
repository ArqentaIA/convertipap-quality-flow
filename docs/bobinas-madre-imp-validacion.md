# Bobinas Madre Imp — validación previa

Histórico importado en registros separados de calidad. No se agregaron bobinas ni órdenes a fabricación.

## Excel verificado

- Archivo: BOBINAS_CONTINENTAL.xlsx.
- Huella SHA-256: f9c984de7b0cda2c0dd021c56c1aa230e024238def3211dd56d60955bdb7e75a.
- 759 filas de bobinas, folios consecutivos 1 a 759; sin duplicados ni huecos dentro de ese intervalo.
- 622 folios son números sin sufijo y 137 son textos con sufijo -0. No hay folios originales -1 en este archivo; la conversión aprobada de -1 a -00 no cubre literalmente los formatos reales. Conservar siempre el valor original.
- Una celda aislada en fila 1047168, columna Ancho útil, contiene 284; no tiene folio, fecha, producto o estado. No tratarla como bobina ni asociarla a otra fila sin autorización.
- Productos: PTC31 166, PSM33 348, PHR31 130, PSK32 115.
- Estados: LIBERADO 715, CONDICIONADO 9, NO CONFORME 35.
- Vacíos en mediciones: Peso base 27, R457 28, a* 29, b* 34, Ancho útil 6; Peso bobina no tiene vacíos.
- No existe folio 760 en el archivo. Confirmado (27/10/2026): la primera captura nueva es 00760-00, continuando sin hueco tras 00759-00.

## Protección de integración

La captura actual utiliza referencias a orden, especificación y planta, además de límites por variable. Las bobinas externas sin esos datos no deben recibir órdenes, límites, turnos ni horas inventados para encajar en ese flujo. Antes de crear la estructura definitiva se debe resolver el alcance de «misma base de calidad»: registros externos separados en esa misma base o adaptación explícita del registro actual. No activar MP-00 ni productos externos en selectores de fabricación.

## Decisiones posteriores a la validación

- El usuario cambia el inicio a **00760-00** y confirma que todos los folios internos deben llevar **-00**, no -0 ni -1. El original se conserva por separado.
- Autoriza registros externos separados dentro de la misma base de calidad, sin órdenes ni límites ficticios.
- Confirmado: capturistas actuales pueden elegir estado y agregar proveedores solo en este módulo.
- Edición por Calidad/adgral limitada a las 36 horas siguientes a captura; catálogo de productos por Karina, Sinay y adgral.

## Resultado verificado

- 759 bobinas importadas, 759 números únicos, máximo 759; contador siguiente 760. Segunda importación creó cero bobinas.
- 45 fechas de texto `24/082026` y `25/082026` se interpretaron como 24 y 25 de agosto de 2026; el texto original permanece intacto. Espacios vacíos se conservaron como nulos, nunca cero.
- La celda 284 sin folio está respaldada como excepción del archivo, no se inventó una bobina.
- Histórico sin hora de captura, planta, turno, SKU ni analista inventados. Fecha de importación separada de fecha original.
- Prueba autenticada transaccional aprobada con reversión total: primera captura 00760-00, SKU distinto, valores vacíos, concesión/rechazo, reintento idempotente, fallo sin consumir folio, permisos por acción, edición auditada, conflicto de revisión y vencimiento 36 h. Sin productos/proveedores/bobinas de prueba persistidos.
- Excel descargado con 759 filas, orden 1–759 y hojas Resumen/Detalle; etiqueta PDF generada y revisada visualmente. QR de trazabilidad requiere sesión; QR de SKU usa el valor persistido.
- Fabricación siguió recibiendo capturas operativas concurrentes; no se puede afirmar igualdad de totales globales entre horas diferentes. La prueba transaccional comprobó que su flujo no altera muestras de fabricación.
- No se publicó la aplicación. No se guardó una bobina ficticia desde la pantalla ni se verificó impresión física ni sesiones de Karina/Sinay en navegador; los permisos se probaron en la transacción autenticada.