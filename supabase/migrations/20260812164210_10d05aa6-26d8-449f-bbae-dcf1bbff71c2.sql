DO $$
DECLARE
  v_nota text := 'DATOS MAESTROS PENDIENTES DE CONFIRMACION. Producto habilitado para operacion de Calidad con especificacion recibida el 08/08/2026 y completada con los limites faltantes (Ancho util minimo, Peso, Uniones) el 12/08/2026. La descripcion/familia indicada como provisional debera ratificarse cuando se reciba la informacion oficial.';
  v_motivo text := 'Alta / actualizacion de especificacion 08/08/2026 (limites faltantes completados 12/08/2026)';
  t_hig uuid; t_ser uuid; t_tor uuid;
  p_phc uuid; p_psc uuid; p_ptk uuid; p_psk uuid;
  s_phc uuid; s_psc uuid; s_ptk uuid; s_psk uuid;
BEGIN
  SELECT id INTO t_hig FROM public.tipos_producto WHERE codigo='HIGIENICO';
  SELECT id INTO t_ser FROM public.tipos_producto WHERE codigo='SERVILLETA';
  SELECT id INTO t_tor FROM public.tipos_producto WHERE codigo='TOALLA_ROLLO';

  INSERT INTO public.productos (tipo_id, codigo, nombre, activo)
  VALUES (t_hig,'PHC10','Papel higiénico PHC10',true)
  ON CONFLICT (codigo) DO NOTHING;
  INSERT INTO public.productos (tipo_id, codigo, nombre, activo)
  VALUES (t_tor,'PTK10','Papel toalla PTK10',true)
  ON CONFLICT (codigo) DO NOTHING;
  INSERT INTO public.productos (tipo_id, codigo, nombre, activo)
  VALUES (t_ser,'PSK03','Papel servilleta PSK03',true)
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO p_phc FROM public.productos WHERE codigo='PHC10';
  SELECT id INTO p_psc FROM public.productos WHERE codigo='PSC10';
  SELECT id INTO p_ptk FROM public.productos WHERE codigo='PTK10';
  SELECT id INTO p_psk FROM public.productos WHERE codigo='PSK03';

  -- PSC10: preservar version anterior, publicar 2.0
  UPDATE public.producto_especificaciones
     SET estado='obsoleta', vigente_hasta=now()
   WHERE producto_id=p_psc AND estado='vigente';

  INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde, notas, motivo_cambio, publicado_at)
  VALUES
    (p_phc,'1.0','vigente',now(),v_nota,v_motivo,now()),
    (p_ptk,'1.0','vigente',now(),v_nota,v_motivo,now()),
    (p_psk,'1.0','vigente',now(),v_nota,v_motivo,now()),
    (p_psc,'2.0','vigente',now(),v_nota,v_motivo,now());

  SELECT id INTO s_phc FROM public.producto_especificaciones WHERE producto_id=p_phc AND version='1.0';
  SELECT id INTO s_ptk FROM public.producto_especificaciones WHERE producto_id=p_ptk AND version='1.0';
  SELECT id INTO s_psk FROM public.producto_especificaciones WHERE producto_id=p_psk AND version='1.0';
  SELECT id INTO s_psc FROM public.producto_especificaciones WHERE producto_id=p_psc AND version='2.0';

  INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
  SELECT s.spec, v.id, s.mn, s.ob, s.mx
  FROM (VALUES
    -- PHC10 (14)
    (s_phc,'calibre',0.75,0.85,0.95),
    (s_phc,'blancuraR457',80,82,84),
    (s_phc,'blancuraA',-1,0,1),
    (s_phc,'blancuraB',0,2.5,5),
    (s_phc,'tensionMD',520,580,640),
    (s_phc,'tensionCD',300,360,390),
    (s_phc,'relMDCD',1.4,1.6,1.8),
    (s_phc,'elongMD',12,14,16),
    (s_phc,'humedad',5,6,7),
    (s_phc,'pesoBase',13.2,13.5,13.8),
    (s_phc,'anchoUtil',231,231,232),
    (s_phc,'diametro',135,140,145),
    (s_phc,'peso',1000,1200,1400),
    (s_phc,'uniones',0,0,1),
    -- PSC10 v2.0 (15)
    (s_psc,'calibre',0.75,0.85,0.95),
    (s_psc,'blancuraR457',80,82,84),
    (s_psc,'blancuraA',-1,0,1),
    (s_psc,'blancuraB',0,2.5,5),
    (s_psc,'tensionMD',1080,1200,1320),
    (s_psc,'tensionCD',775,860,945),
    (s_psc,'tensionRH',160,180,200),
    (s_psc,'relMDCD',1.3,1.4,1.5),
    (s_psc,'elongMD',8,10,12),
    (s_psc,'humedad',5,6,7),
    (s_psc,'pesoBase',17.2,17.5,17.8),
    (s_psc,'anchoUtil',231,231,232),
    (s_psc,'diametro',135,140,145),
    (s_psc,'peso',1000,1200,1400),
    (s_psc,'uniones',0,0,1),
    -- PTK10 (15)
    (s_ptk,'calibre',0.9,1,1.1),
    (s_ptk,'blancuraR457',20,25,30),
    (s_ptk,'blancuraA',2,4,6),
    (s_ptk,'blancuraB',14,16.5,19),
    (s_ptk,'tensionMD',1600,1760,1936),
    (s_ptk,'tensionCD',800,880,968),
    (s_ptk,'tensionRH',320,360,387),
    (s_ptk,'relMDCD',1.8,2,2.2),
    (s_ptk,'elongMD',7,9,11),
    (s_ptk,'humedad',5,6,7),
    (s_ptk,'pesoBase',28.7,29.2,29.7),
    (s_ptk,'anchoUtil',263.7,264,264.3),
    (s_ptk,'diametro',138,140,142),
    (s_ptk,'peso',1200,1500,1800),
    (s_ptk,'uniones',0,0,1),
    -- PSK03 (14)
    (s_psk,'calibre',0.75,0.85,0.95),
    (s_psk,'blancuraR457',20,25,30),
    (s_psk,'blancuraA',2,4,6),
    (s_psk,'blancuraB',14,16.5,19),
    (s_psk,'tensionMD',1080,1200,1380),
    (s_psk,'tensionCD',620,690,760),
    (s_psk,'relMDCD',1.5,1.7,1.9),
    (s_psk,'elongMD',7,9,11),
    (s_psk,'humedad',5,6,7),
    (s_psk,'pesoBase',20,20.5,20.8),
    (s_psk,'anchoUtil',285,285,288),
    (s_psk,'diametro',180,185,190),
    (s_psk,'peso',1800,2100,2400),
    (s_psk,'uniones',0,0,1)
  ) AS s(spec, clave, mn, ob, mx)
  JOIN public.variables_calidad v ON v.clave = s.clave;
END $$;