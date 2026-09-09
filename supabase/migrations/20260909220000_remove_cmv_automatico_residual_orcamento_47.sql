-- ============================================================================
-- LIMPEZA DE DADO — a ÚLTIMA linha de CMV automático de orçamento que escapou
-- das duas migrations anteriores. ⚠️ ESTA MUDA SALDO, DE PROPÓSITO.
--
-- DECISÃO DO CEO (2026-09-09):
--   "O custo do orçamento tem que entrar só quando a pessoa compra o material.
--    O custo do orçamento por enquanto é só demonstrativo."
--
-- POR QUÊ:
-- Aprovar um orçamento criava automaticamente a despesa "CMV Materiais —
-- Orçamento #N" no financeiro, debitando a conta bancária. Isso duplicava o
-- custo: o dinheiro do material sai do caixa quando o material é COMPRADO
-- (lançamento manual do usuário), não quando o orçamento é aprovado. A criação
-- automática já foi removida do código (v1.24.7, commit e4cee373,
-- src/hooks/useQuoteConversion.ts) e está deployada — não nasce mais nenhuma.
--
-- POR QUE ESTA FICOU DE FORA DA MIGRATION ANTERIOR:
-- Ela nasceu em 2026-09-09 13:42:03 UTC, ou seja, DEPOIS da migration
-- 20260909120000 (que zerou o account_id das 17 antigas, às 13:18) e ANTES do
-- deploy do código corrigido. Caiu exatamente na janela entre a correção do
-- banco e a correção do código, então a 20260909140000 não a alcançou.
--
-- ⚠️ DIFERENÇA CRUCIAL EM RELAÇÃO À 20260909140000:
-- Aquelas 17 linhas já estavam com account_id NULL (inertes) — apagá-las NÃO
-- mexeu em saldo nenhum. ESTA linha ainda tem account_id preenchido (Caixa da
-- Alô gás), logo apagá-la MUDA O SALDO. Isso é o efeito desejado: o dinheiro
-- nunca saiu de verdade, o débito era fantasma. O CEO aprovou explicitamente
-- ciente disso.
--
-- ESCOPO MEDIDO EM PRODUÇÃO ANTES DE APLICAR: exatamente 1 linha.
--   id .......... 430c5f5d-4dc9-4884-b7f0-dce7da2fc7e4
--   empresa ..... Alô gás Juquitiba (9bd3d561-a567-48fa-899d-a05b04c2137f)
--   descrição ... CMV Materiais — Orçamento #47
--   valor ....... R$ 5.145,89 (saida, is_paid = true)
--   conta ....... Caixa (57546460-fabb-4c0b-907c-3e9f7c363ead)
--
-- EFEITO ESPERADO NO SALDO (fórmula do app: initial_balance + entradas pagas
-- − saídas pagas, só is_paid, contas type <> 'cartao'):
--   Alô gás Juquitiba / Caixa .... R$ 4.601,22  →  R$ 9.747,11  (+5.145,89)
-- NENHUMA outra conta pode mudar. Conferidas antes e depois, idênticas:
--   Alô gás Juquitiba / Conta Principal .. R$ 1.267,11  (inalterada)
--   VS PROJECT / Conta Principal ......... R$     0,00  (inalterada)
--   VS PROJECT / MERCADO PAGO ............ R$ 2.267,70  (inalterada)
--
-- CRITÉRIO DE ALVO — o id é a condição principal; as demais são cinto de
-- segurança e precisam valer JUNTAS:
--   1. id = 430c5f5d-4dc9-4884-b7f0-dce7da2fc7e4
--   2. category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
--   3. parent_transaction_id IS NOT NULL   (nasceu vinculado ao orçamento)
--   4. description LIKE 'CMV Materiais — Orçamento #%'
--   5. account_id IS NOT NULL
--   6. amount = 5145.89
--
-- 🚨 O QUE NÃO PODE SER TOCADO: existem 11 linhas com categoria de CMV que são
-- lançamentos MANUAIS — o usuário escolheu essa categoria à mão pra uma despesa
-- real que de fato saiu da conta (6 da Alô gás, 3 da ENGETEC, 2 da Glacial),
-- total R$ 3.682,70. Elas NÃO têm parent_transaction_id. O filtro por id, mais
-- as condições 3 e 4, as protegem. Conferidas antes e depois: 11 linhas,
-- R$ 3.682,70, md5(string_agg(id)) = ae29b7b4b83608d0eb7d60979dc4b89d.
--
-- ⚠️ ATENÇÃO AO TRAVESSÃO: a descrição usa em dash "—" (U+2014, bytes E2 80 94),
-- não hífen. Conferido byte a byte em produção via encode(convert_to(...)).
--
-- DEPENDÊNCIAS VERIFICADAS ANTES DO DELETE (todas zero para esta linha):
-- financial_transaction_attachments (ON DELETE CASCADE — apagaria anexo em
-- silêncio), financial_transactions.parent_transaction_id, quotes.
-- financial_transaction_id, nfse_emissions.financial_transaction_id,
-- credit_card_bills.payment_transaction_id. Essas 5 são TODAS as FKs que
-- apontam pra financial_transactions (conferido em pg_constraint).
--
-- IDEMPOTENTE: rodar de novo encontra 0 linhas, avisa e não faz nada.
-- Se encontrar ≠ 1 linha, aborta a transação inteira.
-- Sem DROP, sem mexer em schema, RLS, policy, trigger ou função.
-- ============================================================================

