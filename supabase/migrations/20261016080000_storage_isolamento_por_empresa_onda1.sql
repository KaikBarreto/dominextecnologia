-- ============================================================================
-- Isolamento multi-tenant do Storage — ONDA 1 (16/10/2026)
--
-- ACHADO (provado em produção, não teoria): as policies do bucket `os-photos`
-- eram `bucket_id = 'os-photos' AND auth.uid() IS NOT NULL`, sem NENHUM recorte
-- por empresa. Qualquer usuário logado de qualquer tenant podia APAGAR e, pior,
-- SOBRESCREVER a foto/vídeo de ordem de serviço de qualquer outra empresa.
-- Durante a limpeza dos 454 arquivos órfãos eu apaguei, sem obstáculo nenhum,
-- arquivos de OS do cliente real usando a sessão do tenant DEMO. Sobrescrever é
-- o pior dos dois: troca a evidência sem deixar buraco visível, e foto de OS é
-- prova em PMOC (Lei 13.589/2018). Contraria a regra-lei 2 do projeto.
--
-- O QUE ESTA MIGRATION FECHA:
--   1. `os-photos`      — INSERT/UPDATE/DELETE passam a exigir que a OS dona do
--                         arquivo seja da empresa do chamador.
--   2. `time-photos`    — selfie do ponto (dado sensível de funcionário) só é
--                         lida/escrita por quem é da mesma empresa do dono.
--   3. `team-photos`    — tira o SELECT liberado pro público num bucket PRIVADO.
--   4. `domiflix-thumbnails` — escrita volta a ser só do super_admin (estava
--                         aberta pra admin de QUALQUER tenant).
--
-- PRINCÍPIO: a permissividade DENTRO do tenant fica EXATAMENTE como estava. A
-- migration só corta o atravessamento entre empresas. Assim nenhum fluxo legítimo
-- muda de comportamento e o risco de regressão em campo é mínimo.
--
-- PROVA DE QUE NADA FICA INACESSÍVEL (medido antes de escrever):
--   - `os-photos`: 2.624 objetos, 2.624 com a 1ª pasta no formato uuid e
--     2.624 casando com uma `service_orders` existente. Zero arquivo órfão de
--     pasta, zero arquivo que a policy nova deixaria de fora.
--   - `time-photos`: 198 objetos, 198 com a 1ª pasta no formato uuid. ⚠️ O bucket
--     tem DOIS layouts: `<company_id>/` (edge `time-clock-portal`, 188 arquivos)
--     e `<user_id>/` (app, o resto). A 1ª versão desta migration só cobria o
--     layout do app e teria ESCONDIDO 188 selfies na tela de ponto — pego no QA
--     antes de publicar. A função cobre os dois. Sobram 2 arquivos numa pasta
--     que não é nem empresa nem perfil (usuário apagado), que passam a ser
--     visíveis só pelo super_admin e pelo service_role.
--
-- NÃO ENTRA NESTA ONDA (exige mudar o caminho dos arquivos + migrar dado, com
-- plano e OK próprios): `customer-photos`, `employee-photos`,
-- `financial-receipts`, `equipment-files` e `company-logos`. Nesses o caminho é
-- plano (`logo_<ts>.png`, `photos/<ts>_<nome>`), não tem o company_id, e a
-- coluna `owner` não serve de âncora porque boa parte dos arquivos foi gravada
-- por edge function e está nula (time-photos 197/198, equipment-files
-- 1.139/2.395, customer-photos 83/207).
-- ============================================================================

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Primeira pasta do caminho como uuid, ou NULL quando não for um uuid válido.
-- O cast direto (`...[1]::uuid`) ESTOURA 22P02 num nome fora do padrão, e dentro
-- de uma policy isso derruba a query inteira do usuário em vez de só negar.
CREATE OR REPLACE FUNCTION public.storage_folder_uuid(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, storage
AS $fn$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN ((storage.foldername(object_name))[1])::uuid
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.storage_folder_uuid(text) IS
  'Primeira pasta do caminho do objeto como uuid, NULL se não for uuid. Usada pelas policies de Storage para ancorar o arquivo na entidade dona sem risco de 22P02.';

-- A OS dona do arquivo é da MINHA empresa? SECURITY DEFINER de propósito: a
-- policy precisa enxergar `service_orders` sem depender do RLS da tabela.
CREATE OR REPLACE FUNCTION public.os_media_company_ok(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT public.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
           SELECT 1
           FROM public.service_orders so
           WHERE so.id = public.storage_folder_uuid(object_name)
             AND so.company_id = public.get_user_company_id((SELECT auth.uid()))
         );
$fn$;

COMMENT ON FUNCTION public.os_media_company_ok(text) IS
  'Mídia do bucket os-photos pertence a uma OS da empresa do chamador (ou o chamador é super_admin). O caminho é <service_order_id>/<arquivo>.';

-- A selfie do ponto é de alguém da MINHA empresa (ou minha)?
CREATE OR REPLACE FUNCTION public.time_photo_company_ok(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT public.is_super_admin((SELECT auth.uid()))
      -- Layout do APP (`useTimeRecords`): a pasta é o user_id de quem bateu.
      OR public.storage_folder_uuid(object_name) = (SELECT auth.uid())
      -- Layout do PORTAL (edge `time-clock-portal`): a pasta é o company_id.
      -- É a maioria dos arquivos hoje (188 de 198) e foi o que a primeira
      -- versão desta função ignorou, o que esconderia a selfie do ponto na tela.
      OR public.storage_folder_uuid(object_name) = public.get_user_company_id((SELECT auth.uid()))
      -- Colega da mesma empresa, no layout do app.
      OR EXISTS (
           SELECT 1
           FROM public.profiles p
           WHERE p.user_id = public.storage_folder_uuid(object_name)
             AND p.company_id = public.get_user_company_id((SELECT auth.uid()))
         );
$fn$;

COMMENT ON FUNCTION public.time_photo_company_ok(text) IS
  'Selfie do bucket time-photos pertence ao chamador, à empresa dele ou a um colega. O bucket tem DOIS layouts de caminho: <user_id>/ (app) e <company_id>/ (edge time-clock-portal).';

-- Policy que chama função precisa que o PAPEL tenha EXECUTE nela, senão a
-- avaliação falha em runtime para aquele papel.
GRANT EXECUTE ON FUNCTION public.storage_folder_uuid(text)   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.os_media_company_ok(text)   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.time_photo_company_ok(text) TO authenticated;

-- ─── 1. os-photos ───────────────────────────────────────────────────────────
-- SELECT segue PÚBLICO de propósito: o bucket é público e o link público da OS
-- (cliente final, sem login) toca foto e vídeo por URL direta. Fechar a leitura
-- aqui não protegeria nada (a URL pública não passa por RLS) e quebraria o
-- portal. O buraco real era de ESCRITA, e é o que fecha abaixo.

DROP POLICY IF EXISTS "Authenticated users can upload OS photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update OS photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete OS photos"               ON storage.objects;

CREATE POLICY "os_photos_insert_own_company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'os-photos' AND public.os_media_company_ok(name));

CREATE POLICY "os_photos_update_own_company"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'os-photos' AND public.os_media_company_ok(name))
  WITH CHECK (bucket_id = 'os-photos' AND public.os_media_company_ok(name));

CREATE POLICY "os_photos_delete_own_company"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'os-photos' AND public.os_media_company_ok(name));

