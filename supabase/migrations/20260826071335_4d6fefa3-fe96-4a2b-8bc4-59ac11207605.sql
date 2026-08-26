ALTER TABLE public.pesajes_cintas_lotes ADD COLUMN IF NOT EXISTS bobinador_nombre text;

CREATE OR REPLACE FUNCTION public.pc_set_bobinador_nombre(_lote_id uuid, _nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._pc_require_access(auth.uid());
  UPDATE public.pesajes_cintas_lotes
     SET bobinador_nombre = NULLIF(btrim(_nombre), ''),
         actualizado_por = auth.uid(),
         updated_at = now()
   WHERE id = _lote_id
     AND estado = 'abierto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado o no está abierto';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pc_set_bobinador_nombre(uuid, text) TO authenticated;