BEGIN;

LOCK TABLE public.muestras_calidad IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.muestras_calidad DISABLE TRIGGER USER;

WITH ordenados AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY capturado_at ASC, id ASC) AS n
  FROM public.muestras_calidad
)
UPDATE public.muestras_calidad m
   SET secuencia_captura = o.n
  FROM ordenados o
 WHERE m.id = o.id;

ALTER TABLE public.muestras_calidad ENABLE TRIGGER USER;

SELECT setval('public.muestras_calidad_secuencia_seq',
              (SELECT COALESCE(MAX(secuencia_captura),0) FROM public.muestras_calidad),
              true);

COMMIT;