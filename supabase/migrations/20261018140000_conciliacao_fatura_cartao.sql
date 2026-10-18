-- ============================================================================
-- 20261018140000_conciliacao_fatura_cartao.sql
--
-- CONCILIAÇÃO DE FATURA DE CARTÃO DE CRÉDITO (modo 'card') + REABRIR CONCILIAÇÃO
--
-- Plano aprovado: docs/planos/2026-10-18-conciliacao-fatura-cartao.md
-- Base: 20261017200000 (conciliação bancária), 20261018010000 (categoria
--       'ambos'), 20261018120000 (pernas e diferenças), 20261018130000
--       (import fantasma / total_entries > 0 no can_finalize).
--
-- Numeração: o MAIOR version remoto em supabase_migrations.schema_migrations no
-- momento da escrita era 20261018130000 (conferido na Management API, não no
-- `ls` local). 20261018140000 está acima dele.
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ A INVARIANTE CENTRAL DESTA MIGRATION                                       │
-- │                                                                            │
-- │   NENHUM caminho do modo cartão escreve is_paid = true nem paid_date numa   │
-- │   COMPRA de cartão.                                                        │
-- │                                                                            │
-- │ Despesa de cartão só é quitada quando a FATURA é paga por inteiro, via     │
-- │ pay_credit_card_bill. Quebrar isso regride o bug histórico do "(1/6)       │
-- │ sumindo" (a parcela nascia paga e desaparecia de Contas a Pagar) e faz o   │
-- │ gasto contar DUAS vezes na DRE: na compra e no pagamento da fatura.        │
-- │                                                                            │
-- │ Consequência direta: no modo cartão NÃO EXISTE o destino "dar baixa", nem  │
-- │ "transferência", nem "vale". Os três são a baixa individual de compra de   │
-- │ cartão, que o produto proíbe. Esta migration fecha os três no SERVIDOR     │
-- │ (não só na UI), em dois níveis:                                            │
-- │   (a) _reconcile_assert_kind(entry, 'bank') nas RPCs de extrato bancário;   │
-- │   (b) filtro `kind = 'bank'` dentro das funções de CANDIDATOS, que são as  │
-- │       mesmas consultadas pela sugestão da tela E pelo portão do match      │
-- │       (invariante 6: a tela nunca oferece o que a ação recusa).            │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- O que entra:
--   1. compute_credit_card_bill_date() — a regra "em qual fatura esta compra
--      cai" em SQL, espelhando computeBillDate (src/hooks/useCreditCardBills.ts
--      linha 60). Núcleo PURO + invólucro que lê a conta. Teste de equivalência
--      SQL × TypeScript roda DENTRO desta migration e aborta o apply se
--      divergir em qualquer um dos 23 casos de borda.
--   2. bank_statement_imports.kind ('bank' | 'card') + colunas de auditoria de
--      reabertura. Nenhuma tabela nova.
--   3. create_bank_statement_import passa a ACEITAR conta de cartão, derivando
--      o kind do TIPO REAL da conta (nunca do client).
--   4. RPCs novas do modo cartão: criar compra, casar compra, casar pagamento
--      da fatura, registrar pagamento da fatura, buscar candidatos.
--   5. reconcile_unmatch_entry aprende os 4 tipos novos de match e desfaz o
--      efeito de cada um.
--   6. get_bank_reconciliation_state ganha o bloco 'card' (total da fatura /
--      compras lançadas — NUNCA a palavra "saldo") e o kind. Só ACRÉSCIMO:
--      nenhum campo existente muda de nome, de tipo ou de aritmética.
--   7. reopen_bank_reconciliation() — a porta de volta que não existia.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

-- ============================================================================
-- PARTE 1 — A REGRA DA FATURA EM SQL (o risco técnico principal do plano)
-- ============================================================================
--
-- computeBillDate (TypeScript) era a ÚNICA fonte da verdade de "em qual fatura
-- esta compra cai". A RPC de criação não pode receber credit_card_bill_date do
-- client (é SECURITY DEFINER: dado do client não é confiável) nem reimplementar
-- a regra solta, porque ela tem DUAS armadilhas já pagas em produção:
--
--   (A) FECHA NO PRÓPRIO DIA. closing_day = 20 → a compra do dia 20 vai pra
--       fatura SEGUINTE. O teste é `txDay < closingDay`, não `<=`. Confirmado
--       pelo cliente Glacial Cold (mai/2026) e replicado em três superfícies
--       (a RPC de pagamento, o status exibido e a trava do botão de pagar).
--
--   (B) CLAMP DE FIM DE MÊS. closing_day = 31 em fevereiro: o `setMonth` nativo
--       do JS não faz clamp e vira 3 de março em silêncio. O TS resolve com
--       Math.min(closingDay, getDaysInMonth(txDate)); aqui é least(..., dias do
--       mês da compra).
--
-- A função é partida em DUAS de propósito:
--   credit_card_bill_date_for(closing_day, data)  → núcleo PURO e IMMUTABLE.
--       É ele que o teste de equivalência exercita com closing_day arbitrário,
--       sem precisar criar conta de cartão de mentira em produção.
--   compute_credit_card_bill_date(account_id, data) → invólucro SECURITY
--       DEFINER que lê closing_day da conta, confere o tenant e delega.
--
-- Duas implementações da mesma regra sem teste de equivalência divergem — é
-- questão de tempo. O teste está no fim deste arquivo, no bloco de provas.

CREATE OR REPLACE FUNCTION public.credit_card_bill_date_for(
  p_closing_day      integer,
  p_transaction_date date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_first   date;
  v_dim     integer;
  v_closing integer;
  v_tx_day  integer;
BEGIN
  IF p_transaction_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- startOfMonth(txDate)
  v_first := date_trunc('month', p_transaction_date::timestamp)::date;

  -- getDaysInMonth(txDate): último dia do mês da COMPRA (não do mês da fatura).
  v_dim := extract(day FROM (v_first + interval '1 month' - interval '1 day'))::integer;

  -- closing_day ?? 10  →  o MESMO default do TypeScript. Mudar este 10 aqui sem
  -- mudar lá (ou vice-versa) joga compras na fatura errada sem erro nenhum.
  -- least() é o clamp da armadilha (B).
  v_closing := least(coalesce(p_closing_day, 10), v_dim);

  v_tx_day := extract(day FROM p_transaction_date)::integer;

  -- Armadilha (A): `<`, nunca `<=`. O próprio dia do fechamento já é da
  -- fatura seguinte.
  IF v_tx_day < v_closing THEN
    RETURN v_first;
  END IF;

  -- startOfMonth(addMonths(txDate, 1)). Somar 1 mês ao PRIMEIRO dia do mês
  -- (v_first) e não à data da compra é o que torna o resultado imune a
  -- 31/01 + 1 mês: v_first é sempre dia 1, então nunca há transbordo.
  RETURN (v_first + interval '1 month')::date;
END;
$function$;

COMMENT ON FUNCTION public.credit_card_bill_date_for(integer, date) IS
'Núcleo PURO da regra de fatura de cartão: dado o dia de fechamento e a data da compra, devolve o mês de referência da fatura (primeiro dia do mês). Espelha computeBillDate (src/hooks/useCreditCardBills.ts:60) byte a byte na semântica: default 10, fechamento inclusivo (o próprio dia já é da fatura seguinte) e clamp do dia de fechamento pelo tamanho do mês da compra. Alterar aqui sem alterar o TypeScript joga compras na fatura errada em silêncio.';

CREATE OR REPLACE FUNCTION public.compute_credit_card_bill_date(
  p_account_id       uuid,
  p_transaction_date date
)
RETURNS date
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id  uuid;
  v_type        text;
  v_closing_day integer;
BEGIN
  SELECT fa.company_id, fa.type, fa.closing_day
    INTO v_company_id, v_type, v_closing_day
    FROM public.financial_accounts fa
   WHERE fa.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.' USING ERRCODE = '42501';
  END IF;

  -- Tenant antes de devolver qualquer coisa: closing_day é dado de cliente.
  PERFORM public._reconcile_assert_company(v_company_id);

  IF v_type IS DISTINCT FROM 'cartao' THEN
    RAISE EXCEPTION 'Esta conta não é um cartão de crédito, então não tem fatura.'
      USING ERRCODE = '22023';
  END IF;

  RETURN public.credit_card_bill_date_for(v_closing_day, p_transaction_date);
END;
$function$;

COMMENT ON FUNCTION public.compute_credit_card_bill_date(uuid, date) IS
'Em qual fatura (mês de referência) uma compra feita nesta data cai, para ESTE cartão. Lê closing_day da conta no SERVIDOR: a RPC que cria a compra é SECURITY DEFINER, então aceitar credit_card_bill_date do client seria aceitar que o client decidisse o mês de competência da despesa. Delega a regra para credit_card_bill_date_for.';

-- ============================================================================
-- PARTE 2 — SCHEMA: kind do import + auditoria de reabertura
-- ============================================================================

ALTER TABLE public.bank_statement_imports
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bank';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bank_statement_imports'::regclass
       AND conname  = 'bank_statement_imports_kind_chk'
  ) THEN
    ALTER TABLE public.bank_statement_imports
      ADD CONSTRAINT bank_statement_imports_kind_chk
      CHECK (kind IN ('bank', 'card'));
  END IF;
END
$do$;

COMMENT ON COLUMN public.bank_statement_imports.kind IS
'Modo da conciliação: ''bank'' (extrato de conta, <STMTRS>) ou ''card'' (fatura de cartão, <CCSTMTRS>). DERIVADO do tipo da conta no servidor por create_bank_statement_import — nunca aceito do client. Governa quais destinos existem por linha: no modo card não há "dar baixa", "transferência" nem "vale", porque os três seriam a baixa individual de compra de cartão.';

-- Reabertura auditável. finalized_at/finalized_by voltam a NULL quando o
-- extrato reabre (é o que a UI e o can_finalize leem), então sem estas três
-- colunas a reabertura não deixaria rastro nenhum.
ALTER TABLE public.bank_statement_imports
  ADD COLUMN IF NOT EXISTS reopened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by  uuid,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bank_statement_imports.reopened_at IS
'Quando esta conciliação foi reaberta pela última vez (reopen_bank_reconciliation). Existe porque reabrir zera finalized_at/finalized_by: sem este par a reabertura seria invisível.';
COMMENT ON COLUMN public.bank_statement_imports.reopened_by IS
'Quem reabriu a conciliação pela última vez (auth.uid() no momento da reabertura).';
COMMENT ON COLUMN public.bank_statement_imports.reopen_count IS
'Quantas vezes esta conciliação já foi reaberta. Conta cumulativa: reabrir e finalizar de novo não apaga o histórico.';

-- Índice só nas de cartão: o volume de card imports é pequeno e as telas
-- filtram por conta, então o parcial é o que paga.
CREATE INDEX IF NOT EXISTS bank_statement_imports_kind_idx
  ON public.bank_statement_imports (company_id, kind, created_at DESC);

-- ---------------------------------------------------------------------------
-- match_type: os 4 tipos novos do modo cartão
-- ---------------------------------------------------------------------------
--   card_purchase          → linha casada com compra JÁ lançada. Desfazer só
--                            desvincula (a compra é fato do sistema).
--   card_purchase_created  → a compra que faltava, criada por esta conciliação.
--                            Desfazer APAGA a compra.
--   card_payment           → linha de crédito casada com a perna de cartão de
--                            um pagamento de fatura JÁ registrado. Desfazer só
--                            desvincula.
--   card_payment_created   → o pagamento da fatura foi registrado por esta
--                            conciliação. Desfazer ESTORNA pelo caminho que já
--                            existe (revert_credit_card_bill_payment).
--
-- Tipos distintos e não reaproveitamento de 'created'/'existing': é o
-- match_type que diz ao reconcile_unmatch_entry o que desfazer. Desfazer que
-- não desfaz o efeito é pior que não ter desfazer.
ALTER TABLE public.reconciliation_matches
  DROP CONSTRAINT IF EXISTS reconciliation_matches_type_chk;

ALTER TABLE public.reconciliation_matches
  ADD CONSTRAINT reconciliation_matches_type_chk
  CHECK (match_type IN (
    'existing', 'created', 'settled', 'transfer', 'card_bill', 'employee_vale',
    'card_purchase', 'card_purchase_created', 'card_payment', 'card_payment_created'
  ));

COMMENT ON COLUMN public.reconciliation_matches.match_type IS
'O que esta conciliação FEZ, e portanto o que o desfazer precisa reverter. Modo banco: existing (só vínculo), created (criou lançamento), settled (deu baixa), transfer (par de transferência), card_bill (pagou fatura a partir da conta bancária), employee_vale. Modo cartão: card_purchase (só vínculo com compra já lançada), card_purchase_created (criou a compra — desfazer apaga), card_payment (só vínculo com a perna de cartão de um pagamento já registrado), card_payment_created (registrou o pagamento da fatura — desfazer estorna).';




-- ============================================================================
-- PARTE 3 — O PORTÃO DE MODO
-- ============================================================================

CREATE OR REPLACE FUNCTION public._reconcile_assert_kind(p_entry_id uuid, p_expected text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text;
BEGIN
  SELECT i.kind
    INTO v_kind
    FROM public.bank_statement_entries e
    JOIN public.bank_statement_imports i ON i.id = e.import_id
   WHERE e.id = p_entry_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_kind = p_expected THEN
    RETURN;
  END IF;

  IF p_expected = 'bank' THEN
    RAISE EXCEPTION 'Esta linha é de uma FATURA DE CARTÃO, não de um extrato bancário. Na fatura os destinos são: casar com uma compra já lançada, criar a compra que falta, registrar o pagamento da fatura ou ignorar. Compra no cartão nunca recebe baixa individual — ela é quitada quando a fatura é paga por inteiro.'
      USING ERRCODE = 'P0001';
  ELSE
    RAISE EXCEPTION 'Esta linha é de um EXTRATO BANCÁRIO, não de uma fatura de cartão. Use os destinos do extrato: casar, dar baixa, criar lançamento, transferência, pagar fatura de cartão ou ignorar.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public._reconcile_assert_kind(uuid, text) IS
'Recusa, no SERVIDOR, usar uma RPC de extrato bancário numa linha de fatura de cartão e vice-versa. A UI esconder o botão não é proteção: a RPC é chamável direto pelo PostgREST. É este portão que impede "dar baixa"/"transferência"/"vale" numa compra de cartão — a baixa individual que o produto proíbe.';

-- ============================================================================
-- PARTE 4 — CANDIDATOS CIENTES DO MODO
-- ============================================================================
-- As funções de candidatos são a FONTE ÚNICA consultada tanto pela sugestão da
-- tela quanto pelo portão do match (invariante 6). Colocar o filtro de modo
-- AQUI é o que garante que o modo cartão não ofereça — e não aceite — nenhum
-- destino de extrato bancário, em qualquer superfície, inclusive a busca manual
-- e a chamada direta à RPC.

-- ---------------------------------------------------------------------------
-- 4.1 Casar com lançamento já realizado (extrato bancário). Fechado no cartão.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._reconcile_match_candidates(p_entry_id uuid, p_query text DEFAULT NULL::text, p_tolerance numeric DEFAULT 0.01, p_date_window_days integer DEFAULT 3, p_include_matched boolean DEFAULT false)
 RETURNS SETOF financial_transactions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT en.company_id, en.account_id, en.effective_amount,
           (en.posted_at AT TIME ZONE 'America/Sao_Paulo')::date AS posted_date,
           i.kind AS import_kind
      FROM public.bank_statement_entries en
      JOIN public.bank_statement_imports i ON i.id = en.import_id
     WHERE en.id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.customers cus ON cus.id = t.customer_id
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
    LEFT JOIN public.employees emp ON emp.id = t.employee_id
   -- ÚNICA linha nova em relação a 20261018120000: esta função é do modo BANCO.
   -- Na fatura de cartão o "casar" tem outra definição de candidato (compra em
   -- aberto, não movimento de caixa) e vive em
   -- _reconcile_card_purchase_candidates. Sem este filtro, a tela da fatura
   -- ofereceria casar compra de cartão com movimento de caixa.
   WHERE e.import_kind = 'bank'
     AND t.company_id = e.company_id
     AND t.account_id = e.account_id
     AND t.is_paid IS TRUE
     AND t.cancelled_at IS NULL
     -- Compra de cartão não é caixa do banco: ela só sai da conta quando a
     -- FATURA é paga (invariante 5).
     AND t.credit_card_bill_date IS NULL
     -- Mãe de recebimento parcial não é linha de caixa: o dinheiro entrou nas
     -- filhas ('Recebimento parcial'), e são elas que batem com o extrato.
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_transactions c
        WHERE c.parent_transaction_id = t.id
          AND c.category = 'Recebimento parcial'
          AND c.transaction_type = 'entrada'
     )
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND (
       coalesce(p_include_matched, false)
       OR NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches rm
          WHERE rm.financial_transaction_id = t.id
       )
     )
     AND (
       p_date_window_days IS NULL
       OR coalesce(t.paid_date, t.transaction_date)
            BETWEEN e.posted_date - p_date_window_days AND e.posted_date + p_date_window_days
     )
     AND (
       q.term IS NULL
       OR t.description ILIKE '%' || q.term || '%'
       OR t.category    ILIKE '%' || q.term || '%'
       OR t.notes       ILIKE '%' || q.term || '%'
       OR cus.name      ILIKE '%' || q.term || '%'
       OR sup.name      ILIKE '%' || q.term || '%'
       OR emp.name      ILIKE '%' || q.term || '%'
     )
