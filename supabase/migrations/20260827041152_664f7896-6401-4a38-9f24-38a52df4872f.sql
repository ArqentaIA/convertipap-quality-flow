CREATE OR REPLACE FUNCTION public.ensure_orden_auto(_maquina_id uuid, _producto_id uuid, _planta_id uuid, _turno text, _op_date date, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_folio text;
  v_spec_id uuid;
  v_codigo text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_planta_codigo text;
  v_prod_codigo text;
  v_prod_existente uuid;
BEGIN
  IF _maquina_id IS NULL OR _producto_id IS NULL OR _planta_id IS NULL
     OR _turno IS NULL OR _op_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT codigo INTO v_codigo FROM public.maquinas WHERE id = _maquina_id;
  IF v_codigo IS NULL THEN RETURN NULL; END IF;

  SELECT codigo INTO v_planta_codigo FROM public.plantas WHERE id = _planta_id;

  v_folio := 'OF-' || to_char(_op_date, 'YYYYMMDD') || '-' || v_codigo || '-T' || _turno;

  SELECT id, producto_id INTO v_id, v_prod_existente
    FROM public.ordenes_fabricacion WHERE folio = v_folio;

  IF v_id IS NOT NULL THEN
    -- Trazabilidad: SOLO Ixtapaluca. Si la orden abierta es de otro producto,
    -- se usa/crea una orden separada por producto para no desfasar reportes.
    IF v_planta_codigo = 'IXT' AND v_prod_existente IS DISTINCT FROM _producto_id THEN
      SELECT codigo INTO v_prod_codigo FROM public.productos WHERE id = _producto_id;
      v_folio := v_folio || '-' || COALESCE(v_prod_codigo, left(_producto_id::text, 8));
      SELECT id INTO v_id FROM public.ordenes_fabricacion WHERE folio = v_folio;
      IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    ELSE
      RETURN v_id;
    END IF;
  END IF;

  SELECT id INTO v_spec_id
    FROM public.producto_especificaciones
   WHERE producto_id = _producto_id AND estado = 'vigente'
   ORDER BY vigente_desde DESC NULLS LAST
   LIMIT 1;

  IF v_spec_id IS NULL THEN
    SELECT id INTO v_spec_id
      FROM public.producto_especificaciones
     WHERE producto_id = _producto_id
     ORDER BY vigente_desde DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_spec_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_inicio := CASE _turno
    WHEN '1' THEN (_op_date::timestamp + interval '7 hours')
    WHEN '2' THEN (_op_date::timestamp + interval '15 hours')
    WHEN '3' THEN (_op_date::timestamp + interval '23 hours')
    ELSE _op_date::timestamp
  END AT TIME ZONE 'America/Mexico_City';
  v_fin := v_inicio + interval '8 hours';

  BEGIN
    INSERT INTO public.ordenes_fabricacion(
      folio, producto_id, especificacion_id, maquina_id, planta_id,
      turno, estado, unidad_objetivo,
      creado_por, fecha_programada, fecha_inicio, fecha_fin,
      notas
    ) VALUES (
      v_folio, _producto_id, v_spec_id, _maquina_id, _planta_id,
      _turno, 'finalizada', 'kg',
      _user_id, v_inicio, v_inicio, v_fin,
      'Orden auto-derivada desde captura de calidad'
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.ordenes_fabricacion WHERE folio = v_folio;
  END;

  RETURN v_id;
END $function$;