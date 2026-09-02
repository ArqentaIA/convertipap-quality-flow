DROP POLICY IF EXISTS muestras_calidad_update_status_quality_only ON public.muestras_calidad;

CREATE POLICY muestras_calidad_update_status_quality_only
ON public.muestras_calidad
FOR UPDATE
TO authenticated
USING (user_can_use_machine(auth.uid(), maquina_id) AND can_change_roll_status(auth.uid()))
WITH CHECK (user_can_use_machine(auth.uid(), maquina_id) AND can_change_roll_status(auth.uid()));