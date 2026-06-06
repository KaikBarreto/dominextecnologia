-- =============================================================================
-- PMOC — Snapshot do template da EMPRESA pro contrato no momento da criação
-- =============================================================================
-- Por quê: quando um contrato PMOC nasce, ele deve carregar uma CÓPIA do
-- template padrão de documentos da empresa (company_pmoc_document_templates)
-- congelada NAQUELE momento (modelo snapshot). Assim, alterar o template da
-- empresa depois NÃO muda contratos antigos — cada contrato preserva o texto
-- vigente na criação. Se a empresa não tem template (ou ele é todo NULL), o
-- contrato nasce SEM custom e cai no default de CÓDIGO na geração do PDF — que
-- é exatamente o comportamento desejado.
--
-- Como: função trigger AFTER INSERT ON public.contracts FOR EACH ROW.
--   - Só age quando NEW.is_pmoc IS TRUE.
--   - Lê a linha de company_pmoc_document_templates da MESMA empresa do contrato
--     (WHERE company_id = NEW.company_id).
--   - Se existir E pelo menos um dos conteúdos for NÃO-nulo, copia o snapshot
--     pra pmoc_contract_documents_custom com ON CONFLICT (contract_id) DO NOTHING.
--
-- Multi-tenant (regra-lei): o snapshot é SEMPRE copiado dentro da MESMA empresa
-- (NEW.company_id em ambos os lados). Nunca cruza tenant. O trigger de coerência
-- já existente em pmoc_contract_documents_custom
-- (trg_pmoc_custom_enforce_company_match) revalida company_id ↔ contracts.company_id
-- no INSERT, então qualquer divergência abortaria.
--
-- SECURITY DEFINER + SET search_path = public: espelha o padrão das demais
-- funções trigger do projeto (ex.: pmoc_enforce_company_match_via_contract,
-- ensure_pmoc_token). Roda como owner, então o INSERT em
-- pmoc_contract_documents_custom (tabela RLS) funciona independentemente da role
-- da sessão que criou o contrato — owner bypassa RLS.
--
-- Nota sobre AFTER INSERT: usamos AFTER (não BEFORE) porque precisamos do
-- NEW.id já materializado pra satisfazer a FK contract_id → contracts(id) na
-- linha-snapshot. O trigger BEFORE de token (trg_ensure_pmoc_token) já tratou
-- is_pmoc/token antes; aqui só lemos NEW.is_pmoc/NEW.company_id (já definitivos).
--
-- Os campos *_updated_at do snapshot são preenchidos automaticamente pelo
-- trigger BEFORE INSERT já existente (trg_pmoc_custom_set_updated_by) quando o
-- conteúdo correspondente é não-nulo — por isso NÃO os setamos aqui.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes do
-- CREATE TRIGGER. Toda a migration é UMA transação (BEGIN/COMMIT).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Função trigger: pmoc_snapshot_company_template_on_contract
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pmoc_snapshot_company_template_on_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl_termo_rt    text;
  tpl_certificado text;
  tpl_found       boolean := false;
BEGIN
  -- Só contratos PMOC.
  IF NEW.is_pmoc IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Lê o template padrão da MESMA empresa do contrato.
  SELECT t.termo_rt_content, t.certificado_content, true
    INTO tpl_termo_rt, tpl_certificado, tpl_found
    FROM public.company_pmoc_document_templates t
   WHERE t.company_id = NEW.company_id;

  -- Sem linha de template da empresa OU ambos os conteúdos NULL → não copia
  -- nada. O contrato cai no default de código na geração do PDF.
  IF NOT tpl_found THEN
    RETURN NEW;
  END IF;

  IF tpl_termo_rt IS NULL AND tpl_certificado IS NULL THEN
    RETURN NEW;
  END IF;

  -- Copia o snapshot (congela o template vigente neste momento).
  -- ON CONFLICT DO NOTHING: se já houver custom pra esse contrato (ex.: criado
  -- por outro caminho), não sobrescreve.
  INSERT INTO public.pmoc_contract_documents_custom
    (contract_id, company_id, termo_rt_content, certificado_content)
  VALUES
    (NEW.id, NEW.company_id, tpl_termo_rt, tpl_certificado)
  ON CONFLICT (contract_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pmoc_snapshot_company_template_on_contract() IS
  'AFTER INSERT em contracts: quando is_pmoc, copia (snapshot) o template padrão '
  'da empresa (company_pmoc_document_templates) pra pmoc_contract_documents_custom '
  'do contrato novo. Só copia se a empresa tem template com ao menos um conteúdo '
  'não-nulo; senão o contrato cai no default de código. Snapshot SEMPRE dentro da '
  'mesma empresa (NEW.company_id). SECURITY DEFINER pra inserir na tabela RLS.';

-- -----------------------------------------------------------------------------
-- Trigger AFTER INSERT ON contracts (nome distinto do trg_ensure_pmoc_token)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pmoc_snapshot_company_template ON public.contracts;
CREATE TRIGGER trg_pmoc_snapshot_company_template
  AFTER INSERT ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.pmoc_snapshot_company_template_on_contract();

COMMIT;

-- =============================================================================
-- FIM da migration.
--
-- Não altera schema de colunas (só função + trigger) → NÃO precisa regenerar
-- src/integrations/supabase/types.ts.
--
-- Teste lógico esperado (sem criar contrato real):
--   1. Empresa A tem template com termo_rt_content='X', certificado_content=NULL.
--      → Novo contrato PMOC da A: pmoc_contract_documents_custom ganha
--        (contract_id, A, 'X', NULL). *_updated_at do termo preenchido pelo
--        trigger BEFORE existente. Editar o template da A depois NÃO muda este
--        contrato (snapshot congelado).
--   2. Empresa B sem linha em company_pmoc_document_templates (ou ambos NULL).
--      → Novo contrato PMOC da B: NENHUMA linha custom criada → default código.
--   3. Contrato NÃO-PMOC (is_pmoc=false/null) de qualquer empresa.
--      → Trigger retorna cedo, nada é copiado.
--   4. Multi-tenant: o INSERT usa NEW.company_id dos dois lados; o trigger de
--      coerência já existente revalidaria qualquer divergência (cross-tenant
--      impossível).
-- =============================================================================
