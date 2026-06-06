-- =============================================================================
-- PMOC — Template padrão de documentos POR EMPRESA (tenant-wide)
-- =============================================================================
-- Plano: docs/planos/2026-06-06-* (troca do template base PMOC)
--
-- Escopo desta migration:
--   1. Tabela company_pmoc_document_templates (PK = company_id; UMA linha por
--      empresa). Guarda o HTML do Termo de Responsabilidade Técnica e do
--      Certificado de Conformidade que serve de TEMPLATE PADRÃO do tenant.
--      NULL em qualquer campo = a edge function de PDF usa o default DE CÓDIGO.
--      + RLS (SELECT tenant / INSERT-UPDATE admin-gestor / DELETE super_admin)
--      + Triggers (set_company_id_on_insert, updated_by/updated_at automáticos,
--                  anti-tenant-jump)
--      + CHECK de tamanho (50KB) em cada campo de conteúdo.
--   2. Reset 1x AUTORIZADO PELO CEO dos documentos PMOC custom por contrato
--      (pmoc_contract_documents_custom): zera termo_rt_content/certificado_content
--      pra todos os contratos PMOC voltarem a cair no novo template base.
--
-- Espelha o estilo de §2 de:
--   supabase/migrations/20260523154440_pmoc_v1_9_x_dossie_cronograma.sql
-- Diferença de modelagem: esta tabela é POR EMPRESA (PK = company_id), NÃO por
-- contrato. Portanto NÃO há contract_id e NÃO usamos o trigger
-- pmoc_enforce_company_match_via_contract.
--
-- Toda a migration é UMA transação (BEGIN/COMMIT). ROLLBACK automático se algum
-- step falhar.
-- =============================================================================

BEGIN;

-- =============================================================================
-- §1. Tabela company_pmoc_document_templates
-- =============================================================================
-- Uma linha por empresa. PK = company_id (espelha a PK contract_id de
-- pmoc_contract_documents_custom, mas no nível do tenant). "Restaurar texto
-- padrão" no UI = setar o campo correspondente como NULL (UPDATE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_pmoc_document_templates (
  company_id          uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  termo_rt_content    text,
  certificado_content text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT company_pmoc_tpl_termo_rt_size
    CHECK (termo_rt_content IS NULL OR length(termo_rt_content) <= 50000),
  CONSTRAINT company_pmoc_tpl_certificado_size
    CHECK (certificado_content IS NULL OR length(certificado_content) <= 50000)
);

COMMENT ON TABLE public.company_pmoc_document_templates IS
  'Template padrão (HTML rich-text) dos documentos PMOC POR EMPRESA: Termo de '
  'Responsabilidade Técnica e Certificado de Conformidade. UMA linha por empresa '
  '(PK = company_id). Quando o campo é NULL, a edge function de geração de PDF usa '
  'o template default de CÓDIGO. Sanitização HTML obrigatória server-side antes de '
  'gerar PDF (regra Plataforma).';

COMMENT ON COLUMN public.company_pmoc_document_templates.termo_rt_content IS
  'HTML rich do Termo RT (template do tenant). Limite 50KB. Sanitizado '
  'server-side antes de gerar PDF. NULL = usa template default de código.';

COMMENT ON COLUMN public.company_pmoc_document_templates.certificado_content IS
  'HTML rich do Certificado de Conformidade (template do tenant). Limite 50KB. '
  'Sanitizado server-side antes de gerar PDF. NULL = usa template default de código.';

-- ---- Trigger auto-popula company_id no INSERT
--      A tabela é NOVA, então o trigger genérico por information_schema da
--      migration 20260602213504 (que iterou tabelas existentes naquele momento)
--      NÃO a cobre. Adiciono o mesmo trigger genérico manualmente aqui.
--      Sem isso, INSERT sem company_id é bloqueado silenciosamente pela RLS.
DROP TRIGGER IF EXISTS tg_set_company_id_company_pmoc_document_templates
  ON public.company_pmoc_document_templates;
CREATE TRIGGER tg_set_company_id_company_pmoc_document_templates
  BEFORE INSERT ON public.company_pmoc_document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_id_on_insert();

-- ---- Trigger updated_by + updated_at automáticos (não confia no payload)
CREATE OR REPLACE FUNCTION public.company_pmoc_tpl_set_updated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.company_pmoc_tpl_set_updated() IS
  'Preenche updated_by (auth.uid()) e updated_at (now()) em INSERT/UPDATE de '
  'company_pmoc_document_templates. Não confia em payload do client.';

