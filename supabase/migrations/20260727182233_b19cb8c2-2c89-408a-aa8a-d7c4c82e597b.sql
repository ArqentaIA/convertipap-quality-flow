-- Habilitar múltiples specs vigentes por producto usando perfil_key
ALTER TABLE public.producto_especificaciones
  ADD COLUMN IF NOT EXISTS perfil_key text;

-- Etiquetar los dos perfiles de PHR02
UPDATE public.producto_especificaciones pe
   SET perfil_key = 'MP04'
  FROM public.productos p
 WHERE pe.producto_id = p.id AND p.codigo = 'PHR02' AND pe.version = 'PHR02-MP04';

UPDATE public.producto_especificaciones pe
   SET perfil_key = 'MP05_06_07'
  FROM public.productos p
 WHERE pe.producto_id = p.id AND p.codigo = 'PHR02' AND pe.version = 'PHR02-MP05_06_07';

-- Sustituir los índices únicos parciales previos por uno que considere el perfil
DROP INDEX IF EXISTS public.uq_spec_vigente_por_producto;
DROP INDEX IF EXISTS public.uq_producto_esp_vigente;

CREATE UNIQUE INDEX uq_spec_vigente_por_producto_perfil
  ON public.producto_especificaciones (producto_id, COALESCE(perfil_key, '__default__'))
  WHERE estado = 'vigente'::spec_status;

-- Publicar PHR02-MP04 como vigente (antes quedó en_revision por la restricción anterior)
UPDATE public.producto_especificaciones pe
   SET estado = 'vigente'::spec_status,
       vigente_desde = COALESCE(pe.vigente_desde, now())
  FROM public.productos p
 WHERE pe.producto_id = p.id
   AND p.codigo = 'PHR02'
   AND pe.version = 'PHR02-MP04'
   AND pe.estado <> 'vigente'::spec_status;
