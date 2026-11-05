CREATE OR REPLACE FUNCTION public.imp_puede_operar_cortes(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND (
    public.can_edit_module(_uid,'pesaje_cintas'::app_module)
    OR (public.has_role(_uid,'capturista'::app_role)
        AND public.can_access_module(_uid,'pesaje_cintas'::app_module))
  )
$$;
REVOKE ALL ON FUNCTION public.imp_puede_operar_cortes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imp_puede_operar_cortes(uuid) TO authenticated, service_role;

DO $mig$
DECLARE f text; d text; n int := 0;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.imp_crear_lote_cintas(uuid,uuid,uuid,uuid)','public.imp_cinta_datos()','public.imp_lote_access(uuid)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    IF position($$public.can_edit_module(auth.uid(),'pesaje_cintas')$$ in d) = 0 THEN
      RAISE EXCEPTION 'Regla esperada no encontrada en %', f;
    END IF;
    d := replace(d, $$public.can_edit_module(auth.uid(),'pesaje_cintas')$$, $$public.imp_puede_operar_cortes(auth.uid())$$);
    EXECUTE d;
    n := n + 1;
  END LOOP;
  IF n <> 3 THEN RAISE EXCEPTION 'Se esperaban 3 funciones'; END IF;
END $mig$;