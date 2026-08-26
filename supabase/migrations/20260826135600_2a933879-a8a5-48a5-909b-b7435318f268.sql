-- Rellenar estatus faltante en cintas ya registradas
UPDATE public.pesajes_cintas c
SET estatus_liberacion = m.estatus_liberacion
FROM public.pesajes_cintas_lotes l
JOIN public.muestras_calidad m ON m.id = l.muestra_calidad_id
WHERE l.id = c.lote_id
  AND c.estatus_liberacion IS NULL
  AND m.estatus_liberacion IS NOT NULL;

-- Propagar el estatus del rollo a las cintas que aún no tienen estatus propio
CREATE OR REPLACE FUNCTION public.pc_propagar_estatus_muestra_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus_liberacion IS DISTINCT FROM OLD.estatus_liberacion
     AND NEW.estatus_liberacion IS NOT NULL THEN
    UPDATE public.pesajes_cintas c
    SET estatus_liberacion = NEW.estatus_liberacion
    FROM public.pesajes_cintas_lotes l
    WHERE l.id = c.lote_id
      AND l.muestra_calidad_id = NEW.id
      AND c.estatus_liberacion IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pc_propagar_estatus_muestra ON public.muestras_calidad;
CREATE TRIGGER pc_propagar_estatus_muestra
AFTER UPDATE ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.pc_propagar_estatus_muestra_fn();