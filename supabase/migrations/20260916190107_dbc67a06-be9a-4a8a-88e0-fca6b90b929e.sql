CREATE TABLE IF NOT EXISTS public.cron_secrets (
  nombre text PRIMARY KEY,
  valor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cron_secrets TO service_role;
ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO public.cron_secrets (nombre, valor)
VALUES ('reporte_turno', '3f4dc347ef7e9027734197da00a6d567536e4e11ca894a84')
ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();