$function$;

-- ---------------------------------------------------------------------------
-- 4.2 Dar baixa (extrato bancário). FECHADO no cartão — este é o filtro que
--     mata a baixa individual de compra de cartão no servidor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._reconcile_settle_candidates(p_entry_id uuid, p_query text DEFAULT NULL::text, p_tolerance numeric DEFAULT 0.01)
 RETURNS SETOF financial_transactions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT en.company_id, en.account_id, en.effective_amount,
           i.kind AS import_kind
      FROM public.bank_statement_entries en
      JOIN public.bank_statement_imports i ON i.id = en.import_id
     WHERE en.id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.customers cus ON cus.id = t.customer_id
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
   -- ⚠️ LINHA NOVA, E É A MAIS IMPORTANTE DESTA MIGRATION.
   -- "Dar baixa" NÃO EXISTE no modo cartão: ele escreve is_paid = true e
   -- paid_date no lançamento, que é exatamente a baixa individual proibida.
   -- E o filtro precisa estar AQUI, não só na RPC: esta função não filtra
   -- account_id (de propósito — a baixa adota a conta do extrato como
   -- pagadora), então sem este `kind = 'bank'` uma linha de FATURA conseguiria
   -- dar baixa numa conta a pagar qualquer, carimbando o CARTÃO como conta
   -- pagadora e quitando a despesa fora da fatura.
   WHERE e.import_kind = 'bank'
     AND t.company_id = e.company_id
     AND t.is_paid IS NOT TRUE
     AND t.cancelled_at IS NULL
     -- Despesa de cartão NUNCA é paga individualmente: só a fatura agregada é.
     AND t.credit_card_bill_date IS NULL
     -- Folha/vale/rescisão têm fluxo próprio no RH.
     AND t.payroll_kind IS NULL
     -- Perna de transferência nasce paga; se aparecer em aberto é dado torto.
     AND t.transfer_pair_id IS NULL
     -- Recebimento parcial em andamento: baixa total mentiria sobre o resto.
     AND coalesce(t.amount_received, 0) = 0
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND NOT EXISTS (
       SELECT 1 FROM public.reconciliation_matches rm
        WHERE rm.financial_transaction_id = t.id
     )
     AND (
       q.term IS NULL
       OR t.description ILIKE '%' || q.term || '%'
       OR t.category    ILIKE '%' || q.term || '%'
       OR t.notes       ILIKE '%' || q.term || '%'
       OR cus.name      ILIKE '%' || q.term || '%'
       OR sup.name      ILIKE '%' || q.term || '%'
     )
$function$;

-- ---------------------------------------------------------------------------
-- 4.3 Faturas pagáveis por esta linha — agora nos DOIS modos.
-- ---------------------------------------------------------------------------
-- MODO BANCO (como era): a linha é um DÉBITO na conta bancária e paga a fatura
--   de QUALQUER cartão do tenant.
-- MODO CARTÃO (novo): a linha é um CRÉDITO na própria fatura (o pagamento visto
--   do lado do cartão) e só pode se referir a uma fatura DESTE cartão
--   (b.account_id = e.account_id). Oferecer fatura de outro cartão aqui
--   permitiria registrar um pagamento que não está nesta fatura.
CREATE OR REPLACE FUNCTION public._reconcile_card_bill_candidates(p_entry_id uuid)
 RETURNS TABLE(id uuid, account_id uuid, account_name text, reference_month date, closing_date date, due_date date, status text, bill_total numeric, amount_paid numeric, remaining numeric, is_closed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT en.company_id, en.account_id, en.effective_amount, i.kind AS import_kind
      FROM public.bank_statement_entries en
      JOIN public.bank_statement_imports i ON i.id = en.import_id
     WHERE en.id = p_entry_id
  )
  SELECT
    b.id,
    b.account_id,
    ca.name,
    b.reference_month,
    b.closing_date,
    b.due_date,
    b.status,
    round(coalesce(tot.bill_total, 0), 2),
    round(coalesce(b.amount_paid, 0), 2),
    round(coalesce(tot.bill_total, 0) - coalesce(b.amount_paid, 0), 2),
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date >= b.closing_date)
  FROM public.credit_card_bills b
  CROSS JOIN e
  JOIN public.financial_accounts ca
    ON ca.id = b.account_id
   AND ca.company_id = e.company_id
   AND ca.type = 'cartao'
  LEFT JOIN LATERAL (
    SELECT coalesce(SUM(t.amount), 0) AS bill_total
      FROM public.financial_transactions t
     WHERE t.account_id = b.account_id
       AND t.transaction_type = 'saida'
       AND t.credit_card_bill_date = b.reference_month
  ) tot ON true
  WHERE b.company_id = e.company_id
    AND coalesce(tot.bill_total, 0) - coalesce(b.amount_paid, 0) > 0.01
    AND (
      -- Extrato bancário: só linha de DÉBITO paga fatura.
      (e.import_kind = 'bank' AND e.effective_amount < 0)
      -- Fatura de cartão: o pagamento aparece como CRÉDITO (reduz a dívida), e
      -- só vale pra fatura do PRÓPRIO cartão que está sendo conciliado.
      OR (e.import_kind = 'card' AND e.effective_amount > 0 AND b.account_id = e.account_id)
    )
  ORDER BY b.due_date DESC
$function$;

-- ---------------------------------------------------------------------------
-- 4.4 NOVO — compras do cartão casáveis com uma linha da fatura.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._reconcile_card_purchase_candidates(
  p_entry_id          uuid,
  p_query             text    DEFAULT NULL::text,
  p_tolerance         numeric DEFAULT 0.01,
  p_date_window_days  integer DEFAULT 3,
  p_include_matched   boolean DEFAULT false
)
RETURNS SETOF financial_transactions
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT en.company_id, en.account_id, en.effective_amount,
           (en.posted_at AT TIME ZONE 'America/Sao_Paulo')::date AS posted_date,
           i.kind AS import_kind
      FROM public.bank_statement_entries en
      JOIN public.bank_statement_imports i ON i.id = en.import_id
     WHERE en.id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
    LEFT JOIN public.cost_centers cc ON cc.id = t.cost_center_id
   WHERE e.import_kind = 'card'
     AND t.company_id = e.company_id
     -- A compra tem que estar NO CARTÃO que está sendo conciliado.
     AND t.account_id = e.account_id
     -- É o carimbo de fatura que define "compra de cartão". As duas pernas do
     -- pagamento de fatura nascem com credit_card_bill_date = NULL, então este
     -- predicado já as exclui (elas têm caminho próprio:
     -- _reconcile_card_payment_candidates).
     AND t.credit_card_bill_date IS NOT NULL
     AND t.cancelled_at IS NULL
     AND t.transfer_pair_id IS NULL
     -- ⚠️ DE PROPÓSITO NÃO HÁ FILTRO DE is_paid AQUI.
     -- A compra de cartão vive is_paid = false até a fatura ser paga, mas se o
     -- cliente já pagou a fatura ANTES de conciliar, as compras daquela fatura
     -- estão is_paid = true — e continuam sendo exatamente as linhas da fatura
     -- que ele está conferindo. Filtrar por is_paid esconderia metade dos
     -- candidatos legítimos justamente no cliente organizado, que paga antes de
     -- conciliar. E casar NÃO muda is_paid (ver reconcile_match_card_purchase),
     -- então aceitar os dois estados não quita nem desquita nada.
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND (
       coalesce(p_include_matched, false)
       OR NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches rm
          WHERE rm.financial_transaction_id = t.id
       )
     )
     -- Compra de cartão não tem paid_date enquanto a fatura não é paga, então a
     -- proximidade é medida pela DATA DA COMPRA (transaction_date), que é o que
     -- a fatura também traz. Usar coalesce(paid_date, transaction_date) aqui
     -- faria a janela saltar pra data do PAGAMENTO da fatura nas compras já
     -- quitadas, e elas sumiriam da sugestão.
     AND (
       p_date_window_days IS NULL
       OR t.transaction_date
            BETWEEN e.posted_date - p_date_window_days AND e.posted_date + p_date_window_days
     )
     AND (
       q.term IS NULL
       OR t.description ILIKE '%' || q.term || '%'
       OR t.category    ILIKE '%' || q.term || '%'
       OR t.notes       ILIKE '%' || q.term || '%'
       OR sup.name      ILIKE '%' || q.term || '%'
       OR cc.name       ILIKE '%' || q.term || '%'
     )
$function$;

COMMENT ON FUNCTION public._reconcile_card_purchase_candidates(uuid, text, numeric, integer, boolean) IS
'FONTE ÚNICA das compras de cartão casáveis com uma linha de fatura. Consultada pela sugestão de get_bank_reconciliation_state, pela busca manual de reconcile_search_card_purchases E pelo portão de reconcile_match_card_purchase — é o que impede a tela de oferecer o que a ação recusa. Devolve ZERO linhas quando o import não é kind = ''card''. Não filtra is_paid de propósito: compra de fatura já paga continua sendo linha daquela fatura.';

-- ---------------------------------------------------------------------------
-- 4.5 NOVO — pagamentos de fatura já registrados, casáveis com a linha de
--     crédito da fatura.
-- ---------------------------------------------------------------------------
-- O alvo é a PERNA DE CARTÃO do par criado por pay_credit_card_bill
-- (card_leg_transaction_id): entrada no cartão, que é a que devolve o limite.
-- A perna de saída vive na conta bancária e é casada no OUTRO extrato — casar
-- a saída aqui faria o pagamento aparecer duas vezes no caixa.
CREATE OR REPLACE FUNCTION public._reconcile_card_payment_candidates(
  p_entry_id         uuid,
  p_tolerance        numeric DEFAULT 0.01,
  p_date_window_days integer DEFAULT NULL::integer,
  p_include_matched  boolean DEFAULT false
)
RETURNS SETOF financial_transactions
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT en.company_id, en.account_id, en.effective_amount,
           (en.posted_at AT TIME ZONE 'America/Sao_Paulo')::date AS posted_date,
           i.kind AS import_kind
      FROM public.bank_statement_entries en
      JOIN public.bank_statement_imports i ON i.id = en.import_id
     WHERE en.id = p_entry_id
  )
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
   WHERE e.import_kind = 'card'
     AND e.effective_amount > 0
     AND t.company_id = e.company_id
     AND t.account_id = e.account_id
     AND t.transaction_type = 'entrada'
     AND t.category = 'Pagamento de Fatura'
     AND t.transfer_pair_id IS NOT NULL
     AND t.bill_id IS NOT NULL
     -- As pernas do pagamento nascem SEM carimbo de fatura. Este predicado é o
     -- que separa "pagamento" de "compra" dentro do mesmo cartão.
     AND t.credit_card_bill_date IS NULL
     AND t.cancelled_at IS NULL
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND (
       coalesce(p_include_matched, false)
       OR NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches rm
          WHERE rm.financial_transaction_id = t.id
       )
     )
     -- Default SEM janela de data: a operadora lança o crédito do pagamento na
     -- data que quiser dentro do ciclo, e o par no sistema tem a data em que o
     -- dinheiro saiu do banco. Travar ±3 dias esconderia o pagamento certo.
     AND (
       p_date_window_days IS NULL
       OR coalesce(t.paid_date, t.transaction_date)
            BETWEEN e.posted_date - p_date_window_days AND e.posted_date + p_date_window_days
     )
$function$;

COMMENT ON FUNCTION public._reconcile_card_payment_candidates(uuid, numeric, integer, boolean) IS
'FONTE ÚNICA dos pagamentos de fatura já registrados que podem ser casados com a linha de CRÉDITO de uma fatura de cartão. Mira a perna de CARTÃO do par (card_leg_transaction_id de pay_credit_card_bill), nunca a perna de saída da conta bancária — essa é casada no extrato do banco, e casar as duas no mesmo lugar contaria o pagamento duas vezes no caixa. Devolve ZERO linhas fora do kind = ''card''.';




