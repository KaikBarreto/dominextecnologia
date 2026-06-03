-- Hotfix v1.9.29: reabre os-photos como público.
--
-- Em v1.9.27 (Frente 3 Caminho A) os-photos foi fechado junto com team-photos.
-- Mas as fotos de respostas do formulário técnico (response_photo_url) são
-- renderizadas no portal público de OS (/os-tecnico/:id?modo=cliente),
-- acessado pelo cliente final SEM login. Signed URL exige autenticação →
-- "Erro" em todas as miniaturas pro cliente.
--
-- CEO 2026-06-03: "garanta sempre que a gente não perca as imagens nem
-- pare de funcionar". Reabrir.
--
-- team-photos continua privado (não é renderizado no modo cliente).
-- Isolamento estrito por company_id no path fica pra release dedicada
-- com edge function proxy (decisão arquitetural futura).

UPDATE storage.buckets SET public = true WHERE id = 'os-photos';

-- Remove policies de write que assumiam privado (já não fazem mais sentido).
-- Mantém SELECT permissivo (mesmo público, RLS pode coexistir).
DROP POLICY IF EXISTS "team_os_photos_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "team_os_photos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "team_os_photos_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "team_os_photos_delete_authenticated" ON storage.objects;

-- Recria policies SÓ pra team-photos (continua privado).
CREATE POLICY "team_photos_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'team-photos');

CREATE POLICY "team_photos_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'team-photos');

CREATE POLICY "team_photos_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'team-photos');

CREATE POLICY "team_photos_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'team-photos');
