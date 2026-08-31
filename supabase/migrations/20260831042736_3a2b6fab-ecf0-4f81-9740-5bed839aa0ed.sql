INSERT INTO public.module_permissions (role, module)
VALUES
  ('pesaje_operativo','dashboard'),
  ('pesaje_operativo','produccion'),
  ('operador','dashboard'),
  ('operador','produccion')
ON CONFLICT DO NOTHING;