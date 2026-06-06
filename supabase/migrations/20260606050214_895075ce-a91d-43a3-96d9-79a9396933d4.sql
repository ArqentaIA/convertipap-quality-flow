-- 1) Deduplicar: conservar la captura más antigua por numero_rollo y eliminar las posteriores.
--    Hallazgos previos a esta migración (rollos duplicados en la base global):
--      - 1047-6 (2 capturas)  → se conserva 20466f41 (2026-06-04 19:26), se elimina badba003 (2026-06-04 21:49)
--      - 1048-6 (2 capturas)  → se conserva 2ff98636 (2026-06-04 18:59), se elimina 963b868a (2026-06-04 19:28)
--      - 1100   (2 capturas)  → se conserva 57080368 (2026-06-06 00:12), se elimina 8978579c (2026-06-06 01:38)
WITH ranked AS (
  SELECT id,
         numero_rollo,
         ROW_NUMBER() OVER (PARTITION BY numero_rollo ORDER BY capturado_at ASC, created_at ASC, id ASC) AS rn
  FROM public.muestras_calidad
  WHERE numero_rollo IS NOT NULL
)
DELETE FROM public.muestras_calidad m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2) Restricción de unicidad absoluta a nivel de base de datos.
--    Impide duplicados por error humano o concurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS muestras_calidad_numero_rollo_uidx
  ON public.muestras_calidad (numero_rollo);
