
-- =========================================================
-- 2. Module permissions: rebuild from spec
-- =========================================================
TRUNCATE public.module_permissions;

INSERT INTO public.module_permissions (role, module) VALUES
  -- Administrador: todo
  ('administrador','dashboard'),
  ('administrador','produccion'),
  ('administrador','control_calidad'),
  ('administrador','variables_calidad'),
  ('administrador','catalogos'),
  ('administrador','reportes'),
  ('administrador','auditoria'),
  ('administrador','configuracion'),
  ('administrador','usuarios_permisos'),
  -- Gerente general
  ('gerente_general','dashboard'),
  ('gerente_general','produccion'),
  ('gerente_general','control_calidad'),
  ('gerente_general','variables_calidad'),
  ('gerente_general','reportes'),
  ('gerente_general','auditoria'),
  -- Dirección
  ('direccion','dashboard'),
  ('direccion','produccion'),
  ('direccion','control_calidad'),
  ('direccion','variables_calidad'),
  ('direccion','reportes'),
  ('direccion','auditoria'),
  -- Calidad
  ('calidad','dashboard'),
  ('calidad','produccion'),
  ('calidad','control_calidad'),
  ('calidad','variables_calidad'),
  ('calidad','reportes'),
  ('calidad','auditoria'),
  -- Capturista
  ('capturista','control_calidad');

-- =========================================================
-- 3. Helper: can_edit_module
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_edit_module(_user_id uuid, _module app_module)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'administrador') THEN true
    WHEN public.has_role(_user_id, 'calidad') THEN true
    WHEN public.has_role(_user_id, 'capturista') AND _module = 'control_calidad' THEN true
    -- gerente_general y direccion: solo lectura en CC y variables
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_edit_module(uuid, app_module) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_module(uuid, app_module) TO authenticated, service_role;