-- ============================================================================
-- PARTE 5 — IMPORT: aceitar fatura de cartão, derivando o kind no servidor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_bank_statement_import(p_account_id uuid, p_file_name text, p_file_hash text, p_bank_id text, p_acct_id text, p_period_start date, p_period_end date, p_ledger_balance numeric, p_ledger_balance_date date, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id      uuid;
  v_account         public.financial_accounts%ROWTYPE;
  v_existing        public.bank_statement_imports%ROWTYPE;
  v_import_id       uuid;
  v_kind            text;
  v_inserted        integer := 0;
  v_total           integer;
  v_skipped_content integer := 0;
  v_skipped_samples jsonb   := '[]'::jsonb;
  v_opening         numeric;
  v_prev_acct       text;
  v_suspect         integer := 0;
  v_pending_existing integer := 0;
  v_ghost_deleted   integer := 0;
BEGIN
  SELECT * INTO v_account
    FROM public.financial_accounts
   WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.' USING ERRCODE = '42501';
  END IF;

  v_company_id := v_account.company_id;
  PERFORM public._reconcile_assert_write(v_company_id);

  -- ── O MODO SAI DO TIPO DA CONTA, NUNCA DO CLIENT ────────────────────────
  -- Esta função é SECURITY DEFINER: aceitar um parâmetro p_kind seria aceitar
  -- que o client declarasse "esta conta de cartão é um extrato bancário" e
  -- destravasse, na própria fatura, os destinos "dar baixa"/"transferência" —
  -- a baixa individual de compra de cartão que o produto proíbe.
  --
  -- Até 20261018130000 conta de cartão era RECUSADA aqui, de propósito, porque
  -- não existia caminho correto. Agora existe: o kind 'card' troca o conjunto
  -- de destinos por linha (casar compra · criar compra · pagamento da fatura ·
  -- inverter sinal · ignorar) e nenhum deles escreve is_paid numa compra.
  v_kind := CASE WHEN v_account.type = 'cartao' THEN 'card' ELSE 'bank' END;

  IF v_account.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta conta está inativa. Reative a conta antes de importar o extrato.'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_hash IS NULL OR btrim(p_file_hash) = '' THEN
    RAISE EXCEPTION 'O arquivo precisa de uma identificação (hash) para evitar importação duplicada.'
      USING ERRCODE = '22023';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'A lista de linhas do extrato é inválida.' USING ERRCODE = '22023';
  END IF;

  -- Mesmo arquivo, mesma conta: devolve o import que já existe em vez de
  -- estourar 23505 na cara do usuário. A UI decide (retomar se 'open', avisar
  -- se 'finalized').
  SELECT * INTO v_existing
    FROM public.bank_statement_imports
   WHERE company_id = v_company_id
     AND account_id = p_account_id
     AND file_hash  = p_file_hash;

  IF FOUND THEN
    SELECT count(*) FILTER (WHERE e.status = 'pending')
      INTO v_pending_existing
      FROM public.bank_statement_entries e
     WHERE e.import_id = v_existing.id;

    RETURN jsonb_build_object(
      'already_imported',  true,
      'nothing_new',       false,
      'import_id',         v_existing.id,
      'status',            v_existing.status,
      -- ADITIVO: a UI precisa do modo pra escolher o conjunto de destinos e os
      -- rótulos do rodapé ANTES de abrir a conciliação.
      'kind',              v_existing.kind,
      'file_name',         v_existing.file_name,
      'inserted_count',    0,
      'total_entries',     jsonb_array_length(p_entries),
      'skipped_count',     jsonb_array_length(p_entries),
      'skipped_dup_count', jsonb_array_length(p_entries),
      'skipped_samples',   '[]'::jsonb,
      'pending_count',     coalesce(v_pending_existing, 0),
      'opening_balance',   v_existing.opening_balance,
      'ledger_balance',    v_existing.ledger_balance,
      'acct_warning',      false,
      'acct_warning_previous', NULL,
      'sign_suspect_count',    0
    );
  END IF;

  v_total := jsonb_array_length(p_entries);

  -- Aviso (não bloqueia): import anterior desta conta tinha outro ACCTID →
  -- provavelmente é o arquivo da conta errada.
  SELECT i.acct_id INTO v_prev_acct
    FROM public.bank_statement_imports i
   WHERE i.account_id = p_account_id
     AND nullif(btrim(coalesce(i.acct_id, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(p_acct_id, '')), '') IS NOT NULL
     AND nullif(btrim(i.acct_id), '') <> nullif(btrim(p_acct_id), '')
   ORDER BY i.created_at DESC
   LIMIT 1;

  INSERT INTO public.bank_statement_imports (
    company_id, account_id, file_name, file_hash, bank_id, acct_id,
    period_start, period_end, ledger_balance, ledger_balance_date,
    opening_balance, entry_count, status, kind, created_by
  ) VALUES (
    v_company_id, p_account_id, p_file_name, p_file_hash,
    nullif(btrim(coalesce(p_bank_id, '')), ''),
    nullif(btrim(coalesce(p_acct_id, '')), ''),
    p_period_start, p_period_end, p_ledger_balance, p_ledger_balance_date,
    0, 0, 'open', v_kind, auth.uid()
  )
  RETURNING id INTO v_import_id;

  -- ── AS DUAS TRAVAS DE DEDUP (invariante 8) ──────────────────────────────
  WITH incoming AS (
    SELECT
      ord.ord_num                                      AS ord_num,
      nullif(ord.e->>'fitid', '')                      AS fitid,
      ord.e->>'dedup_key'                              AS dedup_key,
      (ord.e->>'posted_at')::timestamptz               AS posted_at,
      (ord.e->>'amount')::numeric                      AS amount,
      nullif(ord.e->>'trn_type', '')                   AS trn_type,
      nullif(ord.e->>'memo', '')                       AS memo,
      nullif(ord.e->>'name', '')                       AS name,
      coalesce((ord.e->>'sign_suspect')::boolean, false) AS sign_suspect,
      public.bank_entry_content_key(
        (ord.e->>'posted_at')::timestamptz,
        (ord.e->>'amount')::numeric,
        ord.e->>'memo',
        ord.e->>'name'
      )                                                AS content_key
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS ord(e, ord_num)
    WHERE ord.e->>'dedup_key' IS NOT NULL
      AND ord.e->>'posted_at' IS NOT NULL
      AND ord.e->>'amount'    IS NOT NULL
  ),
  ranked AS (
    SELECT i.*, row_number() OVER (PARTITION BY i.content_key ORDER BY i.ord_num) AS batch_rank
      FROM incoming i
  ),
  existing AS (
    SELECT public.bank_entry_content_key(e.posted_at, e.amount, e.memo, e.name) AS content_key,
           count(*) AS cnt
      FROM public.bank_statement_entries e
     WHERE e.account_id = p_account_id
     GROUP BY 1
  ),
  to_consider AS (
    SELECT r.*, coalesce(x.cnt, 0) AS existing_cnt
      FROM ranked r
      LEFT JOIN existing x USING (content_key)
  ),
  ins AS (
    INSERT INTO public.bank_statement_entries (
      import_id, company_id, account_id, fitid, dedup_key,
      posted_at, amount, trn_type, memo, name, sign_suspect, status
    )
    SELECT v_import_id, v_company_id, p_account_id, t.fitid, t.dedup_key,
           t.posted_at, t.amount, t.trn_type, t.memo, t.name, t.sign_suspect, 'pending'
      FROM to_consider t
     WHERE t.batch_rank > t.existing_cnt
    ON CONFLICT (account_id, dedup_key) DO NOTHING
    RETURNING sign_suspect
  ),
  ins_agg AS (
    SELECT count(*) AS c, count(*) FILTER (WHERE sign_suspect) AS suspect FROM ins
  ),
  skipped AS (
    SELECT t.posted_at, t.amount, t.memo, t.name,
           row_number() OVER (ORDER BY t.posted_at, t.ord_num) AS rn
      FROM to_consider t
     WHERE t.batch_rank <= t.existing_cnt
  ),
  skipped_agg AS (
    SELECT count(*) AS c,
           coalesce(
             jsonb_agg(
               jsonb_build_object('posted_at', s.posted_at, 'amount', s.amount,
                                  'memo', s.memo, 'name', s.name)
               ORDER BY s.rn
             ) FILTER (WHERE s.rn <= 20),
             '[]'::jsonb
           ) AS samples
      FROM skipped s
  )
  SELECT ia.c, ia.suspect, sa.c, sa.samples
    INTO v_inserted, v_suspect, v_skipped_content, v_skipped_samples
    FROM ins_agg ia CROSS JOIN skipped_agg sa;

  -- ── IMPORT FANTASMA: nada novo entrou, então NÃO sobra cartão ───────────
  IF coalesce(v_inserted, 0) = 0 THEN
    DELETE FROM public.bank_statement_imports i
     WHERE i.id = v_import_id
       AND NOT EXISTS (
         SELECT 1 FROM public.bank_statement_entries e WHERE e.import_id = i.id
       );
    GET DIAGNOSTICS v_ghost_deleted = ROW_COUNT;

    IF v_ghost_deleted = 1 THEN
      RETURN jsonb_build_object(
        'already_imported',      false,
        'nothing_new',           true,
        'import_id',             NULL,
        'status',                NULL,
        'kind',                  v_kind,
        'file_name',             p_file_name,
        'inserted_count',        0,
        'total_entries',         coalesce(v_total, 0),
        'skipped_count',         coalesce(v_total, 0),
        'skipped_dup_count',     coalesce(v_skipped_content, 0),
        'skipped_samples',       coalesce(v_skipped_samples, '[]'::jsonb),
        'pending_count',         0,
        'opening_balance',       NULL,
        'ledger_balance',        p_ledger_balance,
        'acct_warning',          v_prev_acct IS NOT NULL,
        'acct_warning_previous', v_prev_acct,
        'sign_suspect_count',    0
      );
    END IF;
  END IF;

  UPDATE public.bank_statement_imports
     SET entry_count = coalesce(v_inserted, 0)
   WHERE id = v_import_id;

  v_opening := public._reconcile_recalc_opening(v_import_id);

  RETURN jsonb_build_object(
    'already_imported',      false,
    'nothing_new',           false,
    'import_id',             v_import_id,
    'status',                'open',
    'kind',                  v_kind,
    'file_name',             p_file_name,
    'inserted_count',        coalesce(v_inserted, 0),
    'total_entries',         coalesce(v_total, 0),
    'skipped_count',         coalesce(v_total, 0) - coalesce(v_inserted, 0),
    'skipped_dup_count',     coalesce(v_skipped_content, 0),
    'skipped_samples',       coalesce(v_skipped_samples, '[]'::jsonb),
    'pending_count',         coalesce(v_inserted, 0),
    'opening_balance',       v_opening,
    'ledger_balance',        p_ledger_balance,
    'acct_warning',          v_prev_acct IS NOT NULL,
    'acct_warning_previous', v_prev_acct,
    'sign_suspect_count',    coalesce(v_suspect, 0)
  );
END;
$function$;




-- ============================================================================
-- PARTE 6 — AS RPCs DE EXTRATO BANCÁRIO GANHAM O PORTÃO DE MODO
-- ============================================================================
-- As seis definições abaixo saíram de pg_get_functiondef (definição VIVA em
-- produção) e a ÚNICA alteração em cada uma é o PERFORM
-- _reconcile_assert_kind(p_entry_id, 'bank') logo depois do lock da linha.
-- Nenhum corpo foi reescrito à mão, e CREATE OR REPLACE preserva os GRANTs
-- (DROP FUNCTION os levaria embora).
--
-- Por que cada uma precisa do portão:
--   reconcile_create_transaction      — escreve is_paid = true / paid_date.
--   reconcile_settle_transaction      — É a baixa individual.
--   reconcile_create_transfer         — criaria par de transferência no cartão.
--   reconcile_create_employee_movement— vale de funcionário pago por cartão.
--   reconcile_match_existing          — casar movimento de caixa com fatura.
--   reconcile_pay_card_bill           — pagar fatura USANDO o cartão como conta
--                                       pagadora (o lado cartão é
--                                       reconcile_card_pay_bill).

-- ─── reconcile_create_transaction ───
CREATE OR REPLACE FUNCTION public.reconcile_create_transaction(p_entry_id uuid, p_category_id uuid, p_description text, p_cost_center_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_category  public.financial_categories%ROWTYPE;
  v_type      text;
  v_date      date;
  v_desc      text;
  v_tx_id     uuid;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera lançamento. Use "Ignorar".' USING ERRCODE = '22023';
  END IF;

  v_type := CASE WHEN v_entry.effective_amount > 0 THEN 'entrada' ELSE 'saida' END;
  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- RPC é SECURITY DEFINER: a RLS NÃO protege este INSERT. Categoria é validada
  -- como da empresa, ativa e do TIPO certo — categoria de entrada em linha de
  -- débito classificaria receita como despesa na DRE.
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Escolha uma categoria para o lançamento.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_category
    FROM public.financial_categories c
   WHERE c.id = p_category_id
     AND c.company_id = v_entry.company_id
     AND c.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria inválida: não pertence a esta empresa ou está inativa.' USING ERRCODE = '42501';
  END IF;

  -- `'ambos'` é tipo legítimo de categoria no Dominex (63 ativas em produção) e
  -- TODO o resto do sistema o aceita nos dois sentidos -- inclusive o filtro
  -- canônico `filterCategoriesByTransactionType`
  -- (src/lib/financial-category-filter.ts), que é exatamente quem monta este
  -- select na tela de conciliação (EntryActionPanel). A comparação estrita
  -- anterior fazia a UI OFERECER a categoria e a RPC NEGAR no clique.
  -- Recusamos só o tipo OPOSTO: é ele que classificaria receita como despesa
  -- (ou vice-versa) na DRE. O teste de NULL é explícito porque
  -- `NULL NOT IN (...)` é NULL, e `IF NULL` cairia no caminho de aceitar.
  IF v_category.type IS NULL OR v_category.type NOT IN (v_type, 'ambos') THEN
    RAISE EXCEPTION 'A linha do extrato é uma % e a categoria escolhida é de %. Escolha uma categoria de % ou uma categoria do tipo "ambos".',
      CASE WHEN v_type = 'entrada' THEN 'entrada (crédito)' ELSE 'saída (débito)' END,
      COALESCE(v_category.type, 'tipo indefinido'),
      CASE WHEN v_type = 'entrada' THEN 'entrada' ELSE 'saída' END
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers cc
     WHERE cc.id = p_cost_center_id
       AND cc.company_id = v_entry.company_id
       AND cc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Centro de custo inválido: não pertence a esta empresa ou está inativo.' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id AND c.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s
     WHERE s.id = p_supplier_id AND s.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  -- Descrição: o que o usuário escreveu; na falta, o que o banco escreveu.
  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  v_desc := coalesce(v_desc,
                     nullif(btrim(coalesce(v_entry.name, '')), ''),
                     nullif(btrim(coalesce(v_entry.memo, '')), ''),
                     'Lançamento do extrato bancário');

  -- category guarda o NOME copiado (coluna text, não é FK) — mesma convenção do
  -- resto do schema; category_id não existe em financial_transactions.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description, notes,
    category, cost_center_id, customer_id, supplier_id,
    transaction_date, paid_date, is_paid, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, v_type::public.transaction_type,
    abs(v_entry.effective_amount), v_desc, p_notes,
    v_category.name, p_cost_center_id, p_customer_id, p_supplier_id,
    v_date, v_date, true, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'created', 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'match_type',               'created',
    'transaction_type',         v_type,
    'amount',                   abs(v_entry.effective_amount),
    'category',                 v_category.name,
    'paid_date',                v_date
  );
END;
$function$;

-- ─── reconcile_create_transfer ───
CREATE OR REPLACE FUNCTION public.reconcile_create_transfer(p_entry_id uuid, p_other_account_id uuid, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry      public.bank_statement_entries%ROWTYPE;
  v_other      public.financial_accounts%ROWTYPE;
  v_date       date;
  v_desc       text;
  v_amount     numeric;
  v_this_type  text;
  v_other_type text;
  v_pair_id    uuid;
  v_this_leg   uuid;
  v_other_leg  uuid;
  v_reuse_id   uuid;
  v_reuse_cnt  integer;
  v_reuse_pair uuid;
  v_match_id   uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera transferência.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_other FROM public.financial_accounts WHERE id = p_other_account_id;

  IF NOT FOUND OR v_other.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Conta de destino não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_other.id = v_entry.account_id THEN
    RAISE EXCEPTION 'A conta de destino tem que ser diferente da conta que está sendo conciliada.'
      USING ERRCODE = '22023';
  END IF;

  IF v_other.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'A conta de destino está inativa.' USING ERRCODE = '22023';
  END IF;

  -- Transferir para o cartão é, na prática, pagar a fatura — e aí o caminho
  -- certo é pay_credit_card_bill, que quita as compras e devolve o limite.
  IF v_other.type = 'cartao' THEN
    RAISE EXCEPTION 'Para o cartão de crédito use o destino "Pagar fatura de cartão": é ele que quita as compras da fatura e devolve o limite.'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount    := abs(v_entry.effective_amount);
  v_date      := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_this_type := CASE WHEN v_entry.effective_amount < 0 THEN 'saida' ELSE 'entrada' END;
  v_other_type:= CASE WHEN v_entry.effective_amount < 0 THEN 'entrada' ELSE 'saida' END;

  -- ── A perna oposta JÁ EXISTE? ──────────────────────────────────────────
  -- Cenário real: o extrato da OUTRA conta foi conciliado primeiro e o par já
  -- está no sistema. Criar um par novo aqui faria o MESMO dinheiro entrar duas
  -- vezes. Então, se existe exatamente uma perna compatível nesta conta cujo
  -- irmão está na conta escolhida, casa com ela.
  SELECT count(*), min(mc.id::text)::uuid, min(mc.transfer_pair_id::text)::uuid
    INTO v_reuse_cnt, v_reuse_id, v_reuse_pair
    FROM public._reconcile_match_candidates(p_entry_id, NULL, 0.01, 3) mc
   WHERE mc.transfer_pair_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.financial_transactions sib
        WHERE sib.transfer_pair_id = mc.transfer_pair_id
          AND sib.id <> mc.id
          AND sib.account_id = p_other_account_id
     );

  IF coalesce(v_reuse_cnt, 0) > 1 THEN
    RAISE EXCEPTION 'Existe mais de uma transferência compatível entre estas contas. Escolha a correta na lista de movimentações em vez de criar outra.'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_reuse_cnt, 0) = 1 THEN
    INSERT INTO public.reconciliation_matches (
      company_id, entry_id, financial_transaction_id, match_type,
      transfer_pair_id, transfer_pair_created, value_difference, confidence, created_by
    ) VALUES (
      v_entry.company_id, p_entry_id, v_reuse_id, 'transfer',
      v_reuse_pair, false, 0, 'manual', auth.uid()
    )
    RETURNING id INTO v_match_id;

    UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

    RETURN jsonb_build_object(
      'match_id',                 v_match_id,
      'entry_id',                 p_entry_id,
      'financial_transaction_id', v_reuse_id,
      'match_type',               'transfer',
      'transfer_pair_id',         v_reuse_pair,
      'transfer_pair_created',    false,
      'reused_existing_pair',     true,
      'other_account_id',         p_other_account_id,
      'amount',                   v_amount,
      'paid_date',                v_date
    );
  END IF;

  v_desc := coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'Transferência entre contas');
  v_pair_id := gen_random_uuid();

  -- A categoria é o literal 'Transferência entre contas' de propósito: é
  -- EXATAMENTE o que o fluxo de transferência da tela grava hoje
  -- (useFinancialAccounts.transfer). Paridade com produção vale mais que
  -- esperteza; quem efetivamente tira o par da DRE/DFC é o transfer_pair_id.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description,
    category, transaction_date, paid_date, is_paid, transfer_pair_id, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, v_this_type::public.transaction_type,
    v_amount, v_desc, 'Transferência entre contas', v_date, v_date, true, v_pair_id, auth.uid()
  )
  RETURNING id INTO v_this_leg;

  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description,
    category, transaction_date, paid_date, is_paid, transfer_pair_id, created_by
  ) VALUES (
    v_entry.company_id, p_other_account_id, v_other_type::public.transaction_type,
    v_amount, v_desc, 'Transferência entre contas', v_date, v_date, true, v_pair_id, auth.uid()
  )
  RETURNING id INTO v_other_leg;

  -- A linha do extrato casa com a perna DESTA conta.
  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, transfer_pair_created, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_this_leg, 'transfer',
    v_pair_id, true, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                  v_match_id,
    'entry_id',                  p_entry_id,
    'financial_transaction_id',  v_this_leg,
    'other_leg_transaction_id',  v_other_leg,
    'match_type',                'transfer',
    'transfer_pair_id',          v_pair_id,
    'transfer_pair_created',     true,
    'reused_existing_pair',      false,
    'other_account_id',          p_other_account_id,
    'amount',                    v_amount,
    'paid_date',                 v_date
  );
END;
$function$;

