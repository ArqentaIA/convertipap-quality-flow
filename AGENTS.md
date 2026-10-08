# Architecture rules

- Report data reads must paginate in unique-key order and chunk large identifier filters, assembling every page before returning or exporting; transport limits must never become report totals.
- Report retrieval changes preserve existing weight sources, operational-day rules, plant authorization and export layouts; completeness fixes are not business-rule changes.
- Standalone late-capture reports filter the persisted late-capture flag and capture timestamp; daily windows follow the Mexico operational day through next-day T3 closure, monthly windows remain calendar-based, and other closing-report rules stay unchanged.
- Bobinadora exports extend position columns to the recorded maximum within the supported capture range; SAP-labelled weights remain numeric with display formats so Excel recalculation stays accurate.- Edición de bobina madre: `/calidad/edicion-bobina` reutiliza `qc_editar_rollo` (ventana 24 h, motivo ≥10, observaciones ≥10); cada guardado agrupa sus campos con `qc_ediciones_rollo.evento_id` (legacy NULL se agrupa por muestra+usuario+minuto). El cliente envía `esperado` por medición para detectar conflictos de concurrencia. Reporte de bobinas editadas filtra por `created_at` de la edición con ventana operativa 07:00→07:00 (día y mes), nunca por fecha de producción.

- Al cambiar producto de un rollo (Edición de bobina madre), los datos originales se respaldan íntegros en `qc_cambios_producto_rollo` dentro de la misma transacción de `qc_editar_rollo`; variables no aplicables se retiran y las nuevas son opcionales.
