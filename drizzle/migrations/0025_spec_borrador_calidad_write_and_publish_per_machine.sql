-- 1) Calidad autorizada (puede_gestionar_catalogo_calidad) puede modificar variables SOLO en borradores.
CREATE POLICY prodvar_calidad_borrador_write ON public.producto_variables
  FOR ALL TO authenticated
  USING (
    public.puede_gestionar_catalogo_calidad(auth.uid())
    AND EXISTS (SELECT 1 FROM public.producto_especificaciones s
                 WHERE s.id = producto_variables.especificacion_id AND s.estado = 'borrador')
  )
  WITH CHECK (
    public.puede_gestionar_catalogo_calidad(auth.uid())
    AND EXISTS (SELECT 1 FROM public.producto_especificaciones s
                 WHERE s.id = producto_variables.especificacion_id AND s.estado = 'borrador')
  );

-- 2) Crear borrador: numeración por número principal (evita "v1005" a partir de "1.0-MP04")
--    y conserva el perfil de máquina de la versión de origen.
CREATE OR REPLACE FUNCTION public.crear_borrador_especificacion(_producto_id uuid, _motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_vigente_id uuid;
  v_vigente_carac text;
  v_vigente_perfil text;
  v_existente uuid;
  v_new_id uuid;
  v_next_n int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_user,'calidad') OR public.has_role(v_user,'administrador')) THEN
    RAISE EXCEPTION 'Solo Calidad o Administrador pueden crear borradores.' USING ERRCODE = '42501';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existente
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id AND estado IN ('borrador','en_revision')
   LIMIT 1;
  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT id, caracteristicas_atributos, perfil_key
    INTO v_vigente_id, v_vigente_carac, v_vigente_perfil
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id AND estado = 'vigente'
   ORDER BY (perfil_key IS NULL) DESC, (perfil_key ILIKE '%STANDARD%') DESC, vigente_desde DESC NULLS LAST
   LIMIT 1;

  SELECT COALESCE(MAX(NULLIF(substring(version from '^\D*(\d+)'),'')::int),0) + 1
    INTO v_next_n
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id;

  INSERT INTO public.producto_especificaciones(
    producto_id, version, estado, caracteristicas_atributos, notas, borrador_de, motivo_cambio, perfil_key
  ) VALUES (
    _producto_id,
    v_next_n::text || '.0' || CASE WHEN v_vigente_perfil ILIKE '%-MP%' THEN regexp_replace(v_vigente_perfil, '^.*(-MP\d+)$', '\1') ELSE '' END,
    'borrador', v_vigente_carac, NULL, v_vigente_id, _motivo, v_vigente_perfil
  ) RETURNING id INTO v_new_id;

  IF v_vigente_id IS NOT NULL THEN
    INSERT INTO public.producto_variables(especificacion_id, variable_id, min_valor, objetivo, max_valor, tolerancia)
    SELECT v_new_id, variable_id, min_valor, objetivo, max_valor, tolerancia
      FROM public.producto_variables WHERE especificacion_id = v_vigente_id;

    INSERT INTO public.producto_especificacion_maquinas(especificacion_id, maquina_id)
    SELECT v_new_id, maquina_id FROM public.producto_especificacion_maquinas
     WHERE especificacion_id = v_vigente_id
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public._spec_audit_estado(
    v_new_id, _producto_id, 'caracteristicas',
    CASE WHEN v_vigente_id IS NULL THEN NULL ELSE 'vigente' END,
    'borrador', _motivo, v_user
  );
  RETURN v_new_id;
END $function$;

-- 3) Publicar: sustituye únicamente la versión de origen (mismo perfil/máquinas),
--    sin dejar obsoletas las especificaciones de otras máquinas.
CREATE OR REPLACE FUNCTION public.publicar_especificacion(_spec_id uuid, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_estado spec_status;
  v_producto uuid;
  v_origen uuid;
  v_perfil text;
  v_vigente_actual uuid;
  v_flag boolean;
  v_tiene_ev boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_user,'calidad') OR public.has_role(v_user,'administrador')) THEN
    RAISE EXCEPTION 'Solo Calidad o Administrador pueden publicar versiones.' USING ERRCODE = '42501';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT estado, producto_id, borrador_de, perfil_key INTO v_estado, v_producto, v_origen, v_perfil
    FROM public.producto_especificaciones WHERE id = _spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Especificación no encontrada.'; END IF;
  IF v_estado NOT IN ('borrador','en_revision') THEN
    RAISE EXCEPTION 'Solo borrador o en_revision puede publicarse.' USING ERRCODE='22023';
  END IF;

  SELECT spec_evidencia_obligatoria INTO v_flag FROM public.app_settings LIMIT 1;
  IF COALESCE(v_flag,false) THEN
    SELECT public.spec_tiene_evidencia_vigente(_spec_id) INTO v_tiene_ev;
    IF NOT COALESCE(v_tiene_ev,false) THEN
      RAISE EXCEPTION 'El borrador no tiene evidencia documental vigente. Cárgala antes de publicar.'
        USING ERRCODE='22023';
    END IF;
  END IF;

  -- Vigente a sustituir: la de origen; si no, la del mismo perfil.
  SELECT id INTO v_vigente_actual FROM public.producto_especificaciones
   WHERE id = v_origen AND estado = 'vigente';
  IF v_vigente_actual IS NULL THEN
    SELECT id INTO v_vigente_actual FROM public.producto_especificaciones
     WHERE producto_id = v_producto AND estado = 'vigente'
       AND COALESCE(perfil_key,'__default__') = COALESCE(v_perfil,'__default__')
     LIMIT 1;
  END IF;

  IF v_vigente_actual IS NOT NULL THEN
    SELECT perfil_key INTO v_perfil FROM public.producto_especificaciones WHERE id = v_vigente_actual;
    UPDATE public.producto_especificaciones
       SET estado = 'obsoleta', vigente_hasta = now(), updated_at = now()
     WHERE id = v_vigente_actual;
    PERFORM public._spec_audit_estado(v_vigente_actual, v_producto, 'caracteristicas', 'vigente', 'obsoleta', _motivo, v_user);

    -- Heredar máquinas de la versión sustituida si el borrador no tiene ligas propias.
    IF NOT EXISTS (SELECT 1 FROM public.producto_especificacion_maquinas WHERE especificacion_id = _spec_id) THEN
      INSERT INTO public.producto_especificacion_maquinas(especificacion_id, maquina_id)
      SELECT _spec_id, maquina_id FROM public.producto_especificacion_maquinas
       WHERE especificacion_id = v_vigente_actual
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  UPDATE public.producto_especificaciones
     SET estado = 'vigente', perfil_key = v_perfil, vigente_desde = now(),
         aprobado_por = v_user, aprobado_at = now(),
         publicado_por = v_user, publicado_at = now(), updated_at = now()
   WHERE id = _spec_id;

  PERFORM public._spec_audit_estado(_spec_id, v_producto, 'caracteristicas', v_estado::text, 'vigente', _motivo, v_user);
END $function$;