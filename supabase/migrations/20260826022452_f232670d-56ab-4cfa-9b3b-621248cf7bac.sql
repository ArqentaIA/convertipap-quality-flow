CREATE OR REPLACE FUNCTION public.estado_numeracion_rollo(_maquina_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'configurada', true,
    'activa', n.activo AND now() >= n.vigente_desde,
    'vigente_desde', n.vigente_desde,
    'sufijo', n.sufijo,
    'proximo_numero',
      CASE
        WHEN COALESCE(n.relleno_digitos, 0) > 0
          THEN lpad(n.proximo_numero::text, n.relleno_digitos, '0')
        ELSE n.proximo_numero::text
      END || '-' || n.sufijo,
    'ahora_servidor', now()
  )
  FROM public.numeracion_rollos n
  WHERE n.maquina_id = _maquina_id;
$$;

REVOKE ALL ON FUNCTION public.estado_numeracion_rollo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_numeracion_rollo(uuid) TO authenticated, service_role;