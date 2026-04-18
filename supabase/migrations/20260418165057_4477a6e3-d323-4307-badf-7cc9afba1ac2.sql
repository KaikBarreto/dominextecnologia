
-- ============================================================================
-- FASE 2.3: Privatizar buckets sensíveis (employee-photos, time-photos, financial-receipts)
-- ============================================================================

-- 1) Tornar buckets privados
UPDATE storage.buckets SET public = false WHERE id IN ('employee-photos', 'time-photos', 'financial-receipts');

-- 2) Limpar políticas antigas (se existirem) sobre esses buckets
DROP POLICY IF EXISTS "Public read employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read time photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload time photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update time photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete time photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete financial receipts" ON storage.objects;

-- 3) Políticas restritivas: apenas usuários autenticados (multi-tenant é garantido via RLS das tabelas referenciadoras)
--    Como os arquivos não carregam company_id no path, restringimos a usuários autenticados e válidos.
--    A exposição é controlada por signed URLs com TTL no client.

CREATE POLICY "Authenticated read employee photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated upload employee photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated update employee photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated delete employee photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated read time photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'time-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated upload time photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'time-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated update time photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'time-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated delete time photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'time-photos' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated read financial receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'financial-receipts' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated upload financial receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'financial-receipts' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated update financial receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'financial-receipts' AND public.is_user_active(auth.uid()));

CREATE POLICY "Authenticated delete financial receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'financial-receipts' AND public.is_user_active(auth.uid()));
