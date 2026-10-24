# Propuesta final — Bobinas Madre Imp

**Estado:** propuesta para revisión; no autoriza todavía la implementación ni la importación del histórico.

## 1. Pantalla y captura

- Pantalla propia **Bobinas Madre Imp**, inmediatamente debajo de **Control de Calidad** en el menú.
- Registros integrados en la misma base de calidad, identificados expresamente como bobinas externas, con máquina automática **MP-00**; no representan fabricación de Convertipap.
- Disponible para Tlaxcala e Ixtapaluca, con un único contador compartido entre ambas plantas y todos los proveedores.
- Proveedor inicial **Continental**. Selector con alta escrita de otro proveedor para **Karina, Sinay y también analistas**, conforme a la última precisión. El campo Proveedor no se agrega a las capturas de fabricación propia.
- Captura de producto importado, SKU, analista, observaciones, turno y valores de las variables del Excel. El número de rollo se asigna automáticamente al guardar.
- Variables registradas como datos, sin inventar límites ni exigir valores que el analista no haya capturado. Un campo vacío no se convierte en cero.
- Productos importados separados de los fabricados, sin modificar sus especificaciones existentes.
- Si existe un SKU definido y el usuario escribe otro, mostrar una alerta informativa **sin bloquear el guardado**. Conservar el SKU ingresado en la bobina, etiqueta y QR, y registrar el SKU de referencia y la diferencia para trazabilidad; no cambiar automáticamente el catálogo ni extender esta excepción a fabricación propia.

## 2. Revisión de calidad

- **Analista y Calidad pueden elegir Liberado, No conforme o Concesión** al registrar la bobina, conforme a su última instrucción; reemplaza la propuesta de guardar siempre pendiente de dictamen. No se libera automáticamente por los valores capturados.
- Las cuentas/roles concretos que representan Analista y Calidad se verifican y delimitan antes de implementar; no se conceden permisos globales nuevos.
- En el histórico, **Condicionado → Concesión**, conservando también el texto original del Excel para trazabilidad.
- Cada registro conserva quién lo capturó y cuándo; el dictamen conserva responsable, fecha y motivo.

## 3. Histórico y contador: conservación sin duplicados

**La primera nueva captura solicitada ahora es 00761-00**, con contador automático compartido y consecutivos sin huecos. El sufijo **-00** distingue este segmento de fabricación propia; es un sufijo, no un prefijo. Falta confirmar cómo se aplicará al histórico y cómo resolver una coincidencia dentro del mismo segmento.

1. Revisar todas las filas del Excel antes de cargar: números, fechas, productos, estados, valores y campos vacíos. No dar por confirmada la cantidad de rollos ni el último folio a partir del número de filas.
2. Conservar literalmente el **número original del proveedor** y la referencia al archivo/fila de origen. No renumerar el histórico ni sustituir su identificador original.
3. Crear el **folio interno** conservando la parte numérica. Antes de transformar el sufijo del histórico, confirmar si el cambio anterior **-1 a -0** se reemplaza por **-1 a -00**. El original permanece intacto; sufijos diferentes o números ambiguos quedan en una lista de excepciones.
4. Comparar los folios internos entre sí y contra los importados que ya existan. Detectar también equivalencias numéricas con distintos ceros iniciales. **El sufijo -00 no impide que dos capturas importadas intenten usar 00761-00**; requiere control de unicidad dentro del segmento.
5. Si hay duplicados o ambigüedades, detener la carga hasta resolverlos; no eliminar filas, sobrescribir registros ni asignar números alternativos automáticamente.
6. Con el histórico validado, iniciar nuevas capturas en **00761-00**, seguido de **00762-00, 00763-00…**, si no existe coincidencia con el histórico o registros importados previos. Si ya existe **00761-00**, no sobrescribirlo ni renumerarlo: falta confirmar si se continúa después del máximo importado o se detiene para su decisión. Los folios propios terminados en **-0, -1, -4…** no se modifican.
7. Asignar el folio y guardar la bobina en una sola operación, con control de simultaneidad y unicidad para bobinas importadas. Dos analistas guardando a la vez reciben números distintos. Propuesta para «sin huecos»: asignar número solo al guardar correctamente, no consumirlo por formularios cancelados o guardados fallidos y no reutilizar números de registros anulados; pendiente confirmar esta interpretación.
8. Una nueva ejecución del mismo archivo no vuelve a crear sus registros. El número original y la referencia de importación permiten detectar la repetición y cualquier diferencia.

La conversión de folio y estado queda documentada; los valores originales del Excel permanecen recuperables. Las fechas del archivo no se convierten en horas de captura inventadas.

## 4. Etiqueta, QR y reporte

