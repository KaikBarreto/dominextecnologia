-- ============================================================================
-- MODULO PDV E LOJA : Onda 1, parte 3 de 4 (bucket privado da foto de produto)
--
-- O QUE E
-- ---------------------------------------------------------------------------
-- A grade de venda do PDV e visual: foto, nome em negrito, preco em destaque. A
-- foto vive no bucket novo `inventory-photos`, PRIVADO, e o endereco dela vai
-- pra inventory.image_url (parte 2 desta onda).
--
-- POR QUE ISTO E REESCRITA DO PADRAO CANONICO, E NAO INVENCAO
-- ---------------------------------------------------------------------------
-- Em 16/10/2026 este projeto corrigiu, em duas ondas, um furo REAL (reproduzido
-- apagando arquivo de cliente de verdade com a sessao do tenant demo): em
-- os-photos, customer-photos, employee-photos, financial-receipts,
-- equipment-files e company-logos, QUALQUER usuario logado de QUALQUER empresa
-- lia, trocava e apagava arquivo das outras. As policies deste arquivo sao as
-- mesmas de 20261016130000 (o padrao canonico, ja provado), com um aperto extra
-- explicado abaixo.
--
-- OS DOIS LIMITES DE PERMISSAO QUE DITAM O DESENHO
-- ---------------------------------------------------------------------------
--  1) storage.objects pertence ao supabase_storage_admin. O papel de migration
--     leva 42501 (must be owner of table objects) em CREATE TRIGGER e CREATE
--     INDEX ali. Logo NAO DA PRA CARIMBAR A EMPRESA POR GATILHO.
--  2) Entao quem carimba e o CLIENTE (src/utils/tenantStorage.ts ->
--     tenantFileOptions() injeta metadata.company_id) e A AUTORIDADE FICA NA
--     POLICY DE INSERT, que compara o valor DECLARADO com a empresa REAL do
--     chamador (get_user_company_id(auth.uid()) -> profiles). Carimbo forjado e
--     recusado; upload SEM carimbo tambem (fail-closed, porque arquivo sem dono
--     e arquivo que ninguem consegue abrir depois).
--
-- O APERTO EXTRA DESTE BUCKET: A PASTA TAMBEM TEM QUE SER A MINHA EMPRESA
-- ---------------------------------------------------------------------------
-- Caminho contratado:   {company_id}/{inventory_id}/{uuid}_{arquivo}
-- storage_insert_company_ok() (helper canonico) ja recusa plantar arquivo
-- DENTRO da pasta de outra empresa, mas aceita pasta que nao e uuid de empresa
-- nenhuma, porque os 5 buckets antigos tem caminho PLANO e ele precisa conviver
-- com isso. Aqui o bucket NASCE VAZIO, entao da pra exigir o caminho certo
-- desde o primeiro arquivo: a primeira pasta TEM que ser o company_id real do
-- chamador. Beneficio concreto: da pra LISTAR o bucket com isolamento e o dono
-- de cada objeto fica legivel no proprio caminho, nao so no metadado.
--
-- ORDEM DE DEPLOY: SEM RISCO AQUI
-- ---------------------------------------------------------------------------
-- A regra "publicar o front carimbado ANTES das policies" (20261016130000)
-- existe porque apertar bucket com upload em producao derruba todo mundo.
-- Conferido: `inventory-photos` NASCE VAZIO nesta migration e nenhuma tela
-- existente le ou escreve nele, entao bucket e policies podem entrar juntos.
--
-- PRA QUEM NAO TEM O MODULO: nada muda. Bucket vazio, inventory.image_url NULL.
-- ============================================================================

BEGIN;

-- 5 MB por foto e so imagem: foto de produto tirada no celular cabe folgado, e
-- limitar o mime fecha a porta pra usar o bucket como deposito de qualquer
-- coisa. ON CONFLICT DO UPDATE deixa o arquivo idempotente e permite ajustar
-- limite/mime numa migration futura sem recriar o bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A pasta e a minha empresa? (ou sou super_admin). Fica numa funcao propria pra
-- a mesma regra valer, identica, nas 4 policies.
CREATE OR REPLACE FUNCTION public.storage_folder_company_ok(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT public.is_super_admin((SELECT auth.uid()))
      OR public.storage_folder_uuid(object_name) = public.get_user_company_id((SELECT auth.uid()));
$fn$;

COMMENT ON FUNCTION public.storage_folder_company_ok(text) IS
  'A primeira pasta do caminho é o company_id REAL do chamador (resolvido por profiles), ou o chamador é super_admin. Usada pelo bucket inventory-photos, cujo caminho é {company_id}/{inventory_id}/arquivo. Pasta que não é uuid de empresa nenhuma é recusada: fail-closed.';

-- Toda funcao nova nasce com EXECUTE pra anon neste banco (pg_default_acl do
-- schema public). Tira de anon, mantem so em authenticated, que e quem avalia a
-- policy.
REVOKE ALL ON FUNCTION public.storage_folder_company_ok(text) FROM anon;
REVOKE ALL ON FUNCTION public.storage_folder_company_ok(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.storage_folder_company_ok(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies : SELECT / INSERT / UPDATE / DELETE, uma por comando
-- ---------------------------------------------------------------------------
-- Nenhuma usa FOR ALL de proposito: policy permissiva FOR ALL SOMBREIA a policy
-- mais estreita do comando especifico (policy nova permissiva ALARGA, nunca
-- estreita). Todas com TO authenticated EXPLICITO: policy sem TO cai em
-- TO public, que inclui anon.
-- is_user_active() nas duas portas de leitura/escrita de conteudo e o mesmo
-- padrao dos buckets privados canonicos: usuario desativado nao le nem envia.
DROP POLICY IF EXISTS "inventory_photos_select_own_company" ON storage.objects;
CREATE POLICY "inventory_photos_select_own_company"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND public.is_user_active((SELECT auth.uid()))
    AND public.storage_stamp_company_ok(user_metadata)
    AND public.storage_folder_company_ok(name)
  );

DROP POLICY IF EXISTS "inventory_photos_insert_own_company" ON storage.objects;
CREATE POLICY "inventory_photos_insert_own_company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-photos'
    AND public.is_user_active((SELECT auth.uid()))
    AND public.storage_insert_company_ok(user_metadata, name)
    AND public.storage_folder_company_ok(name)
  );

DROP POLICY IF EXISTS "inventory_photos_update_own_company" ON storage.objects;
CREATE POLICY "inventory_photos_update_own_company"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND public.is_user_active((SELECT auth.uid()))
    AND public.storage_stamp_company_ok(user_metadata)
    AND public.storage_folder_company_ok(name)
  )
  WITH CHECK (
    bucket_id = 'inventory-photos'
    AND public.is_user_active((SELECT auth.uid()))
    AND public.storage_insert_company_ok(user_metadata, name)
    AND public.storage_folder_company_ok(name)
  );

DROP POLICY IF EXISTS "inventory_photos_delete_own_company" ON storage.objects;
CREATE POLICY "inventory_photos_delete_own_company"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND public.storage_stamp_company_ok(user_metadata)
    AND public.storage_folder_company_ok(name)
  );

COMMIT;