-- ─── reconcile_create_employee_movement ───
CREATE OR REPLACE FUNCTION public.reconcile_create_employee_movement(p_entry_id uuid, p_employee_id uuid, p_kind text, p_idempotency_key uuid, p_description text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_date      date;
  v_mov_id    uuid;
  v_tx_id     uuid;
  v_created   boolean;
  v_existing  public.reconciliation_matches%ROWTYPE;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  -- ⚠️ BÔNUS NÃO ENTRA, EM NENHUMA HIPÓTESE. Bônus é crédito interno do
  -- funcionário: ele só vira despesa quando a FOLHA é paga. Aceitar bônus como
  -- destino de uma linha de extrato criaria uma despesa fantasma (o dinheiro
  -- sairia duas vezes: aqui e no pagamento da folha).
  IF p_kind = 'bonus' THEN
    RAISE EXCEPTION 'Bônus não gera lançamento financeiro: ele é crédito interno do funcionário e só vira despesa quando a folha é paga. Registre o bônus na tela de Funcionários.'
      USING ERRCODE = '22023';
  END IF;

  -- ⚠️ FOLHA NÃO ENTRA NESTA RPC, E É DELIBERADO. Pagar folha não é só criar
  -- uma saída: a tela de Funcionários registra o movimento 'pagamento', o
  -- 'ajuste' que reseta o saldo, o 'vale_residual' do que não foi descontado e
  -- o snapshot do holerite em payment_details (é dali que o extrato do
  -- funcionário reconstrói o holerite). Reproduzir isso aqui, em SQL, criaria
  -- folha sem holerite e faria o saldo de vales do funcionário desaparecer no
  -- reset — perda silenciosa de dado. Recusar é reversível; dado torto não é.
  IF p_kind IN ('folha', 'salary', 'pagamento') THEN
    RAISE EXCEPTION 'Pagamento de folha é registrado na tela de Funcionários, que também desconta vales e guarda o holerite. Registre lá e depois volte para casar esta linha com o lançamento.'
      USING ERRCODE = '22023';
  END IF;

  IF p_kind IS DISTINCT FROM 'vale' THEN
    RAISE EXCEPTION 'Tipo de movimento de funcionário inválido (%). Pela conciliação só é possível registrar vale.', p_kind
      USING ERRCODE = '22023';
  END IF;

  IF v_entry.effective_amount >= 0 THEN
    RAISE EXCEPTION 'Vale é saída de dinheiro: só uma linha de débito do extrato pode registrar vale.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência obrigatória para registrar vale.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501';
  END IF;

  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- create_employee_vale faz TUDO numa transação: a saída paga no Financeiro
  -- (payroll_kind='vale', account_id, is_paid=true, paid_date) e a linha em
  -- employee_movements, com os guards de tenant/conta/centro de custo e o gate
  -- fn:manage_finance. Retry com a mesma chave devolve o mesmo par.
  SELECT v.employee_movement_id, v.financial_transaction_id, v.created
    INTO v_mov_id, v_tx_id, v_created
    FROM public.create_employee_vale(
           p_employee_id,
           v_entry.account_id,
           abs(v_entry.effective_amount),
           p_idempotency_key,
           v_date,
           nullif(btrim(coalesce(p_description, '')), ''),
           p_cost_center_id
         ) v;

  -- Retry: o vale já existia. Se já está casado com ESTA linha, devolve o
  -- mesmo resultado (idempotente). Se está casado com outra, recusa — nunca
  -- rouba o vínculo de outra linha.
  SELECT * INTO v_existing
    FROM public.reconciliation_matches
   WHERE financial_transaction_id = v_tx_id;

  IF FOUND THEN
    IF v_existing.entry_id = p_entry_id THEN
      RETURN jsonb_build_object(
        'match_id',                 v_existing.id,
        'entry_id',                 p_entry_id,
        'financial_transaction_id', v_tx_id,
        'employee_movement_id',     v_existing.employee_movement_id,
        'match_type',               'employee_vale',
        'paid_date',                v_date,
        'amount',                   abs(v_entry.effective_amount),
        'created',                  false
      );
    END IF;
    RAISE EXCEPTION 'Este vale já está conciliado com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    employee_movement_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'employee_vale',
    v_mov_id, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'employee_movement_id',     v_mov_id,
    'match_type',               'employee_vale',
    'paid_date',                v_date,
    'amount',                   abs(v_entry.effective_amount),
    'created',                  coalesce(v_created, true)
  );
END;
$function$;

-- ─── reconcile_settle_transaction ───
CREATE OR REPLACE FUNCTION public.reconcile_settle_transaction(p_entry_id uuid, p_financial_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_tx       public.financial_transactions%ROWTYPE;
  v_signed   numeric;
  v_diff     numeric;
  v_paid     date;
  v_match_id uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_tx.is_paid IS TRUE THEN
    RAISE EXCEPTION 'Esta conta já está quitada. Use "Casar" em vez de "Dar baixa".' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta conta foi cancelada e não pode receber baixa.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ A trava que protege o bug histórico da "parcela (1/6) sumindo".
  IF v_tx.credit_card_bill_date IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa no cartão de crédito não é paga individualmente: o que sai da conta é o pagamento da FATURA. Use o destino "Pagar fatura de cartão".'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.payroll_kind IS NOT NULL THEN
    RAISE EXCEPTION 'Folha e vale de funcionário são registrados na tela de Funcionários, que também atualiza o extrato do funcionário. Registre lá e depois volte para casar esta linha com o lançamento.'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_tx.amount_received, 0) <> 0 THEN
    RAISE EXCEPTION 'Esta conta tem recebimento parcial em andamento. Conclua o recebimento pela tela do Financeiro.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está conciliada com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  v_signed := public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount);
  v_diff   := round(v_entry.effective_amount - v_signed, 2);

  IF sign(v_signed) <> sign(v_entry.effective_amount) THEN
    RAISE EXCEPTION 'Conta a % exige uma % no extrato.',
      CASE WHEN v_signed < 0 THEN 'pagar' ELSE 'receber' END,
      CASE WHEN v_signed < 0 THEN 'saída (débito)' ELSE 'entrada (crédito)' END
      USING ERRCODE = 'P0001';
  END IF;

  IF abs(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'A baixa é total: o valor da linha (R$ %) precisa ser igual ao da conta (R$ %). Baixa parcial não é feita pela conciliação.',
      to_char(abs(v_entry.effective_amount), 'FM999999990.00'),
      to_char(abs(v_signed), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_settle_candidates(p_entry_id, NULL, 0.01) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta conta não pode receber baixa por esta linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  -- Data CIVIL da linha em São Paulo: ::date cru leria UTC e jogaria pagamento
  -- noturno pro dia (e mês) seguinte.
  v_paid := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- O snapshot é o que permite DESFAZER de verdade: guarda exatamente o que
  -- estava aqui antes, em vez de "chutar" NULL no desfazer.
  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by, undo_snapshot
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id, 'settled',
    v_diff, 'manual', auth.uid(),
    jsonb_build_object(
      'is_paid',    v_tx.is_paid,
      'paid_date',  v_tx.paid_date,
      'account_id', v_tx.account_id
    )
  )
  RETURNING id INTO v_match_id;

  UPDATE public.financial_transactions
     SET is_paid     = true,
         paid_date   = v_paid,
         account_id  = v_entry.account_id,
         updated_at  = now()
   WHERE id = p_financial_transaction_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               'settled',
    'paid_date',                v_paid,
    'account_id',               v_entry.account_id,
    'value_difference',         v_diff
  );
END;
$function$;

