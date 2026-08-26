CREATE TABLE public.user_plantas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, planta_id)
);

GRANT SELECT ON public.user_plantas TO authenticated;
GRANT ALL ON public.user_plantas TO service_role;

ALTER TABLE public.user_plantas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_plantas_select_self_or_admin"
ON public.user_plantas FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR public.has_role(auth.uid(), 'direccion_general'::public.app_role)
);

CREATE TRIGGER user_plantas_set_updated_at
BEFORE UPDATE ON public.user_plantas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.user_allowed_planta_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COUNT(*) = 0 THEN NULL
    ELSE array_agg(planta_id)
  END
  FROM public.user_plantas
  WHERE user_id = _user_id
$$;

REVOKE ALL ON FUNCTION public.user_allowed_planta_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.user_allowed_planta_ids(uuid) TO authenticated, service_role;