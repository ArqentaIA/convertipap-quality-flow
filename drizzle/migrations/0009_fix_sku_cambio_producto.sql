DO $do$
BEGIN
  EXECUTE replace(pg_get_functiondef('public.qc_editar_rollo'::regproc),
                  'producto_id = v_prod_new AND sku_sap = v_txt_new',
                  'producto_id = v_prod_new AND clave_sku_sap = v_txt_new');
END
$do$;