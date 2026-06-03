
-- ============================================================
-- CAMBIO 1: trigger que bloquea modificación de columnas de estatus
-- por usuarios sin rol Calidad/Administrador.
-- No altera datos existentes. No modifica políticas RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.muestras_protect_status_cols_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_changed boolean := false;
BEGIN
  -- Bypass para operaciones server-side sin sesión (service_role / SECURITY DEFINER
  -- como change_roll_status que ya valida permisos por su cuenta).
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Usuarios autorizados a cambiar estatus pueden modificar libremente.
  IF public.can_change_roll_status(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Para el resto (capturista, gerente_general, direccion), verificar
  -- que NO se modifiquen las columnas protegidas.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN v_changed := true; END IF;
  IF NEW.dictamen IS DISTINCT FROM OLD.dictamen THEN v_changed := true; END IF;
  IF NEW.dictamen_motivo IS DISTINCT FROM OLD.dictamen_motivo THEN v_changed := true; END IF;
  IF NEW.dictamen_at IS DISTINCT FROM OLD.dictamen_at THEN v_changed := true; END IF;
  IF NEW.autorizado_por IS DISTINCT FROM OLD.autorizado_por THEN v_changed := true; END IF;
  IF NEW.autorizado_at IS DISTINCT FROM OLD.autorizado_at THEN v_changed := true; END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muestras_protect_status_cols ON public.muestras_calidad;
CREATE TRIGGER muestras_protect_status_cols
  BEFORE UPDATE ON public.muestras_calidad
  FOR EACH ROW
  EXECUTE FUNCTION public.muestras_protect_status_cols_fn();

-- ============================================================
-- CAMBIO 2: audit_action con whitelist de módulo y límite de descripción.
-- Usuario, email y rol siguen derivándose de auth.uid() (no aceptados como input).
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_action(
  p_modulo text,
  p_descripcion text,
  p_registro_id uuid DEFAULT NULL,
  p_datos jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_rol TEXT;
  v_id UUID;
  v_allowed_modules text[] := ARRAY[
    'auth','etiqueta','qr','reportes','muestra',
    'auditoria','configuracion','control_calidad','calidad'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;

  IF p_modulo IS NULL OR NOT (p_modulo = ANY(v_allowed_modules)) THEN
    RAISE EXCEPTION 'Módulo de auditoría no permitido: %', p_modulo USING ERRCODE = '22023';
  END IF;

  IF p_descripcion IS NULL OR length(p_descripcion) = 0 THEN
    RAISE EXCEPTION 'Descripción de auditoría requerida.' USING ERRCODE = '22023';
  END IF;

  IF length(p_descripcion) > 500 THEN
    RAISE EXCEPTION 'Descripción de auditoría excede 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.audit_log
    (tabla_afectada, operacion, registro_id, datos_nuevos,
     usuario_id, usuario_email, rol, modulo, descripcion_accion)
  VALUES
    (NULL, 'ACTION', p_registro_id, p_datos,
     v_user_id, v_email, v_rol, p_modulo, p_descripcion)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
