-- ============================================================================
-- CORREÇÃO DE DADO — CMV gerado pela aprovação de orçamento não pode debitar
-- o saldo da conta bancária (account_id -> NULL)
--
-- POR QUÊ:
-- Ao aprovar um orçamento, o sistema (src/hooks/useQuoteConversion.ts) criava
-- as despesas de "CMV Materiais" e "Mão de obra avulsa" já com account_id
-- preenchido e is_paid = true — ou seja, elas SAÍAM do saldo da conta.
-- Isso é conceitualmente errado: CMV é o custo do material CONSUMIDO; o
-- dinheiro saiu do banco lá atrás, quando o material foi COMPRADO, e essa
-- compra o usuário lança à mão. Resultado: o mesmo dinheiro era debitado
-- DUAS vezes e o extrato do Dominex nunca fechava com o do banco.
--
-- PROVA (cliente VS PROJECT, extrato real do Mercado Pago, 21/07 a 31/07/2026):
-- considerando SÓ os lançamentos manuais dela, o saldo bate com o banco em
-- 8 de 8 dias, ao centavo. Com os lançamentos automáticos de CMV somados, a
-- divergência é exatamente o valor deles (R$ 1.826,27). A conta MERCADO PAGO
-- mostrava R$ 441,43 e o correto é R$ 2.267,70.
--
-- O código passa a nascer com account_id = NULL (correção paralela no hook).
-- Esta migration cura o passado.
--
-- ESCOPO MEDIDO EM PRODUÇÃO ANTES DE APLICAR: 17 linhas, R$ 11.210,18
--   Alô gás Juquitiba .. 10 linhas .. R$ 9.383,91 (contas Caixa e Conta Principal)
--   VS PROJECT ......... 7 linhas .. R$ 1.826,27 (conta MERCADO PAGO)
--
-- 🚨 O QUE NÃO PODE SER TOCADO: existem 11 linhas com categoria de CMV que são
-- lançamentos MANUAIS (usuário escolheu a categoria à mão pra uma despesa real
-- que de fato saiu da conta): 6 da Alô gás, 3 da ENGETEC, 2 da Glacial.
-- Elas NÃO têm parent_transaction_id e NÃO seguem o padrão de descrição.
-- Por isso o critério de alvo é TRIPLO (categoria + parent_transaction_id +
-- padrão de descrição), e não só a categoria.
--
-- ⚠️ ATENÇÃO AO TRAVESSÃO: a descrição usa em dash "—" (U+2014), não hífen.
--
-- Rastreabilidade: a conta original é gravada em notes antes de zerar, sem
-- destruir a nota existente. Idempotente: o filtro account_id IS NOT NULL já
-- protege, e a nota só é acrescentada se ainda não tiver a marca da correção.
-- ============================================================================

DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.financial_transactions t
     SET notes = CASE
                   WHEN COALESCE(NULLIF(btrim(t.notes), ''), '') = ''
                     THEN '[correção 1.24.3] account_id original: '
                          || t.account_id::text
                          || ' (' || COALESCE(fa.name, 'conta removida') || ')'
                   ELSE t.notes || E'\n'
                          || '[correção 1.24.3] account_id original: '
                          || t.account_id::text
                          || ' (' || COALESCE(fa.name, 'conta removida') || ')'
                 END,
         account_id = NULL
    FROM (SELECT id, name FROM public.financial_accounts) fa
   WHERE fa.id = t.account_id
     AND t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
     AND t.account_id IS NOT NULL
     AND t.parent_transaction_id IS NOT NULL
     AND (t.description LIKE 'CMV Materiais — Orçamento #%'
       OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
     AND COALESCE(t.notes, '') NOT LIKE '%[correção 1.24.3] account_id original:%';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'CMV automático desvinculado da conta bancária: % linha(s).', v_rows;

  IF v_rows > 17 THEN
    RAISE EXCEPTION 'Escopo maior que o medido (% linhas > 17). Abortando pra não tocar dado inesperado.', v_rows;
  END IF;
END $$;
