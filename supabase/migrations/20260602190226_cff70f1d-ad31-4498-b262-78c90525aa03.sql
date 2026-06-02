-- 1) Variable nueva: Tensión RH
INSERT INTO public.variables_calidad (clave, etiqueta, unidad, orden, activo)
VALUES ('tensionRH', 'Tensión RH', 'g/in', 65, true)
ON CONFLICT (clave) DO NOTHING;

-- ---------- PHC02 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PHC02', 'Papel higiénico PHC02', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'HIGIENICO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PHC02'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 13.7::numeric, 14.0::numeric, 14.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.5::numeric, 0.6::numeric, 0.7::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 567.0::numeric, 630.0::numeric, 693.0::numeric),('tensionCD', 378.0::numeric, 420.0::numeric, 462.0::numeric),('relMDCD', 1.3::numeric, 1.5::numeric, 1.8::numeric),('elongMD', 14.0::numeric, 16.0::numeric, 18.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PHC02'
ON CONFLICT DO NOTHING;

-- ---------- PHC01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PHC01', 'Papel higiénico PHC01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'HIGIENICO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PHC01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 12.7::numeric, 13.0::numeric, 13.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.45::numeric, 0.5::numeric, 0.55::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 425.0::numeric, 500.0::numeric, 575.0::numeric),('tensionCD', 250.0::numeric, 280.0::numeric, 310.0::numeric),('relMDCD', 1.6::numeric, 1.8::numeric, 2.0::numeric),('elongMD', 12.0::numeric, 14.0::numeric, 16.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PHC01'
ON CONFLICT DO NOTHING;

-- ---------- PHR03 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PHR03', 'Papel higiénico PHR03', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'HIGIENICO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PHR03'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 21.7::numeric, 22.0::numeric, 22.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.95::numeric, 1.0::numeric, 1.05::numeric),('blancuraR457', 72.0::numeric, 74.0::numeric, 76.0::numeric),('tensionMD', 1260.0::numeric, 1400.0::numeric, 1540.0::numeric),('tensionCD', 700.0::numeric, 780.0::numeric, 860.0::numeric),('relMDCD', 1.7::numeric, 1.8::numeric, 1.9::numeric),('elongMD', 16.0::numeric, 18.0::numeric, 20.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PHR03'
ON CONFLICT DO NOTHING;

-- ---------- PHR11 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PHR11', 'Papel higiénico PHR11', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'HIGIENICO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PHR11'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 13.0::numeric, 13.5::numeric, 14.0::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.45::numeric, 0.5::numeric, 0.55::numeric),('blancuraR457', 72.0::numeric, 74.0::numeric, 76.0::numeric),('tensionMD', 460.0::numeric, 520.0::numeric, 580.0::numeric),('tensionCD', 250.0::numeric, 280.0::numeric, 310.0::numeric),('relMDCD', 1.6::numeric, 1.8::numeric, 2.0::numeric),('elongMD', 12.0::numeric, 14.0::numeric, 16.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PHR11'
ON CONFLICT DO NOTHING;

-- ---------- PHC03 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PHC03', 'Papel higiénico PHC03', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'HIGIENICO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PHC03'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 13.7::numeric, 14.0::numeric, 14.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.7::numeric, 0.8::numeric, 0.9::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 500.0::numeric, 570.0::numeric, 650.0::numeric),('tensionCD', 280.0::numeric, 310.0::numeric, 340.0::numeric),('relMDCD', 1.6::numeric, 1.8::numeric, 2.0::numeric),('elongMD', 18.0::numeric, 20.0::numeric, 22.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PHC03'
ON CONFLICT DO NOTHING;

