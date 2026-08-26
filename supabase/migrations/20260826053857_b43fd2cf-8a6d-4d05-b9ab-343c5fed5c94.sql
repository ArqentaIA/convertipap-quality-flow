CREATE OR REPLACE FUNCTION public.pc_set_bobinadora(_lote_id uuid, _bobinadora_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_estado pesaje_cintas_lote_estado;
BEGIN
  PERFORM public._pc_require_access(auth.uid());

  SELECT estado INTO v_estado FROM public.pesajes_cintas_lotes WHERE id = _lote_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Lote no encontrado';
  END IF;
  IF v_estado <> 'abierto' THEN
    RAISE EXCEPTION 'Solo se puede asignar la máquina en lotes abiertos';
  END IF;

  SELECT nombre INTO v_nombre FROM public.catalogo_bobinadoras WHERE id = _bobinadora_id AND activo;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Máquina no válida';
  END IF;

  UPDATE public.pesajes_cintas_lotes
     SET bobinadora_id = _bobinadora_id,
         bobinadora_nombre_snapshot = v_nombre,
         actualizado_por = auth.uid(),
         updated_at = now()
   WHERE id = _lote_id;

  INSERT INTO public.pesajes_cintas_auditoria (lote_id, accion, valores_nuevos, realizado_por)
  VALUES (_lote_id, 'set_bobinadora', jsonb_build_object('bobinadora_id', _bobinadora_id, 'bobinadora', v_nombre), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.pc_set_bobinadora(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pc_set_bobinadora(uuid, uuid) TO authenticated;