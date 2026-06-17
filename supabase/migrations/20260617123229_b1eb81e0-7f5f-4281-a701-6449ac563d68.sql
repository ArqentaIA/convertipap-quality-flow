
-- Permisos de módulo para calidad_operativo
INSERT INTO public.module_permissions (role, module) VALUES
  ('calidad_operativo','dashboard'),
  ('calidad_operativo','produccion'),
  ('calidad_operativo','control_calidad'),
  ('calidad_operativo','variables_calidad'),
  ('calidad_operativo','reportes'),
  ('calidad_operativo','catalogos')
ON CONFLICT (role, module) DO NOTHING;

-- can_edit_module: permitir edición en control_calidad y variables_calidad
CREATE OR REPLACE FUNCTION public.can_edit_module(_user_id uuid, _module app_module)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'administrador') THEN true
    WHEN public.has_role(_user_id, 'calidad') THEN true
    WHEN public.has_role(_user_id, 'calidad_operativo')
         AND _module IN ('control_calidad','variables_calidad') THEN true
    WHEN public.has_role(_user_id, 'capturista') AND _module = 'control_calidad' THEN true
    ELSE false
  END
$$;

-- Permitir cambio de estatus de rollo
CREATE OR REPLACE FUNCTION public.can_change_roll_status(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id,'calidad')
      OR public.has_role(_user_id,'administrador')
      OR public.has_role(_user_id,'capturista')
      OR public.has_role(_user_id,'calidad_operativo')
$$;

-- Visibilidad de todas las máquinas (igual que calidad)
CREATE OR REPLACE FUNCTION public.user_allowed_machine_codes(_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    RETURN ARRAY['MP-04','MP-05','MP-06','MP-07'];
  END IF;

  RETURN ARRAY[]::text[];
END $$;
