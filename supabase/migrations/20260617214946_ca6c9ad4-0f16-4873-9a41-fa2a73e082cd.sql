
-- 1. Tabla de respaldo permanente
CREATE TABLE IF NOT EXISTS public._backup_eliminacion_captura_prueba (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_origen text NOT NULL,
  registro_id uuid NOT NULL,
  payload jsonb NOT NULL,
  motivo_eliminacion text NOT NULL,
  eliminado_por uuid,
  eliminado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public._backup_eliminacion_captura_prueba TO authenticated;
GRANT ALL ON public._backup_eliminacion_captura_prueba TO service_role;

ALTER TABLE public._backup_eliminacion_captura_prueba ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_elim_admin_read" ON public._backup_eliminacion_captura_prueba;
CREATE POLICY "backup_elim_admin_read"
  ON public._backup_eliminacion_captura_prueba
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- 2. Respaldos (payload completo) - antes de eliminar
INSERT INTO public._backup_eliminacion_captura_prueba(tabla_origen, registro_id, payload, motivo_eliminacion)
SELECT 'muestras_calidad', m.id, to_jsonb(m.*), 'Captura de prueba confirmada por el administrador'
FROM public.muestras_calidad m
WHERE m.id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public._backup_eliminacion_captura_prueba(tabla_origen, registro_id, payload, motivo_eliminacion)
SELECT 'mediciones_calidad', mc.id, to_jsonb(mc.*), 'Captura de prueba confirmada por el administrador'
FROM public.mediciones_calidad mc
WHERE mc.muestra_id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public._backup_eliminacion_captura_prueba(tabla_origen, registro_id, payload, motivo_eliminacion)
SELECT 'rollos_producidos', r.id, to_jsonb(r.*), 'Captura de prueba confirmada por el administrador'
FROM public.rollos_producidos r
WHERE r.observaciones = 'muestra:a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public._backup_eliminacion_captura_prueba(tabla_origen, registro_id, payload, motivo_eliminacion)
SELECT '_excepciones_sufijo_numero_rollo', e.id, to_jsonb(e.*), 'Captura de prueba confirmada por el administrador'
FROM public._excepciones_sufijo_numero_rollo e
WHERE e.id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

-- 3. Auditoría explícita (datos_anteriores completos)
INSERT INTO public.audit_log(tabla_afectada, operacion, registro_id, datos_anteriores, modulo, descripcion_accion, motivo)
SELECT 'muestras_calidad', 'DELETE', m.id, to_jsonb(m.*),
       'control_calidad',
       'Eliminación controlada de captura de prueba confirmada por administrador',
       'Captura de prueba confirmada por el administrador'
FROM public.muestras_calidad m
WHERE m.id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public.audit_log(tabla_afectada, operacion, registro_id, datos_anteriores, modulo, descripcion_accion, motivo)
SELECT 'mediciones_calidad', 'DELETE', mc.id, to_jsonb(mc.*),
       'control_calidad',
       'Eliminación controlada de captura de prueba confirmada por administrador (cascada)',
       'Captura de prueba confirmada por el administrador'
FROM public.mediciones_calidad mc
WHERE mc.muestra_id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public.audit_log(tabla_afectada, operacion, registro_id, datos_anteriores, modulo, descripcion_accion, motivo)
SELECT 'rollos_producidos', 'DELETE', r.id, to_jsonb(r.*),
       'control_calidad',
       'Eliminación controlada de captura de prueba confirmada por administrador (cascada)',
       'Captura de prueba confirmada por el administrador'
FROM public.rollos_producidos r
WHERE r.observaciones = 'muestra:a3e99283-9d50-44ca-80f6-108fd6bf5912';

INSERT INTO public.audit_log(tabla_afectada, operacion, registro_id, datos_anteriores, modulo, descripcion_accion, motivo)
SELECT '_excepciones_sufijo_numero_rollo', 'DELETE', e.id, to_jsonb(e.*),
       'control_calidad',
       'Eliminación controlada de captura de prueba confirmada por administrador',
       'Captura de prueba confirmada por el administrador'
FROM public._excepciones_sufijo_numero_rollo e
WHERE e.id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

-- 4. Eliminaciones (mediciones por CASCADE al borrar la muestra, pero explícito por trazabilidad)
DELETE FROM public.mediciones_calidad
WHERE muestra_id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

DELETE FROM public.rollos_producidos
WHERE observaciones = 'muestra:a3e99283-9d50-44ca-80f6-108fd6bf5912';

DELETE FROM public._excepciones_sufijo_numero_rollo
WHERE id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

DELETE FROM public.muestras_calidad
WHERE id = 'a3e99283-9d50-44ca-80f6-108fd6bf5912';

-- 5. Recalcular SÓLO la orden afectada
UPDATE public.ordenes_fabricacion o
   SET producido_rollos = sub.cnt,
       producido_kg = COALESCE(sub.kg, 0)
  FROM (
    SELECT COUNT(*)::int AS cnt, SUM(COALESCE(peso_kg, 0)) AS kg
      FROM public.rollos_producidos
     WHERE orden_id = '2a82ea5e-60f1-4de9-b94c-aa67ebcdd5be'
  ) sub
 WHERE o.id = '2a82ea5e-60f1-4de9-b94c-aa67ebcdd5be';
