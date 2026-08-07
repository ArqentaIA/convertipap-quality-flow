CREATE OR REPLACE VIEW public.vw_muestras_calidad_estado_oficial
WITH (security_invoker = true) AS
SELECT
  m.id                AS muestra_id,
  m.numero_rollo,
  m.maquina_id,
  m.planta_id,
  m.producto_id,
  m.orden_id,
  m.turno,
  m.capturado_at,
  m.hora_muestreo,
  m.estatus_liberacion,
  m.estado            AS estado_workflow,
  m.dictamen,
  CASE m.estatus_liberacion
    WHEN 'L'  THEN 'Liberado'
    WHEN 'C'  THEN 'Liberado con concesión'
    WHEN 'NC' THEN 'No Conforme'
    ELSE 'Pendiente'
  END AS estado_nombre,
  (m.estatus_liberacion IN ('L','C'))            AS es_liberado,
  (m.estatus_liberacion = 'L')                   AS es_liberado_normal,
  (m.estatus_liberacion = 'C')                   AS es_concesion,
  (m.estatus_liberacion = 'NC')                  AS es_no_conforme,
  (m.estatus_liberacion IS NULL)                 AS esta_pendiente
FROM public.muestras_calidad m;

GRANT SELECT ON public.vw_muestras_calidad_estado_oficial TO authenticated;
GRANT SELECT ON public.vw_muestras_calidad_estado_oficial TO service_role;