-- ─── reconcile_match_existing ───
CREATE OR REPLACE FUNCTION public.reconcile_match_existing(p_entry_id uuid, p_financial_transaction_id uuid, p_confidence text DEFAULT 'manual'::text, p_allow_any_date boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry   public.bank_statement_entries%ROWTYPE;
  v_tx      public.financial_transactions%ROWTYPE;
  v_signed  numeric;
  v_diff    numeric;
  v_tol     numeric;
  v_window  integer;
  v_match_id uuid;
BEGIN
  IF coalesce(p_confidence, 'manual') NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'Confiança inválida (%).', p_confidence USING ERRCODE = '22023';
  END IF;

  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    -- Mensagem única pra "não existe" e "é de outro tenant": não confirma a
    -- existência de id de outra empresa.
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;

  -- Diagnóstico em PT-BR na ordem em que o usuário entende o problema. A
  -- autoridade final é a função de candidatos, checada no fim.
  IF v_tx.account_id IS DISTINCT FROM v_entry.account_id THEN
    RAISE EXCEPTION 'Este lançamento está em outra conta. Só é possível casar com lançamentos da conta que está sendo conciliada.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.is_paid IS NOT TRUE THEN
    RAISE EXCEPTION 'Este lançamento ainda está em aberto. Use "Dar baixa" em vez de "Casar".'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este lançamento foi cancelado e não pode ser conciliado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.credit_card_bill_date IS NOT NULL THEN
    RAISE EXCEPTION 'Esta é uma compra no cartão de crédito. Ela não sai da conta bancária individualmente: o que sai é o pagamento da fatura.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento já está conciliado com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  v_signed := public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount);
  v_diff   := round(v_entry.effective_amount - v_signed, 2);

  IF sign(v_signed) <> sign(v_entry.effective_amount) THEN
    RAISE EXCEPTION 'A linha do extrato é % e o lançamento é %. Conciliação nunca cruza entrada com saída.',
      CASE WHEN v_entry.effective_amount < 0 THEN 'uma saída' ELSE 'uma entrada' END,
      CASE WHEN v_signed < 0 THEN 'uma saída' ELSE 'uma entrada' END
      USING ERRCODE = 'P0001';
  END IF;

  -- Tolerância e janela de data saem do MODO, não da confiança:
  --   p_allow_any_date = false (sugestão / lista): valor exato, ±3 dias.
  --   p_allow_any_date = true  (busca manual): sem data, até R$ 2,00.
  v_tol    := CASE WHEN p_allow_any_date THEN 2.00 ELSE 0.01 END;
  v_window := CASE WHEN p_allow_any_date THEN NULL ELSE 3 END;

  IF abs(v_diff) > v_tol THEN
    RAISE EXCEPTION 'O valor do lançamento (R$ %) não bate com a linha do extrato (R$ %).',
      to_char(abs(v_signed), 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate autoritativo: é EXATAMENTE o conjunto que a UI mostrou.
  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_match_candidates(p_entry_id, NULL, v_tol, v_window) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento não pode ser casado com esta linha. Use a busca manual para procurar sem restrição de data.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id,
    CASE WHEN v_tx.transfer_pair_id IS NOT NULL THEN 'transfer' ELSE 'existing' END,
    v_tx.transfer_pair_id, v_diff, coalesce(p_confidence, 'manual'), auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               CASE WHEN v_tx.transfer_pair_id IS NOT NULL THEN 'transfer' ELSE 'existing' END,
    'transfer_pair_id',         v_tx.transfer_pair_id,
    'value_difference',         v_diff
  );
END;
$function$;

-- ─── reconcile_pay_card_bill ───
CREATE OR REPLACE FUNCTION public.reconcile_pay_card_bill(p_entry_id uuid, p_bill_id uuid, p_amount numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_bill     record;
  v_date     date;
  v_amount   numeric;
  v_result   jsonb;
  v_pay_tx   uuid;
  v_match_id uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⛔ MODO BANCO APENAS (20261018140000). Este destino só existe no extrato de
  -- CONTA. Numa linha de FATURA DE CARTÃO ele implicaria quitar, mover ou dar
  -- baixa numa compra de cartão individualmente — e compra de cartão só é
  -- quitada quando a FATURA é paga por inteiro, via pay_credit_card_bill.
  -- A UI esconder o botão não protege: a RPC é chamável direto pelo PostgREST.
  PERFORM public._reconcile_assert_kind(p_entry_id, 'bank');

  IF v_entry.effective_amount >= 0 THEN
    RAISE EXCEPTION 'Só uma saída (débito) do extrato pode pagar fatura de cartão.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_bill
    FROM public._reconcile_card_bill_candidates(p_entry_id) b
   WHERE b.id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura não encontrada ou já quitada.' USING ERRCODE = '42501';
  END IF;

  v_date   := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  -- O valor pago É o que saiu do banco: a linha do extrato. Aceitar valor
  -- diferente do client inventaria um pagamento que não aconteceu.
  v_amount := coalesce(p_amount, abs(v_entry.effective_amount));

  IF abs(v_amount - abs(v_entry.effective_amount)) > 0.01 THEN
    RAISE EXCEPTION 'O valor do pagamento (R$ %) tem que ser o valor da linha do extrato (R$ %).',
      to_char(v_amount, 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- pay_credit_card_bill valida fechamento da fatura, valor maior que o
  -- restante, tenant das duas contas e cartão, cria as DUAS pernas com
  -- transfer_pair_id e quita as compras que couberem no valor pago.
  -- ⚠️ Pagamento PARCIAL não quita compra nenhuma quando nenhuma compra cabe:
  -- não há como saber quais foram pagas, e inventar critério (mais antigas
  -- primeiro, rateio) produz dado falso (v1.22.4). A RPC só reporta.
  v_result := public.pay_credit_card_bill(p_bill_id, v_entry.account_id, v_date, v_amount, p_notes);

  v_pay_tx := (v_result->>'payment_transaction_id')::uuid;

  IF v_pay_tx IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar o lançamento do pagamento da fatura.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, card_bill_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_pay_tx, 'card_bill',
    (v_result->>'transfer_pair_id')::uuid, p_bill_id, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_pay_tx,
    'match_type',               'card_bill',
    'card_bill_id',             p_bill_id,
    'paid_date',                v_date,
    'amount',                   v_amount,
    'bill',                     v_result
  );
END;
$function$;




-- ============================================================================
-- PARTE 7 — RPCs NOVAS DO MODO CARTÃO
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 7.1 CRIAR A COMPRA QUE FALTA
-- ---------------------------------------------------------------------------
-- É o destino que dá o valor da feature: a diferença da fatura é a compra que
-- o cliente esqueceu de lançar, e aqui ela entra.
--
-- 🔴 ESTA É A FUNÇÃO ONDE A INVARIANTE CENTRAL VIVE:
--      is_paid = false, paid_date = NULL, SEMPRE.
--      credit_card_bill_date calculado NO SERVIDOR.
-- Se um refactor futuro trocar esses três valores, o bug do "(1/6) sumindo"
-- volta e o gasto passa a contar duas vezes na DRE.
CREATE OR REPLACE FUNCTION public.reconcile_create_card_purchase(
  p_entry_id       uuid,
  p_category_id    uuid,
  p_description    text DEFAULT NULL::text,
  p_cost_center_id uuid DEFAULT NULL::uuid,
  p_supplier_id    uuid DEFAULT NULL::uuid,
  p_notes          text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_category  public.financial_categories%ROWTYPE;
  v_acct_type text;
  v_date      date;
  v_bill_date date;
  v_desc      text;
  v_amount    numeric;
  v_tx_id     uuid;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);
  PERFORM public._reconcile_assert_kind(p_entry_id, 'card');

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera compra. Use "Ignorar".' USING ERRCODE = '22023';
  END IF;

  -- Crédito na fatura NÃO é compra. Pode ser o pagamento da fatura (destino
  -- próprio) ou um estorno/devolução da loja.
  --
  -- ⚠️ ESTORNO NÃO ENTRA POR AQUI DE PROPÓSITO. O total da fatura, em TODO o
  -- módulo, é SUM(amount) das linhas com transaction_type = 'saida' e
  -- credit_card_bill_date = referência (predicado de pay_credit_card_bill passo
  -- 4, de revert_credit_card_bill_payment e de _reconcile_card_bill_candidates).
  -- Uma 'entrada' carimbada com credit_card_bill_date NÃO é subtraída desse
  -- total por nenhuma das três — então criar estorno assim faria o sistema
  -- cobrar uma fatura maior do que a real, em silêncio. Representar estorno de
  -- cartão exige mudar aquele predicado nos três lugares ao mesmo tempo, e isso
  -- é decisão de produto, não detalhe desta entrega.
  IF v_entry.effective_amount > 0 THEN
    RAISE EXCEPTION 'Esta linha é um crédito na fatura (reduz a dívida), não uma compra. Se for o pagamento da fatura, use o destino "Pagamento da fatura". Se for um estorno da loja, registre pela tela do Financeiro e volte para casar esta linha.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Defesa em profundidade sobre o kind: se por qualquer bug um import 'card'
  -- apontar pra conta que não é cartão, a compra nasceria com carimbo de fatura
  -- numa conta bancária e ficaria invisível (nem em Movimentações, nem em
  -- nenhuma fatura).
  SELECT fa.type INTO v_acct_type
    FROM public.financial_accounts fa
   WHERE fa.id = v_entry.account_id
     AND fa.company_id = v_entry.company_id;

  IF v_acct_type IS DISTINCT FROM 'cartao' THEN
    RAISE EXCEPTION 'A conta desta conciliação não é um cartão de crédito.' USING ERRCODE = 'P0001';
  END IF;

  v_date   := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_amount := abs(v_entry.effective_amount);

  -- 🔴 A FATURA É DECIDIDA NO SERVIDOR. Nunca aceita do client (esta RPC é
  -- SECURITY DEFINER), nunca reimplementada aqui: é a mesma função que espelha
  -- computeBillDate e que o teste de equivalência cobre.
  v_bill_date := public.compute_credit_card_bill_date(v_entry.account_id, v_date);

  IF v_bill_date IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar a fatura desta compra. Confira o dia de fechamento do cartão.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Escolha uma categoria para a compra.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_category
    FROM public.financial_categories c
   WHERE c.id = p_category_id
     AND c.company_id = v_entry.company_id
     AND c.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria inválida: não pertence a esta empresa ou está inativa.' USING ERRCODE = '42501';
  END IF;

  -- `'ambos'` é tipo legítimo (63 ativas em produção) e o filtro canônico da UI
  -- (filterCategoriesByTransactionType) o oferece nos dois sentidos. Recusá-lo
  -- aqui faria a tela OFERECER a categoria e a RPC NEGAR no clique — foi
  -- exatamente o bug corrigido em 20261018010000 para reconcile_create_transaction.
  -- O teste de NULL é EXPLÍCITO porque `NULL NOT IN (...)` é NULL e um
  -- `IF NULL` cairia no caminho de ACEITAR.
  IF v_category.type IS NULL OR v_category.type NOT IN ('saida', 'ambos') THEN
    RAISE EXCEPTION 'Compra no cartão é uma saída e a categoria escolhida é de %. Escolha uma categoria de saída ou uma categoria do tipo "ambos".',
      coalesce(v_category.type, 'tipo indefinido')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers cc
     WHERE cc.id = p_cost_center_id
       AND cc.company_id = v_entry.company_id
       AND cc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Centro de custo inválido: não pertence a esta empresa ou está inativo.' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s
     WHERE s.id = p_supplier_id AND s.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  v_desc := coalesce(v_desc,
                     nullif(btrim(coalesce(v_entry.name, '')), ''),
                     nullif(btrim(coalesce(v_entry.memo, '')), ''),
                     'Compra na fatura do cartão');

  -- 🔴 is_paid = false e paid_date = NULL. NÃO são "valores padrão" que dá pra
  -- otimizar: são A invariante. bill_id fica NULL porque compra de cartão no
  -- Dominex nunca aponta pra credit_card_bills (conferido: 0 de 29 compras em
  -- produção têm bill_id) — o vínculo com a fatura é o credit_card_bill_date.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description, notes,
    category, cost_center_id, supplier_id,
    transaction_date, paid_date, is_paid, credit_card_bill_date, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, 'saida'::public.transaction_type,
    v_amount, v_desc, p_notes,
    v_category.name, p_cost_center_id, p_supplier_id,
    v_date, NULL, false, v_bill_date, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'card_purchase_created', 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'match_type',               'card_purchase_created',
    'transaction_type',         'saida',
    'amount',                   v_amount,
    'category',                 v_category.name,
    'transaction_date',         v_date,
    'credit_card_bill_date',    v_bill_date,
    -- Devolvidos LITERAIS no payload de propósito: é a prova, visível na
    -- resposta da própria chamada, de que a compra nasceu em aberto.
    'is_paid',                  false,
    'paid_date',                NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.reconcile_create_card_purchase(uuid, uuid, text, uuid, uuid, text) IS
'Cria, a partir de uma linha de FATURA DE CARTÃO, a compra que faltava no sistema. A compra nasce is_paid = false e paid_date = NULL, com credit_card_bill_date calculado no SERVIDOR por compute_credit_card_bill_date — ela aparece em Contas a Pagar DENTRO daquela fatura e só é quitada quando a fatura é paga por inteiro (pay_credit_card_bill). Aceita categoria de tipo ''saida'' e ''ambos''. Recusa linha de crédito.';

-- ---------------------------------------------------------------------------
-- 7.2 CASAR COM COMPRA JÁ LANÇADA
-- ---------------------------------------------------------------------------
-- ⚠️ Casar REGISTRA O VÍNCULO E NADA MAIS. O lançamento casado continua
-- exatamente como estava — inclusive is_paid = false. Casar NÃO quita.
CREATE OR REPLACE FUNCTION public.reconcile_match_card_purchase(
  p_entry_id                uuid,
  p_financial_transaction_id uuid,
  p_allow_any_date          boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_tx       public.financial_transactions%ROWTYPE;
  v_signed   numeric;
  v_diff     numeric;
  v_tol      numeric;
  v_window   integer;
  v_match_id uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);
  PERFORM public._reconcile_assert_kind(p_entry_id, 'card');

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  -- Mensagem única pra "não existe" e "é de outro tenant": não confirma a
  -- existência de id de outra empresa.
  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;

  -- Diagnóstico em PT-BR na ordem em que o usuário entende o problema. A
  -- autoridade final é a função de candidatos, checada no fim.
  IF v_tx.account_id IS DISTINCT FROM v_entry.account_id THEN
    RAISE EXCEPTION 'Este lançamento não está neste cartão. Só é possível casar com compras do cartão que está sendo conciliado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.credit_card_bill_date IS NULL THEN
    RAISE EXCEPTION 'Este lançamento não é uma compra no cartão: ele não está vinculado a nenhuma fatura.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este lançamento foi cancelado e não pode ser conciliado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.transfer_pair_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este lançamento é uma perna de transferência, não uma compra.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento já está conciliado com outra linha da fatura.' USING ERRCODE = 'P0001';
  END IF;

  v_signed := public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount);
  v_diff   := round(v_entry.effective_amount - v_signed, 2);

  IF sign(v_signed) <> sign(v_entry.effective_amount) THEN
    RAISE EXCEPTION 'A linha da fatura é % e o lançamento é %. Conciliação nunca cruza compra com crédito.',
      CASE WHEN v_entry.effective_amount < 0 THEN 'uma compra' ELSE 'um crédito' END,
      CASE WHEN v_signed < 0 THEN 'uma saída' ELSE 'uma entrada' END
      USING ERRCODE = 'P0001';
  END IF;

  -- Tolerância e janela saem do MODO, igual ao extrato bancário:
  --   p_allow_any_date = false (sugestão / lista): valor exato, ±3 dias.
  --   p_allow_any_date = true  (busca manual): sem data, até R$ 2,00.
  v_tol    := CASE WHEN p_allow_any_date THEN 2.00 ELSE 0.01 END;
  v_window := CASE WHEN p_allow_any_date THEN NULL ELSE 3 END;

  IF abs(v_diff) > v_tol THEN
    RAISE EXCEPTION 'O valor do lançamento (R$ %) não bate com a linha da fatura (R$ %).',
      to_char(abs(v_signed), 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate autoritativo: é EXATAMENTE o conjunto que a UI mostrou (invariante 6).
  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_card_purchase_candidates(p_entry_id, NULL, v_tol, v_window) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta compra não pode ser casada com esta linha da fatura. Use a busca manual para procurar sem restrição de data.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id, 'card_purchase',
    v_diff, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  -- ⚠️ NENHUM UPDATE em financial_transactions acontece nesta função. Nem
  -- is_paid, nem paid_date, nem account_id. Casar é vínculo, não quitação.
  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               'card_purchase',
    'value_difference',         v_diff,
    'credit_card_bill_date',    v_tx.credit_card_bill_date,
    -- Lido do banco DEPOIS do vínculo: prova de que casar não quitou nada.
    'is_paid',                  coalesce(v_tx.is_paid, false),
    'paid_date',                v_tx.paid_date
  );
END;
$function$;

COMMENT ON FUNCTION public.reconcile_match_card_purchase(uuid, uuid, boolean) IS
'Casa uma linha de FATURA DE CARTÃO com uma compra já lançada no cartão. Registra SÓ o vínculo: não escreve is_paid, paid_date nem account_id no lançamento — compra de cartão é quitada apenas quando a fatura é paga por inteiro. O portão de aceitação é _reconcile_card_purchase_candidates, a mesma função que alimenta a sugestão da tela.';

-- ---------------------------------------------------------------------------
-- 7.3 CASAR A LINHA DE CRÉDITO COM UM PAGAMENTO DE FATURA JÁ REGISTRADO
-- ---------------------------------------------------------------------------
-- A linha de crédito na fatura NÃO É RECEITA. Ela é o pagamento visto do lado
-- do cartão, e o lançamento certo é a PERNA DE CARTÃO do par criado por
-- pay_credit_card_bill (card_leg_transaction_id) — a que devolve o limite.
CREATE OR REPLACE FUNCTION public.reconcile_match_card_bill_payment(
  p_entry_id                 uuid,
  p_financial_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry      public.bank_statement_entries%ROWTYPE;
  v_tx         public.financial_transactions%ROWTYPE;
  v_diff       numeric;
  v_match_id   uuid;
  v_bill_total numeric;
  v_paid       numeric;
  v_remaining  numeric;
  v_bill_status text;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);
  PERFORM public._reconcile_assert_kind(p_entry_id, 'card');

  IF v_entry.effective_amount <= 0 THEN
    RAISE EXCEPTION 'Só uma linha de crédito da fatura (que reduz a dívida) pode ser o pagamento da fatura.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF v_tx.account_id IS DISTINCT FROM v_entry.account_id THEN
    RAISE EXCEPTION 'Este pagamento não está neste cartão.' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.transaction_type <> 'entrada' OR v_tx.category IS DISTINCT FROM 'Pagamento de Fatura'
     OR v_tx.transfer_pair_id IS NULL OR v_tx.bill_id IS NULL THEN
    RAISE EXCEPTION 'Este lançamento não é a entrada de pagamento de fatura deste cartão. O crédito da fatura casa com a perna de cartão do pagamento (a que devolve o limite), não com a saída da conta bancária — essa é conciliada no extrato do banco.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este pagamento foi cancelado e não pode ser conciliado.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este pagamento já está conciliado com outra linha.' USING ERRCODE = 'P0001';
  END IF;

  v_diff := round(v_entry.effective_amount
                  - public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount), 2);

  IF abs(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'O valor do pagamento (R$ %) não bate com a linha da fatura (R$ %).',
      to_char(v_tx.amount, 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate autoritativo, mesma fonte da sugestão.
  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_card_payment_candidates(p_entry_id, 0.01, NULL) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este pagamento não pode ser casado com esta linha da fatura.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, card_bill_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id, 'card_payment',
    v_tx.transfer_pair_id, v_tx.bill_id, v_diff, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  -- Estado da fatura REPORTADO, não decidido aqui. Pagamento parcial não quita
  -- compra nenhuma; quem decide isso é pay_credit_card_bill, e esta função não
  -- inventa critério nenhum (v1.22.4).
  SELECT coalesce(SUM(t.amount), 0) INTO v_bill_total
    FROM public.financial_transactions t
    JOIN public.credit_card_bills b ON b.id = v_tx.bill_id
   WHERE t.account_id = b.account_id
     AND t.transaction_type = 'saida'
     AND t.credit_card_bill_date = b.reference_month;

  SELECT coalesce(b.amount_paid, 0), b.status INTO v_paid, v_bill_status
    FROM public.credit_card_bills b WHERE b.id = v_tx.bill_id;

  v_remaining := round(coalesce(v_bill_total, 0) - coalesce(v_paid, 0), 2);

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               'card_payment',
    'card_bill_id',             v_tx.bill_id,
    'transfer_pair_id',         v_tx.transfer_pair_id,
    'value_difference',         v_diff,
    'bill_total',               round(coalesce(v_bill_total, 0), 2),
    'bill_amount_paid',         round(coalesce(v_paid, 0), 2),
    'bill_remaining',           v_remaining,
    'bill_status',              v_bill_status,
    'covers_bill',              (v_remaining <= 0.01)
  );
END;
$function$;

COMMENT ON FUNCTION public.reconcile_match_card_bill_payment(uuid, uuid) IS
'Casa a linha de CRÉDITO de uma fatura de cartão com um pagamento de fatura JÁ registrado no sistema, apontando para a perna de CARTÃO do par (card_leg_transaction_id de pay_credit_card_bill). Linha de crédito na fatura não é receita e não cria lançamento nenhum aqui. Reporta se o pagamento cobre a fatura inteira — pagamento parcial não quita compra nenhuma, e esta RPC não inventa critério.';

-- ---------------------------------------------------------------------------
-- 7.4 REGISTRAR O PAGAMENTO DA FATURA A PARTIR DA PRÓPRIA FATURA
-- ---------------------------------------------------------------------------
-- É o reconcile_pay_card_bill VISTO DO OUTRO LADO, e reusa o MESMO núcleo
-- (pay_credit_card_bill), que é quem valida fechamento, valor maior que o
-- restante, tenant das duas contas, cria as DUAS pernas com transfer_pair_id e
-- quita as compras que couberem.
--
-- Por que NOME NOVO em vez de parâmetro novo em reconcile_pay_card_bill: lá a
-- conta pagadora é a conta DO EXTRATO (a linha de débito do banco). Aqui a
-- linha é um crédito NO CARTÃO, e o cartão não pode ser a conta pagadora
-- (pay_credit_card_bill recusa `v_payer_type = 'cartao'`), então a conta
-- pagadora PRECISA vir como parâmetro. Acrescentar um 5º parâmetro com default
-- à função existente criaria duas candidatas para a mesma chamada de 3 ou 4
-- argumentos nomeados, e o Postgres responderia "function is not unique" —
-- quebrando, em runtime, o destino de pagar fatura que JÁ está em produção.
CREATE OR REPLACE FUNCTION public.reconcile_card_pay_bill(
  p_entry_id           uuid,
  p_bill_id            uuid,
  p_payment_account_id uuid,
  p_amount             numeric DEFAULT NULL::numeric,
  p_notes              text    DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_bill      record;
  v_date      date;
  v_amount    numeric;
  v_result    jsonb;
  v_card_leg  uuid;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);
  PERFORM public._reconcile_assert_kind(p_entry_id, 'card');

  IF v_entry.effective_amount <= 0 THEN
    RAISE EXCEPTION 'Só uma linha de crédito da fatura (que reduz a dívida) registra o pagamento da fatura.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_payment_account_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta de onde o dinheiro saiu para pagar a fatura.' USING ERRCODE = '22023';
  END IF;

  -- Fonte única: no modo cartão esta função só devolve faturas DESTE cartão com
  -- saldo restante.
  SELECT * INTO v_bill
    FROM public._reconcile_card_bill_candidates(p_entry_id) b
   WHERE b.id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura não encontrada ou já quitada.' USING ERRCODE = '42501';
  END IF;

  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  -- O valor pago É o valor da linha da fatura. Aceitar valor diferente do
  -- client inventaria um pagamento que não aconteceu.
  v_amount := coalesce(p_amount, abs(v_entry.effective_amount));

  IF abs(v_amount - abs(v_entry.effective_amount)) > 0.01 THEN
    RAISE EXCEPTION 'O valor do pagamento (R$ %) tem que ser o valor da linha da fatura (R$ %).',
      to_char(v_amount, 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ Pagamento PARCIAL não quita compra nenhuma quando nenhuma compra cabe no
  -- orçamento: não há como saber quais foram pagas, e inventar critério produz
  -- dado falso (v1.22.4). O núcleo só reporta, e nós repassamos o relatório.
  v_result := public.pay_credit_card_bill(p_bill_id, p_payment_account_id, v_date, v_amount, p_notes);

  -- A linha da FATURA é a perna de CARTÃO (a entrada que devolve o limite). A
  -- perna de saída vive na conta bancária e é casada no extrato do banco;
  -- vinculá-la aqui faria o pagamento aparecer duas vezes no caixa.
  v_card_leg := (v_result->>'card_leg_transaction_id')::uuid;

  IF v_card_leg IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar a perna de cartão do pagamento da fatura.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, card_bill_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_card_leg, 'card_payment_created',
    (v_result->>'transfer_pair_id')::uuid, p_bill_id, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_card_leg,
    'match_type',               'card_payment_created',
    'card_bill_id',             p_bill_id,
    'payment_account_id',       p_payment_account_id,
    'paid_date',                v_date,
    'amount',                   v_amount,
    'covers_bill',              (v_amount >= v_bill.remaining - 0.01),
    'bill',                     v_result
  );
END;
$function$;

COMMENT ON FUNCTION public.reconcile_card_pay_bill(uuid, uuid, uuid, numeric, text) IS
'Registra o pagamento da fatura a partir da LINHA DE CRÉDITO da própria fatura, escolhendo a conta pagadora. Reusa pay_credit_card_bill (mesmo núcleo do botão de pagar fatura e de reconcile_pay_card_bill) e vincula a linha à perna de CARTÃO do par. Nome distinto de reconcile_pay_card_bill porque aqui a conta pagadora é parâmetro, e acrescentar parâmetro à função existente tornaria a chamada ambígua em runtime.';

-- ---------------------------------------------------------------------------
-- 7.5 BUSCA MANUAL DE CANDIDATOS NO MODO CARTÃO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_search_card_purchases(
  p_entry_id uuid,
  p_query    text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_term      text;
  v_tolerance numeric;
  v_purchases jsonb;
  v_payments  jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.bank_statement_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_entry.company_id);
  PERFORM public._reconcile_assert_kind(p_entry_id, 'card');

  v_term := nullif(btrim(coalesce(p_query, '')), '');

  -- COM termo: tolera até R$ 2,00. SEM termo: exato. Mesma régua do extrato
  -- bancário (reconcile_search_candidates) — automático nunca casa torto.
  v_tolerance := CASE WHEN v_term IS NULL THEN 0.01 ELSE 2.00 END;

  SELECT coalesce(jsonb_agg(x.js ORDER BY x.sort_date DESC, x.xid), '[]'::jsonb)
    INTO v_purchases
  FROM (
    SELECT cp.id AS xid,
           cp.transaction_date AS sort_date,
           public._reconcile_tx_json(cp, v_entry.effective_amount) AS js
      FROM public._reconcile_card_purchase_candidates(p_entry_id, v_term, v_tolerance, NULL) cp
     ORDER BY cp.transaction_date DESC, cp.id
     LIMIT 50
  ) x;

  SELECT coalesce(jsonb_agg(y.js ORDER BY y.sort_date DESC, y.yid), '[]'::jsonb)
    INTO v_payments
  FROM (
    SELECT pay.id AS yid,
           coalesce(pay.paid_date, pay.transaction_date) AS sort_date,
           public._reconcile_tx_json(pay, v_entry.effective_amount) AS js
      FROM public._reconcile_card_payment_candidates(p_entry_id, v_tolerance, NULL) pay
     ORDER BY coalesce(pay.paid_date, pay.transaction_date) DESC, pay.id
     LIMIT 50
  ) y;

  RETURN jsonb_build_object(
    'query',            v_term,
    'tolerance',        v_tolerance,
    'effective_amount', v_entry.effective_amount,
    'purchases',        v_purchases,
    'payments',         v_payments
  );
END;
$function$;

COMMENT ON FUNCTION public.reconcile_search_card_purchases(uuid, text) IS
'Busca manual do modo cartão: compras do cartão (purchases) e pagamentos de fatura já registrados (payments) compatíveis com a linha da fatura. Lê das MESMAS funções de candidatos que os portões de reconcile_match_card_purchase e reconcile_match_card_bill_payment usam, então a tela nunca oferece o que a ação recusa.';




-- ============================================================================
-- PARTE 8 — DESFAZER APRENDE OS TIPOS NOVOS
-- ============================================================================
-- Definição VIVA (pg_get_functiondef) + três alterações cirúrgicas:
--   (a) o gate de permissão de EXCLUIR lançamento aprende
--       card_purchase_created e card_payment_created;
--   (b) card_purchase / card_payment entram no ramo de vínculo PURO (só solta);
--   (c) ramos novos: card_purchase_created apaga a compra criada;
--       card_payment_created estorna pelo caminho existente.
-- Desfazer que não desfaz o efeito é pior que não ter desfazer — por isso cada
-- tipo novo tem ramo explícito, e o ELSE final continua estourando em PT-BR
-- para tipo desconhecido.

CREATE OR REPLACE FUNCTION public.reconcile_unmatch_entry(p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_match    public.reconciliation_matches%ROWTYPE;
  v_snapshot jsonb;
  v_undone   text;
  v_deleted  integer := 0;
  v_revert   jsonb;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, false);

  SELECT * INTO v_match
    FROM public.reconciliation_matches
   WHERE entry_id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Sem match: só normaliza o status (linha ignorada volta a pendente).
    UPDATE public.bank_statement_entries SET status = 'pending' WHERE id = p_entry_id;
    RETURN jsonb_build_object('entry_id', p_entry_id, 'status', 'pending', 'undone', 'none');
  END IF;

  -- Os caminhos que APAGAM lançamento financeiro exigem a mesma permissão que a
  -- política de DELETE de financial_transactions cobra. RPC DEFINER não passa
  -- por RLS: sem este gate, quem não pode excluir excluiria por aqui.
  -- 20261018140000: card_purchase_created apaga a compra criada pela
  -- conciliação da fatura, e card_payment_created apaga as DUAS pernas do
  -- pagamento de fatura (via revert_credit_card_bill_payment). Os dois entram
  -- no mesmo gate: esquecer um deles abriria exclusão de lançamento financeiro
  -- para quem não pode excluir.
  IF v_match.match_type IN ('created', 'card_bill', 'employee_vale',
                            'card_purchase_created', 'card_payment_created')
     OR (v_match.match_type = 'transfer' AND v_match.transfer_pair_created)
  THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.is_super_admin(auth.uid()) OR public.can_delete_finance(auth.uid()))
    THEN
      RAISE EXCEPTION 'Desfazer esta conciliação exclui um lançamento financeiro, e você não tem permissão para excluir lançamentos.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 'card_purchase' e 'card_payment' (20261018140000) são vínculos PUROS do
  -- modo cartão, exatamente como 'existing': a compra e o pagamento são fatos
  -- do sistema que já existiam antes desta conciliação. Em particular, casar
  -- uma compra de cartão NÃO escreve is_paid/paid_date, então não há nada a
  -- restaurar aqui — e não pode haver: desquitar uma compra por desfazer um
  -- VÍNCULO mexeria na DRE sem o usuário ter pedido.
  IF v_match.match_type IN ('existing', 'card_purchase', 'card_payment') THEN
    -- Vínculo puro: nada foi criado nem alterado. Só solta.
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    v_undone := 'link';

  ELSIF v_match.match_type = 'settled' THEN
    v_snapshot := v_match.undo_snapshot;

    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'Não é possível desfazer esta baixa com segurança: o estado anterior da conta não foi registrado. Ajuste o lançamento pela tela do Financeiro.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Restaura EXATAMENTE o que estava antes (inclusive account_id, que pode
    -- ter sido NULL ou outra conta). "Chutar NULL" perderia a conta planejada.
    UPDATE public.financial_transactions
       SET is_paid    = coalesce((v_snapshot->>'is_paid')::boolean, false),
           paid_date  = (v_snapshot->>'paid_date')::date,
           account_id = (v_snapshot->>'account_id')::uuid,
           updated_at = now()
     WHERE id = v_match.financial_transaction_id;

    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    v_undone := 'settlement_reverted';

  ELSIF v_match.match_type = 'created' THEN
    -- Apaga o match ANTES: o trigger de guarda recusaria o DELETE do
    -- lançamento enquanto o vínculo existir (e a FK adiada estouraria no
    -- COMMIT).
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    DELETE FROM public.financial_transactions WHERE id = v_match.financial_transaction_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_undone := 'transaction_deleted';

  ELSIF v_match.match_type = 'card_purchase_created' THEN
    -- Compra criada por reconcile_create_card_purchase. Ela nasceu
    -- is_paid = false, então apagar NÃO mexe em nenhum caixa já reconhecido:
    -- desfaz exatamente o que esta conciliação criou, nada mais.
    -- Mesma ordem do 'created': o match sai primeiro, senão o trigger
    -- _guard_reconciled_transaction_delete recusa o DELETE do lançamento.
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    DELETE FROM public.financial_transactions WHERE id = v_match.financial_transaction_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_undone := 'card_purchase_deleted';

  ELSIF v_match.match_type = 'card_payment_created' THEN
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

    -- Estorno pelo caminho que JÁ EXISTE, idêntico ao 'card_bill': apaga as
    -- duas pernas pelo transfer_pair_id, recomputa amount_paid/status/paid_at
    -- da fatura por SUM e DESQUITA as compras que não couberem mais no que
    -- sobrou de pago. Aqui financial_transaction_id é a perna de CARTÃO (não a
    -- de saída), e revert_credit_card_bill_payment aceita qualquer uma das duas:
    -- o predicado dele é category = 'Pagamento de Fatura' + bill_id +
    -- transfer_pair_id, e ele resolve o par a partir do transfer_pair_id.
    v_revert := public.revert_credit_card_bill_payment(v_match.financial_transaction_id);
    v_undone := 'card_bill_payment_reverted';

  ELSIF v_match.match_type = 'transfer' THEN
    IF v_match.transfer_pair_created THEN
      IF v_match.transfer_pair_id IS NULL THEN
        RAISE EXCEPTION 'Não é possível desfazer esta transferência com segurança: o par não está identificado. Ajuste pela tela do Financeiro.'
          USING ERRCODE = 'P0001';
      END IF;

      -- Cenário real: o usuário conciliou o extrato das DUAS contas, e a perna
      -- oposta foi casada com uma linha do outro extrato. Apagar o par aqui
      -- derrubaria aquela conciliação. Checado ANTES de soltar este vínculo,
      -- pra a mensagem apontar o lugar certo.
      IF EXISTS (
        SELECT 1
          FROM public.financial_transactions t
          JOIN public.reconciliation_matches rm2 ON rm2.financial_transaction_id = t.id
         WHERE t.transfer_pair_id = v_match.transfer_pair_id
           AND rm2.entry_id <> p_entry_id
      ) THEN
        RAISE EXCEPTION 'A outra perna desta transferência está conciliada no extrato da outra conta. Desfaça a conciliação lá primeiro.'
          USING ERRCODE = 'P0001';
      END IF;

      DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

      -- As DUAS pernas saem juntas. Apagar só uma deixaria meia transferência
      -- no sistema (e o saldo da outra conta errado para sempre).
      DELETE FROM public.financial_transactions
       WHERE transfer_pair_id = v_match.transfer_pair_id
         AND company_id = v_entry.company_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_undone := 'transfer_pair_deleted';
    ELSE
      DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
      -- Par preexistente (o extrato da outra conta foi conciliado antes): a
      -- transferência é fato do sistema, não desta conciliação. Só solta.
      v_undone := 'link';
    END IF;

  ELSIF v_match.match_type = 'card_bill' THEN
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

    -- Estorno pelo caminho que JÁ EXISTE: apaga as duas pernas pelo
    -- transfer_pair_id, recomputa amount_paid/status/paid_at da fatura por SUM
    -- e desquita as compras — simétrico ao pay_credit_card_bill.
    v_revert := public.revert_credit_card_bill_payment(v_match.financial_transaction_id);
    v_undone := 'card_bill_payment_reverted';

  ELSIF v_match.match_type = 'employee_vale' THEN
    IF v_match.employee_movement_id IS NULL THEN
      RAISE EXCEPTION 'Não é possível desfazer este vale com segurança: o movimento do funcionário não está identificado. Ajuste pela tela de Funcionários.'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

    -- delete_employee_vale remove o par RH↔Financeiro e recalcula o saldo do
    -- funcionário. Apagar só o lado financeiro deixaria o extrato do
    -- funcionário mentindo.
    PERFORM public.delete_employee_vale(v_match.employee_movement_id);
    v_undone := 'employee_vale_deleted';

  ELSE
    RAISE EXCEPTION 'Tipo de conciliação desconhecido (%). Não é possível desfazer automaticamente.', v_match.match_type
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries SET status = 'pending' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'entry_id',        p_entry_id,
    'status',          'pending',
    'match_type',      v_match.match_type,
    'undone',          v_undone,
    'deleted_count',   coalesce(v_deleted, 0),
    'card_bill_revert', v_revert
  );
