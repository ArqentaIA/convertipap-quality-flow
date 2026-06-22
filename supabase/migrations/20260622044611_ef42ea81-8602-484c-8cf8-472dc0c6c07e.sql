
-- =====================================================================
-- RPCs Fase 3
-- =====================================================================

-- Helper para registrar en spec_audit_log (transición de estado)
CREATE OR REPLACE FUNCTION public._spec_audit_estado(
  _spec_id uuid, _producto_id uuid,
  _campo qc_spec_audit_field, _texto_anterior text, _texto_nuevo text,
  _motivo text, _user uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nombre text; v_rol app_role;
BEGIN
  SELECT nombre INTO v_nombre FROM public.profiles WHERE id = _user;
  SELECT role INTO v_rol FROM public.user_roles
    WHERE user_id = _user AND role IN ('calidad','administrador') LIMIT 1;
  INSERT INTO public.spec_audit_log(
    especificacion_id, producto_id, variable_clave, variable_etiqueta,
    campo, valor_anterior, valor_nuevo,
    valor_anterior_texto, valor_nuevo_texto,
    motivo, modificado_por, modificado_por_nombre, modificado_por_rol
  ) VALUES (
    _spec_id, _producto_id, 'spec_estado', 'Estado de la especificación',
    _campo, NULL, NULL, _texto_anterior, _texto_nuevo,
    _motivo, _user, v_nombre, COALESCE(v_rol,'calidad')
  );
END $$;

-- ---------------------------------------------------------------------
-- crear_borrador_especificacion
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_borrador_especificacion(
  _producto_id uuid,
  _motivo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_vigente_id uuid;
  v_vigente_version text;
  v_vigente_carac text;
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

  -- Idempotente: si ya existe borrador/en_revision, devolverlo
  SELECT id INTO v_existente
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id
     AND estado IN ('borrador','en_revision')
   LIMIT 1;
  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT id, version, caracteristicas_atributos
    INTO v_vigente_id, v_vigente_version, v_vigente_carac
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id AND estado = 'vigente'
   LIMIT 1;

  -- versión "v{n+1}" simple
  SELECT COALESCE(MAX(NULLIF(regexp_replace(version,'\D','','g'),'')::int),0) + 1
    INTO v_next_n
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id;

  INSERT INTO public.producto_especificaciones(
    producto_id, version, estado,
    caracteristicas_atributos, notas,
    borrador_de, motivo_cambio
  ) VALUES (
    _producto_id, 'v' || v_next_n::text, 'borrador',
    v_vigente_carac, NULL,
    v_vigente_id, _motivo
  ) RETURNING id INTO v_new_id;

  -- Clonar producto_variables de la vigente al borrador
  IF v_vigente_id IS NOT NULL THEN
    INSERT INTO public.producto_variables(
      especificacion_id, variable_id, min_valor, objetivo, max_valor, tolerancia
    )
    SELECT v_new_id, variable_id, min_valor, objetivo, max_valor, tolerancia
      FROM public.producto_variables
     WHERE especificacion_id = v_vigente_id;
  END IF;

  PERFORM public._spec_audit_estado(
    v_new_id, _producto_id, 'caracteristicas',
    CASE WHEN v_vigente_id IS NULL THEN NULL ELSE 'vigente' END,
    'borrador', _motivo, v_user
  );

  RETURN v_new_id;
END $$;

-- ---------------------------------------------------------------------
-- enviar_a_revision
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enviar_a_revision(
  _spec_id uuid,
  _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_estado spec_status;
  v_producto uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_user,'calidad') OR public.has_role(v_user,'administrador')) THEN
    RAISE EXCEPTION 'Solo Calidad o Administrador pueden enviar a revisión.' USING ERRCODE = '42501';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT estado, producto_id INTO v_estado, v_producto
    FROM public.producto_especificaciones WHERE id = _spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Especificación no encontrada.'; END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo un borrador puede enviarse a revisión.' USING ERRCODE='22023';
  END IF;

  UPDATE public.producto_especificaciones
     SET estado = 'en_revision',
         enviado_revision_por = v_user,
         enviado_revision_at  = now(),
         updated_at = now()
   WHERE id = _spec_id;

  PERFORM public._spec_audit_estado(
    _spec_id, v_producto, 'caracteristicas',
    'borrador', 'en_revision', _motivo, v_user
  );
END $$;

-- ---------------------------------------------------------------------
-- publicar_especificacion
--   NO re-apunta documentos. Cada versión conserva sus spec_documentos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publicar_especificacion(
  _spec_id uuid,
  _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_estado spec_status;
  v_producto uuid;
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

  SELECT estado, producto_id INTO v_estado, v_producto
    FROM public.producto_especificaciones WHERE id = _spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Especificación no encontrada.'; END IF;
  IF v_estado NOT IN ('borrador','en_revision') THEN
    RAISE EXCEPTION 'Solo borrador o en_revision puede publicarse.' USING ERRCODE='22023';
  END IF;

  -- Si flag ON, exigir evidencia vigente EN EL BORRADOR
  SELECT spec_evidencia_obligatoria INTO v_flag FROM public.app_settings LIMIT 1;
  IF COALESCE(v_flag,false) THEN
    SELECT public.spec_tiene_evidencia_vigente(_spec_id) INTO v_tiene_ev;
    IF NOT COALESCE(v_tiene_ev,false) THEN
      RAISE EXCEPTION 'El borrador no tiene evidencia documental vigente. Cárgala antes de publicar.'
        USING ERRCODE='22023';
    END IF;
  END IF;

  -- Vigente actual (puede no existir si es la primera)
  SELECT id INTO v_vigente_actual
    FROM public.producto_especificaciones
   WHERE producto_id = v_producto AND estado = 'vigente'
   LIMIT 1;

  IF v_vigente_actual IS NOT NULL THEN
    UPDATE public.producto_especificaciones
       SET estado = 'obsoleta',
           vigente_hasta = now(),
           updated_at = now()
     WHERE id = v_vigente_actual;
    PERFORM public._spec_audit_estado(
      v_vigente_actual, v_producto, 'caracteristicas',
      'vigente', 'obsoleta', _motivo, v_user
    );
  END IF;

  UPDATE public.producto_especificaciones
     SET estado = 'vigente',
         vigente_desde = now(),
         aprobado_por = v_user,
         aprobado_at = now(),
         publicado_por = v_user,
         publicado_at = now(),
         updated_at = now()
   WHERE id = _spec_id;

  PERFORM public._spec_audit_estado(
    _spec_id, v_producto, 'caracteristicas',
    v_estado::text, 'vigente', _motivo, v_user
  );
END $$;

-- ---------------------------------------------------------------------
-- descartar_borrador — UPDATE, sin DELETE; conserva variables y evidencia
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.descartar_borrador(
  _spec_id uuid,
  _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_estado spec_status;
  v_producto uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_user,'calidad') OR public.has_role(v_user,'administrador')) THEN
    RAISE EXCEPTION 'Solo Calidad o Administrador pueden descartar borradores.' USING ERRCODE = '42501';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT estado, producto_id INTO v_estado, v_producto
    FROM public.producto_especificaciones WHERE id = _spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Especificación no encontrada.'; END IF;
  IF v_estado NOT IN ('borrador','en_revision') THEN
    RAISE EXCEPTION 'Solo borrador o en_revision puede descartarse.' USING ERRCODE='22023';
  END IF;

  UPDATE public.producto_especificaciones
     SET estado = 'descartada',
         descartado_por = v_user,
         descartado_at = now(),
         motivo_descarte = _motivo,
         updated_at = now()
   WHERE id = _spec_id;

  PERFORM public._spec_audit_estado(
    _spec_id, v_producto, 'caracteristicas',
    v_estado::text, 'descartada', _motivo, v_user
  );
END $$;

-- GRANTs (solo autenticados; revocar PUBLIC para evitar warnings del linter)
REVOKE ALL ON FUNCTION public.crear_borrador_especificacion(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enviar_a_revision(uuid,text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publicar_especificacion(uuid,text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.descartar_borrador(uuid,text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._spec_audit_estado(uuid,uuid,qc_spec_audit_field,text,text,text,uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_borrador_especificacion(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_a_revision(uuid,text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_especificacion(uuid,text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_borrador(uuid,text)            TO authenticated;
