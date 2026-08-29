DO $$
DECLARE v_planta uuid; v_maq uuid;
BEGIN
  SELECT id INTO v_planta FROM public.plantas WHERE upper(codigo)='TLX' LIMIT 1;

  INSERT INTO public.maquinas (planta_id, codigo, nombre, area, activo)
  VALUES (v_planta, 'MP-10', 'MP-10', 'Laboratorio Sur', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_maq FROM public.maquinas WHERE codigo='MP-10';

  INSERT INTO public.numeracion_rollos
    (maquina_id, maquina_codigo, sufijo, proximo_numero, numero_inicial, vigente_desde, activo, relleno_digitos)
  VALUES (v_maq, 'MP-10', '10', 100, 100, now(), true, 0)
  ON CONFLICT (maquina_id) DO NOTHING;

  INSERT INTO public.producto_especificacion_maquinas (especificacion_id, maquina_id)
  SELECT pem.especificacion_id, v_maq
  FROM public.producto_especificacion_maquinas pem
  JOIN public.maquinas m ON m.id = pem.maquina_id
  WHERE m.codigo = 'MP-01'
    AND NOT EXISTS (
      SELECT 1 FROM public.producto_especificacion_maquinas x
      WHERE x.especificacion_id = pem.especificacion_id AND x.maquina_id = v_maq
    );
END $$;

CREATE OR REPLACE FUNCTION public.user_allowed_machine_codes(_user_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_capt boolean;
  v_sees_all boolean;
BEGIN
  v_sees_all := public.has_role(_user_id,'administrador')
             OR public.has_role(_user_id,'gerente_general')
             OR public.has_role(_user_id,'direccion')
             OR public.has_role(_user_id,'calidad')
             OR public.has_role(_user_id,'calidad_operativo');
  IF v_sees_all THEN
    RETURN NULL;
  END IF;

  v_is_capt := public.has_role(_user_id,'capturista');
  IF v_is_capt THEN
    RETURN ARRAY['MP-04','MP-05','MP-06','MP-07','MP-10'];
  END IF;

  RETURN ARRAY[]::text[];
END $function$;