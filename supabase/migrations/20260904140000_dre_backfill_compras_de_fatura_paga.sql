-- ============================================================================
-- BACKFILL — compras de faturas JÁ pagas viram is_paid = true
-- (Onda A do plano docs/planos/2026-09-04-dre-regime-caixa-competencia.md)
--
-- Complemento da 20260904130000: aquela migration faz o pagamento DAQUI PRA
-- FRENTE quitar as compras. Esta cura o passado — as faturas que já estão em
-- status 'paid' e cujas compras continuam penduradas em is_paid = false, e que
-- portanto nunca apareceram na DRE e nunca apareceriam.
--
-- ESCOPO MEDIDO EM PRODUÇÃO ANTES DE APLICAR: 16 linhas, R$ 3.066,12, tudo de
-- Glacial Cold Brasil, fatura de referência 2026-06-01 (1 fatura, 1 empresa).
--
-- Query de contagem (rodar ANTES e DEPOIS; depois tem que dar 0):
--
--   SELECT count(*) AS linhas,
--          round(COALESCE(sum(t.amount), 0), 2) AS valor,
--          count(DISTINCT b.id) AS faturas,
--          count(DISTINCT b.company_id) AS empresas
--     FROM public.credit_card_bills b
--     JOIN public.financial_accounts ca
--       ON ca.id = b.account_id
--      AND ca.company_id = b.company_id
--      AND ca.type = 'cartao'
--     JOIN public.financial_transactions t
--       ON t.account_id = b.account_id
--      AND t.company_id = b.company_id
--      AND t.transaction_type = 'saida'
--      AND t.credit_card_bill_date = b.reference_month
--      AND t.is_paid = false
--    WHERE b.status = 'paid';
--
-- IDEMPOTÊNCIA: o `AND t.is_paid = false` é o que garante. Na segunda execução
-- não sobra nenhuma linha candidata e o UPDATE afeta 0 — não é "roda de novo e
-- reescreve igual", é "roda de novo e não toca em nada". Importante porque
-- paid_date é derivado da fatura: se o filtro fosse por outra coisa, uma segunda
-- passada poderia sobrescrever um paid_date que o usuário tivesse ajustado à mão.
--
-- ⚠️ SÓ FATURA 'paid'. Fatura 'partial' fica de fora de propósito: não há como
-- saber quais compras o pagamento parcial cobriu, e inventar critério produz
-- dado falso na DRE. Mesma decisão do CEO que rege a RPC.
--
-- ⚠️ NÃO alcança as duas pernas do pagamento de fatura: elas nascem com
-- credit_card_bill_date = NULL (a coluna marca DESPESA do cartão; pagamento não
-- é despesa do cartão) e is_paid = true. Conferido no banco antes de aplicar:
-- 0 linhas de category 'Pagamento de Fatura' com credit_card_bill_date
-- preenchida e 0 com is_paid <> true.
--
-- O join com financial_accounts (type = 'cartao') não é decorativo: impede que
-- uma fatura apontando pra conta que não é cartão arraste lançamento comum de
-- conta bancária pra dentro do backfill.
--
-- Não há ambiguidade de qual fatura casa com qual compra: credit_card_bills tem
-- UNIQUE (account_id, reference_month), então o par (conta do cartão, mês de
-- referência) resolve pra no máximo uma fatura. Conferido: 0 duplicatas.
-- ============================================================================

DO $backfill$
DECLARE
  v_antes_linhas  integer;
  v_antes_valor   numeric;
  v_atualizadas   integer;
BEGIN
  SELECT count(*), round(COALESCE(sum(t.amount), 0), 2)
    INTO v_antes_linhas, v_antes_valor
    FROM public.credit_card_bills b
    JOIN public.financial_accounts ca
      ON ca.id = b.account_id
     AND ca.company_id = b.company_id
     AND ca.type = 'cartao'
    JOIN public.financial_transactions t
      ON t.account_id = b.account_id
     AND t.company_id = b.company_id
     AND t.transaction_type = 'saida'
     AND t.credit_card_bill_date = b.reference_month
     AND t.is_paid = false
   WHERE b.status = 'paid';

  RAISE NOTICE 'backfill cartao/DRE — candidatas ANTES: % linhas, R$ %',
    v_antes_linhas, v_antes_valor;

  -- paid_date = quando a fatura foi paga.
  --   1º  paid_at (carimbo real do pagamento). Convertido em America/Sao_Paulo
  --       e não com `::date` cru, que leria UTC e jogaria pagamento feito à
  --       noite pro dia seguinte — e no virar do mês, pro mês seguinte, que na
  --       DRE em regime Caixa é o resultado de OUTRO período.
  --   2º  due_date (vencimento da fatura). É o que existe pros pagamentos
  --       antigos, feitos pelo payBill legado, que não gravava paid_at. A única
  --       fatura afetada por esta migration está exatamente nesse caso.
  --   3º  a data da própria compra, só pra garantir que NUNCA fique
  --       is_paid = true com paid_date NULL: a DRE em regime Caixa agrupa por
  --       paid_date, e linha paga sem data some do relatório em silêncio.
  --       (Hoje due_date é NOT NULL de fato — 0 nulos —, então este ramo não
  --       deve disparar; está aqui porque a coluna não tem constraint.)
  UPDATE public.financial_transactions t
     SET is_paid    = true,
         paid_date  = COALESCE(
                        (b.paid_at AT TIME ZONE 'America/Sao_Paulo')::date,
                        b.due_date,
                        t.transaction_date
                      ),
         updated_at = now()
    FROM public.credit_card_bills b
    JOIN public.financial_accounts ca
      ON ca.id = b.account_id
     AND ca.company_id = b.company_id
     AND ca.type = 'cartao'
   WHERE b.status = 'paid'
     AND t.account_id            = b.account_id
     AND t.company_id            = b.company_id
     AND t.transaction_type      = 'saida'
     AND t.credit_card_bill_date = b.reference_month
     AND t.is_paid               = false;

  -- GET DIAGNOSTICS tem que ficar no MESMO bloco PL/pgSQL do UPDATE. Fora dele
  -- (num bloco DO separado) leria 0 sempre, porque o DO abre outro contexto.
  -- A tag do bloco tem nome proprio (nao e o cifrao duplo padrao) de proposito:
  -- este comentario cita o delimitador padrao, e citar o proprio delimitador
  -- dentro do bloco FECHA a string ali e o parser estoura 'syntax error at or
  -- near'. Aconteceu na primeira tentativa de aplicar esta migration.
  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;

  RAISE NOTICE 'backfill cartao/DRE — atualizadas: % linhas', v_atualizadas;

  IF v_atualizadas <> v_antes_linhas THEN
    RAISE EXCEPTION 'backfill cartao/DRE abortado: contei % candidatas mas atualizei % linhas. O predicado da contagem e o do UPDATE divergiram.',
      v_antes_linhas, v_atualizadas;
  END IF;
END $backfill$;
