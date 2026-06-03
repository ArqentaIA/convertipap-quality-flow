-- Estandarizar turnos antiguos
UPDATE public.muestras_calidad SET turno = '1' WHERE turno = 'A';
UPDATE public.muestras_calidad SET turno = '2' WHERE turno = 'B';
UPDATE public.muestras_calidad SET turno = '3' WHERE turno = 'C';

-- Backfill numero_rollo nulos para poder marcar NOT NULL
UPDATE public.muestras_calidad SET numero_rollo = 'SN-0' WHERE numero_rollo IS NULL OR numero_rollo = '';
ALTER TABLE public.muestras_calidad ALTER COLUMN numero_rollo SET NOT NULL;

-- Realtime para OEE y producción
ALTER TABLE public.rollos_producidos REPLICA IDENTITY FULL;
ALTER TABLE public.paros_maquina REPLICA IDENTITY FULL;
ALTER TABLE public.ordenes_fabricacion REPLICA IDENTITY FULL;
ALTER TABLE public.maquina_estado_actual REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rollos_producidos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.paros_maquina; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes_fabricacion; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.maquina_estado_actual; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
