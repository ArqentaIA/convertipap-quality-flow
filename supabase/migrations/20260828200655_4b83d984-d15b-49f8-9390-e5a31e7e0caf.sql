CREATE TABLE public.enlaces_pesaje_publico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  maquina_id uuid NOT NULL REFERENCES public.maquinas(id),
  descripcion text,
  expira_at timestamptz NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.enlaces_pesaje_publico TO authenticated;
GRANT ALL ON public.enlaces_pesaje_publico TO service_role;

ALTER TABLE public.enlaces_pesaje_publico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administradores consultan enlaces publicos"
ON public.enlaces_pesaje_publico
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

INSERT INTO public.enlaces_pesaje_publico (token, maquina_id, descripcion, expira_at)
SELECT encode(gen_random_bytes(16), 'hex'), m.id, 'Captura temporal de peso MP-01 Ixtapaluca (48 h)', now() + interval '48 hours'
FROM public.maquinas m
WHERE m.codigo = 'MP-01';