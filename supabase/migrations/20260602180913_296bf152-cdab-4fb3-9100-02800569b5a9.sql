-- Tabla singleton de configuración global de la aplicación
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  -- Parámetros generales
  tolerancia_advertencia_pct numeric NOT NULL DEFAULT 10,
  frecuencia_muestreo_min integer NOT NULL DEFAULT 30,
  -- Turnos (HH:MM)
  turno1_inicio text NOT NULL DEFAULT '07:00',
  turno1_fin text NOT NULL DEFAULT '15:00',
  turno2_inicio text NOT NULL DEFAULT '15:00',
  turno2_fin text NOT NULL DEFAULT '23:00',
  turno3_inicio text NOT NULL DEFAULT '23:00',
  turno3_fin text NOT NULL DEFAULT '07:00',
  -- Notificaciones
  notif_fuera_rango boolean NOT NULL DEFAULT true,
  notif_resumen_diario boolean NOT NULL DEFAULT true,
  notif_no_conformidades boolean NOT NULL DEFAULT true,
  notif_resumen_semanal boolean NOT NULL DEFAULT false,
  -- Reporte CEO
  ceo_report_enabled boolean NOT NULL DEFAULT true,
  ceo_report_hora text NOT NULL DEFAULT '07:00',
  ceo_report_destinatarios text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton_uniq UNIQUE (singleton)
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer la configuración
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- Solo admin / gerente general pueden escribirla
CREATE POLICY app_settings_write_admin ON public.app_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gerente_general'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gerente_general'::app_role));

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inicializar fila única
INSERT INTO public.app_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;