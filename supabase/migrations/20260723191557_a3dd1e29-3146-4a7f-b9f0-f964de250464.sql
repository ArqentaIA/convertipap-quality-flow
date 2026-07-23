
-- 1. Unicidad de pesaje_id en muestras_calidad (permite NULL)
CREATE UNIQUE INDEX IF NOT EXISTS muestras_pesaje_id_unique
  ON public.muestras_calidad(pesaje_id)
  WHERE pesaje_id IS NOT NULL;

-- 2. RPC vincular_pesaje_a_muestra: validar OP y doble vinculación con mensaje claro
CREATE OR REPLACE FUNCTION public.vincular_pesaje_a_muestra(_muestra_id uuid, _pesaje_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m RECORD;
  v_p RECORD;
  v_otra RECORD;
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

  -- Prevención de doble vinculación: verificar si el pesaje ya está usado.
  SELECT id, numero_rollo, capturado_at INTO v_otra
    FROM public.muestras_calidad
   WHERE pesaje_id = _pesaje_id AND id <> _muestra_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Este pesaje ya se encuentra vinculado a otra muestra de calidad. Rollo: %, Fecha: %',
      v_otra.numero_rollo, to_char(v_otra.capturado_at,'YYYY-MM-DD HH24:MI')
      USING ERRCODE='22023';
  END IF;

  IF v_m.numero_rollo IS DISTINCT FROM v_p.numero_rollo THEN
    RAISE EXCEPTION 'El número de rollo no coincide (muestra=% pesaje=%).', v_m.numero_rollo, v_p.numero_rollo USING ERRCODE='22023';
  END IF;

  IF v_m.maquina_id IS DISTINCT FROM v_p.maquina_id THEN
    RAISE EXCEPTION 'La máquina no coincide entre muestra y pesaje.' USING ERRCODE='22023';
  END IF;

  -- Orden de Producción: si ambos existen deben coincidir; si la muestra no tiene, permitir.
  IF v_m.orden_id IS NOT NULL AND v_p.orden_produccion_id IS NOT NULL
     AND v_m.orden_id <> v_p.orden_produccion_id THEN
    RAISE EXCEPTION 'La Orden de Producción del pesaje no coincide con la de la muestra.' USING ERRCODE='22023';
  END IF;

  UPDATE public.muestras_calidad
     SET pesaje_id = v_p.id,
         hora_muestreo = v_p.fecha_hora_pesaje,
         updated_at = now()
   WHERE id = _muestra_id;

  UPDATE public.mediciones_calidad
     SET valor = v_p.peso_neto_kg,
         observacion = COALESCE(observacion,'') || ' [pesaje vinculado]'
   WHERE muestra_id = _muestra_id AND variable_clave = 'peso';
END $function$;
