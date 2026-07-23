
CREATE TABLE IF NOT EXISTS public.ordenes_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_orden text NOT NULL UNIQUE,
  peso_registrado numeric NOT NULL CHECK (peso_registrado >= 0),
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','cerrada')),
  fecha_registro timestamptz NOT NULL DEFAULT now(),
  fecha_cierre timestamptz,
  cerrada_por uuid,
  archivo_origen text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_estado ON public.ordenes_produccion(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_fecha ON public.ordenes_produccion(fecha_registro DESC);

GRANT SELECT, INSERT, UPDATE ON public.ordenes_produccion TO authenticated;
GRANT ALL ON public.ordenes_produccion TO service_role;

ALTER TABLE public.ordenes_produccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordenes_produccion_select_planeacion_admin"
ON public.ordenes_produccion FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'planeacion')
);

CREATE POLICY "ordenes_produccion_insert_planeacion_admin"
ON public.ordenes_produccion FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'planeacion')
);

CREATE POLICY "ordenes_produccion_update_planeacion_admin"
ON public.ordenes_produccion FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'planeacion')
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador')
  OR public.has_role(auth.uid(), 'planeacion')
);

DROP TRIGGER IF EXISTS trg_ordenes_produccion_updated_at ON public.ordenes_produccion;
CREATE TRIGGER trg_ordenes_produccion_updated_at
BEFORE UPDATE ON public.ordenes_produccion
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permisos de módulo
INSERT INTO public.module_permissions(role, module) VALUES
  ('administrador','ordenes_produccion'),
  ('planeacion','ordenes_produccion')
ON CONFLICT DO NOTHING;
