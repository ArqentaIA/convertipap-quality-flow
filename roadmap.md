# Roadmap

## Consulta transversal de Bobinas Madre Imp y SKU
- [x] Autorizar consulta y cortes de importadas en ambas plantas, fuera de visores y reportes de fabricación.
- [x] Sin SKU mostrar «necesita atención Calidad SKU» y bloquear continuar; asignación individual solo Calidad/adgral, sin deducir ni completar masivamente correspondencias.
- [ ] Implementar y verificar después de resolver alcance y correspondencias pendientes, conservando permisos y registros originales.

## Bobinas Madre Imp — propuesta previa a implementación
- [x] Incorporar precisiones: nuevas capturas desde 00761-00, contador automático compartido, elección de estado por analista/Calidad, alta de proveedores por analistas, edición solo Calidad/adgral y SKU distinto con alerta sin bloqueo.
- [x] Validar Excel: 759 bobinas 1–759 sin duplicados; 622 folios numéricos y 137 -0; celda aislada 284 sin folio. Documentado en docs/bobinas-madre-imp-validacion.md.
- [x] Resolver numeración actualizada tras validación: todos los folios internos -00 con original respaldado; nuevas desde 00760-00 o después del máximo si ocupado; folios no anulables ni repetibles. Autorizados registros separados en la misma base, sin órdenes/límites ficticios.
- [x] Confirmar que todos los capturistas actuales pueden elegir estado y agregar proveedores únicamente en Bobinas Madre Imp; sin ampliar permisos de otros módulos.
- [x] Resolver administración de productos importados (Karina/Sinay/adgral) y edición (36 h desde captura). Histórico conserva fecha sin inventar hora/planta/turno/analista; QR requiere sesión por defecto.
- [x] Implementar módulo e importar 759 bobinas sin duplicados; captura/edición y permisos verificados con transacción autenticada y reversión total. Excel completo y etiqueta revisados; QR decodificados. 9 pruebas aprobadas y vista móvil comprobada. Verificación temporal retirada. No se publicó; impresión física y guardado desde pantalla con Karina/Sinay no certificados. Contador disponible 00760-00 según decisión posterior documentada.

## Código y trazabilidad SKU
- [x] Alinear validación de código con espacios y símbolos; verificar RPC autenticada: SKU en versión distinta permitido, misma versión bloqueada con mensaje claro.
- [x] Alinear SKU guardado en ambos módulos con etiqueta y QR; admitir SKU manual sin catálogo, hasta 64 caracteres; históricos operativos intactos.
- [x] Verificar con adgral alta/edición de QA_SKU+231026, captura en MP-10 del rollo 164-10 y lectura/reimpresión: SKU SSK101101285 igual al QR decodificado. 15 pruebas pasan. Campo manual fuera de turno visible; no se guardó allí ni se probó con Karina/Sinay. Producto temporal desactivado, rollo de pruebas conservado; app no publicada.

## Actualización de Variables de Calidad
- [x] Corregir guardado completo de límites y auditoría en una transacción con control de concurrencia; error PSK01 reproducido y corregido, Tensión RH 270/300/330 guardada únicamente en su borrador.
- [x] Conservar revisión/publicación y actualizar lecturas de ambos módulos y plantas con Realtime y respaldo de conexión, sin borrar valores ingresados.
- [x] Verificar con adgral guardado, revisión y publicación de producto temporal: cuatro capturas abiertas (ambos módulos × TLX/IXT) cambian 135/150/165 → 270/300/330 sin recarga, conservando el valor 150. Producto temporal desactivado; PSK01 real no publicado. Dos pruebas aprobadas, sin errores de pantalla. Cuentas Karina/Sinay no probadas; app aún no publicada.

## PSC01: variable RH duplicada
- [x] Retirar RH únicamente de los dos perfiles vigentes de PSC01, conservando Tensión RH; respaldo y motivo en bitácora. 1,937 muestras y 32,268 mediciones históricas sin cambios (huellas verificadas).
- [x] Verificar PSC01 MP-04 con administrador en Control de Calidad y Captura fuera de turno: Tensión RH visible, RH ausente; verificar ambos perfiles vigentes y prueba SQL de regresión.

## Reportes completos
- [x] Corregir consulta mensual: grupos de órdenes, páginas completas y periodo acotado.
- [x] Revisar y corregir el mismo riesgo en otros reportes sin alterar cálculos ni formatos.
- [x] Validar pruebas y septiembre en pantalla/Excel contra datos reales de ambas plantas; verificar aviso de error y bloqueo de exportación. Sin enviar correos.

## Revisión integral solicitada
- [x] Auditar reportes y descargas; corregir lecturas auxiliares y paginación de ejecutivo, anual, no conformes y mensual de bobinadoras sin cambiar cálculos.
- [x] Ampliar columnas de bobinadoras hasta C350; verificar los tres formatos y recalcular subtotales SAP en Excel sin errores.
- [x] Verificar producción dinámica julio/agosto/septiembre en ambas plantas contra pantalla, Excel y base; comprobar descargas anual/mensual, no conformes, general y consolidado con administrador. Sin enviar correos.
- [x] Probar bloqueo de descarga anual/mensual ante fallo de red y ejecutar pruebas de paginación y fechas. La verificación no certifica todos los reportes ni todos los periodos.
- [x] Alcance confirmado: cambiar solo el reporte independiente de capturas fuera de turno; otros reportes conservan sus reglas.
- [x] Ajustar reporte diario fuera de turno de 07:00 de la fecha seleccionada hasta cierre T3 a las 07:00 del día siguiente; verificar 06/10 en pantalla, Excel y base (3 registros TLX), pruebas y mensual sin cambios.
- [x] Crear y probar reporte independiente de capturas fuera de turno por día y mes, agrupado por fecha real de captura en México; sin modificar cierres ni históricos.
- [x] Ajustar solo el menú del reporte fuera de turno y descarga directa sin tabla en pantalla; Excel plano sin titulares. Descargas verificadas: diario 06/10 (3 registros TLX), mensual septiembre (211 registros); aviso ante fallo de red, menú compacto y 7 pruebas aprobadas. Sin cambiar capturas ni enviar correos.
- [x] Edición de bobina madre (Jefe de Calidad, ventana 24 h, ambos módulos de captura): menú bajo Control de Calidad, búsqueda por folio/fecha/máquina, edición con motivo y control de concurrencia, un evento por guardado (evento_id), impresión de etiqueta sin evento. Verificado con gcalidad@: edición real guardada y revertida, reporte muestra 1 bobina / 2 eventos.
- [x] REPORTE DE BOBINAS EDITADAS en Reportes: día/mes operativo 07:00→07:00 (inicio inclusivo, fin exclusivo), filtros planta/máquina/usuario/folio, resumen + detalle por evento, XLSX con hojas Resumen y Detalle. Solo usuarios con permiso de edición.
