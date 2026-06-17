
-- =====================================================================
-- Trazabilidad automática Calidad ↔ Producción
-- =====================================================================

-- 1) Fecha operativa del turno (TZ America/Mexico_City)
CREATE OR REPLACE FUNCTION public.shift_op_date(_ts timestamptz, _turno text)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _turno = '3'
      AND EXTRACT(HOUR FROM (_ts AT TIME ZONE 'America/Mexico_City')) < 23
    THEN ((_ts AT TIME ZONE 'America/Mexico_City')::date - 1)
    ELSE (_ts AT TIME ZONE 'America/Mexico_City')::date
  END
$$;

-- 2) Garantiza la OF auto-derivada para (máquina, turno, fecha operativa, producto)
CREATE OR REPLACE FUNCTION public.ensure_orden_auto(
  _maquina_id uuid,
  _producto_id uuid,
  _planta_id uuid,
  _turno text,
  _op_date date,
  _user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_folio text;
  v_spec_id uuid;
  v_codigo text;
  v_inicio timestamptz;
  v_fin timestamptz;
BEGIN
  IF _maquina_id IS NULL OR _producto_id IS NULL OR _planta_id IS NULL
     OR _turno IS NULL OR _op_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT codigo INTO v_codigo FROM public.maquinas WHERE id = _maquina_id;
  IF v_codigo IS NULL THEN RETURN NULL; END IF;

  v_folio := 'OF-' || to_char(_op_date, 'YYYYMMDD') || '-' || v_codigo || '-T' || _turno;

  SELECT id INTO v_id FROM public.ordenes_fabricacion WHERE folio = v_folio;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

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
END $$;

-- 3) Trigger sobre muestras_calidad: enlaza OF + crea rollo
CREATE OR REPLACE FUNCTION public.muestras_auto_traceability_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden uuid;
  v_op_date date;
  v_numero int;
  v_peso numeric;
BEGIN
  IF NEW.orden_id IS NOT NULL THEN
    -- Ya enlazada manualmente; no tocar
    RETURN NEW;
  END IF;

  IF NEW.producto_id IS NULL OR NEW.maquina_id IS NULL
     OR NEW.planta_id IS NULL OR NEW.turno IS NULL THEN
    RETURN NEW;
  END IF;

  v_op_date := public.shift_op_date(COALESCE(NEW.capturado_at, now()), NEW.turno);

  v_orden := public.ensure_orden_auto(
    NEW.maquina_id, NEW.producto_id, NEW.planta_id,
    NEW.turno, v_op_date, COALESCE(NEW.capturado_por, NEW.created_at::text::uuid)
  );

  IF v_orden IS NULL THEN
    RETURN NEW;
  END IF;

  -- Enlazar muestra → orden (sin disparar otros triggers de status)
  UPDATE public.muestras_calidad SET orden_id = v_orden WHERE id = NEW.id;

  -- Asegurar rollo (idempotente por orden + numero_rollo)
  PERFORM pg_advisory_xact_lock(hashtext('rollo:' || v_orden::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.rollos_producidos r
     WHERE r.orden_id = v_orden
       AND r.observaciones = 'muestra:' || NEW.id::text
  ) THEN
    SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
      FROM public.rollos_producidos WHERE orden_id = v_orden;

    -- Peso si ya hay medición
    SELECT NULLIF(med.valor, 0) INTO v_peso
      FROM public.mediciones_calidad med
     WHERE med.muestra_id = NEW.id AND med.variable_clave = 'peso'
     LIMIT 1;

    INSERT INTO public.rollos_producidos(
      orden_id, numero, peso_kg, registrado_por, registrado_at, observaciones
    ) VALUES (
      v_orden, v_numero, v_peso, NEW.capturado_por, COALESCE(NEW.capturado_at, now()),
      'muestra:' || NEW.id::text
    );

    -- Recalcular totales de la orden
    UPDATE public.ordenes_fabricacion o
       SET producido_rollos = sub.cnt,
           producido_kg = COALESCE(sub.kg, 0)
      FROM (
        SELECT COUNT(*)::int AS cnt, SUM(COALESCE(peso_kg, 0)) AS kg
          FROM public.rollos_producidos WHERE orden_id = v_orden
      ) sub
     WHERE o.id = v_orden;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_muestras_auto_traceability ON public.muestras_calidad;
CREATE TRIGGER trg_muestras_auto_traceability
AFTER INSERT ON public.muestras_calidad
FOR EACH ROW EXECUTE FUNCTION public.muestras_auto_traceability_fn();

-- 4) Trigger sobre mediciones_calidad (variable peso) → actualiza rollo + OF
CREATE OR REPLACE FUNCTION public.mediciones_sync_peso_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden uuid;
BEGIN
  IF NEW.variable_clave IS DISTINCT FROM 'peso' THEN RETURN NEW; END IF;
  IF NEW.valor IS NULL OR NEW.valor = 0 THEN RETURN NEW; END IF;

  UPDATE public.rollos_producidos
     SET peso_kg = NEW.valor, updated_at = now()
   WHERE observaciones = 'muestra:' || NEW.muestra_id::text
  RETURNING orden_id INTO v_orden;

  IF v_orden IS NOT NULL THEN
    UPDATE public.ordenes_fabricacion o
       SET producido_kg = COALESCE(sub.kg, 0),
           producido_rollos = sub.cnt
      FROM (
        SELECT COUNT(*)::int AS cnt, SUM(COALESCE(peso_kg, 0)) AS kg
          FROM public.rollos_producidos WHERE orden_id = v_orden
      ) sub
     WHERE o.id = v_orden;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mediciones_sync_peso ON public.mediciones_calidad;
