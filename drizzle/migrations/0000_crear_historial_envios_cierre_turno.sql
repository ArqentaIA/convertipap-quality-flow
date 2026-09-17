CREATE TABLE public.reporte_turno_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generado_at timestamptz NOT NULL DEFAULT now(),
  fecha date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::date,
  hora time NOT NULL DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::time,
  turno text NOT NULL,
  destinatario text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'fallido')),
  asunto text NOT NULL,
  proveedor text NOT NULL DEFAULT 'resend',
  proveedor_id text,
  error text,
  confirmado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reporte_turno_envios TO authenticated;
GRANT ALL ON public.reporte_turno_envios TO service_role;

ALTER TABLE public.reporte_turno_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rte_select_adgral"
ON public.reporte_turno_envios
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'adgral@convertipap.site');

CREATE INDEX idx_reporte_turno_envios_generado_at ON public.reporte_turno_envios (generado_at DESC);
CREATE INDEX idx_reporte_turno_envios_estado ON public.reporte_turno_envios (estado);

CREATE OR REPLACE FUNCTION public.set_reporte_turno_envios_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reporte_turno_envios_updated_at
BEFORE UPDATE ON public.reporte_turno_envios
FOR EACH ROW EXECUTE FUNCTION public.set_reporte_turno_envios_updated_at();