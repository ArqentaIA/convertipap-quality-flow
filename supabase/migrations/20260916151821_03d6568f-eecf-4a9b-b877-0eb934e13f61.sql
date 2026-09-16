CREATE TABLE IF NOT EXISTS public.reporte_turno_destinatarios (
  planta_id uuid PRIMARY KEY REFERENCES public.plantas(id) ON DELETE CASCADE,
  destinatarios text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reporte_turno_destinatarios TO authenticated;
GRANT ALL ON public.reporte_turno_destinatarios TO service_role;

ALTER TABLE public.reporte_turno_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rtd_select_auth" ON public.reporte_turno_destinatarios;
CREATE POLICY "rtd_select_auth" ON public.reporte_turno_destinatarios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rtd_admin_write" ON public.reporte_turno_destinatarios;
CREATE POLICY "rtd_admin_write" ON public.reporte_turno_destinatarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

INSERT INTO public.reporte_turno_destinatarios (planta_id)
SELECT id FROM public.plantas
ON CONFLICT (planta_id) DO NOTHING;