-- =====================================================================
-- apply_tenant_charge_payment — restringir EXECUTE só ao service_role
-- =====================================================================
-- CONTEXTO: a RPC de baixa (webhook → marca recebível como pago) é operação
-- de SERVIDOR. No Supabase, funções novas ganham EXECUTE por default para
-- os roles anon/authenticated (via default privileges no schema public);
-- um simples REVOKE ... FROM PUBLIC NÃO remove esses grants por-role. Sem
-- este REVOKE explícito, um usuário logado poderia chamar a RPC direto e
-- forçar a baixa de um recebível (marcar como pago sem pagamento real).
--
-- Correção: revogar EXECUTE de PUBLIC, anon e authenticated; conceder só ao
-- service_role (a edge do webhook). Idempotente.
-- =====================================================================

REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;
