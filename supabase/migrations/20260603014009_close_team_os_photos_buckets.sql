-- v1.9.27 frente 3 (Caminho A): fecha team-photos + os-photos (decisao CEO 2026-06-03).
-- Os outros 5 buckets tenant ficam publicos por design — OSReport portal cliente,
-- PDF orcamento (templates) e dreHtmlGenerator dependem deles publicos.
--
-- Policy permissiva (authenticated le qualquer objeto nesses 2 buckets):
-- isolamento ESTRITO por company_id no path fica pra futuro (precisa backfill
-- de paths). Esta release apenas elimina vetor de URL PUBLICA sem login.
--
-- Idempotente: UPDATE em bucket ja privado e no-op; policies usam DROP IF EXISTS.

-- 1) Fechar buckets (vira privado — getPublicUrl ainda gera link no formato,
--    mas storage retorna 400/401 sem signed token).
UPDATE storage.buckets
SET public = false
WHERE id IN ('team-photos', 'os-photos');

-- 2) Policies de leitura/escrita pra usuarios autenticados nos dois buckets.
DROP POLICY IF EXISTS "team_os_photos_read_authenticated" ON storage.objects;
CREATE POLICY "team_os_photos_read_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('team-photos', 'os-photos'));

DROP POLICY IF EXISTS "team_os_photos_insert_authenticated" ON storage.objects;
CREATE POLICY "team_os_photos_insert_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('team-photos', 'os-photos'));

DROP POLICY IF EXISTS "team_os_photos_update_authenticated" ON storage.objects;
CREATE POLICY "team_os_photos_update_authenticated"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id IN ('team-photos', 'os-photos'))
WITH CHECK (bucket_id IN ('team-photos', 'os-photos'));

DROP POLICY IF EXISTS "team_os_photos_delete_authenticated" ON storage.objects;
CREATE POLICY "team_os_photos_delete_authenticated"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('team-photos', 'os-photos'));