CREATE TRIGGER trg_mediciones_sync_peso
AFTER INSERT OR UPDATE OF valor ON public.mediciones_calidad
FOR EACH ROW EXECUTE FUNCTION public.mediciones_sync_peso_fn();

-- =====================================================================
-- 5) BACKFILL: procesa muestras históricas sin orden_id
-- =====================================================================
DO $$
DECLARE
  r record;
  v_orden uuid;
  v_op_date date;
  v_numero int;
  v_peso numeric;
BEGIN
  FOR r IN
    SELECT m.id, m.maquina_id, m.producto_id, m.planta_id, m.turno,
           m.capturado_at, m.capturado_por
      FROM public.muestras_calidad m
     WHERE m.orden_id IS NULL
       AND m.producto_id IS NOT NULL
       AND m.maquina_id IS NOT NULL
       AND m.planta_id IS NOT NULL
       AND m.turno IS NOT NULL
     ORDER BY m.capturado_at NULLS LAST
  LOOP
    v_op_date := public.shift_op_date(COALESCE(r.capturado_at, now()), r.turno);
    v_orden := public.ensure_orden_auto(
      r.maquina_id, r.producto_id, r.planta_id, r.turno, v_op_date, r.capturado_por
    );
    IF v_orden IS NULL THEN CONTINUE; END IF;

    UPDATE public.muestras_calidad SET orden_id = v_orden WHERE id = r.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.rollos_producidos
       WHERE orden_id = v_orden AND observaciones = 'muestra:' || r.id::text
    ) THEN
      SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
        FROM public.rollos_producidos WHERE orden_id = v_orden;

      SELECT NULLIF(med.valor, 0) INTO v_peso
        FROM public.mediciones_calidad med
       WHERE med.muestra_id = r.id AND med.variable_clave = 'peso'
       LIMIT 1;

      INSERT INTO public.rollos_producidos(
        orden_id, numero, peso_kg, registrado_por, registrado_at, observaciones
      ) VALUES (
        v_orden, v_numero, v_peso, r.capturado_por, COALESCE(r.capturado_at, now()),
        'muestra:' || r.id::text
      );
    END IF;
  END LOOP;

  -- Recalcular totales de todas las órdenes tocadas
  UPDATE public.ordenes_fabricacion o
     SET producido_rollos = sub.cnt,
         producido_kg = COALESCE(sub.kg, 0)
    FROM (
      SELECT orden_id, COUNT(*)::int AS cnt, SUM(COALESCE(peso_kg, 0)) AS kg
        FROM public.rollos_producidos
       GROUP BY orden_id
    ) sub
   WHERE o.id = sub.orden_id;
END $$;
