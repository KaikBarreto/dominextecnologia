-- =============================================================================
-- Performance das leituras tenant-scoped mais frequentes
-- =============================================================================
--
-- Consultas confirmadas no frontend:
--   * service_orders: RLS por company_id + range de scheduled_date;
--   * financial_transactions: RLS por company_id + ORDER BY transaction_date;
--   * dashboard financeiro: mesmo acesso, restrito a is_paid = true;
--   * customers: RLS por company_id + is_deleted = false + ORDER BY name;
--   * profiles: filtro/RLS por company_id + ORDER BY full_name.
--
-- A consulta separada de OS abertas NAO recebe indice novo por status:
-- idx_service_orders_company_created (company_id, created_at DESC) ja cobre a
-- ordenacao, e status tem baixa cardinalidade sem seletividade medida.
-- service_order_assignees NAO recebe indice novo: a UNIQUE existente em
-- (service_order_id, user_id) ja cobre o relacionamento embutido por OS.
--
-- Seguranca: indices nao mudam grants nem policies. O isolamento continua nas
-- policies RLS e no entitlement do tenant; company_id apenas lidera as chaves
-- para que o planner consiga aplicar esses predicados sem varrer outros tenants.
-- Nao ha alteracao de schema exposto pela API, portanto os tipos gerados do
-- Supabase nao precisam ser regenerados.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- O dashboard limitado aplica gte/lte em scheduled_date. A condicao implica
-- IS NOT NULL, entao o indice parcial evita carregar OS sem agendamento.
-- created_at nao entra na chave: apos um range em scheduled_date ele nao
-- eliminaria a ordenacao global, apenas aumentaria escrita e armazenamento.
CREATE INDEX IF NOT EXISTS idx_service_orders_company_scheduled_date
  ON public.service_orders USING btree (company_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

-- Ledger completo usado pela listagem, DRE e resumos derivados em memoria.
-- DESC tambem atende ORDER BY asc via varredura reversa do btree.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_transaction_date
  ON public.financial_transactions USING btree (company_id, transaction_date DESC);

-- O dashboard carrega somente lancamentos pagos e os ordena por data. Manter o
-- predicado parcial reduz o indice e evita percorrer recebiveis ainda abertos.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_paid_date
  ON public.financial_transactions USING btree (company_id, transaction_date DESC)
  WHERE is_paid = true;

-- A listagem operacional exclui soft-deleted e ordena por nome. O predicado
-- replica exatamente `.eq('is_deleted', false)`; linhas NULL nao entram em
-- nenhum dos dois lados.
CREATE INDEX IF NOT EXISTS idx_customers_company_active_name
  ON public.customers USING btree (company_id, name)
  WHERE is_deleted = false;

-- useProfiles/useUsers ordenam por full_name dentro do tenant. O indice parcial
-- idx_profiles_company_active nao cobre essas consultas quando is_active nao e
-- informado, por isso este indice geral nao e duplicado dele.
CREATE INDEX IF NOT EXISTS idx_profiles_company_full_name
  ON public.profiles USING btree (company_id, full_name);

COMMIT;

-- Rollback logico (somente se for necessario reverter esta otimizacao):
-- DROP INDEX IF EXISTS public.idx_service_orders_company_scheduled_date;
-- DROP INDEX IF EXISTS public.idx_financial_transactions_company_transaction_date;
-- DROP INDEX IF EXISTS public.idx_financial_transactions_company_paid_date;
-- DROP INDEX IF EXISTS public.idx_customers_company_active_name;
-- DROP INDEX IF EXISTS public.idx_profiles_company_full_name;
