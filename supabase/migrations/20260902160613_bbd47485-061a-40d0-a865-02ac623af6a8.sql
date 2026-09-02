ALTER TABLE public.pesajes_cintas_lotes
  ADD COLUMN IF NOT EXISTS operador_cortes_nombre text,
  ADD COLUMN IF NOT EXISTS analista_cortes_nombre text,
  ADD COLUMN IF NOT EXISTS cortes_personal_registrado_at timestamptz;

CREATE OR REPLACE FUNCTION public.pc_set_personal_cortes(
  _lote_id uuid,
  _operador text,
  _analista text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op text := nullif(btrim(coalesce(_operador, '')), '');
  v_an text := nullif(btrim(coalesce(_analista, '')), '');
BEGIN
  PERFORM public._pc_require_access(auth.uid());

  IF v_op IS NULL AND v_an IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.pesajes_cintas_lotes
     SET operador_cortes_nombre = coalesce(left(v_op, 40), operador_cortes_nombre),
         analista_cortes_nombre = coalesce(left(v_an, 40), analista_cortes_nombre),
         cortes_personal_registrado_at = now(),
         updated_at = now()
   WHERE id = _lote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bajada no encontrada';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pc_set_personal_cortes(uuid, text, text) TO authenticated;