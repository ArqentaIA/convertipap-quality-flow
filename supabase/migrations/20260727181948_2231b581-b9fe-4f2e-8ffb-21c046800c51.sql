-- =====================================================================
-- Integración de 8 productos y variables (batch controlado, idempotente)
-- Fuente: integracion_de_8_prodcutos_y_variables.xlsx
-- =====================================================================

-- 1) Tablas auxiliares de trazabilidad -----------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  source_hash text,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  executed_by uuid,
  created_products int NOT NULL DEFAULT 0,
  updated_products int NOT NULL DEFAULT 0,
  created_profiles int NOT NULL DEFAULT 0,
  created_specifications int NOT NULL DEFAULT 0,
  skipped_records int NOT NULL DEFAULT 0,
  conflicts int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  notes text
);
GRANT SELECT ON public.catalog_import_batches TO authenticated;
GRANT ALL ON public.catalog_import_batches TO service_role;
ALTER TABLE public.catalog_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin lectura batches" ON public.catalog_import_batches;
CREATE POLICY "admin lectura batches" ON public.catalog_import_batches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general') OR public.has_role(auth.uid(),'direccion'));

CREATE TABLE IF NOT EXISTS public.quality_catalog_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.catalog_import_batches(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  product_key text,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  source_file text
);
CREATE INDEX IF NOT EXISTS idx_qca_batch ON public.quality_catalog_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_qca_product ON public.quality_catalog_audit(product_key);
GRANT SELECT ON public.quality_catalog_audit TO authenticated;
GRANT ALL ON public.quality_catalog_audit TO service_role;
ALTER TABLE public.quality_catalog_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin lectura audit" ON public.quality_catalog_audit;
CREATE POLICY "admin lectura audit" ON public.quality_catalog_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gerente_general') OR public.has_role(auth.uid(),'direccion'));

-- 2) Tabla de resolución de perfil por máquina (PHR02 y futuros) ---------
CREATE TABLE IF NOT EXISTS public.producto_especificacion_maquinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  especificacion_id uuid NOT NULL REFERENCES public.producto_especificaciones(id) ON DELETE CASCADE,
  maquina_id uuid NOT NULL REFERENCES public.maquinas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (especificacion_id, maquina_id)
);
CREATE INDEX IF NOT EXISTS idx_pem_maquina ON public.producto_especificacion_maquinas(maquina_id);
GRANT SELECT ON public.producto_especificacion_maquinas TO authenticated;
GRANT ALL ON public.producto_especificacion_maquinas TO service_role;
ALTER TABLE public.producto_especificacion_maquinas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lectura autenticada perfil-maquina" ON public.producto_especificacion_maquinas;
CREATE POLICY "lectura autenticada perfil-maquina" ON public.producto_especificacion_maquinas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin gestiona perfil-maquina" ON public.producto_especificacion_maquinas;
CREATE POLICY "admin gestiona perfil-maquina" ON public.producto_especificacion_maquinas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'))
  WITH CHECK (public.has_role(auth.uid(),'administrador'));

-- 3) Ejecución del batch dentro de bloque transaccional ------------------
DO $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_tipo_hig uuid;
  v_tipo_serv uuid;
  v_tipo_toalla uuid;
  v_prod_id uuid;
  v_spec_id uuid;
  v_var_id uuid;
  v_created_p int := 0;
  v_created_s int := 0;
  v_created_v int := 0;
  r record;
  data_row record;
