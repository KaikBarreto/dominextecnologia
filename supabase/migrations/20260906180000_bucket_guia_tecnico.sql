-- Bucket público `guia-tecnico`: hospeda o PDF do Guia Técnico da Dominex.
--
-- POR QUE O PDF NÃO FICA NO REPOSITÓRIO:
-- ele tem ~6,8 MB e é REGERADO INTEIRO a cada release do guia. Versionar isso
-- é uma cópia nova e completa no histórico do git toda vez, pra sempre. Os
-- prints (JPEG) continuam no repositório, em public/guia-tecnico/img/, porque
-- mudam pouco e um de cada vez. O precedente já existe aqui: `public/videos/`
-- está no .gitignore com a nota "servida pelo Supabase Storage, nunca
-- commitada", e o vídeo da hero da landing vem do bucket `landingpage`
-- (src/components/landing/HeroSection.tsx).
--
-- O QUE ESTE BUCKET SERVE: documentação de produto. Nenhum dado de cliente,
-- nenhum company_id, nada de tenant. Por isso `public = true`: o objetivo é a
-- URL /storage/v1/object/public/guia-tecnico/... abrir sem login, que é como a
-- página /guia-tecnico linka o download.
--
-- LEITURA PÚBLICA SIM, ESCRITA PÚBLICA NÃO. Essa é a parte que não pode ficar
-- no default. O bucket público só torna o GET aberto; quem escreve continua
-- sendo decidido por RLS em storage.objects. Auditado antes de criar:
--   * anon e authenticated TÊM grant de INSERT/UPDATE/DELETE na TABELA
--     storage.objects (default do Supabase, e não dá pra revogar sem quebrar
--     todos os outros buckets, porque o grant é da tabela, não do bucket);
--   * logo, a RLS é a ÚNICA tranca, e ela é deny-by-default;
--   * nenhuma policy permissiva de escrita existente é agnóstica de bucket —
--     todas casam `bucket_id = '<bucket específico>'`, então nenhuma alcança um
--     bucket novo;
--   * as duas policies FOR ALL com cara de "libera tudo menos X"
--     (fiscal_certificates_bloqueia_anon_authenticated e
--     pmoc_docs_bloqueia_escrita_authenticated) foram conferidas em
--     pg_policies.permissive e são RESTRICTIVE — se fossem PERMISSIVE elas
--     liberariam escrita em todo bucket que não fosse o delas, inclusive neste.
--
-- Ou seja: o bucket já nasceria fechado pra escrita. As policies abaixo são
-- declaração EXPLÍCITA, não conserto — a regra deste repositório é não confiar
-- em default implícito, e o custo de um dia alguém adicionar uma policy de
-- escrita ampla é este bucket virar upload aberto pra internet sem ninguém
-- perceber.
--
-- service_role não aparece em policy nenhuma aqui de propósito: ele tem
-- rolbypassrls = true (conferido), então o upload do
-- scripts/publicar-pdf-guia.mjs passa por cima da RLS. Policy pra service_role
-- seria enfeite.

-- ---------------------------------------------------------------------------
-- 1. O bucket
-- ---------------------------------------------------------------------------
-- Teto de 20 MB: o PDF de hoje tem ~6,8 MB e o guia só cresce; 20 MB dá folga
-- sem transformar o bucket em depósito. MIME travado em application/pdf porque
-- é literalmente a única coisa que mora aqui — se um dia precisar de outro tipo,
-- que seja uma decisão consciente e não um upload que passou de raspão.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guia-tecnico', 'guia-tecnico', true, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Leitura: liberada, e escrita nominalmente ausente
-- ---------------------------------------------------------------------------
-- Só SELECT. Não existe policy permissiva de INSERT/UPDATE/DELETE pra este
-- bucket, e a ausência é a tranca — RLS é deny-by-default.
DROP POLICY IF EXISTS "guia_tecnico_leitura_publica" ON storage.objects;
CREATE POLICY "guia_tecnico_leitura_publica"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'guia-tecnico');

-- ---------------------------------------------------------------------------
-- 3. Trava RESTRICTIVE de escrita (o cinto, além do suspensório)
-- ---------------------------------------------------------------------------
-- RESTRICTIVE entra em AND com TODAS as permissivas: mesmo que amanhã apareça
-- uma policy de escrita ampla, ela não alcança `guia-tecnico`. Para todo outro
-- bucket o predicado é TRUE, então estas três são no-op fora daqui.
-- Mesmo padrão de fiscal_certificates_bloqueia_anon_authenticated, mas separado
-- por comando em vez de FOR ALL: FOR ALL bloquearia o SELECT também, e aqui a
-- leitura é o ponto.
DROP POLICY IF EXISTS "guia_tecnico_bloqueia_insert" ON storage.objects;
CREATE POLICY "guia_tecnico_bloqueia_insert"
  ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id IS DISTINCT FROM 'guia-tecnico');

DROP POLICY IF EXISTS "guia_tecnico_bloqueia_update" ON storage.objects;
CREATE POLICY "guia_tecnico_bloqueia_update"
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id IS DISTINCT FROM 'guia-tecnico')
  WITH CHECK (bucket_id IS DISTINCT FROM 'guia-tecnico');

DROP POLICY IF EXISTS "guia_tecnico_bloqueia_delete" ON storage.objects;
CREATE POLICY "guia_tecnico_bloqueia_delete"
  ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id IS DISTINCT FROM 'guia-tecnico');
