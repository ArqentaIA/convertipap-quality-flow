ALTER TABLE public.muestras_calidad REPLICA IDENTITY FULL;
ALTER TABLE public.mediciones_calidad REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='muestras_calidad') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.muestras_calidad';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='mediciones_calidad') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.mediciones_calidad';
  END IF;
END $$;