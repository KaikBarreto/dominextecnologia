-- NFS-e: neutralizar camada de provedor (Fisqal vs motor próprio Sefin Nacional) e preparar custódia de certificado.
-- Parte da tarefa B3 do plano docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md.
-- Migration puramente aditiva: nenhuma coluna/tabela existente é alterada em semântica, só somada.
--
-- Desenho de custódia (§Custódia do plano, decisão do CEO 2026-09-03): envelope encryption
-- com KEK fora do banco (só na VPS). O que este schema guarda são PONTEIROS e material JÁ
-- CIFRADO — nunca o certificado em claro, nunca a senha em claro, e NUNCA no Supabase Vault
-- (Vault é decifrável pela Management API do projeto — inaceitável para chave privada de terceiro).

-- ============================================================
-- 1) company_fiscal_settings — seleção de provedor + custódia de certificado
-- ============================================================

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS provedor text NOT NULL DEFAULT 'fisqal';

COMMENT ON COLUMN public.company_fiscal_settings.provedor IS
  'Provedor de emissão de NFS-e desta empresa. "fisqal" = integração terceirizada legada (em descontinuação). "sefin" = motor próprio falando direto com a API do governo (Sefin Nacional), via microserviço na VPS.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_fiscal_settings_provedor_check'
      AND conrelid = 'public.company_fiscal_settings'::regclass
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_provedor_check
      CHECK (provedor IN ('fisqal', 'sefin'));
  END IF;
END $$;

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS certificado_ref text;

COMMENT ON COLUMN public.company_fiscal_settings.certificado_ref IS
  'Ponteiro para o objeto CIFRADO do certificado A1 (.pfx) no Storage (ex.: caminho no bucket privado). NUNCA guardar aqui o arquivo em claro nem a senha — só a referência de onde buscar o ciphertext.';

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS certificado_dek_envelopada text;

COMMENT ON COLUMN public.company_fiscal_settings.certificado_dek_envelopada IS
  'DEK (data encryption key) desta empresa, cifrada pela KEK que vive só na VPS (Docker secret/env, nunca no banco). Base64. Sem a KEK este valor é inútil — isso é intencional (comprometer só a Supabase não expõe o certificado).';

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS certificado_senha_cifrada text;

COMMENT ON COLUMN public.company_fiscal_settings.certificado_senha_cifrada IS
  'Senha do .pfx cifrada com a DEK da empresa (AES-256-GCM). NUNCA em texto puro no banco, nunca no Supabase Vault, nunca em log.';

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS certificado_nonce text;

COMMENT ON COLUMN public.company_fiscal_settings.certificado_nonce IS
  'Nonce/IV do AES-256-GCM usado para cifrar a senha do certificado (certificado_senha_cifrada). Único por operação de cifra, nunca reaproveitado.';

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS certificado_algoritmo text DEFAULT 'AES-256-GCM';

COMMENT ON COLUMN public.company_fiscal_settings.certificado_algoritmo IS
  'Algoritmo de cifra usado no envelope do certificado/senha. Default AES-256-GCM (autenticado); campo existe para permitir rotação de algoritmo sem quebrar dados já cifrados com o anterior.';

-- ============================================================
-- 2) service_types — cTribMun (código de tributação municipal)
-- ============================================================

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS codigo_tributacao_municipal text;

COMMENT ON COLUMN public.service_types.codigo_tributacao_municipal IS
  'cTribMun do layout nacional de NFS-e: 3 dígitos, complementar ao codigo_servico (cTribNac, 6 dígitos) já existente. O município registra o serviço completo como cTribNac+cTribMun, ex.: "14.01.01.001" = cTribNac "14.01.01" (6 díg.) + cTribMun "001" (3 díg.). Sem este código a prefeitura rejeita a emissão com erro E0312 ("código não administrado pelo município").';

-- ============================================================
-- 3) fiscal_certificate_audit — trilha append-only de uso do certificado
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fiscal_certificate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operacao text NOT NULL,
  contexto text,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fiscal_certificate_audit IS
  'Trilha append-only de toda operação sobre o certificado A1 custodiado (upload, decifra, revogação). Existe pra responder "quem usou o certificado do cliente X e quando" (§Custódia do plano de motor próprio NFS-e). Sem UPDATE/DELETE por policy — revogação de certificado é um INSERT novo (operacao=''revogacao''), não uma edição do histórico.';
COMMENT ON COLUMN public.fiscal_certificate_audit.operacao IS 'Ex.: upload, decifra, revogacao.';
COMMENT ON COLUMN public.fiscal_certificate_audit.contexto IS 'Ex.: emitir_nfse, ou a chave de acesso da nota associada à operação.';
COMMENT ON COLUMN public.fiscal_certificate_audit.origem IS 'IP ou identificador do serviço que executou a operação (edge function / microserviço fiscal na VPS).';

CREATE INDEX IF NOT EXISTS idx_fiscal_certificate_audit_company_created
  ON public.fiscal_certificate_audit (company_id, created_at DESC);

ALTER TABLE public.fiscal_certificate_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_fiscal_certificate_audit" ON public.fiscal_certificate_audit;
CREATE POLICY "service_role_full_access_fiscal_certificate_audit"
  ON public.fiscal_certificate_audit FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view fiscal certificate audit from their company" ON public.fiscal_certificate_audit;
CREATE POLICY "Users can view fiscal certificate audit from their company"
  ON public.fiscal_certificate_audit FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));
-- INSERT: só service_role (edge/microserviço fiscal grava, tenant nunca insere direto).
-- UPDATE/DELETE: sem policy authenticated nem service_role explícita além da FOR ALL acima —
--   é intencional que o service_role também não apague/edite em fluxo normal; append-only.
