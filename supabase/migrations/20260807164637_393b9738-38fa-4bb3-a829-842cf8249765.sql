-- 1. Respaldo previo
CREATE TABLE IF NOT EXISTS public._backup_normalizacion_estado_qc (
  id uuid PRIMARY KEY,
  numero_rollo text,
  estado text,
  dictamen text,
  estatus_liberacion text,
  autorizado_por uuid,
  capturado_at timestamptz,
  estado_nuevo text,
  respaldado_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public._backup_normalizacion_estado_qc TO authenticated;
GRANT ALL ON public._backup_normalizacion_estado_qc TO service_role;
ALTER TABLE public._backup_normalizacion_estado_qc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo lectura administrada" ON public._backup_normalizacion_estado_qc
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'direccion_general'));

-- 2. Excepciones para revisión manual
CREATE TABLE IF NOT EXISTS public._excepciones_normalizacion_estado_qc (
  id uuid PRIMARY KEY,
  numero_rollo text,
  estado text,
  dictamen text,
  estatus_liberacion text,
  autorizado_por uuid,
  capturado_at timestamptz,
  motivo_excepcion text NOT NULL,
  detectado_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public._excepciones_normalizacion_estado_qc TO authenticated;
GRANT ALL ON public._excepciones_normalizacion_estado_qc TO service_role;
ALTER TABLE public._excepciones_normalizacion_estado_qc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo lectura administrada" ON public._excepciones_normalizacion_estado_qc
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'direccion_general'));

-- 3. Clasificación
WITH c AS (
  SELECT id, numero_rollo, estado::text AS e, dictamen::text AS d,
         estatus_liberacion AS s, autorizado_por, capturado_at,
         CASE estatus_liberacion WHEN 'L' THEN 'liberada' WHEN 'C' THEN 'concesion' WHEN 'NC' THEN 'rechazada' END AS esperado
    FROM public.muestras_calidad
),
excep AS (
  INSERT INTO public._excepciones_normalizacion_estado_qc
    (id, numero_rollo, estado, dictamen, estatus_liberacion, autorizado_por, capturado_at, motivo_excepcion)
  SELECT id, numero_rollo, e, d, s, autorizado_por, capturado_at,
    CASE
      WHEN s IS NOT NULL AND d = 'correccion_solicitada' THEN 'Corrección solicitada con resultado oficial asignado'
      WHEN s IS NULL AND d IN ('liberada','concesion','rechazada') THEN 'Dictamen manual sin resultado oficial'
      ELSE 'Dictamen incompatible con el resultado oficial'
    END
  FROM c
  WHERE (s IN ('L','C','NC') AND d IS NOT NULL AND d <> esperado)
     OR (s IS NOT NULL AND d = 'correccion_solicitada')
     OR (s IS NULL AND d IN ('liberada','concesion','rechazada'))
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
objetivo AS (
  SELECT id, numero_rollo, e, d, s, autorizado_por, capturado_at,
         CASE
           WHEN s IN ('L','C','NC') AND (d IS NULL OR d = esperado) AND e <> esperado THEN esperado
           WHEN s IS NULL AND e = 'pendiente_revision' AND (d IS NULL OR d <> 'correccion_solicitada') THEN 'pendiente_dictamen'
         END AS nuevo
    FROM c
   WHERE id NOT IN (SELECT id FROM excep)
),
resp AS (
  INSERT INTO public._backup_normalizacion_estado_qc
    (id, numero_rollo, estado, dictamen, estatus_liberacion, autorizado_por, capturado_at, estado_nuevo)
  SELECT id, numero_rollo, e, d, s, autorizado_por, capturado_at, nuevo
    FROM objetivo WHERE nuevo IS NOT NULL
  ON CONFLICT (id) DO NOTHING
  RETURNING id, estado_nuevo
)
UPDATE public.muestras_calidad m
   SET estado = r.estado_nuevo::qc_muestra_estado,
       updated_at = now()
  FROM resp r
 WHERE m.id = r.id;