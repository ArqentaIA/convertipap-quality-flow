-- ============================================================
-- Corrección histórica controlada de numero_rollo
-- Excluye: a3e99283-9d50-44ca-80f6-108fd6bf5912 (colisión 1086-6)
-- ============================================================

-- 1) Tabla de respaldo
CREATE TABLE IF NOT EXISTS public._backup_sufijo_numero_rollo (
  id uuid PRIMARY KEY,
  numero_rollo_anterior text NOT NULL,
  numero_rollo_nuevo    text NOT NULL,
  maquina_id            uuid NOT NULL,
  capturado_at          timestamptz,
  operador              text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public._backup_sufijo_numero_rollo TO authenticated;
GRANT ALL    ON public._backup_sufijo_numero_rollo TO service_role;
ALTER TABLE public._backup_sufijo_numero_rollo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backup_sufijo_select_admin" ON public._backup_sufijo_numero_rollo;
CREATE POLICY "backup_sufijo_select_admin"
  ON public._backup_sufijo_numero_rollo FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- 2) Tabla de excepciones (registros NO corregidos, requieren validación manual)
CREATE TABLE IF NOT EXISTS public._excepciones_sufijo_numero_rollo (
  id uuid PRIMARY KEY,
  numero_rollo_actual   text NOT NULL,
  numero_rollo_propuesto text NOT NULL,
  maquina_id            uuid NOT NULL,
  capturado_at          timestamptz,
  operador              text,
  turno                 text,
  orden_id              uuid,
  secuencia_captura     bigint,
  motivo_exclusion      text NOT NULL,
  registrado_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public._excepciones_sufijo_numero_rollo TO authenticated;
GRANT ALL    ON public._excepciones_sufijo_numero_rollo TO service_role;
ALTER TABLE public._excepciones_sufijo_numero_rollo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "excep_sufijo_select_admin" ON public._excepciones_sufijo_numero_rollo;
CREATE POLICY "excep_sufijo_select_admin"
  ON public._excepciones_sufijo_numero_rollo FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- 3) Calcular candidatos
WITH mapa AS (
  SELECT id AS maquina_id, codigo,
    CASE codigo WHEN 'MP-04' THEN '-4' WHEN 'MP-05' THEN '-5'
                WHEN 'MP-06' THEN '-6' WHEN 'MP-07' THEN '-7' END AS suf
  FROM public.maquinas WHERE codigo IN ('MP-04','MP-05','MP-06','MP-07')
),
candidatos AS (
  SELECT mc.id, mc.numero_rollo AS rollo_anterior, m.codigo,
    CASE
      WHEN mc.numero_rollo ~ '-[0-9][a-zA-Z]$' AND m.codigo='MP-07'
        THEN regexp_replace(mc.numero_rollo,'-[0-9][a-zA-Z]$', m.suf)
      WHEN mc.numero_rollo ~ '-[0-9]$'
        THEN regexp_replace(mc.numero_rollo,'-[0-9]$', m.suf)
      ELSE mc.numero_rollo || m.suf
    END AS rollo_nuevo,
    mc.maquina_id, mc.capturado_at, mc.operador, mc.turno,
    mc.orden_id, mc.secuencia_captura
  FROM public.muestras_calidad mc
  JOIN mapa m ON m.maquina_id = mc.maquina_id
  WHERE mc.numero_rollo IS NOT NULL AND mc.numero_rollo<>''
    AND NOT (mc.numero_rollo ~ ('-'||substring(m.suf from 2)||'$'))
),
-- 4) Registrar la excepción
ins_excep AS (
  INSERT INTO public._excepciones_sufijo_numero_rollo
    (id, numero_rollo_actual, numero_rollo_propuesto, maquina_id,
     capturado_at, operador, turno, orden_id, secuencia_captura, motivo_exclusion)
  SELECT c.id, c.rollo_anterior, c.rollo_nuevo, c.maquina_id,
         c.capturado_at, c.operador, c.turno, c.orden_id, c.secuencia_captura,
         'Colisión con muestra existente (mismo numero_rollo destino). Requiere validación manual con Producción y Calidad.'
  FROM candidatos c
  WHERE c.id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912'::uuid
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
-- 5) Insertar respaldo (excluyendo la excepción)
ins_backup AS (
  INSERT INTO public._backup_sufijo_numero_rollo
    (id, numero_rollo_anterior, numero_rollo_nuevo, maquina_id, capturado_at, operador)
  SELECT c.id, c.rollo_anterior, c.rollo_nuevo, c.maquina_id, c.capturado_at, c.operador
  FROM candidatos c
  WHERE c.id <> 'a3e99283-9d50-44ca-80f6-108fd6bf5912'::uuid
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT 1; -- ejecuta las CTEs INSERT

-- 6) Aplicar UPDATE únicamente sobre los respaldados
UPDATE public.muestras_calidad mc
   SET numero_rollo = b.numero_rollo_nuevo
  FROM public._backup_sufijo_numero_rollo b
 WHERE mc.id = b.id
   AND mc.numero_rollo = b.numero_rollo_anterior;

-- 7) Auditoría con motivo legible
INSERT INTO public.audit_log
  (tabla_afectada, operacion, registro_id,
   datos_anteriores, datos_nuevos,
   usuario_id, usuario_email, rol, modulo, descripcion_accion,
   maquina_id, folio_rollo, motivo)
SELECT
  'muestras_calidad','CORRECCION_SUFIJO', b.id,
  jsonb_build_object('numero_rollo', b.numero_rollo_anterior),
  jsonb_build_object('numero_rollo', b.numero_rollo_nuevo),
  NULL, 'system@cutover', 'sistema', 'control_calidad',
  'Corrección histórica de sufijo derivado de maquina_id',
  b.maquina_id, b.numero_rollo_nuevo,
  'Corrección histórica de sufijo derivado de maquina_id'
FROM public._backup_sufijo_numero_rollo b
WHERE b.created_at >= now() - interval '5 minutes';
