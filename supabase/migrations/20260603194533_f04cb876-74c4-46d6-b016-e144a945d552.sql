
-- 1. Add 'catalogos' to app_module enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_module'::regtype AND enumlabel = 'catalogos') THEN
    ALTER TYPE public.app_module ADD VALUE 'catalogos';
  END IF;
END $$;
