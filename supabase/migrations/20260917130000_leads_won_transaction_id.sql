-- ============================================================================
-- Trava de idempotência: receita gerada ao mover oportunidade pra "ganho"
-- ============================================================================
--
-- CONTEXTO:
--   Quando o usuário move uma oportunidade do CRM para um estágio marcado
--   como "ganho" (public.crm_stages.is_won = true), o sistema vai oferecer
--   abrir o lançamento de receita (conta a receber) já preenchido com o
--   cliente e o valor da oportunidade.
--
--   Requisito crítico: não gerar receita duplicada. Se a pessoa tirar a
--   oportunidade do "ganho" e colocar de volta, ou mover duas vezes, não
--   pode oferecer de novo nem criar dois lançamentos. Pra isso o lead
--   precisa lembrar qual lançamento financeiro ele já gerou — daí esta
--   coluna.
--
-- ON DELETE SET NULL (não RESTRICT, não CASCADE):
--   Se o lançamento financeiro referenciado for excluído, o lead volta ao
--   estado "ainda não gerou receita" (won_transaction_id = null) em vez de
--   ficar travado apontando pra um registro morto e nunca mais poder gerar
--   a receita do próprio ganho. Consistente com o padrão já estabelecido
--   pras FKs de financial_transactions (20260904190000, 20260916170000):
--   excluir uma ponta nunca deve travar ou apagar em cascata a outra por
--   engano — aqui a "ponta" que pode ser excluída é o próprio lançamento,
--   e quem perde o vínculo é o lead.
--
-- NULLABLE, SEM DEFAULT:
--   null = ainda não gerou receita — estado de TODAS as linhas existentes
--   hoje. Nenhuma empresa vê nada mudar por causa desta migration.
--
-- ÍNDICE: não criado.
--   O padrão de leitura desta coluna é sempre "este lead específico já
--   gerou receita?" — uma consulta por PK do lead (id), que já tem índice
--   primário. Não há tela nem relatório que liste leads filtrando ou
--   agrupando por won_transaction_id (diferente de supplier_id em
--   20260916170000, que serve pra listar lançamentos por fornecedor). Sem
--   caso de uso de busca por esta coluna, um índice aqui seria só overhead
--   de escrita sem benefício de leitura.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS won_transaction_id uuid;

COMMENT ON COLUMN public.leads.won_transaction_id IS
  'Lançamento financeiro (financial_transactions) gerado ao mover esta oportunidade para um estágio "ganho". Trava de idempotência: null = ainda não gerou receita; não-null = já gerou, não oferecer de novo. SET NULL se o lançamento for excluído (lead volta a poder gerar receita).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_won_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_won_transaction_id_fkey
      FOREIGN KEY (won_transaction_id) REFERENCES public.financial_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS: nenhuma política nova. public.leads já é RLS por linha via
-- "Users manage own company leads" (FOR ALL, company_id =
-- get_user_company_id(auth.uid()) OU is_super_admin(auth.uid()), ver
-- 20260418163700, otimizada em 20260826161618). RLS no Postgres é por
-- linha, não por coluna: o UPDATE que o usuário da empresa já tem sobre a
-- linha do lead cobre a coluna nova automaticamente, sem precisar de
-- policy dedicada.
