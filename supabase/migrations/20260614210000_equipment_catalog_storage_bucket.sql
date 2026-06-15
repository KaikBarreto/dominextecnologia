-- Bucket de storage para fotos PRÓPRIAS dos modelos do catálogo GLOBAL de
-- equipamentos (equipment_models). Re-hospedamos fotos de produto (baixadas
-- server-side) num bucket NOSSO para não depender de CDN de terceiro (frágil).
--
-- PÚBLICO: fotos de produto são dado NÃO-sensível e precisam carregar como
-- <img src> sem auth (getPublicUrl). Sem company_id no path — catálogo é GLOBAL.
-- Escrita (INSERT/UPDATE/DELETE) restrita a super_admin Auctus, mesmo critério
-- das tabelas do catálogo (public.has_role(auth.uid(),'super_admin')).
-- service_role bypassa RLS automaticamente (download/upload server-side).

-- ============================================================
-- BUCKET (idempotente)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-catalog', 'equipment-catalog', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================
-- POLICIES em storage.objects (idempotentes)
-- ============================================================

-- Leitura pública (qualquer um, inclusive anon — é <img src> sem auth).
DROP POLICY IF EXISTS "equipment_catalog public read" ON storage.objects;
CREATE POLICY "equipment_catalog public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'equipment-catalog');

-- Escrita: somente super_admin Auctus.
DROP POLICY IF EXISTS "equipment_catalog super_admin insert" ON storage.objects;
CREATE POLICY "equipment_catalog super_admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'equipment-catalog'
    AND public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "equipment_catalog super_admin update" ON storage.objects;
CREATE POLICY "equipment_catalog super_admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'equipment-catalog'
    AND public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    bucket_id = 'equipment-catalog'
    AND public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "equipment_catalog super_admin delete" ON storage.objects;
CREATE POLICY "equipment_catalog super_admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'equipment-catalog'
    AND public.has_role(auth.uid(), 'super_admin')
  );

-- Audit
DO $audit$
DECLARE
  v_public  BOOLEAN;
  v_pol_cnt INTEGER;
BEGIN
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'equipment-catalog';
  IF v_public IS NOT TRUE THEN
    RAISE EXCEPTION 'Bucket equipment-catalog não ficou público.';
  END IF;

  SELECT count(*) INTO v_pol_cnt
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'equipment_catalog %';

  RAISE NOTICE 'Bucket equipment-catalog PÚBLICO. % policies aplicadas em storage.objects.', v_pol_cnt;
END $audit$;
