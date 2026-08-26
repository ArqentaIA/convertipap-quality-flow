CREATE OR REPLACE FUNCTION public.pc_set_nombres_operativos(_lote_id uuid, _conductor text, _maquina text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._pc_require_access(auth.uid());
  UPDATE public.pesajes_cintas_lotes
     SET conductor_nombre_snapshot = COALESCE(NULLIF(btrim(_conductor), ''), conductor_nombre_snapshot),
         bobinadora_nombre_snapshot = COALESCE(NULLIF(btrim(_maquina), ''), bobinadora_nombre_snapshot),
         actualizado_por = auth.uid(),
         updated_at = now()
   WHERE id = _lote_id
     AND estado = 'abierto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado o no está abierto';
  END IF;
END;
$function$;