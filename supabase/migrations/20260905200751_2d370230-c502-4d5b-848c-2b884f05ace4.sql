ALTER TABLE public.producto_variables DROP CONSTRAINT producto_variables_check;
ALTER TABLE public.producto_variables ADD CONSTRAINT producto_variables_check CHECK (min_valor <= max_valor);