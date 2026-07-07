-- ============================================================================
-- 20260707120000_dre_start_date_and_reset_company.sql
-- ----------------------------------------------------------------------------
-- PARTE A — Data de corte do DRE (company_settings.dre_start_date)
--
-- Coluna opcional: quando preenchida, o DRE conta apenas movimentacao a partir
-- dessa data. NULL = comportamento atual (conta tudo).
-- A Parte B (Zerar Sistema via reset_company_*) foi removida desta migration
-- pois o feature ja existe em producao (reset_system_audit_start / reset_system_step)
-- e esta migration duplicaria funcoes conflitantes. Objetos criados acidentalmente
-- foram dropados em seguida via query direta no prod.
-- ============================================================================


-- ############################################################################
-- PARTE A — DRE start date
-- ############################################################################
-- Corte opcional: quando preenchido, o DRE conta apenas movimentacao a partir
-- dessa data. NULL = comportamento atual (conta tudo). Nenhum tenant existente
-- e afetado (coluna nasce NULL).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS dre_start_date date NULL;

COMMENT ON COLUMN public.company_settings.dre_start_date IS
  'Data de corte do DRE: quando preenchida, o DRE conta apenas a partir desta data. NULL = conta toda a movimentacao (comportamento padrao).';

-- Setar o corte da empresa "Glacial Cold Brasil" para hoje.
-- company_id confirmado como EXATAMENTE 1 linha antes de escrever esta migration
-- (SELECT id,name FROM companies WHERE name ILIKE '%glacial%' -> 478ee686-...).
-- A empresa possui linha em company_settings (confirmado), entao o UPDATE afeta 1 row.
UPDATE public.company_settings
   SET dre_start_date = CURRENT_DATE
 WHERE company_id = '478ee686-12dd-40a8-880a-a7375764a5a0';


