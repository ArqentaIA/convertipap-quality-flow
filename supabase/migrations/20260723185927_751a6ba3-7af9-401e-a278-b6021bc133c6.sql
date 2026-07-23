
-- =====================================================================
-- BLOQUE 1: maquina_access_codes
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.maquina_access_codes (
  maquina_id uuid PRIMARY KEY REFERENCES public.maquinas(id) ON DELETE CASCADE,
  access_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.maquina_access_codes TO service_role;
-- NO se otorga acceso a anon/authenticated (RLS + solo admin abajo)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquina_access_codes TO authenticated;

ALTER TABLE public.maquina_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mac_admin_all ON public.maquina_access_codes;
CREATE POLICY mac_admin_all ON public.maquina_access_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'))
  WITH CHECK (public.has_role(auth.uid(),'administrador'));

-- Migrar códigos existentes (idempotente)
INSERT INTO public.maquina_access_codes (maquina_id, access_code)
SELECT id, access_code FROM public.maquinas
WHERE access_code IS NOT NULL
ON CONFLICT (maquina_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_mac_updated_at ON public.maquina_access_codes;
CREATE TRIGGER trg_mac_updated_at BEFORE UPDATE ON public.maquina_access_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reescribir validate_maquina_access para usar la nueva tabla
CREATE OR REPLACE FUNCTION public.validate_maquina_access(_codigo text, _pin text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1
      FROM public.maquinas m
      JOIN public.maquina_access_codes c ON c.maquina_id = m.id
     WHERE m.codigo = _codigo
       AND m.activo = true
       AND c.access_code IS NOT NULL
       AND c.access_code = _pin
  );
$$;

REVOKE ALL ON FUNCTION public.validate_maquina_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_maquina_access(text, text) TO anon, authenticated;

-- =====================================================================
-- BLOQUE 2: Proteger estatus_liberacion / liberado_*
-- =====================================================================
CREATE OR REPLACE FUNCTION public.muestras_protect_status_cols_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_changed boolean := false;
BEGIN
  -- Bypass para operaciones server-side (service_role / SECURITY DEFINER internos)
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  -- Usuarios autorizados: pueden modificar libremente
  IF public.can_change_roll_status(v_uid) THEN RETURN NEW; END IF;

  -- Para el resto: bloquear cualquier cambio a columnas de estado/dictamen/liberación
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN v_changed := true; END IF;
  IF NEW.dictamen IS DISTINCT FROM OLD.dictamen THEN v_changed := true; END IF;
  IF NEW.dictamen_motivo IS DISTINCT FROM OLD.dictamen_motivo THEN v_changed := true; END IF;
  IF NEW.dictamen_at IS DISTINCT FROM OLD.dictamen_at THEN v_changed := true; END IF;
  IF NEW.autorizado_por IS DISTINCT FROM OLD.autorizado_por THEN v_changed := true; END IF;
  IF NEW.autorizado_at IS DISTINCT FROM OLD.autorizado_at THEN v_changed := true; END IF;
  IF NEW.estatus_liberacion IS DISTINCT FROM OLD.estatus_liberacion THEN v_changed := true; END IF;
  IF NEW.liberado_con_justificacion IS DISTINCT FROM OLD.liberado_con_justificacion THEN v_changed := true; END IF;
  IF NEW.liberacion_justificacion IS DISTINCT FROM OLD.liberacion_justificacion THEN v_changed := true; END IF;
  IF NEW.liberado_por IS DISTINCT FROM OLD.liberado_por THEN v_changed := true; END IF;
  IF NEW.liberado_at IS DISTINCT FROM OLD.liberado_at THEN v_changed := true; END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el responsable de Calidad puede modificar estatus/liberación de un rollo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- BLOQUE 3: REVOKE en funciones SECURITY DEFINER
-- =====================================================================

-- Funciones solo de trigger (retirar authenticated y anon)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'public.audit_trigger_fn()',
      'public.set_updated_at()',
      'public.handle_new_user()',
      'public.muestras_enforce_capturado_at_fn()',
      'public.muestras_protect_secuencia_captura_fn()',
      'public.muestras_protect_status_cols_fn()',
      'public.muestras_apply_regla_oro_fn()',
      'public.muestras_audit_liberacion_fn()',
      'public.muestras_autofill_uniones_fn()',
      'public.muestras_auto_traceability_fn()',
      'public.mediciones_recalc_estatus_fn()',
      'public.mediciones_sync_peso_fn()'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Funciones internas invocadas por triggers/otras definer (no por cliente)
REVOKE ALL ON FUNCTION public.qc_eval_regla_oro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qc_recalc_estatus_muestra(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_orden_auto(uuid, uuid, uuid, text, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_audit_estado(uuid, uuid, qc_spec_audit_field, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Funciones invocables por app: retirar PUBLIC/anon, mantener authenticated
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'public.has_role(uuid, app_role)',
      'public.can_change_roll_status(uuid)',
      'public.can_access_module(uuid, app_module)',
      'public.can_edit_module(uuid, app_module)',
      'public.user_allowed_machine_codes(uuid)',
      'public.user_can_use_machine(uuid, uuid)',
      'public.shift_op_date(timestamptz, text)',
      'public.spec_tiene_evidencia_vigente(uuid)',
      'public.audit_action(text, text, uuid, jsonb)',
      'public.change_roll_status(uuid, text, text, text, text, text)',
      'public.crear_borrador_especificacion(uuid, text)',
      'public.enviar_a_revision(uuid, text)',
      'public.publicar_especificacion(uuid, text)',
      'public.descartar_borrador(uuid, text)',
      'public.vincular_pesaje_a_muestra(uuid, uuid)',
      'public.fn_cumplimiento_turno_v2(uuid, text, date)',
      'public.fn_cumplimiento_variables_rollo_v2(uuid)'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- =====================================================================
-- BLOQUE 4: Pesajes inmutables + FK real
-- =====================================================================

-- FK real (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema='public' AND table_name='muestras_calidad'
       AND constraint_name='muestras_calidad_pesaje_id_fkey'
  ) THEN
    ALTER TABLE public.muestras_calidad
      ADD CONSTRAINT muestras_calidad_pesaje_id_fkey
      FOREIGN KEY (pesaje_id) REFERENCES public.pesajes_bobina_madre(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Trigger de inmutabilidad
CREATE OR REPLACE FUNCTION public.pesajes_immutables_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.peso_bruto_kg      IS DISTINCT FROM OLD.peso_bruto_kg      OR
     NEW.peso_neto_kg       IS DISTINCT FROM OLD.peso_neto_kg       OR
     NEW.peso_eje_kg        IS DISTINCT FROM OLD.peso_eje_kg        OR
     NEW.evidencia_path     IS DISTINCT FROM OLD.evidencia_path     OR
     NEW.fecha_hora_pesaje  IS DISTINCT FROM OLD.fecha_hora_pesaje  OR
     NEW.capturado_por      IS DISTINCT FROM OLD.capturado_por      OR
     NEW.ocr_confianza      IS DISTINCT FROM OLD.ocr_confianza      OR
     NEW.ocr_raw            IS DISTINCT FROM OLD.ocr_raw            OR
     NEW.numero_rollo       IS DISTINCT FROM OLD.numero_rollo       OR
     NEW.maquina_id         IS DISTINCT FROM OLD.maquina_id         THEN
    RAISE EXCEPTION 'Los datos de pesaje registrados son inmutables. Elimina el registro si requiere corrección.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pesajes_immutables_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pesajes_immutables ON public.pesajes_bobina_madre;
CREATE TRIGGER trg_pesajes_immutables
  BEFORE UPDATE ON public.pesajes_bobina_madre
  FOR EACH ROW EXECUTE FUNCTION public.pesajes_immutables_fn();
