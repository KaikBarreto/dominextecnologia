-- Categoria financeira por assinatura recorrente.
--
-- Contexto: na cobrança avulsa o usuário já escolhe a categoria e ela é gravada em
-- financial_transactions.category (via RPC create_tenant_charge_receivable). Na
-- assinatura recorrente isso não existia: tenant_subscriptions não tinha coluna de
-- categoria, então a escolha do usuário não sobrevivia até o momento em que o
-- webhook materializa a cobrança de cada ciclo (que sempre usava o
-- default_income_category da conta). Esta migration só abre o campo para persistir
-- a escolha; a leitura em cada ciclo é feita pelo tenant-asaas-webhook.
--
-- Aditiva, sem backfill: NULL significa "usa o default_income_category da conta",
-- que é exatamente o comportamento de hoje para todas as assinaturas existentes.
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS category text NULL;

COMMENT ON COLUMN public.tenant_subscriptions.category IS
  'Categoria financeira escolhida pelo usuario na criacao da assinatura. NULL = usar default_income_category da conta de pagamento.';
