-- 1) Operarios: alta desde el módulo, siempre con planta
ALTER TABLE public.operarios ADD COLUMN IF NOT EXISTS creado_por uuid;
GRANT SELECT, INSERT ON public.operarios TO authenticated;
GRANT ALL ON public.operarios TO service_role;
DROP POLICY IF EXISTS "operarios_insert_operativos" ON public.operarios;
CREATE POLICY "operarios_insert_operativos" ON public.operarios
  FOR INSERT TO authenticated
  WITH CHECK (
    planta_id IS NOT NULL
    AND (
      public.can_access_module(auth.uid(), 'pesaje_cintas'::app_module)
      OR public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module)
    )
  );

-- 2) Bobinadoras por planta
ALTER TABLE public.catalogo_bobinadoras ADD COLUMN IF NOT EXISTS planta_id uuid REFERENCES public.plantas(id);
UPDATE public.catalogo_bobinadoras
SET planta_id = (SELECT id FROM public.plantas WHERE codigo = 'IXT')
WHERE planta_id IS NULL AND upper(codigo) IN ('JG01','JG02','RB01','RB02');
UPDATE public.catalogo_bobinadoras
SET planta_id = (SELECT id FROM public.plantas WHERE codigo = 'TLX')
WHERE planta_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cat_bobinadoras_planta ON public.catalogo_bobinadoras(planta_id) WHERE activo;
GRANT SELECT, INSERT ON public.catalogo_bobinadoras TO authenticated;
GRANT ALL ON public.catalogo_bobinadoras TO service_role;
DROP POLICY IF EXISTS "bobinadoras_insert_operativos" ON public.catalogo_bobinadoras;
CREATE POLICY "bobinadoras_insert_operativos" ON public.catalogo_bobinadoras
  FOR INSERT TO authenticated
  WITH CHECK (
    planta_id IS NOT NULL
    AND public.can_access_module(auth.uid(), 'pesaje_cintas'::app_module)
  );

-- 3) Pesaje de rollo: personal responsable
ALTER TABLE public.pesajes_bobina_madre
  ADD COLUMN IF NOT EXISTS operador_nombre text,
  ADD COLUMN IF NOT EXISTS jefe_maquina_nombre text;

CREATE OR REPLACE FUNCTION public.pb_set_personal(
  _pesaje_id uuid,
  _operador text,
  _jefe text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module) THEN
    RAISE EXCEPTION 'Sin acceso al módulo de pesaje';
  END IF;
  UPDATE public.pesajes_bobina_madre
  SET operador_nombre = NULLIF(btrim(COALESCE(_operador, '')), ''),
      jefe_maquina_nombre = NULLIF(btrim(COALESCE(_jefe, '')), '')
  WHERE id = _pesaje_id AND NOT anulado;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pb_set_personal(uuid, text, text) TO authenticated;