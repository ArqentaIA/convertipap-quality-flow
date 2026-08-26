ALTER TABLE public.numeracion_rollos
  ADD COLUMN IF NOT EXISTS relleno_digitos integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.asignar_numero_rollo(_maquina_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.numeracion_rollos%ROWTYPE;
  v_num text;
  v_base text;
BEGIN
  SELECT * INTO v_rec FROM public.numeracion_rollos
   WHERE maquina_id = _maquina_id FOR UPDATE;

  IF NOT FOUND OR NOT v_rec.activo THEN
    RETURN NULL;
  END IF;

  -- DEPLOYMENT != ACTIVACION: antes de la hora efectiva no se consume nada.
  IF now() < v_rec.vigente_desde THEN
    RETURN NULL;
  END IF;

  v_base := v_rec.proximo_numero::text;
  IF v_rec.relleno_digitos > 0 THEN
    v_base := lpad(v_base, v_rec.relleno_digitos, '0');
  END IF;

  v_num := v_base || '-' || v_rec.sufijo;

  IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN
    RAISE EXCEPTION 'COLISION_NUMERACION: el número % ya está utilizado. No se asigna automáticamente otro número; reportar al administrador.', v_num;
  END IF;

  UPDATE public.numeracion_rollos
     SET proximo_numero = proximo_numero + 1
   WHERE maquina_id = _maquina_id;

  RETURN v_num;
END;
$function$;