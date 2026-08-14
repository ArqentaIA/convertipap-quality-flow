CREATE TABLE public.numeracion_rollos (
  maquina_id uuid PRIMARY KEY REFERENCES public.maquinas(id) ON DELETE CASCADE,
  maquina_codigo text NOT NULL,
  sufijo text NOT NULL,
  proximo_numero bigint NOT NULL,
  numero_inicial bigint NOT NULL,
  vigente_desde timestamptz NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.numeracion_rollos TO authenticated;
GRANT ALL ON public.numeracion_rollos TO service_role;

ALTER TABLE public.numeracion_rollos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "numeracion_rollos_select_auth"
  ON public.numeracion_rollos FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_numeracion_rollos_updated_at
  BEFORE UPDATE ON public.numeracion_rollos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.numeracion_rollos (maquina_id, maquina_codigo, sufijo, proximo_numero, numero_inicial, vigente_desde)
SELECT m.id, m.codigo, v.sufijo, v.inicial, v.inicial,
       timestamptz '2026-08-14 07:00:00 America/Mexico_City'
FROM (VALUES
  ('MP-04','4',10900::bigint),
  ('MP-05','5',2700::bigint),
  ('MP-06','6',3700::bigint),
  ('MP-07','7',2800::bigint)
) AS v(codigo, sufijo, inicial)
JOIN public.maquinas m ON m.codigo = v.codigo;

CREATE OR REPLACE FUNCTION public.estado_numeracion_rollo(_maquina_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'configurada', true,
    'activa', now() >= n.vigente_desde AND n.activo,
    'vigente_desde', n.vigente_desde,
    'sufijo', n.sufijo,
    'proximo_numero', n.proximo_numero::text || '-' || n.sufijo,
    'ahora_servidor', now()
  )
  FROM public.numeracion_rollos n
  WHERE n.maquina_id = _maquina_id;
$$;

GRANT EXECUTE ON FUNCTION public.estado_numeracion_rollo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asignar_numero_rollo(_maquina_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.numeracion_rollos%ROWTYPE;
  v_num text;
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

  v_num := v_rec.proximo_numero::text || '-' || v_rec.sufijo;

  IF EXISTS (SELECT 1 FROM public.muestras_calidad WHERE numero_rollo = v_num) THEN
    RAISE EXCEPTION 'COLISION_NUMERACION: el número % ya está utilizado. No se asigna automáticamente otro número; reportar al administrador.', v_num;
  END IF;

  UPDATE public.numeracion_rollos
     SET proximo_numero = proximo_numero + 1
   WHERE maquina_id = _maquina_id;

  RETURN v_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.asignar_numero_rollo(uuid) TO authenticated;