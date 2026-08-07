-- Todos los roles obtienen los módulos generales
insert into public.module_permissions (role, module)
select r.role, m.module
from (select unnest(enum_range(null::public.app_role)) as role) r
cross join (values
  ('dashboard'::public.app_module),
  ('produccion'),
  ('control_calidad'),
  ('reportes'),
  ('auditoria'),
  ('catalogos'),
  ('pesaje_bobina_madre'),
  ('pesaje_cintas')
) m(module)
on conflict do nothing;

-- Módulos exclusivos de administrador
delete from public.module_permissions
where module in ('variables_calidad','configuracion','usuarios_permisos')
  and role <> 'administrador';

-- Órdenes de producción: solo administrador y planeación
delete from public.module_permissions
where module = 'ordenes_produccion'
  and role not in ('administrador','planeacion');
