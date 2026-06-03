
-- ============= AUDIT LOG TABLE =============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_afectada TEXT,
  operacion TEXT NOT NULL,
  registro_id UUID,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  usuario_id UUID,
  usuario_email TEXT,
  rol TEXT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  modulo TEXT,
  descripcion_accion TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON public.audit_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla ON public.audit_log (tabla_afectada);
CREATE INDEX IF NOT EXISTS idx_audit_log_modulo ON public.audit_log (modulo);
CREATE INDEX IF NOT EXISTS idx_audit_log_operacion ON public.audit_log (operacion);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT only admin & gerente_general
CREATE POLICY audit_log_select_admins ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role) OR public.has_role(auth.uid(), 'gerente_general'::app_role));

-- INSERT permitted to any authenticated (so triggers / audit_action work as the calling user)
CREATE POLICY audit_log_insert_authenticated ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE / DELETE policies => append-only

-- ============= TRIGGER FUNCTION =============
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_rol TEXT;
  v_old JSONB;
  v_new JSONB;
  v_rec_id UUID;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    BEGIN v_rec_id := (v_old->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_rec_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN v_rec_id := (v_new->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_rec_id := NULL; END;
  ELSE
    v_old := NULL;
    v_new := to_jsonb(NEW);
    BEGIN v_rec_id := (v_new->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_rec_id := NULL; END;
  END IF;

  INSERT INTO public.audit_log
    (tabla_afectada, operacion, registro_id, datos_anteriores, datos_nuevos,
     usuario_id, usuario_email, rol, modulo, descripcion_accion)
  VALUES
    (TG_TABLE_NAME, TG_OP, v_rec_id, v_old, v_new,
     v_user_id, v_email, v_rol, TG_TABLE_NAME, TG_OP || ' on ' || TG_TABLE_NAME);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;

-- ============= APPLY TRIGGERS =============
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'muestras_calidad','mediciones_calidad','ajustes_calidad','spec_audit_log',
    'profiles','user_roles','productos','maquinas','plantas',
    'variables_calidad','producto_variables','app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()', t);
  END LOOP;
END $$;

-- ============= MANUAL AUDIT ACTION FN =============
CREATE OR REPLACE FUNCTION public.audit_action(
  p_modulo TEXT,
  p_descripcion TEXT,
  p_registro_id UUID DEFAULT NULL,
  p_datos JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_rol TEXT;
  v_id UUID;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT email, rol_visible INTO v_email, v_rol FROM public.profiles WHERE id = v_user_id;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.audit_action(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ============= MODULE PERMISSIONS =============
INSERT INTO public.module_permissions (role, module) VALUES
  ('administrador', 'auditoria'),
  ('gerente_general', 'auditoria')
ON CONFLICT DO NOTHING;
