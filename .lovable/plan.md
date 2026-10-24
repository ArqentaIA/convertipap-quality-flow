# Propuesta final — Bobinas Madre Imp

**Estado:** propuesta para revisión; no autoriza todavía la implementación ni la importación del histórico.

## 1. Pantalla y captura

- Pantalla propia **Bobinas Madre Imp**, inmediatamente debajo de **Control de Calidad** en el menú.
- Registros integrados en la misma base de calidad, identificados expresamente como bobinas externas, con máquina automática **MP-00**; no representan fabricación de Convertipap.
- Disponible para Tlaxcala e Ixtapaluca, con un único contador compartido entre ambas plantas y todos los proveedores.
- Proveedor inicial **Continental**. Selector con alta escrita de otro proveedor únicamente para **Karina y Sinay**, como se autorizó. El campo Proveedor no se agrega a las capturas de fabricación propia.
- Captura de producto importado, SKU, analista, observaciones, turno y valores de las variables del Excel. El número de rollo se asigna automáticamente al guardar.
- Variables registradas como datos, sin inventar límites ni exigir valores que el analista no haya capturado. Un campo vacío no se convierte en cero.
- Productos importados separados de los fabricados, sin modificar sus especificaciones existentes.

## 2. Revisión de calidad

- Las nuevas bobinas quedan **pendientes de dictamen** al guardarse; no se liberan por tener valores capturados.
- Después de revisión se asigna **Liberado, No conforme o Concesión**. Las cuentas concretas autorizadas para dictaminar se precisan antes de implementar; no se habilita automáticamente a todos los usuarios con rol Calidad.
- En el histórico, **Condicionado → Concesión**, conservando también el texto original del Excel para trazabilidad.
- Cada registro conserva quién lo capturó y cuándo; el dictamen conserva responsable, fecha y motivo.

## 3. Histórico y contador: conservación sin duplicados

**00760-0 es el inicio solicitado para nuevas capturas, siempre que el histórico no haya alcanzado o superado ese número.** Usted autorizó continuar después del histórico si existe coincidencia.

1. Revisar todas las filas del Excel antes de cargar: números, fechas, productos, estados, valores y campos vacíos. No dar por confirmada la cantidad de rollos ni el último folio a partir del número de filas.
2. Conservar literalmente el **número original del proveedor** y la referencia al archivo/fila de origen. No renumerar el histórico ni sustituir su identificador original.
3. Crear el **folio interno** conservando la parte numérica y cambiando únicamente el sufijo **-1 a -0**. Ejemplo: original `00759-1` → interno `00759-0`. Los sufijos diferentes o números ambiguos quedan en una lista de excepciones para su decisión.
4. Comparar los folios internos entre sí y contra los importados que ya existan. Detectar también equivalencias como `760-1` y `00760-1`: no pueden convertirse en dos bobinas diferentes con el mismo número interno.
5. Si hay duplicados o ambigüedades, detener la carga hasta resolverlos; no eliminar filas, sobrescribir registros ni asignar números alternativos automáticamente.
6. Con el histórico validado, el siguiente número será **el mayor entre 760 y el máximo número histórico importado más uno**:
   - Último histórico `00759-0` → primera nueva captura `00760-0`.
   - Histórico ya contiene `00760-0` → primera nueva captura `00761-0`.
   - Último histórico `00820-0` → primera nueva captura `00821-0`; no reutilizar huecos anteriores.
7. Asignar el folio y guardar la bobina en una sola operación, con control de simultaneidad y unicidad para bobinas importadas. Dos analistas guardando a la vez reciben números distintos.
8. Una nueva ejecución del mismo archivo no vuelve a crear sus registros. El número original y la referencia de importación permiten detectar la repetición y cualquier diferencia.

La conversión de folio y estado queda documentada; los valores originales del Excel permanecen recuperables. Las fechas del archivo no se convierten en horas de captura inventadas.

## 4. Etiqueta, QR y reporte

- Etiqueta con folio interno, proveedor, producto, SKU persistido, estado y los datos de impresión que se acuerden.
- QR de trazabilidad dirigido al mismo registro; el QR SKU contiene exactamente el SKU guardado, no el SKU actual del catálogo.
- Reporte independiente **Bobinas Madre Imp**, con el estilo de los reportes existentes y lectura completa, sin truncar registros.
- **Sin Cortes de Bobina, fuera de visores y sin incluirse en producción, Consolidado o reportes de fabricación.**
- El acceso a los datos mediante QR requiere una decisión expresa: no se harán públicos por defecto.

## 5. Permisos: lo autorizado y lo que no se presume

| Acción | Alcance confirmado |
|---|---|
| Registrar bobinas | Capturistas, Calidad y adgral, según la opción aprobada |
| Consultar histórico y descargar reporte | Usuarios con acceso a Reportes; además del acceso operativo necesario de quienes registran |
| Agregar proveedores | Solo Karina y Sinay |
| Compartir estas bobinas | Tlaxcala e Ixtapaluca; no amplía acceso a producción de la otra planta |
| Dictaminar | Después de revisión por Calidad/adgral; falta fijar las cuentas concretas de Calidad |
| Editar, anular o borrar bobinas | No autorizado todavía |
| Administrar productos importados | No se presume autorización; pendiente precisar responsables |

El acceso general previamente establecido de adgral no se retira. Debe aclararse expresamente si incluye **agregar proveedores**, porque para esa acción usted indicó «solo Karina y Sinay». No se cambiarán roles ni permisos globales para habilitar este módulo.

## 6. Precisiones pendientes, enumeradas

1. **Cuentas y acciones:** confirmar las cuentas de Karina y Sinay y si son las únicas de Calidad que pueden dictaminar; resolver la excepción de adgral para agregar proveedores. Precisar quién administra productos importados.
2. **Identidad de productos/SKU:** definir cómo se distinguirán sus códigos y versiones de los productos fabricados, sin inventar nombres o SKU. Acordar qué hacer si un SKU coincide con un producto de la misma versión conforme a la regla actual del sistema.
3. **Fecha y planta:** definir la fecha que captura el analista y la asignación de planta de recepción, si se requiere. Para filas históricas sin planta, hora, SKU, analista o turno, conservar la ausencia; no deducirlos ni completar datos sin autorización.
4. **Campos obligatorios y revisión:** precisar si SKU, analista, observaciones y turno son obligatorios; si se permite guardar sin ninguna medición; motivo/evidencia requerida al dictaminar y si una etiqueta pendiente puede imprimirse.
5. **Edición y anulación:** decidir quién puede corregir registros o dictámenes y bajo qué ventana. No extender automáticamente la regla de 36 h ni permitir borrado.
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