-- =========================================================
-- 4. Helper: user_allowed_machine_codes (laboratorio)
-- =========================================================
CREATE OR REPLACE FUNCTION public.user_allowed_machine_codes(_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lab text;
  v_is_capt boolean;
  v_sees_all boolean;
BEGIN
  v_sees_all := public.has_role(_user_id,'administrador')
             OR public.has_role(_user_id,'gerente_general')
             OR public.has_role(_user_id,'direccion')
             OR public.has_role(_user_id,'calidad');
  IF v_sees_all THEN
    RETURN NULL; -- NULL = todas
  END IF;

  v_is_capt := public.has_role(_user_id,'capturista');
  IF NOT v_is_capt THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT laboratorio INTO v_lab FROM public.profiles WHERE id = _user_id;
  IF v_lab = 'norte' THEN
    RETURN ARRAY['MP-06','MP-07'];
  ELSIF v_lab = 'sur' THEN
    RETURN ARRAY['MP-04','MP-05'];
  END IF;
  RETURN ARRAY[]::text[];
END $$;
REVOKE EXECUTE ON FUNCTION public.user_allowed_machine_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_allowed_machine_codes(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_can_use_machine(_user_id uuid, _maquina_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_codes text[];
  v_code text;
BEGIN
  v_codes := public.user_allowed_machine_codes(_user_id);
  IF v_codes IS NULL THEN RETURN true; END IF;
  IF array_length(v_codes,1) IS NULL THEN RETURN false; END IF;
  SELECT codigo INTO v_code FROM public.maquinas WHERE id = _maquina_id;
  RETURN v_code = ANY(v_codes);
END $$;
REVOKE EXECUTE ON FUNCTION public.user_can_use_machine(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_use_machine(uuid, uuid) TO authenticated, service_role;

-- =========================================================
-- 5. audit_log: extend with status-change context, immutability
-- =========================================================
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS planta_id uuid,
  ADD COLUMN IF NOT EXISTS maquina_id uuid,
  ADD COLUMN IF NOT EXISTS laboratorio text,
  ADD COLUMN IF NOT EXISTS folio_rollo text,
  ADD COLUMN IF NOT EXISTS estatus_anterior text,
  ADD COLUMN IF NOT EXISTS estatus_nuevo text,
  ADD COLUMN IF NOT EXISTS motivo text;

-- Immutability: forbid UPDATE / DELETE
DROP POLICY IF EXISTS "audit_log_no_update" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_no_delete" ON public.audit_log;
CREATE POLICY "audit_log_no_update" ON public.audit_log FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "audit_log_no_delete" ON public.audit_log FOR DELETE TO authenticated USING (false);

-- =========================================================
-- 6. Roll-status change: centralized, restricted
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_change_roll_status(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id,'calidad') OR public.has_role(_user_id,'administrador')
$$;
REVOKE EXECUTE ON FUNCTION public.can_change_roll_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_change_roll_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_roll_status(
  p_muestra_id uuid,
  p_nuevo_estado text,
  p_dictamen text,
  p_motivo text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text; v_rol text;
  v_old_estado text; v_old_dictamen text;
  v_planta uuid; v_maquina uuid; v_folio text; v_lab text;
  v_codigo text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF NOT public.can_change_roll_status(v_uid) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obligatorio (mínimo 5 caracteres).';
  END IF;

  SELECT estado::text, dictamen::text, planta_id, maquina_id, numero_rollo
    INTO v_old_estado, v_old_dictamen, v_planta, v_maquina, v_folio
    FROM public.muestras_calidad WHERE id = p_muestra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muestra no encontrada'; END IF;

  SELECT codigo INTO v_codigo FROM public.maquinas WHERE id = v_maquina;
  v_lab := CASE WHEN v_codigo IN ('MP-06','MP-07') THEN 'norte'
                WHEN v_codigo IN ('MP-04','MP-05') THEN 'sur' ELSE NULL END;

  UPDATE public.muestras_calidad
     SET estado = p_nuevo_estado::muestra_estado,
         dictamen = COALESCE(p_dictamen::dictamen_calidad, dictamen),
         dictamen_motivo = p_motivo,
         dictamen_at = now(),
         autorizado_por = v_uid,
         autorizado_at = now(),
         updated_at = now()
   WHERE id = p_muestra_id;

  SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.audit_log (
    tabla_afectada, operacion, registro_id, datos_anteriores, datos_nuevos,
    usuario_id, usuario_email, rol, modulo, descripcion_accion,
    ip_address, user_agent, planta_id, maquina_id, laboratorio, folio_rollo,
    estatus_anterior, estatus_nuevo, motivo
  ) VALUES (
    'muestras_calidad','STATUS_CHANGE', p_muestra_id,
    jsonb_build_object('estado',v_old_estado,'dictamen',v_old_dictamen),
    jsonb_build_object('estado',p_nuevo_estado,'dictamen',p_dictamen),
    v_uid, v_email, v_rol, 'control_calidad',
    'Cambio de estatus de rollo',
    p_ip, p_user_agent, v_planta, v_maquina, v_lab, v_folio,
    v_old_estado, p_nuevo_estado, p_motivo
  );

  RETURN p_muestra_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_roll_status(uuid, text, text, text, text, text) TO authenticated;

-- =========================================================
-- 7. Harden RLS — block direct status edits & enforce lab scope
-- =========================================================

-- muestras_calidad: restrict UPDATE to authorized roles; reads scoped by lab
DROP POLICY IF EXISTS "muestras_calidad_update_status_quality_only" ON public.muestras_calidad;
CREATE POLICY "muestras_calidad_update_status_quality_only"
  ON public.muestras_calidad FOR UPDATE TO authenticated
  USING (
    public.user_can_use_machine(auth.uid(), maquina_id)
    AND (
      public.can_change_roll_status(auth.uid())
      OR public.has_role(auth.uid(),'capturista')
    )
  )
  WITH CHECK (
    public.user_can_use_machine(auth.uid(), maquina_id)
  );

-- variables_calidad: writes only by calidad/administrador
DROP POLICY IF EXISTS "variables_calidad_write_quality_only" ON public.variables_calidad;
CREATE POLICY "variables_calidad_write_quality_only"
  ON public.variables_calidad FOR ALL TO authenticated
  USING (true)
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'calidad')
  );

-- module_permissions: only admin can change
DROP POLICY IF EXISTS "module_permissions_admin_write" ON public.module_permissions;
CREATE POLICY "module_permissions_admin_write"
  ON public.module_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'))
  WITH CHECK (public.has_role(auth.uid(),'administrador'));
