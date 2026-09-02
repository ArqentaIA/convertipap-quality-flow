CREATE TABLE IF NOT EXISTS public.monitor_access_codes (
  monitor_id text PRIMARY KEY,
  access_code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_access_codes TO authenticated;
GRANT ALL ON public.monitor_access_codes TO service_role;

ALTER TABLE public.monitor_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moc_admin_all ON public.monitor_access_codes;
CREATE POLICY moc_admin_all ON public.monitor_access_codes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE OR REPLACE FUNCTION public.validate_monitor_access(_monitor text, _pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.monitor_access_codes
    WHERE monitor_id = lower(_monitor) AND access_code = _pin
  );
$$;

GRANT EXECUTE ON FUNCTION public.validate_monitor_access(text, text) TO anon, authenticated;

INSERT INTO public.monitor_access_codes (monitor_id, access_code)
VALUES ('a','1111'), ('b','2222')
ON CONFLICT (monitor_id) DO NOTHING;