-- ─── 2. time-photos (bucket PRIVADO, selfie do ponto) ───────────────────────
-- Antes: qualquer usuário ativo de qualquer empresa lia, trocava e apagava a
-- selfie de ponto de qualquer funcionário de qualquer empresa — e, como dá pra
-- LISTAR o bucket, nem precisava adivinhar o caminho.

DROP POLICY IF EXISTS "Authenticated read time photos"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload time photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update time photos"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete time photos"        ON storage.objects;

CREATE POLICY "time_photos_select_own_company"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'time-photos' AND public.is_user_active((SELECT auth.uid())) AND public.time_photo_company_ok(name));

CREATE POLICY "time_photos_insert_own_company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'time-photos' AND public.is_user_active((SELECT auth.uid())) AND public.time_photo_company_ok(name));

CREATE POLICY "time_photos_update_own_company"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'time-photos' AND public.is_user_active((SELECT auth.uid())) AND public.time_photo_company_ok(name))
  WITH CHECK (bucket_id = 'time-photos' AND public.is_user_active((SELECT auth.uid())) AND public.time_photo_company_ok(name));

CREATE POLICY "time_photos_delete_own_company"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'time-photos' AND public.is_user_active((SELECT auth.uid())) AND public.time_photo_company_ok(name));

-- ─── 3. team-photos: tira a leitura pública de um bucket privado ────────────
-- O bucket é `public = false` e o app lê por URL assinada (useSignedUrl), que
-- exige SELECT do papel `authenticated` — esse continua existindo
-- (`team_photos_read_authenticated`). A policy removida liberava a leitura via
-- API pra QUALQUER UM, inclusive anônimo.
DROP POLICY IF EXISTS "Anyone can view team photos" ON storage.objects;

-- ─── 4. domiflix-thumbnails: curadoria é da Auctus, não do tenant ───────────
-- Estava aberto pra `admin` de qualquer empresa apagar/trocar a capa do
-- catálogo Domiflix, que é conteúdo global curado pelo super_admin.
DROP POLICY IF EXISTS "domiflix_thumbs_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "domiflix_thumbs_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "domiflix_thumbs_admin_delete" ON storage.objects;

CREATE POLICY "domiflix_thumbs_super_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'domiflix-thumbnails' AND public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

CREATE POLICY "domiflix_thumbs_super_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'domiflix-thumbnails' AND public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (bucket_id = 'domiflix-thumbnails' AND public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

CREATE POLICY "domiflix_thumbs_super_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'domiflix-thumbnails' AND public.has_role((SELECT auth.uid()), 'super_admin'::app_role));
