-- Storage RLS policies para bucket privado 'spec-documentos'
-- (Tabla storage.objects ya tiene RLS habilitado por Supabase)

CREATE POLICY "spec_docs_storage_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'spec-documentos');

CREATE POLICY "spec_docs_storage_insert_calidad_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'spec-documentos'
    AND (
      public.has_role(auth.uid(), 'calidad')
      OR public.has_role(auth.uid(), 'administrador')
    )
  );

CREATE POLICY "spec_docs_storage_update_calidad_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'spec-documentos'
    AND (
      public.has_role(auth.uid(), 'calidad')
      OR public.has_role(auth.uid(), 'administrador')
    )
  );

-- Sin policy de DELETE => DELETE sobre archivos del bucket queda prohibido.
