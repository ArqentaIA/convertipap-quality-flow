
-- Personal columns on muestras_calidad
ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS jefe_maquina text,
  ADD COLUMN IF NOT EXISTS operador text,
  ADD COLUMN IF NOT EXISTS prensero text,
  ADD COLUMN IF NOT EXISTS analista text;

-- numero_rollo: integer -> text (format XXXX-X)
ALTER TABLE public.muestras_calidad
  ALTER COLUMN numero_rollo TYPE text USING numero_rollo::text;

-- Reorder variables
UPDATE public.variables_calidad SET orden = 1  WHERE clave = 'pesoBase';
UPDATE public.variables_calidad SET orden = 2  WHERE clave = 'humedad';
UPDATE public.variables_calidad SET orden = 3  WHERE clave = 'calibre';
UPDATE public.variables_calidad SET orden = 4  WHERE clave = 'blancuraR457';
UPDATE public.variables_calidad SET orden = 5  WHERE clave = 'blancuraA';
UPDATE public.variables_calidad SET orden = 6  WHERE clave = 'blancuraB';
UPDATE public.variables_calidad SET orden = 7  WHERE clave = 'tensionMD';
UPDATE public.variables_calidad SET orden = 8  WHERE clave = 'tensionCD';
UPDATE public.variables_calidad SET orden = 9  WHERE clave = 'relMDCD';
UPDATE public.variables_calidad SET orden = 10 WHERE clave = 'elongMD';
UPDATE public.variables_calidad SET orden = 11 WHERE clave = 'tensionRH';
UPDATE public.variables_calidad SET orden = 12 WHERE clave = 'anchoUtil';
UPDATE public.variables_calidad SET orden = 13 WHERE clave = 'diametro';
UPDATE public.variables_calidad SET orden = 14 WHERE clave = 'peso';
UPDATE public.variables_calidad SET orden = 15 WHERE clave = 'uniones';
