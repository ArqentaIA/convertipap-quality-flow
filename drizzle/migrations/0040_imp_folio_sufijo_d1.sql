ALTER TABLE public.imp_bobinas ADD COLUMN folio_sufijo text NOT NULL DEFAULT '-0';
ALTER TABLE public.imp_bobinas ADD CONSTRAINT imp_bobinas_folio_sufijo_chk CHECK (folio_sufijo IN ('-0','-D1'));
ALTER TABLE public.imp_bobinas ALTER COLUMN folio SET EXPRESSION AS (lpad((numero)::text, GREATEST(5, length((numero)::text)), '0'::text) || folio_sufijo);
COMMENT ON COLUMN public.imp_bobinas.folio_sufijo IS 'Sufijo del folio importado: -0 por defecto, -D1 para rollos autorizados por Calidad (alineado con lote SAP).';