- Etiqueta con folio interno, proveedor, producto, SKU persistido, estado y los datos de impresión que se acuerden.
- QR de trazabilidad dirigido al mismo registro; el QR SKU contiene exactamente el SKU guardado, no el SKU actual del catálogo.
- Reporte independiente **Bobinas Madre Imp**, con el estilo de los reportes existentes y lectura completa, sin truncar registros.
- **Sin Cortes de Bobina, fuera de visores y sin incluirse en producción, Consolidado o reportes de fabricación.**
- El acceso a los datos mediante QR requiere una decisión expresa: no se harán públicos por defecto.
- Este apartado fue aprobado en su última respuesta; la aprobación no se interpreta como autorización para exponer datos privados mediante un QR público ni para inventar formato de impresión.

## 5. Permisos: lo autorizado y lo que no se presume

| Acción | Alcance confirmado |
|---|---|
| Registrar bobinas | Capturistas, Calidad y adgral, según la opción aprobada |
| Consultar histórico y descargar reporte | Usuarios con acceso a Reportes; además del acceso operativo necesario de quienes registran |
| Agregar proveedores | Karina, Sinay y también analistas |
| Compartir estas bobinas | Tlaxcala e Ixtapaluca; no amplía acceso a producción de la otra planta |
| Elegir estado | Analista y Calidad; adgral conserva su acceso general |
| Editar bobinas | Solo Calidad y adgral; ventana y alcance de la edición pendientes |
| Anular o borrar bobinas | No autorizado |
| Administrar productos importados | No se presume autorización; pendiente precisar responsables |

El acceso general previamente establecido de adgral no se retira. La última instrucción amplía el alta de proveedores a analistas y limita la edición a Calidad/adgral. No se cambiarán roles ni permisos globales para habilitar este módulo; se verificará qué cuentas corresponden a cada acción.

## 6. Precisiones pendientes, enumeradas

1. **Histórico y contador:** confirmar si todo el histórico cambia de -1 a **-00**, qué hacer si **00761-00** ya existe dentro del segmento, y si «sin huecos» significa no consumir números por intentos fallidos/cancelados, sin reutilizar folios anulados. No corregir números históricos sin esta precisión.
2. **Cuentas y productos/SKU:** verificar qué cuentas representan Analista y Calidad y quién administra productos importados; definir cómo se distinguirán códigos y versiones de los fabricados. El SKU distinto al de referencia está autorizado con alerta sin bloqueo para la captura importada, no como cambio de la regla global del catálogo.
3. **Fecha y planta:** definir la fecha que captura el analista y la asignación de planta de recepción, si se requiere. Para filas históricas sin planta, hora, SKU, analista o turno, conservar la ausencia; no deducirlos ni completar datos sin autorización.
4. **Campos obligatorios y revisión:** precisar si SKU, analista, observaciones y turno son obligatorios; si se permite guardar sin ninguna medición; motivo/evidencia requerida para elegir o cambiar estado. Analista y Calidad ya están autorizados para elegir los tres estados.
5. **Edición y anulación:** edición autorizada solo para Calidad/adgral; precisar campos editables, cambios de dictamen y ventana. No extender automáticamente la regla de 36 h ni permitir borrado/anulación.
6. **Etiqueta, QR y reporte:** aprobar tamaño, campos y QR de la etiqueta; acceso autenticado o público limitado para trazabilidad; filtros por fecha/estado/proveedor/producto y formatos de descarga del reporte. No asumir envíos automáticos por correo.
7. **Validación del Excel:** presentar el inventario real de filas, folios originales/internos, duplicados, vacíos y excepciones, así como el siguiente folio calculado, antes de importar. El inicio exacto no queda confirmado hasta revisar los folios, no solamente contar filas.

## 7. Protección de producción y validación previa a entrega

- No modificar contadores, históricos, variables, reglas de liberación o permisos de fabricación propia.
- No alterar Control de Calidad ni Captura fuera de turno.
- Evitar que MP-00 y los productos importados entren automáticamente en selectores de fabricación, Cortes de Bobina, visores o totales productivos.
- Probar acceso por acción y cuenta, dos guardados simultáneos, importación repetida, campos vacíos, dictamen y coincidencia registro–etiqueta–QR–reporte.
- Comparar los totales de producción y los registros existentes antes/después. La implementación y la importación comenzarán únicamente tras resolver los puntos pendientes y su aprobación.

## Detalles técnicos propuestos

Identificación explícita de origen importado dentro de calidad; folio original separado del interno; clave única del contador importado; asignación transaccional; referencia de archivo/fila y auditoría de transformación. Permisos comprobados en servidor por acción, sin ampliar roles globales. Lecturas de producción excluyen el origen importado sin cambiar sus reglas de cálculo. El uso de MP-00 y los estados sin límites se adapta al esquema existente tras verificarlo, sin reutilizar automáticamente lógica de fabricación que exija orden o especificación con límites.