BEGIN
  SELECT id INTO v_tipo_hig    FROM public.tipos_producto WHERE codigo='HIGIENICO';
  SELECT id INTO v_tipo_serv   FROM public.tipos_producto WHERE codigo='SERVILLETA';
  SELECT id INTO v_tipo_toalla FROM public.tipos_producto WHERE codigo='TOALLA_ROLLO';
  IF v_tipo_hig IS NULL OR v_tipo_serv IS NULL OR v_tipo_toalla IS NULL THEN
    RAISE EXCEPTION 'Faltan tipos_producto base (HIGIENICO/SERVILLETA/TOALLA_ROLLO)';
  END IF;

  INSERT INTO public.catalog_import_batches(id, source_file, status, executed_by, notes)
  VALUES (v_batch, 'integracion_de_8_prodcutos_y_variables.xlsx', 'running', NULL,
          'Alta inicial de 8 productos faltantes con base en archivo de especificaciones internas.');

  -- 3.1 Productos ---------------------------------------------------------
  FOR r IN SELECT * FROM (VALUES
    ('PHK01', 'Papel higiénico PHK01',    'hig'),
    ('PHR02', 'Papel higiénico PHR02',    'hig'),
    ('PSIC01','Papel servilleta PSIC01', 'serv'),
    ('PSIK01','Papel servilleta PSIK01', 'serv'),
    ('PSK01', 'Papel servilleta PSK01',  'serv'),
    ('PSTC01','Papel servilleta PSTC01', 'serv'),
    ('PSTK01','Papel servilleta PSTK01', 'serv'),
    ('PTK01', 'Papel toalla PTK01',      'toalla')
  ) AS t(codigo, nombre, tipo) LOOP
    INSERT INTO public.productos(codigo, nombre, tipo_id, activo)
    VALUES (r.codigo, r.nombre,
            CASE r.tipo WHEN 'hig' THEN v_tipo_hig WHEN 'serv' THEN v_tipo_serv ELSE v_tipo_toalla END,
            true)
    ON CONFLICT (codigo) DO NOTHING
    RETURNING id INTO v_prod_id;
    IF v_prod_id IS NOT NULL THEN
      v_created_p := v_created_p + 1;
      INSERT INTO public.quality_catalog_audit(batch_id, entity_type, entity_id, product_key, action, after_data, reason, source_file)
      VALUES (v_batch, 'producto', v_prod_id, r.codigo, 'INSERT',
              jsonb_build_object('codigo', r.codigo, 'nombre', r.nombre),
              'Alta inicial de producto faltante',
              'integracion_de_8_prodcutos_y_variables.xlsx');
    ELSE
      INSERT INTO public.quality_catalog_audit(batch_id, entity_type, product_key, action, reason, source_file)
      VALUES (v_batch, 'producto', r.codigo, 'NO_CHANGE', 'Producto ya existente', 'integracion_de_8_prodcutos_y_variables.xlsx');
    END IF;
    v_prod_id := NULL;
  END LOOP;

  -- 3.2 Especificaciones (9 perfiles) -------------------------------------
  FOR r IN SELECT * FROM (VALUES
    ('PHK01', 'PHK01-v1',        'vigente'),
    ('PHR02', 'PHR02-MP04',       'en_revision'),
    ('PHR02', 'PHR02-MP05_06_07', 'vigente'),
    ('PSIC01','PSIC01-v1',        'vigente'),
    ('PSIK01','PSIK01-v1',        'vigente'),
    ('PSK01', 'PSK01-v1',         'vigente'),
    ('PSTC01','PSTC01-v1',        'vigente'),
    ('PSTK01','PSTK01-v1',        'vigente'),
    ('PTK01', 'PTK01-v1',         'vigente')
  ) AS t(codigo, version, estado) LOOP
    SELECT id INTO v_prod_id FROM public.productos WHERE codigo=r.codigo;
    INSERT INTO public.producto_especificaciones(producto_id, version, estado, vigente_desde, notas)
    VALUES (v_prod_id, r.version, r.estado::spec_status,
            CASE WHEN r.estado='vigente' THEN now() ELSE NULL END,
            'Alta inicial (batch '||v_batch::text||'). Fuente: integracion_de_8_prodcutos_y_variables.xlsx')
    ON CONFLICT (producto_id, version) DO NOTHING
    RETURNING id INTO v_spec_id;
    IF v_spec_id IS NOT NULL THEN
      v_created_s := v_created_s + 1;
      INSERT INTO public.quality_catalog_audit(batch_id, entity_type, entity_id, product_key, action, after_data, reason, source_file)
      VALUES (v_batch, 'especificacion', v_spec_id, r.codigo, 'INSERT',
              jsonb_build_object('version', r.version, 'estado', r.estado),
              'Alta inicial de perfil de especificación',
              'integracion_de_8_prodcutos_y_variables.xlsx');
    END IF;
    v_spec_id := NULL;
  END LOOP;

  -- 3.3 Variables de calidad (132 filas) ---------------------------------
  FOR data_row IN
    SELECT * FROM (VALUES
  ('PHK01','PHK01-v1','calibre',0.7,0.8,0.9),
  ('PHK01','PHK01-v1','blancuraR457',20.0,25.0,30.0),
  ('PHK01','PHK01-v1','blancuraA',2.0,4.0,6.0),
  ('PHK01','PHK01-v1','blancuraB',14.0,16.5,19.0),
  ('PHK01','PHK01-v1','tensionMD',340.0,400.0,460.0),
  ('PHK01','PHK01-v1','tensionCD',190.0,220.0,250.0),
  ('PHK01','PHK01-v1','relMDCD',1.6,1.8,2.1),
  ('PHK01','PHK01-v1','elongMD',12.0,14.0,16.0),
  ('PHK01','PHK01-v1','humedad',5.0,6.0,7.0),
  ('PHK01','PHK01-v1','pesoBase',13.2,13.5,13.8),
  ('PHK01','PHK01-v1','anchoUtil',283.0,285.0,287.0),
  ('PHK01','PHK01-v1','diametro',170.0,190.0,210.0),
  ('PHK01','PHK01-v1','peso',1500.0,2000.0,2500.0),
  ('PHK01','PHK01-v1','uniones',0.0,0.0,1.0),
  ('PHR02','PHR02-MP04','calibre',0.75,0.85,0.95),
  ('PHR02','PHR02-MP04','blancuraR457',72.0,74.0,76.0),
  ('PHR02','PHR02-MP04','blancuraA',-1.0,0.0,1.0),
  ('PHR02','PHR02-MP04','blancuraB',-2.0,1.0,4.0),
  ('PHR02','PHR02-MP04','tensionMD',490.0,550.0,610.0),
  ('PHR02','PHR02-MP04','tensionCD',268.0,300.0,310.0),
  ('PHR02','PHR02-MP04','relMDCD',1.6,1.8,2.0),
  ('PHR02','PHR02-MP04','elongMD',12.0,14.0,16.0),
  ('PHR02','PHR02-MP04','humedad',5.0,6.0,7.0),
  ('PHR02','PHR02-MP04','pesoBase',13.0,13.3,13.6),
  ('PHR02','PHR02-MP04','anchoUtil',230.0,231.0,232.0),
  ('PHR02','PHR02-MP04','diametro',170.0,190.0,210.0),
  ('PHR02','PHR02-MP04','peso',1500.0,2000.0,2500.0),
  ('PHR02','PHR02-MP04','uniones',0.0,1.0,3.0),
  ('PHR02','PHR02-MP05_06_07','calibre',0.75,0.85,0.95),
  ('PHR02','PHR02-MP05_06_07','blancuraR457',72.0,74.0,76.0),
  ('PHR02','PHR02-MP05_06_07','blancuraA',-1.0,0.0,1.0),
  ('PHR02','PHR02-MP05_06_07','blancuraB',-2.0,1.0,4.0),
  ('PHR02','PHR02-MP05_06_07','tensionMD',490.0,550.0,610.0),
  ('PHR02','PHR02-MP05_06_07','tensionCD',268.0,300.0,310.0),
  ('PHR02','PHR02-MP05_06_07','relMDCD',1.6,1.8,2.0),
  ('PHR02','PHR02-MP05_06_07','elongMD',12.0,14.0,16.0),
  ('PHR02','PHR02-MP05_06_07','humedad',5.0,6.0,7.0),
  ('PHR02','PHR02-MP05_06_07','pesoBase',13.0,13.3,13.6),
  ('PHR02','PHR02-MP05_06_07','anchoUtil',284.0,285.0,286.0),
  ('PHR02','PHR02-MP05_06_07','diametro',170.0,190.0,210.0),
  ('PHR02','PHR02-MP05_06_07','peso',1500.0,2000.0,2500.0),
  ('PHR02','PHR02-MP05_06_07','uniones',0.0,0.0,2.0),
  ('PSIC01','PSIC01-v1','calibre',0.7,0.8,0.9),
  ('PSIC01','PSIC01-v1','blancuraR457',80.0,82.0,84.0),
  ('PSIC01','PSIC01-v1','blancuraA',-1.0,0.0,1.0),
  ('PSIC01','PSIC01-v1','blancuraB',0.0,2.5,5.0),
  ('PSIC01','PSIC01-v1','tensionMD',810.0,900.0,990.0),
  ('PSIC01','PSIC01-v1','tensionCD',540.0,600.0,660.0),
  ('PSIC01','PSIC01-v1','tensionRH',122.0,135.0,140.0),
  ('PSIC01','PSIC01-v1','relMDCD',1.4,1.5,1.6),
  ('PSIC01','PSIC01-v1','elongMD',13.0,15.0,17.0),
  ('PSIC01','PSIC01-v1','humedad',5.0,6.0,7.0),
  ('PSIC01','PSIC01-v1','pesoBase',15.7,16.0,16.3),
  ('PSIC01','PSIC01-v1','anchoUtil',230.0,231.0,232.0),
  ('PSIC01','PSIC01-v1','diametro',209.0,210.0,211.0),
  ('PSIC01','PSIC01-v1','peso',1000.0,1500.0,2200.0),
  ('PSIC01','PSIC01-v1','uniones',0.0,1.0,3.0),
  ('PSIK01','PSIK01-v1','calibre',0.85,0.95,1.05),
  ('PSIK01','PSIK01-v1','blancuraR457',20.0,25.0,30.0),
  ('PSIK01','PSIK01-v1','blancuraA',2.0,4.0,6.0),
  ('PSIK01','PSIK01-v1','blancuraB',14.0,16.5,19.0),
  ('PSIK01','PSIK01-v1','tensionMD',990.0,1100.0,1210.0),
  ('PSIK01','PSIK01-v1','tensionCD',658.0,730.0,801.0),
  ('PSIK01','PSIK01-v1','tensionRH',149.0,165.0,172.0),
  ('PSIK01','PSIK01-v1','relMDCD',1.4,1.5,1.6),
  ('PSIK01','PSIK01-v1','elongMD',15.0,16.0,17.0),
  ('PSIK01','PSIK01-v1','humedad',5.0,6.0,7.0),
  ('PSIK01','PSIK01-v1','pesoBase',25.7,26.0,26.3),
  ('PSIK01','PSIK01-v1','anchoUtil',218.0,219.0,220.0),
  ('PSIK01','PSIK01-v1','diametro',129.0,130.0,131.0),
  ('PSIK01','PSIK01-v1','peso',1500.0,2000.0,2500.0),
  ('PSIK01','PSIK01-v1','uniones',0.0,1.0,3.0),
  ('PSK01','PSK01-v1','calibre',0.9,0.95,1.0),
  ('PSK01','PSK01-v1','blancuraR457',20.0,25.0,30.0),
  ('PSK01','PSK01-v1','blancuraA',2.0,4.0,6.0),
  ('PSK01','PSK01-v1','blancuraB',14.0,16.5,19.0),
  ('PSK01','PSK01-v1','tensionMD',900.0,1000.0,1100.0),
  ('PSK01','PSK01-v1','tensionCD',635.0,714.0,785.0),
  ('PSK01','PSK01-v1','tensionRH',135.0,150.0,165.0),
  ('PSK01','PSK01-v1','relMDCD',1.3,1.4,1.5),
  ('PSK01','PSK01-v1','elongMD',10.0,12.0,14.0),
  ('PSK01','PSK01-v1','humedad',5.0,6.0,7.0),
  ('PSK01','PSK01-v1','pesoBase',19.2,19.5,19.8),
  ('PSK01','PSK01-v1','anchoUtil',285.0,288.0,290.0),
  ('PSK01','PSK01-v1','diametro',180.0,185.0,190.0),
  ('PSK01','PSK01-v1','peso',1500.0,2000.0,2500.0),
  ('PSK01','PSK01-v1','uniones',0.0,1.0,3.0),
  ('PSTC01','PSTC01-v1','calibre',0.5,0.6,0.7),
  ('PSTC01','PSTC01-v1','blancuraR457',80.0,82.0,84.0),
  ('PSTC01','PSTC01-v1','blancuraA',-1.5,-1.0,-0.5),
  ('PSTC01','PSTC01-v1','blancuraB',1.0,3.0,5.0),
  ('PSTC01','PSTC01-v1','tensionMD',1350.0,1500.0,1650.0),
  ('PSTC01','PSTC01-v1','tensionCD',900.0,1000.0,1100.0),
  ('PSTC01','PSTC01-v1','tensionRH',338.0,375.0,413.0),
  ('PSTC01','PSTC01-v1','relMDCD',1.3,1.5,1.7),
  ('PSTC01','PSTC01-v1','elongMD',9.0,11.0,13.0),
  ('PSTC01','PSTC01-v1','humedad',5.0,6.0,7.0),
  ('PSTC01','PSTC01-v1','pesoBase',24.7,25.0,25.3),
  ('PSTC01','PSTC01-v1','anchoUtil',230.0,231.0,232.0),
  ('PSTC01','PSTC01-v1','diametro',140.0,145.0,150.0),
  ('PSTC01','PSTC01-v1','peso',1000.0,1500.0,2200.0),
  ('PSTC01','PSTC01-v1','uniones',0.0,1.0,3.0),
  ('PSTK01','PSTK01-v1','calibre',0.85,0.95,1.05),
  ('PSTK01','PSTK01-v1','blancuraR457',20.0,25.0,30.0),
  ('PSTK01','PSTK01-v1','blancuraA',2.0,4.0,6.0),
  ('PSTK01','PSTK01-v1','blancuraB',14.0,16.5,19.0),
  ('PSTK01','PSTK01-v1','tensionMD',990.0,1100.0,1210.0),
  ('PSTK01','PSTK01-v1','tensionCD',675.0,750.0,825.0),
  ('PSTK01','PSTK01-v1','tensionRH',200.0,220.0,240.0),
  ('PSTK01','PSTK01-v1','relMDCD',1.3,1.5,1.6),
  ('PSTK01','PSTK01-v1','elongMD',12.0,14.0,16.0),
  ('PSTK01','PSTK01-v1','humedad',5.0,6.0,7.0),
  ('PSTK01','PSTK01-v1','pesoBase',20.7,21.0,21.3),
  ('PSTK01','PSTK01-v1','anchoUtil',284.0,285.0,287.0),
  ('PSTK01','PSTK01-v1','diametro',180.0,185.0,190.0),
  ('PSTK01','PSTK01-v1','peso',1500.0,2000.0,2500.0),
  ('PSTK01','PSTK01-v1','uniones',0.0,1.0,3.0),
  ('PTK01','PTK01-v1','calibre',0.9,1.0,1.1),
  ('PTK01','PTK01-v1','blancuraR457',20.0,25.0,30.0),
  ('PTK01','PTK01-v1','blancuraA',2.0,4.0,6.0),
  ('PTK01','PTK01-v1','blancuraB',14.0,16.5,19.0),
  ('PTK01','PTK01-v1','tensionMD',945.0,1100.0,1275.0),
  ('PTK01','PTK01-v1','tensionCD',550.0,650.0,750.0),
  ('PTK01','PTK01-v1','tensionRH',250.0,300.0,350.0),
  ('PTK01','PTK01-v1','relMDCD',1.5,1.7,1.9),
  ('PTK01','PTK01-v1','elongMD',6.0,8.0,10.0),
  ('PTK01','PTK01-v1','humedad',5.0,6.0,7.0),
  ('PTK01','PTK01-v1','pesoBase',29.5,30.0,30.5),
  ('PTK01','PTK01-v1','anchoUtil',284.0,285.0,286.0),
  ('PTK01','PTK01-v1','diametro',140.0,145.0,150.0),
  ('PTK01','PTK01-v1','peso',1500.0,2000.0,2500.0),
  ('PTK01','PTK01-v1','uniones',0.0,1.0,3.0)
    ) AS v(codigo, version, clave, vmin, vobj, vmax)
  LOOP
    SELECT pe.id INTO v_spec_id
      FROM public.producto_especificaciones pe
      JOIN public.productos p ON p.id = pe.producto_id
     WHERE p.codigo = data_row.codigo AND pe.version = data_row.version;
    SELECT id INTO v_var_id FROM public.variables_calidad WHERE clave = data_row.clave;
    IF v_spec_id IS NULL OR v_var_id IS NULL THEN
      RAISE EXCEPTION 'Faltante spec o variable: % / % / %', data_row.codigo, data_row.version, data_row.clave;
    END IF;
    INSERT INTO public.producto_variables(especificacion_id, variable_id, min_valor, objetivo, max_valor)
    VALUES (v_spec_id, v_var_id, data_row.vmin, data_row.vobj, data_row.vmax)
    ON CONFLICT (especificacion_id, variable_id) DO NOTHING;
    IF FOUND THEN
      v_created_v := v_created_v + 1;
    END IF;
  END LOOP;

  -- 3.4 Mapeo PHR02 ↔ máquinas -------------------------------------------
  INSERT INTO public.producto_especificacion_maquinas(especificacion_id, maquina_id)
  SELECT pe.id, m.id
    FROM public.producto_especificaciones pe
    JOIN public.productos p ON p.id = pe.producto_id
    JOIN public.maquinas m ON m.codigo = 'MP-04'
   WHERE p.codigo='PHR02' AND pe.version='PHR02-MP04'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.producto_especificacion_maquinas(especificacion_id, maquina_id)
  SELECT pe.id, m.id
    FROM public.producto_especificaciones pe
    JOIN public.productos p ON p.id = pe.producto_id
    JOIN public.maquinas m ON m.codigo IN ('MP-05','MP-06','MP-07')
   WHERE p.codigo='PHR02' AND pe.version='PHR02-MP05_06_07'
  ON CONFLICT DO NOTHING;

  -- 3.5 Cierre del batch --------------------------------------------------
  UPDATE public.catalog_import_batches
     SET status='completed',
         completed_at=now(),
         created_products=v_created_p,
         created_profiles=v_created_s,
         created_specifications=v_created_v
   WHERE id=v_batch;
END $$;