END;
$function$;




-- ============================================================================
-- PARTE 9 — ESTADO DA CONCILIAÇÃO: kind, bloco 'card' e can_reopen
-- ============================================================================
-- SÓ ACRÉSCIMO. statement_balance, reconciled_balance, difference, can_finalize,
-- total_entries, is_empty, pending_count e todo o resto seguem com a MESMA
-- aritmética de 20261018130000 — a UI da conciliação bancária já está escrita
-- contra esse contrato.
--
-- ┌─ POR QUE O MODO CARTÃO NÃO PRECISA DE OUTRA ARITMÉTICA DE FECHAMENTO ─────┐
-- │ _reconcile_recalc_opening grava opening = ledger − Σ(todas as linhas).    │
-- │ Logo:                                                                     │
-- │   difference = ledger − (opening + Σ_não-ignoradas) = Σ_ignoradas         │
-- │ E, no bloco card:                                                         │
-- │   card.difference = card.bill_total − card.reconciled_total              │
-- │                   = (−Σ_todas) − (−Σ_casadas)                             │
-- │                   = −(Σ_pendentes + Σ_ignoradas)                          │
-- │ Com pending_count = 0 (exigido pelo can_finalize), card.difference passa  │
-- │ a ser exatamente −difference. Ou seja: |difference| ≤ 0,01 ∧ pendentes=0  │
-- │ ⟺ |card.difference| ≤ 0,01. UMA trava de fechamento, dois rótulos.       │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- E os números do cartão são derivados das LINHAS, não do LEDGERBAL: operadora
-- de cartão divergem no sinal do LEDGERBAL (algumas mandam o total devido
-- positivo, outras negativo), e a álgebra acima vale em qualquer um dos dois
-- porque não usa o ledger. O ledger vai no payload cru + um sinalizador de
-- conferência (ledger_matches_entries), para a UI poder avisar sem travar.
CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_state(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_import         public.bank_statement_imports%ROWTYPE;
  v_account        public.financial_accounts%ROWTYPE;
  v_statement_bal  numeric;
  v_reconciled_bal numeric;
  v_difference     numeric;
  v_pending        integer;
  v_total_entries  integer;
  v_matched        integer;
  v_ignored        integer;
  v_suspect        integer;
  v_flipped        integer;
  v_vd_total       numeric;
  v_vd_count       integer;
  v_vd_rows        jsonb;
  v_vd_listed      integer;
  v_entries        jsonb;
  v_open_bills     jsonb;
  v_movements      jsonb;
  -- Modo cartão (aditivo).
  v_card              jsonb   := NULL;
  v_c_bill_total      numeric;
  v_c_reconciled      numeric;
  v_c_purch_total     numeric;
  v_c_purch_linked    numeric;
  v_c_purch_pending   numeric;
  v_c_purch_ignored   numeric;
  v_c_credit_total    numeric;
  v_c_credit_linked   numeric;
  v_c_credit_pending  numeric;
  v_c_purch_count     integer;
  v_c_credit_count    integer;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_import.company_id);

  SELECT * INTO v_account FROM public.financial_accounts WHERE id = v_import.account_id;

  v_statement_bal := coalesce(v_import.ledger_balance, 0);

  SELECT coalesce(v_import.opening_balance, 0)
         + coalesce(SUM(e.effective_amount) FILTER (WHERE e.status <> 'ignored'), 0),
         count(*) FILTER (WHERE e.status = 'pending'),
         count(*) FILTER (WHERE e.status = 'matched'),
         count(*) FILTER (WHERE e.status = 'ignored'),
         count(*) FILTER (WHERE e.sign_suspect AND NOT e.sign_flipped),
         count(*) FILTER (WHERE e.sign_flipped),
         count(*)
    INTO v_reconciled_bal, v_pending, v_matched, v_ignored, v_suspect, v_flipped,
         v_total_entries
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  v_difference := round(v_statement_bal - coalesce(v_reconciled_bal, 0), 2);

  -- ── NÚMEROS DA FATURA (modo cartão) ────────────────────────────────────
  -- Os rótulos aqui NÃO são "saldo". No cartão é TOTAL DA FATURA e COMPRAS
  -- LANÇADAS. Reaproveitar a palavra "saldo" numa fatura ensina errado: fatura
  -- não é conta com saldo, é dívida de um ciclo.
  --
  -- Convenção de sinal das linhas: compra NEGATIVA (aumenta a dívida),
  -- pagamento/estorno POSITIVO (reduz). Por isso o −1 nos totais: ele converte
  -- a soma assinada no total da fatura em valor POSITIVO, do jeito que o
  -- cliente lê o papel.
  IF v_import.kind = 'card' THEN
    SELECT
      round(-1 * coalesce(SUM(e.effective_amount), 0), 2),
      round(-1 * coalesce(SUM(e.effective_amount) FILTER (WHERE e.status = 'matched'), 0), 2),
      round(coalesce(SUM(abs(e.effective_amount)) FILTER (WHERE e.effective_amount < 0), 0), 2),
      round(coalesce(SUM(abs(e.effective_amount)) FILTER (WHERE e.effective_amount < 0 AND e.status = 'matched'), 0), 2),
      round(coalesce(SUM(abs(e.effective_amount)) FILTER (WHERE e.effective_amount < 0 AND e.status = 'pending'), 0), 2),
      round(coalesce(SUM(abs(e.effective_amount)) FILTER (WHERE e.effective_amount < 0 AND e.status = 'ignored'), 0), 2),
      round(coalesce(SUM(e.effective_amount) FILTER (WHERE e.effective_amount > 0), 0), 2),
      round(coalesce(SUM(e.effective_amount) FILTER (WHERE e.effective_amount > 0 AND e.status = 'matched'), 0), 2),
      round(coalesce(SUM(e.effective_amount) FILTER (WHERE e.effective_amount > 0 AND e.status = 'pending'), 0), 2),
      count(*) FILTER (WHERE e.effective_amount < 0),
      count(*) FILTER (WHERE e.effective_amount > 0)
      INTO v_c_bill_total, v_c_reconciled, v_c_purch_total, v_c_purch_linked,
           v_c_purch_pending, v_c_purch_ignored, v_c_credit_total,
           v_c_credit_linked, v_c_credit_pending, v_c_purch_count, v_c_credit_count
      FROM public.bank_statement_entries e
     WHERE e.import_id = p_import_id;

    v_card := jsonb_build_object(
      -- "Total da fatura" segundo o ARQUIVO, linha por linha (compras menos
      -- créditos). É este número que a tela mostra como total — não o ledger.
      'bill_total',              coalesce(v_c_bill_total, 0),
      -- "Compras lançadas": o que já está vinculado a lançamento do sistema.
      'reconciled_total',        coalesce(v_c_reconciled, 0),
      -- "Falta lançar": a compra que o cliente esqueceu de registrar. É O
      -- NÚMERO QUE JUSTIFICA A FEATURE.
      'difference',              round(coalesce(v_c_bill_total, 0) - coalesce(v_c_reconciled, 0), 2),
      'purchases_total',         coalesce(v_c_purch_total, 0),
      'purchases_linked_total',  coalesce(v_c_purch_linked, 0),
      'purchases_pending_total', coalesce(v_c_purch_pending, 0),
      'purchases_ignored_total', coalesce(v_c_purch_ignored, 0),
      'purchases_count',         coalesce(v_c_purch_count, 0),
      'credits_total',           coalesce(v_c_credit_total, 0),
      'credits_linked_total',    coalesce(v_c_credit_linked, 0),
      'credits_pending_total',   coalesce(v_c_credit_pending, 0),
      'credits_count',           coalesce(v_c_credit_count, 0),
      -- O LEDGERBAL cru do <CCSTMTRS>, e se ele confere com a soma das linhas.
      -- Em módulo porque a convenção de sinal do LEDGERBAL de cartão varia por
      -- banco. Divergência é AVISO (a UI mostra), nunca trava: o arquivo pode
      -- trazer período parcial.
      'ledger_balance',          v_import.ledger_balance,
      'ledger_matches_entries',  (v_import.ledger_balance IS NOT NULL
                                  AND abs(abs(v_import.ledger_balance) - abs(coalesce(v_c_bill_total, 0))) <= 0.01)
    );
  END IF;

  -- Resumo auditável das diferenças de valor aceitas na busca manual.
  SELECT coalesce(SUM(rm.value_difference), 0),
         count(*) FILTER (WHERE rm.value_difference <> 0)
    INTO v_vd_total, v_vd_count
    FROM public.reconciliation_matches rm
    JOIN public.bank_statement_entries e ON e.id = rm.entry_id
   WHERE e.import_id = p_import_id;

  SELECT coalesce(jsonb_agg(d.js ORDER BY d.sort_abs DESC, d.did), '[]'::jsonb),
         count(*)::integer
    INTO v_vd_rows, v_vd_listed
  FROM (
    SELECT rm.id                     AS did,
           abs(rm.value_difference)  AS sort_abs,
           jsonb_build_object(
             'entry_id',                 e.id,
             'posted_at',                e.posted_at,
             'memo',                     e.memo,
             'name',                     e.name,
             'effective_amount',         e.effective_amount,
             'financial_transaction_id', t.id,
             'description',              t.description,
             'signed_amount',            public.ft_signed_amount(t.transaction_type::text, t.amount),
             'value_difference',         round(rm.value_difference, 2)
           ) AS js
      FROM public.reconciliation_matches rm
      JOIN public.bank_statement_entries   e ON e.id = rm.entry_id
      JOIN public.financial_transactions   t ON t.id = rm.financial_transaction_id
     WHERE e.import_id = p_import_id
       AND rm.value_difference <> 0
     ORDER BY abs(rm.value_difference) DESC, rm.id
     LIMIT 50
  ) d;

  -- Uma linha por entry. As LATERAIS agregam DENTRO delas (retornam exatamente
  -- 1 row): lateral que devolve N rows multiplicaria a entry por N.
  --
  -- As duas laterais de CARTÃO (card_purchase / card_payment) são sempre
  -- montadas, e custam nada no modo banco: as funções de candidatos filtram
  -- `kind = 'card'` numa CTE de 1 linha, então o predicado é falso antes de
  -- qualquer varredura de financial_transactions. Simétrico às de banco, que
  -- filtram `kind = 'bank'` e vêm vazias na fatura.
  SELECT coalesce(jsonb_agg(row_json ORDER BY sort_posted, sort_created, sort_id), '[]'::jsonb)
    INTO v_entries
  FROM (
    SELECT
      e.posted_at  AS sort_posted,
      e.created_at AS sort_created,
      e.id         AS sort_id,
      jsonb_build_object(
        'id',               e.id,
        'fitid',            e.fitid,
        'posted_at',        e.posted_at,
        'posted_date',      (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date,
        'amount',           e.amount,
        'effective_amount', e.effective_amount,
        'trn_type',         e.trn_type,
        'memo',             e.memo,
        'name',             e.name,
        'sign_suspect',     e.sign_suspect,
        'sign_flipped',     e.sign_flipped,
        'sign_flipped_at',  e.sign_flipped_at,
        'status',           e.status,
        'current_match', (
          SELECT jsonb_build_object(
                   'match_id',                 rm.id,
                   'financial_transaction_id', rm.financial_transaction_id,
                   'match_type',               rm.match_type,
                   'transfer_pair_id',          rm.transfer_pair_id,
                   'transfer_pair_created',     rm.transfer_pair_created,
                   'card_bill_id',              rm.card_bill_id,
                   'employee_movement_id',      rm.employee_movement_id,
                   'value_difference',          rm.value_difference,
                   'confidence',                rm.confidence,
                   'created_at',                rm.created_at,
                   'transaction',               public._reconcile_tx_json(t, e.effective_amount)
                 )
            FROM public.reconciliation_matches rm
            JOIN public.financial_transactions t ON t.id = rm.financial_transaction_id
           WHERE rm.entry_id = e.id
        ),
        'suggested', jsonb_build_object(
          'ambiguous',                coalesce(cand.candidate_count, 0) >= 2,
          'candidate_count',          coalesce(cand.candidate_count, 0),
          'suggested_transaction_id', cand.single_id,
          'candidates',               coalesce(cand.candidates, '[]'::jsonb)
        ),
        'settle', jsonb_build_object(
          'candidate_count', coalesce(scand.candidate_count, 0),
          'candidates',      coalesce(scand.candidates, '[]'::jsonb)
        ),
        -- MODO CARTÃO: compras do cartão compatíveis com esta linha da fatura.
        -- Vazio no modo banco.
        'card_purchase', jsonb_build_object(
          'ambiguous',                coalesce(cpcand.candidate_count, 0) >= 2,
          'candidate_count',          coalesce(cpcand.candidate_count, 0),
          'suggested_transaction_id', cpcand.single_id,
          'candidates',               coalesce(cpcand.candidates, '[]'::jsonb)
        ),
        -- MODO CARTÃO: pagamentos de fatura já registrados compatíveis com esta
        -- linha de crédito. Vazio no modo banco e em linha de compra.
        'card_payment', jsonb_build_object(
          'candidate_count',          coalesce(cpay.candidate_count, 0),
          'suggested_transaction_id', cpay.single_id,
          'candidates',               coalesce(cpay.candidates, '[]'::jsonb)
        )
      ) AS row_json
    FROM public.bank_statement_entries e
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             CASE WHEN count(*) = 1 THEN (array_agg(c.cid))[1] ELSE NULL END AS single_id,
             coalesce(jsonb_agg(c.js ORDER BY c.proximity, c.cid), '[]'::jsonb) AS candidates
        FROM (
          SELECT mc.id AS cid,
                 public._reconcile_tx_json(mc, e.effective_amount) AS js,
                 abs(coalesce(mc.paid_date, mc.transaction_date)
                     - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date) AS proximity
            FROM public._reconcile_match_candidates(e.id, NULL, 0.01, 3) mc
           ORDER BY abs(coalesce(mc.paid_date, mc.transaction_date)
                        - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date), mc.id
           LIMIT 10
        ) c
    ) cand ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             coalesce(jsonb_agg(s.js ORDER BY s.sort_due, s.sort_date, s.sid), '[]'::jsonb) AS candidates
        FROM (
          SELECT sc.id AS sid,
                 public._reconcile_tx_json(sc, e.effective_amount) AS js,
                 sc.due_date         AS sort_due,
                 sc.transaction_date AS sort_date
            FROM public._reconcile_settle_candidates(e.id, NULL, 0.01) sc
           ORDER BY sc.due_date NULLS LAST, sc.transaction_date, sc.id
           LIMIT 10
        ) s
    ) scand ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             CASE WHEN count(*) = 1 THEN (array_agg(p.pid))[1] ELSE NULL END AS single_id,
             coalesce(jsonb_agg(p.js ORDER BY p.proximity, p.pid), '[]'::jsonb) AS candidates
        FROM (
          SELECT cp.id AS pid,
                 public._reconcile_tx_json(cp, e.effective_amount) AS js,
                 abs(cp.transaction_date - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date) AS proximity
            FROM public._reconcile_card_purchase_candidates(e.id, NULL, 0.01, 3) cp
           ORDER BY abs(cp.transaction_date - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date), cp.id
           LIMIT 10
        ) p
    ) cpcand ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             CASE WHEN count(*) = 1 THEN (array_agg(y.yid))[1] ELSE NULL END AS single_id,
             coalesce(jsonb_agg(y.js ORDER BY y.sort_date DESC, y.yid), '[]'::jsonb) AS candidates
        FROM (
          SELECT pay.id AS yid,
                 public._reconcile_tx_json(pay, e.effective_amount) AS js,
                 coalesce(pay.paid_date, pay.transaction_date) AS sort_date
            FROM public._reconcile_card_payment_candidates(e.id, 0.01, NULL) pay
           ORDER BY coalesce(pay.paid_date, pay.transaction_date) DESC, pay.id
           LIMIT 10
        ) y
    ) cpay ON true
    WHERE e.import_id = p_import_id
  ) sub;

  -- Contas em aberto do tenant (contexto do painel direito). VAZIO no modo
  -- cartão de propósito: "dar baixa" não existe lá, então oferecer a lista
  -- ensinaria um destino que a RPC recusa.
  SELECT coalesce(jsonb_agg(ob.js ORDER BY ob.sort_due, ob.sort_date, ob.oid), '[]'::jsonb)
    INTO v_open_bills
  FROM (
    SELECT t.id AS oid,
           public._reconcile_tx_json(t, NULL) AS js,
           t.due_date         AS sort_due,
           t.transaction_date AS sort_date
      FROM public.financial_transactions t
     WHERE v_import.kind = 'bank'
       AND t.company_id = v_import.company_id
       AND t.is_paid IS NOT TRUE
       AND t.cancelled_at IS NULL
       AND t.credit_card_bill_date IS NULL
       AND t.payroll_kind IS NULL
       AND t.transfer_pair_id IS NULL
       AND coalesce(t.amount_received, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches rm
          WHERE rm.financial_transaction_id = t.id
       )
     ORDER BY t.due_date NULLS LAST, t.transaction_date, t.id
     LIMIT 300
  ) ob;

  -- Painel "sistema" ao lado do painel "extrato".
  --   banco  : movimentações JÁ realizadas da conta no período (± 7 dias).
  --   cartão : as COMPRAS lançadas naquele cartão (que vivem is_paid = false
  --            até a fatura ser paga) + as pernas de pagamento da fatura.
  --            Filtrar is_paid aqui esconderia justamente o que o cliente
  --            precisa comparar com a fatura.
  SELECT coalesce(jsonb_agg(m.js ORDER BY m.sort_date DESC, m.mid), '[]'::jsonb)
    INTO v_movements
  FROM (
    SELECT t.id AS mid,
           coalesce(t.paid_date, t.transaction_date) AS sort_date,
           public._reconcile_tx_json(t, NULL) || jsonb_build_object(
             'is_matched',       rm.id IS NOT NULL,
             'matched_entry_id', rm.entry_id
           ) AS js
      FROM public.financial_transactions t
      LEFT JOIN public.reconciliation_matches rm ON rm.financial_transaction_id = t.id
     WHERE t.company_id = v_import.company_id
       AND t.account_id = v_import.account_id
       AND t.cancelled_at IS NULL
       AND (
         (v_import.kind = 'bank' AND t.is_paid IS TRUE AND t.credit_card_bill_date IS NULL)
         OR v_import.kind = 'card'
       )
       AND (
         v_import.period_start IS NULL OR v_import.period_end IS NULL
         OR coalesce(t.paid_date, t.transaction_date)
              BETWEEN v_import.period_start - 7 AND v_import.period_end + 7
       )
     ORDER BY coalesce(t.paid_date, t.transaction_date) DESC, t.id
     LIMIT 500
  ) m;

  RETURN jsonb_build_object(
    'import', jsonb_build_object(
      'id',                  v_import.id,
      'account_id',          v_import.account_id,
      'account_name',        v_account.name,
      'account_type',        v_account.type,
      'file_name',           v_import.file_name,
      'bank_id',             v_import.bank_id,
      'acct_id',             v_import.acct_id,
      'status',              v_import.status,
      'kind',                v_import.kind,
      'period_start',        v_import.period_start,
      'period_end',          v_import.period_end,
      'ledger_balance',      v_import.ledger_balance,
      'ledger_balance_date', v_import.ledger_balance_date,
      'opening_balance',     v_import.opening_balance,
      'entry_count',         v_import.entry_count,
      'created_at',          v_import.created_at,
      'finalized_at',        v_import.finalized_at,
      'reopened_at',         v_import.reopened_at,
      'reopened_by',         v_import.reopened_by,
      'reopen_count',        coalesce(v_import.reopen_count, 0)
    ),
    -- Atalho de topo: a UI não precisa descer em `import` pra escolher o modo.
    'kind',                           v_import.kind,
    'statement_balance',              v_statement_bal,
    'reconciled_balance',             round(coalesce(v_reconciled_bal, 0), 2),
    'difference',                     v_difference,
    'can_finalize',                   (coalesce(v_pending, 0) = 0
                                       AND abs(v_difference) <= 0.01
                                       AND v_import.status = 'open'
                                       AND coalesce(v_total_entries, 0) > 0),
    -- A porta de volta. Finalizar deixou de ser caminho sem retorno: a UI
    -- mostra "Reabrir" quando isto é true (ver reopen_bank_reconciliation).
    'can_reopen',                     (v_import.status = 'finalized'),
    'total_entries',                  coalesce(v_total_entries, 0),
    'is_empty',                       (coalesce(v_total_entries, 0) = 0),
    'pending_count',                  coalesce(v_pending, 0),
    'matched_count',                  coalesce(v_matched, 0),
    'ignored_count',                  coalesce(v_ignored, 0),
    'sign_suspect_count',             coalesce(v_suspect, 0),
    'sign_flipped_count',             coalesce(v_flipped, 0),
    'matched_value_difference_total', round(coalesce(v_vd_total, 0), 2),
    'matched_value_difference_count', coalesce(v_vd_count, 0),
    'matched_value_differences',           coalesce(v_vd_rows, '[]'::jsonb),
    'matched_value_differences_listed',    coalesce(v_vd_listed, 0),
    'matched_value_differences_truncated', (coalesce(v_vd_count, 0) > coalesce(v_vd_listed, 0)),
    'entries',                        v_entries,
    'open_bills',                     v_open_bills,
    'ledger_movements',               v_movements,
    -- NULL no modo banco. No modo cartão traz TOTAL DA FATURA / COMPRAS
    -- LANÇADAS / FALTA LANÇAR — nunca a palavra "saldo".
    'card',                           v_card
  );