-- ---------- PSR01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSR01', 'Papel servilleta PSR01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSR01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 16.2::numeric, 16.5::numeric, 16.8::numeric),('humedad', 4.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.65::numeric, 0.75::numeric, 0.85::numeric),('blancuraR457', 76.0::numeric, 78.0::numeric, 80.0::numeric),('tensionMD', 900.0::numeric, 1000.0::numeric, 1100.0::numeric),('tensionCD', 750.0::numeric, 833.0::numeric, 917.0::numeric),('tensionRH', 180.0::numeric, 200.0::numeric, 220.0::numeric),('relMDCD', 1.1::numeric, 1.2::numeric, 1.3::numeric),('elongMD', 10.0::numeric, 12.0::numeric, 14.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSR01'
ON CONFLICT DO NOTHING;

-- ---------- PSM01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSM01', 'Papel servilleta PSM01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSM01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 16.2::numeric, 16.5::numeric, 16.8::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.65::numeric, 0.75::numeric, 0.85::numeric),('blancuraR457', 78.0::numeric, 80.0::numeric, 82.0::numeric),('tensionMD', 990.0::numeric, 1100.0::numeric, 1210.0::numeric),('tensionCD', 700.0::numeric, 785.0::numeric, 870.0::numeric),('tensionRH', 150.0::numeric, 165.0::numeric, 180.0::numeric),('relMDCD', 1.3::numeric, 1.4::numeric, 1.5::numeric),('elongMD', 8.0::numeric, 10.0::numeric, 12.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSM01'
ON CONFLICT DO NOTHING;

-- ---------- PSC01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSC01', 'Papel servilleta PSC01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSC01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 17.2::numeric, 17.5::numeric, 17.8::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.75::numeric, 0.85::numeric, 0.95::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 1080.0::numeric, 1200.0::numeric, 1320.0::numeric),('tensionCD', 775.0::numeric, 860.0::numeric, 945.0::numeric),('tensionRH', 160.0::numeric, 180.0::numeric, 200.0::numeric),('relMDCD', 1.3::numeric, 1.4::numeric, 1.5::numeric),('elongMD', 8.0::numeric, 10.0::numeric, 12.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSC01'
ON CONFLICT DO NOTHING;

-- ---------- PSC02 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSC02', 'Papel servilleta PSC02', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSC02'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 28.7::numeric, 29.0::numeric, 29.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.8::numeric, 0.9::numeric, 1.0::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 1440.0::numeric, 1600.0::numeric, 1760.0::numeric),('tensionCD', 1025.0::numeric, 1140.0::numeric, 1255.0::numeric),('tensionRH', 215.0::numeric, 240.0::numeric, 260.0::numeric),('relMDCD', 1.3::numeric, 1.4::numeric, 1.5::numeric),('elongMD', 6.0::numeric, 8.0::numeric, 10.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSC02'
ON CONFLICT DO NOTHING;

-- ---------- PSC10 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSC10', 'Papel servilleta PSC10', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSC10'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 18.7::numeric, 19.0::numeric, 19.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.75::numeric, 0.85::numeric, 0.95::numeric),('blancuraR457', 80.0::numeric, 82.0::numeric, 84.0::numeric),('tensionMD', 1050.0::numeric, 1200.0::numeric, 1320.0::numeric),('tensionCD', 775.0::numeric, 860.0::numeric, 945.0::numeric),('tensionRH', 160.0::numeric, 180.0::numeric, 200.0::numeric),('relMDCD', 1.3::numeric, 1.4::numeric, 1.5::numeric),('elongMD', 8.0::numeric, 10.0::numeric, 12.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSC10'
ON CONFLICT DO NOTHING;

-- ---------- PSR11 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSR11', 'Papel servilleta PSR11', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSR11'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 20.3::numeric, 20.8::numeric, 21.3::numeric),('humedad', 3.0::numeric, 4.0::numeric, 5.0::numeric),('calibre', 0.9::numeric, 1.0::numeric, 1.1::numeric),('blancuraR457', 76.0::numeric, 78.0::numeric, 80.0::numeric),('tensionMD', 1260.0::numeric, 1430.0::numeric, 1560.0::numeric),('tensionCD', 858.0::numeric, 953.0::numeric, 1049.0::numeric),('tensionRH', 296.0::numeric, 329.0::numeric, 362.0::numeric),('relMDCD', 1.3::numeric, 1.5::numeric, 1.6::numeric),('elongMD', 4.0::numeric, 6.0::numeric, 8.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSR11'
ON CONFLICT DO NOTHING;

-- ---------- PSR12 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSR12', 'Papel servilleta PSR12', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSR12'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 18.5::numeric, 19.0::numeric, 19.5::numeric),('humedad', 3.0::numeric, 4.0::numeric, 5.0::numeric),('calibre', 0.7::numeric, 0.8::numeric, 0.9::numeric),('blancuraR457', 76.0::numeric, 78.0::numeric, 80.0::numeric),('tensionMD', 1062.0::numeric, 1180.0::numeric, 1298.0::numeric),('tensionCD', 708.0::numeric, 787.0::numeric, 865.0::numeric),('tensionRH', 244.0::numeric, 271.0::numeric, 299.0::numeric),('relMDCD', 1.4::numeric, 1.5::numeric, 1.7::numeric),('elongMD', 5.0::numeric, 7.0::numeric, 9.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSR12'
ON CONFLICT DO NOTHING;

-- ---------- PSR13 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSR13', 'Papel servilleta PSR13', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSR13'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 18.0::numeric, 18.5::numeric, 19.0::numeric),('humedad', 3.0::numeric, 4.0::numeric, 5.0::numeric),('calibre', 0.6::numeric, 0.7::numeric, 0.8::numeric),('blancuraR457', 76.0::numeric, 78.0::numeric, 80.0::numeric),('tensionMD', 790.0::numeric, 960.0::numeric, 1090.0::numeric),('tensionCD', 576.0::numeric, 640.0::numeric, 704.0::numeric),('tensionRH', 199.0::numeric, 221.0::numeric, 243.0::numeric),('relMDCD', 1.2::numeric, 1.5::numeric, 1.7::numeric),('elongMD', 5.0::numeric, 7.0::numeric, 9.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSR13'
ON CONFLICT DO NOTHING;

-- ---------- PSIM01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSIM01', 'Papel servilleta PSIM01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSIM01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 24.7::numeric, 25.0::numeric, 25.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.7::numeric, 0.8::numeric, 0.9::numeric),('blancuraR457', 78.0::numeric, 80.0::numeric, 82.0::numeric),('tensionMD', 2070.0::numeric, 2300.0::numeric, 2530.0::numeric),('tensionCD', 1374.0::numeric, 1544.0::numeric, 1700.0::numeric),('tensionRH', 312.0::numeric, 345.0::numeric, 359.0::numeric),('relMDCD', 1.4::numeric, 1.5::numeric, 1.6::numeric),('elongMD', 15.0::numeric, 16.0::numeric, 17.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSIM01'
ON CONFLICT DO NOTHING;

-- ---------- PSIM02 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSIM02', 'Papel servilleta PSIM02', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSIM02'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 22.2::numeric, 22.5::numeric, 22.8::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.65::numeric, 0.75::numeric, 0.85::numeric),('blancuraR457', 78.0::numeric, 80.0::numeric, 82.0::numeric),('tensionMD', 1890.0::numeric, 2100.0::numeric, 2310.0::numeric),('tensionCD', 1235.0::numeric, 1373.0::numeric, 1511.0::numeric),('tensionRH', 284.0::numeric, 315.0::numeric, 328.0::numeric),('relMDCD', 1.4::numeric, 1.5::numeric, 1.6::numeric),('elongMD', 15.0::numeric, 16.0::numeric, 17.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSIM02'
ON CONFLICT DO NOTHING;

-- ---------- PSTR01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PSTR01', 'Papel servilleta PSTR01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'SERVILLETA'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PSTR01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 19.0::numeric, 19.5::numeric, 20.0::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.65::numeric, 0.75::numeric, 0.85::numeric),('blancuraR457', 76.0::numeric, 78.0::numeric, 80.0::numeric),('tensionMD', 1130.0::numeric, 1300.0::numeric, 1430.0::numeric),('tensionCD', 790.0::numeric, 880.0::numeric, 970.0::numeric),('tensionRH', 235.0::numeric, 260.0::numeric, 270.0::numeric),('relMDCD', 1.3::numeric, 1.5::numeric, 1.7::numeric),('elongMD', 12.0::numeric, 14.0::numeric, 16.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PSTR01'
ON CONFLICT DO NOTHING;

-- ---------- PTR01 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PTR01', 'Papel toalla PTR01', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'TOALLA_ROLLO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PTR01'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 26.7::numeric, 27.0::numeric, 27.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.65::numeric, 0.75::numeric, 0.85::numeric),('blancuraR457', 72.0::numeric, 74.0::numeric, 76.0::numeric),('tensionMD', 1440.0::numeric, 1600.0::numeric, 1760.0::numeric),('tensionCD', 900.0::numeric, 1000.0::numeric, 1100.0::numeric),('tensionRH', 360.0::numeric, 400.0::numeric, 440.0::numeric),('relMDCD', 1.4::numeric, 1.6::numeric, 1.8::numeric),('elongMD', 6.0::numeric, 8.0::numeric, 10.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PTR01'
ON CONFLICT DO NOTHING;

-- ---------- PTR02 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PTR02', 'Papel toalla PTR02', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'TOALLA_ROLLO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PTR02'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 15.0::numeric, 15.5::numeric, 16.0::numeric),('humedad', 4.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.6::numeric, 0.7::numeric, 0.8::numeric),('blancuraR457', 74.0::numeric, 77.0::numeric, 80.0::numeric),('tensionMD', 900.0::numeric, 1000.0::numeric, 1100.0::numeric),('tensionCD', 600.0::numeric, 670.0::numeric, 740.0::numeric),('tensionRH', 225.0::numeric, 250.0::numeric, 275.0::numeric),('relMDCD', 1.4::numeric, 1.5::numeric, 1.6::numeric),('elongMD', 6.0::numeric, 8.0::numeric, 10.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PTR02'
ON CONFLICT DO NOTHING;

-- ---------- PTR10 ----------
INSERT INTO public.productos (codigo, nombre, tipo_id, activo)
SELECT 'PTR10', 'Papel toalla PTR10', tp.id, true
FROM public.tipos_producto tp WHERE tp.codigo = 'TOALLA_ROLLO'
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde)
SELECT p.id, '1.0', 'vigente'::spec_status, now()
FROM public.productos p WHERE p.codigo = 'PTR10'
  AND NOT EXISTS (SELECT 1 FROM public.producto_especificaciones pe WHERE pe.producto_id = p.id AND pe.estado = 'vigente');
INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
SELECT pe.id, v.id, x.min_v, x.obj_v, x.max_v
FROM public.productos p
JOIN public.producto_especificaciones pe ON pe.producto_id = p.id AND pe.estado = 'vigente'
JOIN (VALUES
  ('pesoBase', 28.7::numeric, 29.0::numeric, 29.3::numeric),('humedad', 5.0::numeric, 6.0::numeric, 7.0::numeric),('calibre', 0.9::numeric, 1.0::numeric, 1.1::numeric),('blancuraR457', 72.0::numeric, 74.0::numeric, 76.0::numeric),('tensionMD', 1620.0::numeric, 1800.0::numeric, 1980.0::numeric),('tensionCD', 1072.0::numeric, 1200.0::numeric, 1320.0::numeric),('tensionRH', 405.0::numeric, 450.0::numeric, 495.0::numeric),('relMDCD', 1.4::numeric, 1.5::numeric, 1.7::numeric),('elongMD', 6.0::numeric, 8.0::numeric, 10.0::numeric)
) AS x(clave, min_v, obj_v, max_v) ON true
JOIN public.variables_calidad v ON v.clave = x.clave
WHERE p.codigo = 'PTR10'
ON CONFLICT DO NOTHING;