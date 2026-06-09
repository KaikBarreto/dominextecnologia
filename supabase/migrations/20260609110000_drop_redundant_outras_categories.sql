-- Remove categorias redundantes 'outras_receitas' / 'outras_despesas'
-- adicionadas em 20260609100000_ledger_asaas_conciliacao.sql.
--
-- Por quê: já existiam as categorias de sistema 'other_income' (income, "Outras Receitas")
-- e 'other_expense' (expense, "Outras Despesas") com a mesma semântica. Os names em
-- pt-BR ficaram duplicados. Padronizamos nos EXISTENTES (other_income/other_expense).
--
-- Seguro: confirmado 0 referências em admin_financial_transactions e ledger_asaas
-- (transactions.category / ledger_asaas.category). A remoção só ocorre se NENHUMA
-- linha referenciar esses names — senão o bloco aborta sem deletar.

DO $$
DECLARE
  v_txn_refs    INT;
  v_ledger_refs INT;
  v_deleted     INT;
BEGIN
  SELECT count(*) INTO v_txn_refs
  FROM public.admin_financial_transactions
  WHERE category IN ('outras_receitas', 'outras_despesas');

  SELECT count(*) INTO v_ledger_refs
  FROM public.ledger_asaas
  WHERE category IN ('outras_receitas', 'outras_despesas');

  IF v_txn_refs > 0 OR v_ledger_refs > 0 THEN
    RAISE EXCEPTION 'Abortado: % ref(s) em transactions e % ref(s) em ledger_asaas usam outras_receitas/outras_despesas. Migre para other_income/other_expense antes de remover.',
      v_txn_refs, v_ledger_refs;
  END IF;

  DELETE FROM public.admin_financial_categories
  WHERE name IN ('outras_receitas', 'outras_despesas');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Categorias redundantes removidas: % linha(s).', v_deleted;
END $$;
