# Número de rollo estimado y bloqueado en Pesaje

## Objetivo
Al seleccionar una máquina en **Pesaje de Bobina Madre**, mostrar automáticamente el siguiente número estimado conforme a la numeración configurada para esa máquina, sin permitir que el usuario lo modifique.

## Cambios
- Consultar la numeración vigente de la máquina seleccionada.
- Formatear el estimado con su relleno y sufijo configurados; para MP-01, por ejemplo, `000001-1`.
- Mostrar el número en un campo de solo lectura y eliminar la captura manual del número.
- Bloquear fotografía y registro mientras la estimación esté cargando o no exista una numeración activa.
- Refrescar el estimado después de registrar un pesaje.
- Mantener el valor como estimación: no se consumirá ni reservará el consecutivo al seleccionar la máquina.

## Validación
- Verificar en la vista que MP-01 muestre cinco ceros antes del primer consecutivo.
- Confirmar que el campo no sea editable y que cambiar de máquina recalcule el estimado.
