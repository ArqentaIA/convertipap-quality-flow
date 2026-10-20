-- Read-only regression check. Each rule returns true when satisfied.
WITH specs AS (
  SELECT e.id FROM public.producto_especificaciones e
  JOIN public.productos p ON p.id = e.producto_id
  WHERE p.codigo = 'PSC01' AND e.estado = 'vigente'
), variables AS (
  SELECT s.id, v.clave FROM specs s
  JOIN public.producto_variables pv ON pv.especificacion_id = s.id
  JOIN public.variables_calidad v ON v.id = pv.variable_id
)
SELECT 'PSC01 no incluye RH duplicada' AS regla,
  (SELECT count(*) FROM specs) > 0
  AND NOT EXISTS (SELECT 1 FROM variables WHERE clave = 'rh') AS cumple
UNION ALL
SELECT 'PSC01 conserva una Tensión RH por especificación',
  (SELECT count(*) FROM specs) > 0
  AND NOT EXISTS (
    SELECT s.id FROM specs s LEFT JOIN variables v ON v.id = s.id AND v.clave = 'tensionRH'
    GROUP BY s.id HAVING count(v.clave) <> 1
  );