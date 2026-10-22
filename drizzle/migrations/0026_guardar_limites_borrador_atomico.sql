CREATE OR REPLACE FUNCTION public.guardar_variables_borrador(_spec_id uuid, _variables jsonb, _motivo text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 s public.producto_especificaciones%ROWTYPE;
 pv public.producto_variables%ROWTYPE;
 item jsonb; vc public.variables_calidad%ROWTYPE;
 nmin numeric; nobj numeric; nmax numeric; nombre text; rol public.app_role;
 campo text; anterior numeric; nuevo numeric; cambios integer := 0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.puede_gestionar_catalogo_calidad(auth.uid()) THEN
  RAISE EXCEPTION 'No autorizado para editar especificaciones.' USING ERRCODE='42501';
 END IF;
 IF _motivo IS NULL OR length(trim(_motivo)) < 1 THEN RAISE EXCEPTION 'Indique el motivo del cambio.'; END IF;
 IF jsonb_typeof(_variables) IS DISTINCT FROM 'array' OR jsonb_array_length(_variables) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Lista de variables inválida.'; END IF;
 SELECT * INTO s FROM public.producto_especificaciones WHERE id=_spec_id FOR UPDATE;
 IF NOT FOUND OR s.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se pueden editar variables de un borrador.'; END IF;
 IF EXISTS (SELECT 1 FROM public.app_settings WHERE spec_evidencia_obligatoria=true) AND NOT public.spec_tiene_evidencia_vigente(_spec_id) THEN RAISE EXCEPTION 'El borrador no tiene evidencia documental vigente.'; END IF;
 SELECT p.nombre INTO nombre FROM public.profiles p WHERE p.id=auth.uid();
 rol := CASE WHEN public.has_role(auth.uid(),'calidad') THEN 'calidad'::public.app_role ELSE 'administrador'::public.app_role END;
 IF (SELECT count(*) FROM jsonb_array_elements(_variables)) <> (SELECT count(DISTINCT x->>'clave') FROM jsonb_array_elements(_variables) x) THEN RAISE EXCEPTION 'Variables duplicadas.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_variables) LOOP
  SELECT * INTO vc FROM public.variables_calidad WHERE clave=item->>'clave';
  IF NOT FOUND THEN RAISE EXCEPTION 'Variable no encontrada: %',item->>'clave'; END IF;
  SELECT * INTO pv FROM public.producto_variables WHERE especificacion_id=_spec_id AND variable_id=vc.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La variable % no pertenece al borrador.',vc.etiqueta; END IF;
  nmin := (item->>'min')::numeric; nobj := (item->>'objetivo')::numeric; nmax := (item->>'max')::numeric;
  IF nmin IS NULL OR nobj IS NULL OR nmax IS NULL OR nmin > nmax OR nmin::text IN ('NaN','Infinity','-Infinity') OR nobj::text IN ('NaN','Infinity','-Infinity') OR nmax::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Rango inválido en %: mínimo debe ser menor o igual al máximo.',vc.etiqueta; END IF;
  IF NOT (item ? 'esperado') OR (item->'esperado'->>'min')::numeric IS DISTINCT FROM pv.min_valor OR (item->'esperado'->>'objetivo')::numeric IS DISTINCT FROM pv.objetivo OR (item->'esperado'->>'max')::numeric IS DISTINCT FROM pv.max_valor THEN RAISE EXCEPTION 'Otro usuario modificó %. Vuelva a abrir la edición.',vc.etiqueta; END IF;
  UPDATE public.producto_variables SET min_valor=nmin,objetivo=nobj,max_valor=nmax,updated_at=now() WHERE id=pv.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se guardó %: sin permiso para editar este borrador.',vc.etiqueta; END IF;
  FOREACH campo IN ARRAY ARRAY['min','objetivo','max'] LOOP
   anterior := CASE campo WHEN 'min' THEN pv.min_valor WHEN 'objetivo' THEN pv.objetivo ELSE pv.max_valor END;
   nuevo := CASE campo WHEN 'min' THEN nmin WHEN 'objetivo' THEN nobj ELSE nmax END;
   IF anterior IS DISTINCT FROM nuevo THEN
    INSERT INTO public.spec_audit_log(especificacion_id,producto_id,variable_id,variable_clave,variable_etiqueta,campo,valor_anterior,valor_nuevo,motivo,modificado_por,modificado_por_nombre,modificado_por_rol)
    VALUES(_spec_id,s.producto_id,vc.id,vc.clave,vc.etiqueta,campo::public.qc_spec_audit_field,anterior,nuevo,trim(_motivo),auth.uid(),nombre,rol);
    cambios := cambios+1;
   END IF;
  END LOOP;
 END LOOP;
 RETURN cambios;
END $$;
REVOKE ALL ON FUNCTION public.guardar_variables_borrador(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_variables_borrador(uuid,jsonb,text) TO authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='producto_especificaciones') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.producto_especificaciones;
 END IF;
END $$;