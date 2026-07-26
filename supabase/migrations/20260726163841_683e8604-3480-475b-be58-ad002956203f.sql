ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS estado_sap TEXT;

COMMENT ON COLUMN public.ordenes_produccion.estado_sap IS
  'Código de estado proveniente de SAP (columna G del XLSX): 1, 3, 5, 7, 8, etc. Distinto del campo estado (activa/cerrada) que controla el flujo interno.';