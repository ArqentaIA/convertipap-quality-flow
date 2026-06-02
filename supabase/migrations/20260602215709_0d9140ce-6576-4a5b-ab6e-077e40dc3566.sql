-- 1) Nuevos campos en muestras_calidad para la sección C de la captura
ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS estatus_liberacion text NULL,
  ADD COLUMN IF NOT EXISTS defectos text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.muestras_calidad
  DROP CONSTRAINT IF EXISTS muestras_calidad_estatus_liberacion_chk;
ALTER TABLE public.muestras_calidad
  ADD CONSTRAINT muestras_calidad_estatus_liberacion_chk
  CHECK (estatus_liberacion IS NULL OR estatus_liberacion IN ('L','NC','C'));

-- 2) Reordenar variables_calidad al orden exacto solicitado
UPDATE public.variables_calidad SET orden = 10 WHERE clave = 'calibre';
UPDATE public.variables_calidad SET orden = 11 WHERE clave = 'blancuraR457';
UPDATE public.variables_calidad SET orden = 12 WHERE clave = 'blancuraA';
UPDATE public.variables_calidad SET orden = 13 WHERE clave = 'blancuraB';
UPDATE public.variables_calidad SET orden = 14 WHERE clave = 'tensionMD';
UPDATE public.variables_calidad SET orden = 15 WHERE clave = 'tensionCD';
UPDATE public.variables_calidad SET orden = 16 WHERE clave = 'relMDCD';
UPDATE public.variables_calidad SET orden = 17 WHERE clave = 'elongMD';
UPDATE public.variables_calidad SET orden = 18 WHERE clave = 'humedad';
UPDATE public.variables_calidad SET orden = 19 WHERE clave = 'pesoBase';
UPDATE public.variables_calidad SET orden = 20 WHERE clave = 'anchoUtil';
UPDATE public.variables_calidad SET orden = 21 WHERE clave = 'diametro';
UPDATE public.variables_calidad SET orden = 22 WHERE clave = 'peso';
UPDATE public.variables_calidad SET orden = 23 WHERE clave = 'uniones';
UPDATE public.variables_calidad SET orden = 24 WHERE clave = 'tensionRH';

-- 3) Defaults sensatos para variables nuevas (admin podrá editar después)
UPDATE public.variables_calidad
  SET min_default = COALESCE(min_default, -1),
      objetivo_default = COALESCE(objetivo_default, 0),
      max_default = COALESCE(max_default, 1)
  WHERE clave = 'blancuraA';

UPDATE public.variables_calidad
  SET min_default = COALESCE(min_default, -2),
      objetivo_default = COALESCE(objetivo_default, 1),
      max_default = COALESCE(max_default, 4)
  WHERE clave = 'blancuraB';

UPDATE public.variables_calidad
  SET min_default = COALESCE(min_default, 284),
      objetivo_default = COALESCE(objetivo_default, 285),
      max_default = COALESCE(max_default, 286)
  WHERE clave = 'anchoUtil';

UPDATE public.variables_calidad
  SET min_default = COALESCE(min_default, 170),
      objetivo_default = COALESCE(objetivo_default, 190),
      max_default = COALESCE(max_default, 210)
  WHERE clave = 'diametro';

-- 4) Backfill: agregar producto_variables faltantes en TODAS las specs vigentes
--    para las 4 variables que estaban incompletas (blancuraA, blancuraB,
--    anchoUtil, diametro). Usa los defaults de variables_calidad.
INSERT INTO public.producto_variables
  (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id,
       COALESCE(v.min_default, 0),
       COALESCE(v.objetivo_default, 0),
       COALESCE(v.max_default, 0)
FROM public.producto_especificaciones pe
CROSS JOIN public.variables_calidad v
WHERE pe.estado = 'vigente'
  AND v.clave IN ('blancuraA','blancuraB','anchoUtil','diametro')
  AND NOT EXISTS (
    SELECT 1 FROM public.producto_variables pv
    WHERE pv.especificacion_id = pe.id AND pv.variable_id = v.id
  );
