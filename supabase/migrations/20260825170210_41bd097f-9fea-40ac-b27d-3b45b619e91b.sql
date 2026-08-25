INSERT INTO public.module_permissions (role, module)
SELECT r::public.app_role, 'pesaje_cintas'::public.app_module
FROM unnest(ARRAY['administrador','direccion_general','gerente_general','direccion','calidad','calidad_operativo','capturista','reportes_consulta','planeacion']) AS r
ON CONFLICT DO NOTHING;