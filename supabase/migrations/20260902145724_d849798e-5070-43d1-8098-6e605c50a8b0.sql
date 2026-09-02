DROP FUNCTION IF EXISTS public.pc_set_estatus_cinta(uuid, text);

CREATE OR REPLACE FUNCTION public.pc_set_estatus_cinta(_cinta_id uuid, _estatus text, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anterior text;
  v_lote uuid;
  v_motivo text := trim(coalesce(_motivo, ''));
BEGIN
  PERFORM public._pc_require_access(auth.uid());

  IF _estatus IS NOT NULL AND _estatus NOT IN ('L','C','NC') THEN
    RAISE EXCEPTION 'Estatus inválido';
  END IF;

  IF length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo obligatorio: escribe la razón real del cambio de estatus (mínimo 10 caracteres).';
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
    (lote_id, cinta_id, accion, valores_anteriores, valores_nuevos, motivo, realizado_por)
  VALUES
    (v_lote, _cinta_id, 'cambio_estatus',
     jsonb_build_object('estatus_liberacion', v_anterior),
     jsonb_build_object('estatus_liberacion', _estatus),
     v_motivo,
     auth.uid());
END;
$function$;