-- ============================================================================
-- RECUPERAÇÃO: descomente para restaurar
-- ----------------------------------------------------------------------------
-- Snapshot de TODAS as 36 colunas, tirado em produção em 2026-09-09,
-- imediatamente antes do DELETE. Restaura a linha exatamente como estava
-- (inclusive o account_id, ou seja, devolve o saldo pra R$ 4.601,22).
-- ----------------------------------------------------------------------------
-- INSERT INTO public.financial_transactions (
--   id, transaction_type, category, description, amount, transaction_date,
--   due_date, paid_date, is_paid, customer_id, service_order_id, receipt_url,
--   notes, created_by, created_at, updated_at, contract_id, payment_method,
--   installment_group_id, installment_number, installment_total, account_id,
--   transfer_pair_id, company_id, parent_transaction_id, credit_card_bill_date,
--   employee_id, payroll_period, payroll_kind, cancelled_at, cancelled_reason,
--   amount_received, billing_reminder_resolved_at, billing_reminder_resolved_by,
--   tenant_charge_id, bill_id
-- ) VALUES
--   ('430c5f5d-4dc9-4884-b7f0-dce7da2fc7e4'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #47', 5145.89, '2026-09-08'::date, NULL, '2026-09-08'::date, true, 'ba49e537-1dae-4352-8973-40e95b86515b'::uuid, NULL, NULL, 'Custo de materiais do orçamento #47', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-09-09 13:42:03.026873+00'::timestamptz, '2026-09-09 13:42:03.026873+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, '57546460-fabb-4c0b-907c-3e9f7c363ead'::uuid, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'e9736694-8cea-4b56-8f56-9ad9ed3655ea'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL)
-- ON CONFLICT (id) DO NOTHING;
-- ============================================================================

DO $$
DECLARE
  v_alvo integer;
  v_rows integer;
  v_deps integer;
  v_id   uuid := '430c5f5d-4dc9-4884-b7f0-dce7da2fc7e4'::uuid;
BEGIN
  -- 1) Medir o alvo antes de tocar em qualquer coisa.
  SELECT count(*) INTO v_alvo
    FROM public.financial_transactions t
   WHERE t.id = v_id
     AND t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
     AND t.parent_transaction_id IS NOT NULL
     AND t.description LIKE 'CMV Materiais — Orçamento #%'
     AND t.account_id IS NOT NULL
     AND t.amount = 5145.89;

  IF v_alvo = 0 THEN
    RAISE NOTICE 'CMV automático residual (orçamento #47): nada a remover (já limpo).';
    RETURN;
  END IF;

  IF v_alvo <> 1 THEN
    RAISE EXCEPTION 'Esperava exatamente 1 linha alvo, encontrei %. Abortando.', v_alvo;
  END IF;

  -- 2) Ninguém pode depender dessa linha. O FK de anexos é ON DELETE CASCADE:
  --    se houvesse anexo, o DELETE o levaria junto sem avisar.
  SELECT (SELECT count(*) FROM public.financial_transactions f
            WHERE f.parent_transaction_id = v_id)
       + (SELECT count(*) FROM public.financial_transaction_attachments a
            WHERE a.transaction_id = v_id)
       + (SELECT count(*) FROM public.quotes q
            WHERE q.financial_transaction_id = v_id)
       + (SELECT count(*) FROM public.nfse_emissions n
            WHERE n.financial_transaction_id = v_id)
       + (SELECT count(*) FROM public.credit_card_bills b
            WHERE b.payment_transaction_id = v_id)
    INTO v_deps;

  IF v_deps > 0 THEN
    RAISE EXCEPTION 'Existem % registro(s) dependendo da linha alvo. Abortando.', v_deps;
  END IF;

  -- 3) Apagar. Mesmas condições da medição — o id manda, o resto é cinto.
  DELETE FROM public.financial_transactions t
   WHERE t.id = v_id
     AND t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
     AND t.parent_transaction_id IS NOT NULL
     AND t.description LIKE 'CMV Materiais — Orçamento #%'
     AND t.account_id IS NOT NULL
     AND t.amount = 5145.89;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DELETE removeu % linha(s), esperado 1. Abortando.', v_rows;
  END IF;

  RAISE NOTICE 'CMV automático residual removido: % linha(s), R$ 5.145,89. Saldo do Caixa da Alô gás vai de 4.601,22 para 9.747,11.', v_rows;
END $$;
