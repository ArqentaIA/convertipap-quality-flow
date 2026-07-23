
-- FK real en muestras_calidad
ALTER TABLE public.muestras_calidad
  ADD COLUMN IF NOT EXISTS pesaje_id UUID REFERENCES public.pesajes_bobina_madre(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS muestras_calidad_pesaje_id_idx
  ON public.muestras_calidad(pesaje_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_pesajes_bobina_madre_updated_at ON public.pesajes_bobina_madre;
CREATE TRIGGER trg_pesajes_bobina_madre_updated_at
  BEFORE UPDATE ON public.pesajes_bobina_madre
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS pesajes_bobina_madre
CREATE POLICY "pesajes_select_autorizados"
  ON public.pesajes_bobina_madre FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module));

CREATE POLICY "pesajes_insert_autorizados"
  ON public.pesajes_bobina_madre FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module)
    AND capturado_por = auth.uid()
  );

CREATE POLICY "pesajes_update_admin"
  ON public.pesajes_bobina_madre FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "pesajes_delete_admin"
  ON public.pesajes_bobina_madre FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Permisos de módulo
INSERT INTO public.module_permissions(role, module) VALUES
  ('administrador','pesaje_bobina_madre'),
  ('planeacion','pesaje_bobina_madre'),
  ('calidad','pesaje_bobina_madre'),
  ('calidad_operativo','pesaje_bobina_madre'),
  ('capturista','pesaje_bobina_madre')
ON CONFLICT DO NOTHING;

-- Storage policies para bucket privado
CREATE POLICY "pesajes_evidencia_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pesajes-evidencia'
    AND public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module)
  );

CREATE POLICY "pesajes_evidencia_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pesajes-evidencia'
    AND public.can_access_module(auth.uid(), 'pesaje_bobina_madre'::app_module)
  );

CREATE POLICY "pesajes_evidencia_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pesajes-evidencia'
    AND public.has_role(auth.uid(), 'administrador')
  );

-- RPC: vincular pesaje a muestra por número de rollo
CREATE OR REPLACE FUNCTION public.vincular_pesaje_a_muestra(_muestra_id UUID, _pesaje_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m RECORD;
  v_p RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE='42501';
  END IF;

  SELECT id, numero_rollo, maquina_id, orden_id, pesaje_id
    INTO v_m FROM public.muestras_calidad WHERE id = _muestra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muestra no encontrada.'; END IF;

  SELECT id, numero_rollo, maquina_id, orden_produccion_id, peso_neto_kg, fecha_hora_pesaje
    INTO v_p FROM public.pesajes_bobina_madre WHERE id = _pesaje_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesaje no encontrado.'; END IF;

  IF v_m.pesaje_id IS NOT NULL THEN
    RAISE EXCEPTION 'La muestra ya tiene un pesaje vinculado.' USING ERRCODE='22023';
  END IF;

  IF v_m.numero_rollo IS DISTINCT FROM v_p.numero_rollo THEN
    RAISE EXCEPTION 'El número de rollo no coincide (muestra=% pesaje=%).', v_m.numero_rollo, v_p.numero_rollo USING ERRCODE='22023';
  END IF;

  IF v_m.maquina_id IS DISTINCT FROM v_p.maquina_id THEN
    RAISE EXCEPTION 'La máquina no coincide entre muestra y pesaje.' USING ERRCODE='22023';
  END IF;

  UPDATE public.muestras_calidad
     SET pesaje_id = v_p.id,
         hora_muestreo = v_p.fecha_hora_pesaje,
         updated_at = now()
   WHERE id = _muestra_id;

  -- Escribir/actualizar medición de peso
  UPDATE public.mediciones_calidad
     SET valor = v_p.peso_neto_kg,
         observacion = COALESCE(observacion,'') || ' [pesaje vinculado]'
   WHERE muestra_id = _muestra_id AND variable_clave = 'peso';
END $$;

REVOKE ALL ON FUNCTION public.vincular_pesaje_a_muestra(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_pesaje_a_muestra(UUID,UUID) TO authenticated;