DROP TRIGGER IF EXISTS trg_company_pmoc_tpl_set_updated
  ON public.company_pmoc_document_templates;
CREATE TRIGGER trg_company_pmoc_tpl_set_updated
  BEFORE INSERT OR UPDATE ON public.company_pmoc_document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.company_pmoc_tpl_set_updated();

-- ---- Trigger anti-tenant-jump (bloqueia UPDATE de company_id)
--      Reusa o helper genérico public.raise_company_immutable() criado na
--      migration 20260523154440 (Onda C).
DROP TRIGGER IF EXISTS trg_company_pmoc_tpl_prevent_company_change
  ON public.company_pmoc_document_templates;
CREATE TRIGGER trg_company_pmoc_tpl_prevent_company_change
  BEFORE UPDATE OF company_id ON public.company_pmoc_document_templates
  FOR EACH ROW
  WHEN (OLD.company_id IS DISTINCT FROM NEW.company_id)
  EXECUTE FUNCTION public.raise_company_immutable();

-- ---- RLS
ALTER TABLE public.company_pmoc_document_templates ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge functions de geração de PDF leem o template)
DROP POLICY IF EXISTS "service_role_full_access_company_pmoc_tpl"
  ON public.company_pmoc_document_templates;
CREATE POLICY "service_role_full_access_company_pmoc_tpl"
  ON public.company_pmoc_document_templates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- SELECT — qualquer usuário autenticado do tenant (ou super_admin)
DROP POLICY IF EXISTS "company_pmoc_tpl_tenant_select"
  ON public.company_pmoc_document_templates;
CREATE POLICY "company_pmoc_tpl_tenant_select"
  ON public.company_pmoc_document_templates FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- INSERT — admin OU gestor do tenant (ou super_admin)
DROP POLICY IF EXISTS "company_pmoc_tpl_admin_gestor_insert"
  ON public.company_pmoc_document_templates;
CREATE POLICY "company_pmoc_tpl_admin_gestor_insert"
  ON public.company_pmoc_document_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- UPDATE — admin OU gestor do tenant (ou super_admin).
-- "Restaurar texto padrão" = UPDATE setando NULL — coberto por esta policy.
DROP POLICY IF EXISTS "company_pmoc_tpl_admin_gestor_update"
  ON public.company_pmoc_document_templates;
CREATE POLICY "company_pmoc_tpl_admin_gestor_update"
  ON public.company_pmoc_document_templates FOR UPDATE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- DELETE — só super_admin Auctus (consistência com pmoc_docs_super_admin_delete).
-- authenticated comum fica negado por padrão (sem policy DELETE pra ele).
DROP POLICY IF EXISTS "company_pmoc_tpl_super_admin_delete"
  ON public.company_pmoc_document_templates;
CREATE POLICY "company_pmoc_tpl_super_admin_delete"
  ON public.company_pmoc_document_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================================================
-- §2. Reset 1x AUTORIZADO PELO CEO — troca do template base PMOC
-- =============================================================================
-- Estamos trocando o template default de CÓDIGO dos documentos PMOC. O CEO
-- autorizou explicitamente (plano 2026-06-06) resetar TODOS os documentos
-- custom por contrato já existentes pra que voltem a usar o default — que
-- agora é o NOVO template base.
--
-- Zerar termo_rt_content/certificado_content faz a edge function cair no
-- template padrão na próxima geração de PDF. Atualizo também os *_updated_at
-- pra refletir a data do reset (auditoria). Em DO $$ pra logar ROW_COUNT no
-- MESMO bloco PL/pgSQL (gotcha GET DIAGNOSTICS).
-- =============================================================================

DO $$
DECLARE
  affected int;
BEGIN
  UPDATE public.pmoc_contract_documents_custom
     SET termo_rt_content       = NULL,
         certificado_content    = NULL,
         termo_rt_updated_at    = now(),
         certificado_updated_at = now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'Reset 1x template base PMOC (autorizado CEO): % linha(s) de pmoc_contract_documents_custom resetada(s) pra usar o default.', affected;
END $$;

COMMIT;

-- =============================================================================
-- FIM da migration.
--
-- Próximos passos (fora desta migration):
--   1. Regenerar src/integrations/supabase/types.ts
--      → supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   2. (Plataforma/Dev de tela) hook + UI pra editar o template por empresa.
--   3. (Edge function de PDF) passar a ler company_pmoc_document_templates como
--      fallback ANTES do default de código.
-- =============================================================================