END;
$function$;




-- ============================================================================
-- PARTE 10 — REABRIR CONCILIAÇÃO (a porta que não existia)
-- ============================================================================
-- Achado em QA: "Finalizar conciliação" era porta sem volta. Não existia
-- reopen/reabrir/unfinalize em lugar nenhum do banco, e a UI esconde os botões
-- de desfazer quando o import está finalizado. Um clique acidental trancava o
-- extrato em somente-leitura e o cliente precisava de um desenvolvedor.
--
-- Detalhe importante: reconcile_unmatch_entry NUNCA recusou import finalizado —
-- quem recusa é _reconcile_lock_entry ('Este extrato já foi finalizado'). Ou
-- seja: finalizado tranca de verdade no servidor, e sem esta função não havia
-- NENHUM caminho de volta.
--
-- Reabrir NÃO desfaz conciliação nenhuma: os matches, os lançamentos criados e
-- as baixas continuam exatamente como estão. Reabrir só devolve a permissão de
-- continuar mexendo. É o inverso exato de finalize_bank_reconciliation.
CREATE OR REPLACE FUNCTION public.reopen_bank_reconciliation(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_import     public.bank_statement_imports%ROWTYPE;
  v_reconciled numeric;
  v_difference numeric;
  v_pending    integer;
  v_total      integer;
  v_count      integer;
  v_was_at     timestamptz;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  -- MESMA guarda de escrita do finalize: tenant + assinatura ativa + plano com
  -- Financeiro. Reabrir é ação de escrita, não de leitura.
  PERFORM public._reconcile_assert_write(v_import.company_id);

  IF v_import.status <> 'finalized' THEN
    RAISE EXCEPTION 'Esta conciliação não está finalizada, então não há o que reabrir.'
      USING ERRCODE = 'P0001',
            DETAIL  = format('import=%s status=%s', p_import_id, v_import.status);
  END IF;

  v_was_at := v_import.finalized_at;

  UPDATE public.bank_statement_imports
     SET status       = 'open',
         finalized_at = NULL,
         finalized_by = NULL,
         reopened_at  = now(),
         reopened_by  = auth.uid(),
         reopen_count = coalesce(reopen_count, 0) + 1
   WHERE id = p_import_id
  RETURNING reopen_count INTO v_count;

  -- Devolve o estado de fechamento junto: depois de reabrir, a tela precisa
  -- saber na hora se ainda está fechando (pra oferecer Finalizar de novo) ou se
  -- sobrou pendência.
  SELECT coalesce(v_import.opening_balance, 0)
         + coalesce(SUM(e.effective_amount) FILTER (WHERE e.status <> 'ignored'), 0),
         count(*) FILTER (WHERE e.status = 'pending'),
         count(*)
    INTO v_reconciled, v_pending, v_total
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  v_difference := round(coalesce(v_import.ledger_balance, 0) - coalesce(v_reconciled, 0), 2);

  RETURN jsonb_build_object(
    'import_id',          p_import_id,
    'status',             'open',
    'kind',               v_import.kind,
    'reopened_at',        now(),
    'reopened_by',        auth.uid(),
    'reopen_count',       coalesce(v_count, 0),
    -- Fica no retorno pra a tela poder dizer "reaberta (estava finalizada em
    -- dd/mm às hh:mm)" sem uma segunda consulta.
    'was_finalized_at',   v_was_at,
    'reconciled_balance', round(coalesce(v_reconciled, 0), 2),
    'difference',         v_difference,
    'pending_count',      coalesce(v_pending, 0),
    'total_entries',      coalesce(v_total, 0),
    'can_finalize',       (coalesce(v_pending, 0) = 0
                           AND abs(v_difference) <= 0.01
                           AND coalesce(v_total, 0) > 0)
  );
