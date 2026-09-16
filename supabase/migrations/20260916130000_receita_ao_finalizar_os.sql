-- Feature: "Receita ao finalizar a OS" (Natura Ar Climatização, plano em
-- docs/planos/2026-09-16-receita-ao-finalizar-os.md, seção 3.1).
--
-- Toggle por empresa: perguntar sobre receita ao finalizar uma OS.
-- Nasce DESLIGADO — empresa que não pediu não vê nada mudar.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS os_finish_revenue_prompt_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.os_finish_revenue_prompt_enabled IS
  'Quando true, ao concluir uma Ordem de Serviço o sistema pergunta se houve receita '
  'e, se sim, abre o formulário de receita do Financeiro já vinculado àquela OS '
  '(financial_transactions.service_order_id). Desligado por padrão.';

-- Apoia (a) a checagem de idempotência "esta OS já tem receita lançada?" e
-- (b) o resumo "quanto esta OS faturou" no modal de detalhe da OS.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_service_order
  ON public.financial_transactions (service_order_id)
  WHERE service_order_id IS NOT NULL;

-- Nenhuma policy nova: company_settings e financial_transactions já têm RLS por
-- company_id (a coluna nova herda a cobertura da policy existente de UPDATE
-- "System managers can manage company_settings", FOR ALL); e a receita nasce
-- pelo caminho já existente do useFinancial.createTransaction.
