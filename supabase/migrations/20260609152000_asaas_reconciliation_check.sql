-- =============================================================================
-- asaas_reconciliation_check(): varredura de anomalias da integração Asaas
-- =============================================================================
-- Por quê: blindagem contra os 2 furos da integração de cobrança SaaS:
--   1) renovação creditada em dobro (mesma fatura creditou LTV mais de uma vez)
--   2) pagamento órfão (recebeu/confirmou mas não renovou — ltv_credited_at NULL)
--   3) lançamento financeiro duplicado (mesmo asaas_transaction_id em >1 linha)
-- Esta função SÓ LÊ e devolve as anomalias. Quem dispara alerta é o cron
-- (asaas_reconciliation_alert). A tela admin também pode chamar pra auditoria.
--
-- SECURITY DEFINER + search_path fixo: roda com privilégio do dono pra ler
-- subscription_payments / admin_financial_transactions independentemente da RLS
-- de quem chamou (a tela admin já é gateada por is_admin_user na rota).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.asaas_reconciliation_check()
RETURNS TABLE (
  issue_type  TEXT,
  ref         TEXT,
  detail      TEXT,
  description TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- (1) RENOVAÇÃO EM DOBRO: mesma fatura (company_id, amount, due_date) com mais
  -- de um pagamento que creditou LTV. Significa que a renovação rodou 2x.
  SELECT
    'RENOVACAO_EM_DOBRO'::TEXT AS issue_type,
    (sp.company_id::TEXT || '|' || sp.amount::TEXT || '|' || sp.due_date::TEXT) AS ref,
    ('company_id=' || sp.company_id || ' amount=' || sp.amount
       || ' due_date=' || sp.due_date || ' creditos=' || count(*)) AS detail,
    'Mesma fatura creditou renovacao (LTV) mais de uma vez' AS description
  FROM public.subscription_payments sp
  WHERE sp.ltv_credited_at IS NOT NULL
  GROUP BY sp.company_id, sp.amount, sp.due_date
  HAVING count(*) > 1

  UNION ALL

  -- (2) PAGAMENTO SEM CREDITO: recebido/confirmado mas nunca renovou a empresa.
  SELECT
    'PAGAMENTO_SEM_CREDITO'::TEXT AS issue_type,
    COALESCE(sp.asaas_payment_id, sp.id::TEXT) AS ref,
    ('payment_id=' || COALESCE(sp.asaas_payment_id, '(null)')
       || ' company_id=' || sp.company_id
       || ' status=' || sp.status || ' amount=' || sp.amount) AS detail,
    'Pagamento recebido/confirmado mas LTV nunca foi creditado (renovacao orfa)' AS description
  FROM public.subscription_payments sp
  WHERE sp.status IN ('RECEIVED', 'CONFIRMED')
    AND sp.ltv_credited_at IS NULL

  UNION ALL

  -- (3) LANCAMENTO DUPLICADO: mesmo asaas_transaction_id em mais de uma linha
  -- de admin_financial_transactions (a idempotência do ledger furou).
  SELECT
    'LANCAMENTO_DUPLICADO'::TEXT AS issue_type,
    aft.asaas_transaction_id AS ref,
    ('asaas_transaction_id=' || aft.asaas_transaction_id
       || ' linhas=' || count(*)) AS detail,
    'Mesmo pagamento Asaas lancado mais de uma vez no financeiro admin' AS description
  FROM public.admin_financial_transactions aft
  WHERE aft.asaas_transaction_id IS NOT NULL
  GROUP BY aft.asaas_transaction_id
  HAVING count(*) > 1;
$$;

GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_check() TO authenticated, service_role;

COMMENT ON FUNCTION public.asaas_reconciliation_check() IS
  'Varredura read-only de anomalias da integracao Asaas: renovacao em dobro, pagamento orfao, lancamento duplicado. Usada pela tela admin e pelo cron de reconciliacao.';
