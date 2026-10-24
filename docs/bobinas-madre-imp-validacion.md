# Bobinas Madre Imp — validación previa

No se ha importado ni modificado información de producción.

## Excel verificado

- Archivo: BOBINAS_CONTINENTAL.xlsx.
- Huella SHA-256: f9c984de7b0cda2c0dd021c56c1aa230e024238def3211dd56d60955bdb7e75a.
- 759 filas de bobinas, folios consecutivos 1 a 759; sin duplicados ni huecos dentro de ese intervalo.
- 622 folios son números sin sufijo y 137 son textos con sufijo -0. No hay folios originales -1 en este archivo; la conversión aprobada de -1 a -00 no cubre literalmente los formatos reales. Conservar siempre el valor original.
- Una celda aislada en fila 1047168, columna Ancho útil, contiene 284; no tiene folio, fecha, producto o estado. No tratarla como bobina ni asociarla a otra fila sin autorización.
- Productos: PTC31 166, PSM33 348, PHR31 130, PSK32 115.
- Estados: LIBERADO 715, CONDICIONADO 9, NO CONFORME 35.
- Vacíos en mediciones: Peso base 27, R457 28, a* 29, b* 34, Ancho útil 6; Peso bobina no tiene vacíos.
- No existe folio 760 en el archivo. Iniciar nuevas capturas en 00761-00 cumple el inicio solicitado, pero deja 00760-00 sin registro histórico. No inventar una bobina para rellenarlo.

## Protección de integración

La captura actual utiliza referencias a orden, especificación y planta, además de límites por variable. Las bobinas externas sin esos datos no deben recibir órdenes, límites, turnos ni horas inventados para encajar en ese flujo. Antes de crear la estructura definitiva se debe resolver el alcance de «misma base de calidad»: registros externos separados en esa misma base o adaptación explícita del registro actual. No activar MP-00 ni productos externos en selectores de fabricación.

## Decisiones posteriores a la validación

- El usuario cambia el inicio a **00760-00** y confirma que todos los folios internos deben llevar **-00**, no -0 ni -1. El original se conserva por separado.
- Autoriza registros externos separados dentro de la misma base de calidad, sin órdenes ni límites ficticios.
- La respuesta «capturistas?» no confirma por sí sola que todos los capturistas puedan elegir estado y agregar proveedores; aclarar esa identidad.

## Bloqueos de importación

Confirmar tratamiento de la celda aislada, cuentas/roles de analistas, campos obligatorios, fecha/planta y ventana de edición. QR sin exposición pública por defecto. Las reglas confirmadas no autorizan completar datos históricos ausentes.