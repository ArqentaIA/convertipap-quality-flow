DO $$
DECLARE
  v_mp01 uuid;
  v_spec uuid;
  v_prod uuid;
  v_tipo uuid;
  r record;
  vr record;
BEGIN
  SELECT id INTO v_mp01 FROM public.maquinas WHERE codigo = 'MP-01';

  FOR r IN
    SELECT * FROM (VALUES
      ('PSK21','Papel servilleta - Kraft','SERVILLETA'),
      ('PSR21','Papel servilleta - Blanca','SERVILLETA'),
      ('PTK21','Papel toalla - Café','TOALLA_ROLLO'),
      ('PTR21','Papel toalla - Blanca','TOALLA_ROLLO'),
      ('PGA01','Papel grado alimenticio - Blanco','OTRO_TISSUE'),
      ('PEB01','Papel envoltura - Blanca (40 g/m²)','OTRO_TISSUE'),
      ('PEB02','Papel envoltura - Blanca (70 g/m²)','OTRO_TISSUE')
    ) AS t(codigo, nombre, tipo)
  LOOP
    SELECT id INTO v_tipo FROM public.tipos_producto WHERE codigo = r.tipo;

    INSERT INTO public.productos (tipo_id, codigo, nombre, activo)
    VALUES (v_tipo, r.codigo, r.nombre, true)
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true
    RETURNING id INTO v_prod;

    IF v_prod IS NULL THEN
      SELECT id INTO v_prod FROM public.productos WHERE codigo = r.codigo;
    END IF;

    INSERT INTO public.producto_especificaciones (producto_id, version, estado, vigente_desde, notas)
    VALUES (v_prod, '1.0', 'vigente', now(), 'Alta inicial Planta Ixtapaluca (MP-01)')
    RETURNING id INTO v_spec;

    INSERT INTO public.producto_especificacion_maquinas (especificacion_id, maquina_id)
    VALUES (v_spec, v_mp01);

    FOR vr IN
      SELECT * FROM (VALUES
        ('PSK21','pesoBase',17.0,18.0,19.0),
        ('PSK21','tensionMD',0.600,0.650,99999),
        ('PSK21','tensionCD',0.500,0.550,99999),
        ('PSK21','tensionRH',105,105,99999),
        ('PSK21','humedad',6,6.5,7),
        ('PSK21','anchoUtil',259.8,260,260.2),
        ('PSK21','diametro',100,110,120),

        ('PSR21','pesoBase',17,18,19),
        ('PSR21','tensionMD',0.7,0.7,99999),
        ('PSR21','tensionCD',0.355,0.510,99999),
        ('PSR21','tensionRH',0.100,0.105,99999),
        ('PSR21','humedad',6,6.5,7),
        ('PSR21','anchoUtil',259.8,260,260.2),
        ('PSR21','diametro',100,110,120.0),

        ('PTK21','pesoBase',28.0,30.0,32),
        ('PTK21','tensionMD',1450,1500,99999),
        ('PTK21','tensionCD',1400,1450,99999),
        ('PTK21','tensionRH',360,380,99999),
        ('PTK21','humedad',6,6.5,7),
        ('PTK21','anchoUtil',258,260,262.0),
        ('PTK21','diametro',100,110,120),

        ('PTR21','pesoBase',28.0,30.0,32),
        ('PTR21','tensionMD',1450,1500,99999),
        ('PTR21','tensionCD',1400,1450,99999),
        ('PTR21','tensionRH',360,380,99999),
        ('PTR21','humedad',6,6.5,7),
        ('PTR21','anchoUtil',258,260,262),
        ('PTR21','diametro',100,110,120.0),

        ('PGA01','pesoBase',29,30,31),
        ('PGA01','tensionMD',3700,3800,3900),
        ('PGA01','tensionCD',2700,2900,3100),
        ('PGA01','tensionRH',400,500,700),
        ('PGA01','humedad',6,6.5,7),
        ('PGA01','anchoUtil',257.8,258,258.2),
        ('PGA01','diametro',100,105,110),

        ('PEB01','pesoBase',39,40,41),
        ('PEB01','tensionMD',4200,4500,4900),
        ('PEB01','tensionCD',2600,2900,3100),
        ('PEB01','tensionRH',700,800,900),
        ('PEB01','humedad',6,6.5,7),
        ('PEB01','anchoUtil',259.8,260,260.2),
        ('PEB01','diametro',100,105,110),

        ('PEB02','pesoBase',69,70,71),
        ('PEB02','tensionMD',4200,4500,4900),
        ('PEB02','tensionCD',2600,2900,3100),
        ('PEB02','tensionRH',800,900,1100),
        ('PEB02','humedad',6,6.5,7),
        ('PEB02','anchoUtil',259.8,260,260.2),
        ('PEB02','diametro',100,105,110)
      ) AS x(prod, clave, minv, obj, maxv)
      WHERE x.prod = r.codigo
    LOOP
      INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
      SELECT v_spec, v.id, vr.minv, vr.obj, vr.maxv
      FROM public.variables_calidad v WHERE v.clave = vr.clave;
    END LOOP;

    -- Peso y Uniones: registro libre (sin control de spec)
    INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
    SELECT v_spec, v.id, 0, 0, 99999 FROM public.variables_calidad v WHERE v.clave = 'peso';
    INSERT INTO public.producto_variables (especificacion_id, variable_id, min_valor, objetivo, max_valor)
    SELECT v_spec, v.id, 0, 0, 999 FROM public.variables_calidad v WHERE v.clave = 'uniones';
  END LOOP;
END $$;