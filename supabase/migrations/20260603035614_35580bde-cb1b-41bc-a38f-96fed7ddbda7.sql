
-- 1) Add 'auditoria' module to enum
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'auditoria';
