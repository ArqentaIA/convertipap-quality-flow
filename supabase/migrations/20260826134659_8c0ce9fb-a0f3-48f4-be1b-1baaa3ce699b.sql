ALTER TABLE public.pesajes_cintas
  ADD COLUMN IF NOT EXISTS estatus_liberacion text;

ALTER TABLE public.pesajes_cintas
  DROP CONSTRAINT IF EXISTS pesajes_cintas_estatus_liberacion_chk;
ALTER TABLE public.pesajes_cintas
  ADD CONSTRAINT pesajes_cintas_estatus_liberacion_chk
  CHECK (estatus_liberacion IS NULL OR estatus_liberacion IN ('L','C','NC'));

CREATE OR REPLACE FUNCTION public.pc_cinta_hereda_estatus_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estatus text;
BEGIN
  IF NEW.estatus_liberacion IS NULL THEN
    SELECT m.estatus_liberacion INTO v_estatus
    FROM public.pesajes_cintas_lotes l
    JOIN public.muestras_calidad m ON m.id = l.muestra_calidad_id
    WHERE l.id = NEW.lote_id;
    NEW.estatus_liberacion := v_estatus;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pc_cinta_hereda_estatus ON public.pesajes_cintas;
CREATE TRIGGER pc_cinta_hereda_estatus
  BEFORE INSERT ON public.pesajes_cintas
  FOR EACH ROW EXECUTE FUNCTION public.pc_cinta_hereda_estatus_fn();

CREATE OR REPLACE FUNCTION public.pc_set_estatus_cinta(_cinta_id uuid, _estatus text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior text;
  v_lote uuid;
BEGIN
  PERFORM public._pc_require_access(auth.uid());

  IF _estatus IS NOT NULL AND _estatus NOT IN ('L','C','NC') THEN
    RAISE EXCEPTION 'Estatus inválido';
  END IF;

  SELECT estatus_liberacion, lote_id INTO v_anterior, v_lote
  FROM public.pesajes_cintas WHERE id = _cinta_id;
  IF v_lote IS NULL THEN
    RAISE EXCEPTION 'Cinta no encontrada';
  END IF;

  UPDATE public.pesajes_cintas
     SET estatus_liberacion = _estatus,
         actualizado_por = auth.uid(),
         updated_at = now()
   WHERE id = _cinta_id;

  INSERT INTO public.pesajes_cintas_auditoria
    (lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, realizado_por)
  VALUES
    (v_lote, _cinta_id, 'cambio_estatus',
     jsonb_build_object('estatus_liberacion', v_anterior),
     jsonb_build_object('estatus_liberacion', _estatus),
     auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.pc_set_estatus_cinta(uuid, text) TO authenticated;