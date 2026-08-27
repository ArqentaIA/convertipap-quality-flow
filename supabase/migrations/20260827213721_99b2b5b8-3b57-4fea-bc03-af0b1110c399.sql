INSERT INTO public.module_permissions (role, module)
VALUES ('operador', 'pesaje_bobina_madre')
ON CONFLICT DO NOTHING;