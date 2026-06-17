
-- =====================================================================
-- FASE 1 — Objetos PARALELOS (_v2). No reemplazan nada existente.
-- Solo lectura / cálculo. No tocan datos históricos.
-- =====================================================================

-- A) Cumplimiento de VARIABLES por rollo
CREATE OR REPLACE FUNCTION public.fn_cumplimiento_variables_rollo_v2(_muestra_id uuid)
RETURNS TABLE (
  muestra_id uuid,
  variables_evaluables int,
  variables_conformes int,
  variables_no_conformes int,
  cumplimiento_variables_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _muestra_id,
    COUNT(*) FILTER (WHERE estado IN ('conforme','no_conforme','fuera_rango_critico'))::int AS variables_evaluables,
    COUNT(*) FILTER (WHERE estado = 'conforme')::int AS variables_conformes,
    COUNT(*) FILTER (WHERE estado IN ('no_conforme','fuera_rango_critico'))::int AS variables_no_conformes,
    CASE
      WHEN COUNT(*) FILTER (WHERE estado IN ('conforme','no_conforme','fuera_rango_critico')) = 0 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(*) FILTER (WHERE estado = 'conforme')
        / COUNT(*) FILTER (WHERE estado IN ('conforme','no_conforme','fuera_rango_critico'))
      , 2)
    END AS cumplimiento_variables_pct
  FROM public.mediciones_calidad
  WHERE muestra_id = _muestra_id;
$$;

-- B) Cumplimiento del TURNO basado en estatus_liberacion oficial
CREATE OR REPLACE FUNCTION public.fn_cumplimiento_turno_v2(
  _maquina_id uuid,
  _turno text,
  _op_date date
)
RETURNS TABLE (
  maquina_id uuid,
  turno text,
  op_date date,
  rollos_capturados int,
  rollos_liberados int,
  rollos_concesion int,
  rollos_no_conformes int,
  rollos_sin_estatus int,
  cumplimiento_turno_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _maquina_id,
    _turno,
    _op_date,
    COUNT(*)::int AS rollos_capturados,
    COUNT(*) FILTER (WHERE estatus_liberacion = 'L')::int AS rollos_liberados,
    COUNT(*) FILTER (WHERE estatus_liberacion = 'C')::int AS rollos_concesion,
    COUNT(*) FILTER (WHERE estatus_liberacion = 'NC')::int AS rollos_no_conformes,
    COUNT(*) FILTER (WHERE estatus_liberacion IS NULL OR estatus_liberacion NOT IN ('L','C','NC'))::int AS rollos_sin_estatus,
    CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(*) FILTER (WHERE estatus_liberacion IN ('L','C')) / COUNT(*)
      , 2)
    END AS cumplimiento_turno_pct
  FROM public.muestras_calidad
  WHERE maquina_id = _maquina_id
    AND turno = _turno
    AND public.shift_op_date(capturado_at, turno) = _op_date;
$$;

-- C) Vista por muestra (rollo) — estatus OFICIAL + variables como info complementaria
CREATE OR REPLACE VIEW public.v_muestra_kpis_v2 AS
SELECT
  m.id AS muestra_id,
  m.numero_rollo,
  m.maquina_id,
  m.turno,
  m.producto_id,
  m.orden_id,
  m.capturado_at,
  public.shift_op_date(m.capturado_at, m.turno) AS op_date,
  -- Fuente única de verdad del estatus
  m.estatus_liberacion AS estatus_oficial,
  m.estado AS estado_workflow,
  m.dictamen,
  m.autorizado_por,
  -- Variables (info complementaria, NO sustituye estatus oficial)
  v.variables_evaluables,
  v.variables_conformes,
  v.variables_no_conformes,
  v.cumplimiento_variables_pct,
  (v.variables_no_conformes > 0) AS tiene_variables_fuera_spec
FROM public.muestras_calidad m
LEFT JOIN LATERAL public.fn_cumplimiento_variables_rollo_v2(m.id) v ON TRUE;

-- D) Vista por turno (máquina + turno + op_date)
CREATE OR REPLACE VIEW public.v_turno_kpis_v2 AS
SELECT
  m.maquina_id,
  m.turno,
  public.shift_op_date(m.capturado_at, m.turno) AS op_date,
  COUNT(*)::int AS rollos_capturados,
  COUNT(*) FILTER (WHERE m.estatus_liberacion = 'L')::int AS rollos_liberados,
  COUNT(*) FILTER (WHERE m.estatus_liberacion = 'C')::int AS rollos_concesion,
  COUNT(*) FILTER (WHERE m.estatus_liberacion = 'NC')::int AS rollos_no_conformes,
  COUNT(*) FILTER (WHERE m.estatus_liberacion IS NULL OR m.estatus_liberacion NOT IN ('L','C','NC'))::int AS rollos_sin_estatus,
  CASE
    WHEN COUNT(*) = 0 THEN NULL
    ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE m.estatus_liberacion IN ('L','C')) / COUNT(*), 2)
  END AS cumplimiento_turno_pct
FROM public.muestras_calidad m
GROUP BY m.maquina_id, m.turno, public.shift_op_date(m.capturado_at, m.turno);

-- Permisos de lectura (paralelos a la convención existente)
GRANT EXECUTE ON FUNCTION public.fn_cumplimiento_variables_rollo_v2(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cumplimiento_turno_v2(uuid, text, date) TO authenticated, service_role;
GRANT SELECT ON public.v_muestra_kpis_v2 TO authenticated, service_role;
GRANT SELECT ON public.v_turno_kpis_v2 TO authenticated, service_role;
