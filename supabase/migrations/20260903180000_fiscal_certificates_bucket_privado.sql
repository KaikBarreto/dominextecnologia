-- NFS-e motor próprio — bucket PRIVADO do ciphertext do certificado A1 (passo C3 / §Custódia).
-- Plano: docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md
--
-- O que mora aqui: CHAVE PRIVADA DE CLIENTE, cifrada com a DEK da empresa (AES-256-GCM).
-- Se vazar em claro, alguém assina documento fiscal no nome do cliente. O conteúdo é
-- ciphertext e a KEK vive só na VPS — mas defesa em profundidade importa: ninguém além do
-- service_role toca este bucket, nem o próprio tenant dono do certificado.
--
-- Hoje `_shared/providers/sefin.ts` cria o bucket por API (idempotente). Esta migration
-- existe pra o estado ficar VERSIONADO e AUDITÁVEL, não improvisado em runtime.

-- ============================================================
-- 1) O bucket, privado
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fiscal-certificates', 'fiscal-certificates', false, 2097152)  -- .pfx real tem KBs; 2 MB é folga
ON CONFLICT (id) DO UPDATE
  SET public = false,                          -- reafirma: se alguém tornou público, volta a privado
      file_size_limit = EXCLUDED.file_size_limit;

-- ============================================================
-- 2) O guard — RESTRICTIVE, porque existe policy ampla neste projeto
-- ============================================================
--
-- ⚠️ AUDITORIA 2026-09-03 (o motivo desta seção existir):
-- `storage.objects` tem 3 policies PERMISSIVAS de outro domínio com predicado NEGATIVO —
--   pmoc_docs_storage_no_authenticated_insert / _update / _delete
--   USING/WITH CHECK: (bucket_id <> 'pmoc-documents')
-- Escritas pra "proibir o pmoc-documents", elas na prática LIBERAM INSERT/UPDATE/DELETE de
-- QUALQUER authenticated em TODOS os outros buckets (policy permissiva é OR — um predicado
-- negativo vira concessão universal ao complemento). Sem contramedida, qualquer usuário logado
-- poderia sobrescrever ou apagar o certificado cifrado de outra empresa.
--
-- NÃO mexemos nelas de propósito: o bucket `landingpage` não tem policy própria nenhuma e
-- depende exatamente desse guarda-chuva pra escrita — dropá-las quebraria outro domínio.
-- Está reportado ao Tech Lead como pendência separada.
--
-- A contramedida cirúrgica é uma policy RESTRICTIVE (AND, não OR): ela não concede nada,
-- só corta. Aplica-se apenas a anon/authenticated e apenas a este bucket — nenhum outro
-- domínio é afetado. `service_role` tem BYPASSRLS, então continua passando por cima.

DROP POLICY IF EXISTS "fiscal_certificates_bloqueia_anon_authenticated" ON storage.objects;
CREATE POLICY "fiscal_certificates_bloqueia_anon_authenticated"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING      (bucket_id IS DISTINCT FROM 'fiscal-certificates')
  WITH CHECK (bucket_id IS DISTINCT FROM 'fiscal-certificates');
-- IS DISTINCT FROM (e não <>) porque bucket_id NULL faria o predicado virar NULL = negado
-- em toda a tabela pro papel. Aqui NULL tem que passar: o corte é só neste bucket.

-- Permissiva explícita pro service_role. Redundante hoje (BYPASSRLS), intencional mesmo assim:
-- deixa a INTENÇÃO legível na auditoria e sobrevive a uma eventual mudança de bypassrls.
DROP POLICY IF EXISTS "fiscal_certificates_service_role_full_access" ON storage.objects;
CREATE POLICY "fiscal_certificates_service_role_full_access"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'fiscal-certificates')
  WITH CHECK (bucket_id = 'fiscal-certificates');