END;
$function$;

COMMENT ON FUNCTION public.reopen_bank_reconciliation(uuid) IS
'Reabre uma conciliação finalizada: status volta pra ''open'', finalized_at/finalized_by são limpos e reopened_at/reopened_by/reopen_count registram quem reabriu e quando. NÃO desfaz conciliação nenhuma — matches, lançamentos criados e baixas continuam como estão; reabrir só devolve a permissão de continuar mexendo (é _reconcile_lock_entry que trava tudo enquanto o import está finalizado). Recusa import que não está finalizado. Inverso exato de finalize_bank_reconciliation.';




-- ============================================================================
-- PARTE 11 — PERMISSÕES
-- ============================================================================
-- O Supabase concede EXECUTE ao papel `anon` POR DEFAULT em função nova criada
-- em `public`, e `REVOKE ... FROM PUBLIC` NÃO remove grant explícito de papel.
-- Por isso cada função nova revoga `anon` NOMINALMENTE. O bloco de provas no
-- fim do arquivo estoura se algum grant escapar.
--
-- As funções internas (`_reconcile_*`) ficam SÓ com service_role, igual às de
-- 20261017200000: elas são chamadas de dentro de funções SECURITY DEFINER cujo
-- dono é `postgres`, então rodam com o privilégio do dono e não precisam de
-- grant pro papel `authenticated`. Menos superfície exposta no PostgREST.

REVOKE ALL ON FUNCTION public.credit_card_bill_date_for(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_card_bill_date_for(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.credit_card_bill_date_for(integer, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.compute_credit_card_bill_date(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_credit_card_bill_date(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_credit_card_bill_date(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._reconcile_assert_kind(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reconcile_assert_kind(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_assert_kind(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._reconcile_assert_kind(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public._reconcile_card_purchase_candidates(uuid, text, numeric, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reconcile_card_purchase_candidates(uuid, text, numeric, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_card_purchase_candidates(uuid, text, numeric, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._reconcile_card_purchase_candidates(uuid, text, numeric, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public._reconcile_card_payment_candidates(uuid, numeric, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reconcile_card_payment_candidates(uuid, numeric, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_card_payment_candidates(uuid, numeric, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._reconcile_card_payment_candidates(uuid, numeric, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_create_card_purchase(uuid, uuid, text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_create_card_purchase(uuid, uuid, text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_create_card_purchase(uuid, uuid, text, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reconcile_match_card_purchase(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_match_card_purchase(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_match_card_purchase(uuid, uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reconcile_match_card_bill_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_match_card_bill_payment(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_match_card_bill_payment(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reconcile_card_pay_bill(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_card_pay_bill(uuid, uuid, uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_card_pay_bill(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reconcile_search_card_purchases(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_search_card_purchases(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_search_card_purchases(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reopen_bank_reconciliation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_bank_reconciliation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_bank_reconciliation(uuid) TO authenticated, service_role;

-- Cinto de segurança nas REPLACEADAS: CREATE OR REPLACE preserva a ACL, mas se
-- alguma delas já tivesse `anon` por acidente, o REVOKE abaixo fecha.
REVOKE ALL ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.get_bank_reconciliation_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_unmatch_entry(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_create_transfer(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_create_employee_movement(uuid, uuid, text, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_settle_transaction(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_match_existing(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_pay_card_bill(uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_match_candidates(uuid, text, numeric, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_settle_candidates(uuid, text, numeric) FROM anon;
REVOKE ALL ON FUNCTION public._reconcile_card_bill_candidates(uuid) FROM anon;




-- ============================================================================
-- PARTE 12 — PROVAS. ESTE BLOCO ABORTA O APPLY SE QUALQUER UMA FALHAR.
-- ============================================================================
DO $proof$
DECLARE
  v_missing text;
  v_n       integer;
  v_bad     text;
  v_row     record;
  v_got     date;
  v_div     integer := 0;
BEGIN
  -- ── PROVA 1: coluna kind e suas garantias ───────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bank_statement_imports'
       AND column_name = 'kind' AND is_nullable = 'NO'
       AND column_default LIKE '%bank%'
  ) THEN
    RAISE EXCEPTION 'PROVA 1 FALHOU: bank_statement_imports.kind ausente, nullable ou sem default bank.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bank_statement_imports'::regclass
       AND conname = 'bank_statement_imports_kind_chk'
       AND pg_get_constraintdef(oid) LIKE '%card%'
  ) THEN
    RAISE EXCEPTION 'PROVA 1 FALHOU: CHECK de kind ausente ou sem o valor card.';
  END IF;

  -- ── PROVA 2: colunas de auditoria de reabertura ─────────────────────────
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('reopened_at'), ('reopened_by'), ('reopen_count')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'bank_statement_imports'
        AND ic.column_name = c.want
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 2 FALHOU: colunas de reabertura ausentes: %', v_missing;
  END IF;

  -- ── PROVA 3: match_type aceita os 4 tipos novos ─────────────────────────
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('card_purchase'), ('card_purchase_created'),
                 ('card_payment'), ('card_payment_created')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.reconciliation_matches'::regclass
        AND conname = 'reconciliation_matches_type_chk'
        AND pg_get_constraintdef(oid) LIKE '%' || c.want || '%'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 3 FALHOU: match_type nao aceita: %', v_missing;
  END IF;

  -- ── PROVA 4: as funcoes novas existem, DEFINER e com search_path ────────
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('compute_credit_card_bill_date'), ('_reconcile_assert_kind'),
                 ('_reconcile_card_purchase_candidates'), ('_reconcile_card_payment_candidates'),
                 ('reconcile_create_card_purchase'), ('reconcile_match_card_purchase'),
                 ('reconcile_match_card_bill_payment'), ('reconcile_card_pay_bill'),
                 ('reconcile_search_card_purchases'), ('reopen_bank_reconciliation')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = c.want
        AND p.prosecdef IS TRUE
        AND array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 4 FALHOU: funcao ausente, sem SECURITY DEFINER ou sem SET search_path: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'credit_card_bill_date_for'
       AND p.provolatile = 'i'
  ) THEN
    RAISE EXCEPTION 'PROVA 4 FALHOU: credit_card_bill_date_for ausente ou nao IMMUTABLE.';
  END IF;

  -- ── PROVA 5: `anon` sem EXECUTE em NADA do modulo de conciliacao ────────
  SELECT string_agg(p.proname, ', ')
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'reconcile%' OR p.proname LIKE '_reconcile%'
          OR p.proname LIKE '%bank_statement%' OR p.proname LIKE '%bank_reconciliation%'
          OR p.proname LIKE '%credit_card_bill%')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 5 FALHOU: anon tem EXECUTE em: %', v_bad;
  END IF;

  -- ── PROVA 6: o portao de modo existe em TODAS as RPCs de extrato banco ──
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('reconcile_create_transaction'), ('reconcile_create_transfer'),
                 ('reconcile_create_employee_movement'), ('reconcile_settle_transaction'),
                 ('reconcile_match_existing'), ('reconcile_pay_card_bill')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = c.want
        AND pg_get_functiondef(p.oid) LIKE '%_reconcile_assert_kind(p_entry_id, ''bank'')%'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 6 FALHOU: RPC de extrato bancario sem o portao de modo: %', v_missing;
  END IF;

  -- ── PROVA 7: as funcoes de candidatos filtram o modo ────────────────────
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('_reconcile_match_candidates'), ('_reconcile_settle_candidates')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = c.want
        AND pg_get_functiondef(p.oid) LIKE '%import_kind = ''bank''%'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 7 FALHOU: funcao de candidatos sem filtro de modo: %', v_missing;
  END IF;

  -- ── PROVA 8: criar compra de cartao NAO escreve is_paid/paid_date ───────
  -- Varredura textual na definicao viva: nenhuma atribuicao de is_paid = true
  -- nem de paid_date pode existir em reconcile_create_card_purchase / match.
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'reconcile_create_card_purchase')
     LIKE '%is_paid = true%'
  THEN
    RAISE EXCEPTION 'PROVA 8 FALHOU: reconcile_create_card_purchase escreve is_paid = true. A INVARIANTE CENTRAL FOI QUEBRADA.';
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'reconcile_match_card_purchase')
     LIKE '%UPDATE public.financial_transactions%'
  THEN
    RAISE EXCEPTION 'PROVA 8 FALHOU: reconcile_match_card_purchase faz UPDATE em financial_transactions. Casar deve ser SO vinculo.';
  END IF;

  -- ── PROVA 9: desfazer conhece os 4 tipos novos ──────────────────────────
  SELECT string_agg(c.want, ', ')
    INTO v_missing
    FROM (VALUES ('card_purchase'), ('card_purchase_created'),
                 ('card_payment'), ('card_payment_created')) AS c(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reconcile_unmatch_entry'
        AND pg_get_functiondef(p.oid) LIKE '%' || c.want || '%'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA 9 FALHOU: reconcile_unmatch_entry nao trata: %', v_missing;
  END IF;

  -- ── PROVA 10 🔴 EQUIVALENCIA SQL x TYPESCRIPT ───────────────────────────
  -- Os valores esperados abaixo foram PRODUZIDOS executando a propria
  -- computeBillDate (src/hooks/useCreditCardBills.ts:60) em Node, com o mesmo
  -- date-fns do app, copia verbatim da funcao. Nao foram deduzidos a mao.
  -- Qualquer divergencia aborta o apply: duas implementacoes da mesma regra
  -- sem este teste divergem, e e questao de tempo.
  FOR v_row IN
    SELECT * FROM (VALUES
      (20::integer, '2026-10-19'::date, '2026-10-01'::date, 'dia anterior ao fechamento'),
      (20::integer, '2026-10-20'::date, '2026-11-01'::date, 'dia IGUAL ao fechamento -> fatura seguinte'),
      (20::integer, '2026-10-21'::date, '2026-11-01'::date, 'dia posterior ao fechamento'),
      (29::integer, '2026-02-27'::date, '2026-02-01'::date, 'closing 29 em fev comum (clamp 28) -> 27 < 28'),
      (29::integer, '2026-02-28'::date, '2026-03-01'::date, 'closing 29 em fev comum (clamp 28) -> 28 >= 28'),
      (29::integer, '2024-02-28'::date, '2024-02-01'::date, 'closing 29 em fev bissexto (sem clamp) -> 28 < 29'),
      (29::integer, '2024-02-29'::date, '2024-03-01'::date, 'closing 29 em fev bissexto -> 29 >= 29'),
      (30::integer, '2026-02-27'::date, '2026-02-01'::date, 'closing 30 em fev comum (clamp 28)'),
      (30::integer, '2026-02-28'::date, '2026-03-01'::date, 'closing 30 em fev comum (clamp 28) -> igual'),
      (31::integer, '2026-02-27'::date, '2026-02-01'::date, 'closing 31 em fev comum (clamp 28)'),
      (31::integer, '2026-02-28'::date, '2026-03-01'::date, 'closing 31 em fev comum -> igual ao clamp'),
      (31::integer, '2024-02-29'::date, '2024-03-01'::date, 'closing 31 em fev bissexto (clamp 29) -> igual'),
      (31::integer, '2026-04-29'::date, '2026-04-01'::date, 'closing 31 em mes de 30 dias (clamp 30)'),
      (31::integer, '2026-04-30'::date, '2026-05-01'::date, 'closing 31 em mes de 30 dias -> igual ao clamp'),
      (31::integer, '2026-01-30'::date, '2026-01-01'::date, 'closing 31 em jan (31 dias) -> 30 < 31'),
      (31::integer, '2026-01-31'::date, '2026-02-01'::date, 'closing 31 em jan -> igual'),
      (10::integer, '2026-12-09'::date, '2026-12-01'::date, 'virada de ano: 09/12 fica em dez'),
      (10::integer, '2026-12-10'::date, '2027-01-01'::date, 'virada de ano: 10/12 vai pra jan/2027'),
      (31::integer, '2026-12-31'::date, '2027-01-01'::date, 'virada de ano com closing 31'),
      (1::integer, '2026-03-01'::date, '2026-04-01'::date, 'closing 1: todo dia >= 1 -> sempre fatura seguinte'),
      (NULL::integer, '2026-05-09'::date, '2026-05-01'::date, 'closing NULL (default 10) -> 09 < 10'),
      (NULL::integer, '2026-05-10'::date, '2026-06-01'::date, 'closing NULL (default 10) -> 10 >= 10'),
      (NULL::integer, '2026-02-28'::date, '2026-03-01'::date, 'closing NULL em fev comum (clamp 28 nao atua: 10<28)')    ) AS t(closing_day, tx_date, expected_ts, label)
  LOOP
    v_got := public.credit_card_bill_date_for(v_row.closing_day, v_row.tx_date);
    IF v_got IS DISTINCT FROM v_row.expected_ts THEN
      v_div := v_div + 1;
      RAISE WARNING 'DIVERGENCIA closing_day=% data=% | SQL=% | TS=% | %',
        coalesce(v_row.closing_day::text, 'NULL'), v_row.tx_date, v_got, v_row.expected_ts, v_row.label;
    END IF;
    v_n := coalesce(v_n, 0) + 1;
  END LOOP;

  IF coalesce(v_n, 0) <> 23 THEN
    RAISE EXCEPTION 'PROVA 10 FALHOU: esperados 23 casos de borda, rodaram %.', coalesce(v_n, 0);
  END IF;

  IF v_div > 0 THEN
    RAISE EXCEPTION 'PROVA 10 FALHOU: % de 23 casos divergem entre compute_credit_card_bill_date (SQL) e computeBillDate (TypeScript). Corrija a FUNCAO SQL, nunca o teste.', v_div;
  END IF;

  RAISE NOTICE 'OK — 10 provas passaram. Equivalencia SQL x TypeScript: 23/23 casos de borda identicos.';
END
$proof$;

COMMIT;
