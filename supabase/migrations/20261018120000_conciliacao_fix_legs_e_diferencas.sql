-- ============================================================================
-- Conciliação bancária — 3 correções de contrato (Dominex)
-- ============================================================================
--
-- NOTA DE TIMESTAMP (2026-10-18): o máximo remoto em
-- supabase_migrations.schema_migrations no momento de nomear este arquivo era
-- 20261018010000 (conferido via Management API, 639 versões). 20261018120000
-- estava LIVRE. Timestamp ocupado faz o `db push` responder "up to date" e
-- PULAR o arquivo pra sempre, em silêncio — por isso se confere o remoto, não
-- o `ls` local.
--
-- ⚠️ Uma sessão anterior RELATOU ter escrito este arquivo. Ele nunca existiu em
-- nenhum worktree nem em nenhum commit, e nenhum dos objetos abaixo existia em
-- produção (conferido: legs sem `is_matched`, state sem
-- `matched_value_differences`). Relatório não é prova; catálogo é.
--
-- ── O QUE MUDA ────────────────────────────────────────────────────────────
--
-- A1. `reconcile_list_transfer_legs` ESCONDIA a perna já conciliada.
--     A lista sai de `_reconcile_match_candidates`, que carrega
--     `NOT EXISTS (reconciliation_matches ...)`. Consequência em produção: uma
--     perna de transferência já casada com OUTRA linha do extrato simplesmente
--     desaparecia do painel, e o cliente concluía que o sistema perdeu a
--     transferência dele.
--
--     A correção NÃO duplica o conjunto de predicados — duplicar quebraria a
--     invariante 6 de 20261017200000 ("o filtro da UI é o do match, por
--     construção"). Em vez disso, a função ÚNICA de candidatos ganha um 5º
--     parâmetro `p_include_matched boolean DEFAULT false`, e a única linha que
--     muda no corpo é o NOT EXISTS, que passa a ser condicional.
--
--     Default `false` ⇒ TODO chamador existente continua idêntico: sugestão
--     automática (get_bank_reconciliation_state), busca manual
--     (reconcile_search_candidates), validação (reconcile_match_existing) e
--     reconcile_create_transfer seguem SEM oferecer lançamento já conciliado.
--     Só `reconcile_list_transfer_legs` passa `true`.
--
--     DECISÃO (Tech Lead, 18/10): a perna casada volta MARCADA, não removida.
--     O portão do match (`reconcile_match_existing`) NÃO é alargado — clicar
--     continua sendo recusado, com mensagem clara. A UI desabilita e explica.
--     Assim a lista e o portão passam a diferir por UMA FLAG NOMEADA
--     (`is_matched`), não por acidente. As não casadas vêm PRIMEIRO, pra as
--     casadas nunca empurrarem uma perna acionável fora do LIMIT 20.
--
--     Anti-overload: DROP da assinatura de 4 argumentos ANTES do create. Sem o
--     drop ficariam duas funções (4 e 5 args) e a chamada de 4 args viraria
--     ambígua. Conferido por pg_depend que NENHUM chamador é
--     `LANGUAGE sql ... BEGIN ATOMIC` (os 5 são plpgsql, prosqlbody IS NULL,
--     deptype='n' = 0 dependências armazenadas), então o DROP é seguro.
--     DROP FUNCTION LEVA OS GRANTS EMBORA: os REVOKE/GRANT são reaplicados.
--
-- A2. `get_bank_reconciliation_state` só devolvia a diferença SOMADA.
--     Ganha UMA chave nova no topo: `matched_value_differences` (lista, cap 50,
--     ordenada por abs(value_difference) DESC — a diferença mais material
--     primeiro), mais `matched_value_differences_listed` e
--     `matched_value_differences_truncated` pra a truncagem ser REPORTADA e não
--     silenciosa.
--
--     `matched_value_difference_total` / `_count` continuam varrendo TODOS os
--     matches do import (sem cap), pro agregado seguir honesto quando a lista
--     for truncada.
--
--     ⚠️ `reconciled_balance` e `difference` NÃO MUDAM. A diferença de valor
--     aceita na busca manual nunca entrou nessa aritmética (invariante 9: o
--     saldo conciliado segue o valor do MOVIMENTO, não o da linha) e não pode
--     entrar agora — entraria desencontrando o rodapé e travando o Finalizar.
--
--     SOMENTE ACRESCENTA: nenhum campo removido nem renomeado. O front-end da
--     conciliação já está escrito contra o contrato atual.
--
-- A3. Limpeza de grant herdada. Três funções de 20261017200000
--     (`_bank_statement_entry_immutable`,
--      `_bank_statement_entry_block_matched_delete`,
--      `_bank_statement_import_block_matched_delete`) mantinham EXECUTE pra
--     `anon`. São SECURITY INVOKER retornando `trigger`, então o PostgREST não
--     as expõe e o risco prático é ~zero — mas quebram a invariante 2 do
--     próprio cabeçalho daquela migration. Revogadas NOMINALMENTE de
--     PUBLIC, anon.
--     Achado extra desta auditoria: `_guard_reconciled_transaction_delete`,
--     da MESMA migration e da mesma natureza, estava no mesmo estado. Incluída
--     aqui pelo mesmo motivo. `authenticated` MANTÉM o grant nas quatro: o
--     privilégio de EXECUTE de função de trigger é checado no CREATE TRIGGER,
--     não a cada disparo, mas tirar de authenticated não traria benefício e
--     traria risco.
--
-- Por que REVOKE nominal de `anon` e não só de PUBLIC: o Supabase mantém
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon`, então toda função nova em `public` nasce com grant EXPLÍCITO anon=X no
-- proacl, e `REVOKE ALL ... FROM PUBLIC` não remove grant explícito de papel.
-- O bloco de prova no fim recusa o COMMIT se algum escapar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

-- ===========================================================================
-- A1a. Conjunto ÚNICO de candidatos, agora com a chave `p_include_matched`
-- ===========================================================================

DROP FUNCTION IF EXISTS public._reconcile_match_candidates(uuid, text, numeric, integer);

CREATE FUNCTION public._reconcile_match_candidates(
  p_entry_id         uuid,
  p_query            text    DEFAULT NULL,
  p_tolerance        numeric DEFAULT 0.01,
  p_date_window_days integer DEFAULT 3,
  p_include_matched  boolean DEFAULT false
)
RETURNS SETOF public.financial_transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH e AS (
    SELECT company_id, account_id, effective_amount,
           (posted_at AT TIME ZONE 'America/Sao_Paulo')::date AS posted_date
      FROM public.bank_statement_entries
     WHERE id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.customers cus ON cus.id = t.customer_id
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
    LEFT JOIN public.employees emp ON emp.id = t.employee_id
   WHERE t.company_id = e.company_id
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
     -- ÚNICA linha que mudou em relação a 20261017200000: o filtro de "já
     -- conciliado" virou condicional. Com o default (false) o conjunto é
     -- IDÊNTICO ao de antes — é o que mantém sugestão, busca manual e o portão
     -- do match sem oferecer lançamento já casado.
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
$fn$;

COMMENT ON FUNCTION public._reconcile_match_candidates(uuid, text, numeric, integer, boolean) IS
  'Conjunto ÚNICO de candidatos a match com lançamento já realizado. Mesma conta, is_paid, não cancelado, sem credit_card_bill_date, MESMO SINAL e valor dentro da tolerância; janela de data opcional. p_include_matched (default FALSE) é a única chave que alarga o conjunto: com false exclui o que já tem reconciliation_matches — e é esse o conjunto consumido pela sugestão (get_bank_reconciliation_state), pela busca manual (reconcile_search_candidates), pela validação (reconcile_match_existing) e por reconcile_create_transfer, por isso a UI nunca oferece o que o match recusa. Só reconcile_list_transfer_legs passa TRUE, pra PODER MOSTRAR a perna já casada marcada com is_matched em vez de fazê-la desaparecer do painel; o portão do match segue estreito. INTERNA: sem grant pra authenticated, porque não valida tenant (quem chama já validou).';

-- DROP FUNCTION levou os GRANTs embora. Reaplicar é obrigatório.
-- Esta é INTERNA: nem `authenticated` executa (dar grant abriria sondagem de
-- entry_id de outro tenant). Quem chama é sempre RPC DEFINER que já validou.
REVOKE ALL ON FUNCTION public._reconcile_match_candidates(uuid, text, numeric, integer, boolean)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- A1b. A lista de pernas de transferência passa a MOSTRAR a já conciliada
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_list_transfer_legs(uuid);

CREATE FUNCTION public.reconcile_list_transfer_legs(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry  public.bank_statement_entries%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.bank_statement_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_entry.company_id);

  -- Ordenação: NÃO CONCILIADAS PRIMEIRO (sort_matched = 0), depois por data
  -- desc. Sem isso uma safra de pernas antigas já casadas poderia empurrar a
  -- perna acionável pra fora do LIMIT 20 — o inverso do bug que estamos
  -- consertando.
  SELECT coalesce(jsonb_agg(z.js ORDER BY z.sort_matched, z.sort_date DESC, z.zid), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT mc.id AS zid,
           CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS sort_matched,
           coalesce(mc.paid_date, mc.transaction_date) AS sort_date,
           public._reconcile_tx_json(mc, v_entry.effective_amount)
             || jsonb_build_object(
                  'other_account_id',   sib.account_id,
                  'other_account_name', oa.name,
                  -- A flag nomeada que substitui o "desaparecer": a UI
                  -- desabilita o clique e EXPLICA, em vez de omitir a linha.
                  'is_matched',               (rm.id IS NOT NULL),
                  -- Os três matched_entry_* existem pra a UI escrever a frase
                  -- ("já conciliada com a linha de 05/10 — PIX ACME") em vez de
                  -- mostrar um uuid cru. A linha casada pode pertencer a OUTRO
                  -- import da MESMA conta, então o front não consegue sempre
                  -- achá-la em state.entries — daí matched_import_id também.
                  'matched_entry_id',         rm.entry_id,
                  'matched_entry_posted_at',  me.posted_at,
                  'matched_entry_memo',       coalesce(
                                                nullif(btrim(coalesce(me.memo, '')), ''),
                                                nullif(btrim(coalesce(me.name, '')), '')
                                              ),
                  'matched_import_id',        me.import_id,
                  'other_leg_id',             sib.id,
                  'other_leg_is_matched',     EXISTS (
                                                SELECT 1 FROM public.reconciliation_matches rm2
                                                 WHERE rm2.financial_transaction_id = sib.id
                                              )
                ) AS js
      FROM public._reconcile_match_candidates(p_entry_id, NULL, 0.01, 3, true) mc
      -- A perna irmã: mesmo transfer_pair_id, outra linha.
      JOIN public.financial_transactions sib
        ON sib.transfer_pair_id = mc.transfer_pair_id
       AND sib.id <> mc.id
      LEFT JOIN public.financial_accounts oa ON oa.id = sib.account_id
      LEFT JOIN public.reconciliation_matches rm ON rm.financial_transaction_id = mc.id
      LEFT JOIN public.bank_statement_entries me ON me.id = rm.entry_id
     WHERE mc.transfer_pair_id IS NOT NULL
     ORDER BY CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END,
              coalesce(mc.paid_date, mc.transaction_date) DESC,
              mc.id
     LIMIT 20
  ) z;

  RETURN jsonb_build_object('legs', v_result);
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_list_transfer_legs(uuid) IS
  'Pernas de transferência JÁ existentes nesta conta que casam com a linha do extrato (valor exato, ±3 dias), com o nome da conta do outro lado. Existe para o caso em que o extrato da outra conta foi conciliado primeiro: casar com a perna existente em vez de criar par duplicado, senão o mesmo dinheiro entra duas vezes. DESDE 2026-10-18 a perna JÁ CONCILIADA volta MARCADA (is_matched + matched_entry_id/_posted_at/_memo + matched_import_id), não removida — antes ela sumia do painel e o cliente concluía que o sistema havia perdido a transferência. O portão do match (reconcile_match_existing) NÃO foi alargado: clicar numa perna com is_matched=true continua sendo recusado, e a UI desabilita e explica. Lista e portão diferem agora por UMA flag nomeada, não por acidente. Não conciliadas vêm primeiro, pra as casadas não empurrarem a perna acionável fora do LIMIT 20.';

-- ===========================================================================
-- A2. Estado da conciliação: a LISTA das diferenças, não só a soma
--
-- Recriada a partir da DEFINIÇÃO VIVA (pg_get_functiondef conferido byte a byte
-- contra 20261017200000 antes de editar: corpo idêntico), mudando SÓ o que
-- ACRESCENTA. Nada removido, nada renomeado.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.get_bank_reconciliation_state(uuid);

CREATE FUNCTION public.get_bank_reconciliation_state(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import         public.bank_statement_imports%ROWTYPE;
  v_account        public.financial_accounts%ROWTYPE;
  v_statement_bal  numeric;
  v_reconciled_bal numeric;
  v_difference     numeric;
  v_pending        integer;
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
         count(*) FILTER (WHERE e.sign_flipped)
    INTO v_reconciled_bal, v_pending, v_matched, v_ignored, v_suspect, v_flipped
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  v_difference := round(v_statement_bal - coalesce(v_reconciled_bal, 0), 2);

  -- Resumo auditável das diferenças de valor aceitas na busca manual. NÃO entra
  -- na diferença do rodapé e NÃO bloqueia o Finalizar: o saldo conciliado segue
  -- o valor do MOVIMENTO, não o da linha (invariante 9).
  -- AGREGADO SEM CAP de propósito: varre TODOS os matches do import, pra o
  -- total e a contagem seguirem honestos mesmo quando a LISTA abaixo trunca.
  SELECT coalesce(SUM(rm.value_difference), 0),
         count(*) FILTER (WHERE rm.value_difference <> 0)
    INTO v_vd_total, v_vd_count
    FROM public.reconciliation_matches rm
    JOIN public.bank_statement_entries e ON e.id = rm.entry_id
   WHERE e.import_id = p_import_id;

  -- A LISTA (novidade de 2026-10-18). Antes só a soma voltava, e o cliente via
  -- "R$ 7,40 de diferença em 3 casamentos" sem nenhum caminho pra descobrir
  -- QUAIS. Cap de 50 e ordenada por abs(value_difference) DESC: a diferença
  -- mais material primeiro. A truncagem é REPORTADA (`_listed` /
  -- `_truncated`), nunca silenciosa.
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

  -- Uma linha por entry. As duas LATERAIS agregam DENTRO delas (retornam
  -- exatamente 1 row): lateral que devolve N rows multiplicaria a entry por N.
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
        -- Sugestão AUTOMÁTICA: janela de ±3 dias e valor EXATO (≤ R$ 0,01).
        -- Automático nunca casa torto — a janela de R$ 2,00 só existe na busca
        -- manual por termo. candidate_count é limitado a 10 (ver COMMENT).
        'suggested', jsonb_build_object(
          'ambiguous',                coalesce(cand.candidate_count, 0) >= 2,
          'candidate_count',          coalesce(cand.candidate_count, 0),
          'suggested_transaction_id', cand.single_id,
          'candidates',               coalesce(cand.candidates, '[]'::jsonb)
        ),
        'settle', jsonb_build_object(
          'candidate_count', coalesce(scand.candidate_count, 0),
          'candidates',      coalesce(scand.candidates, '[]'::jsonb)
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
    WHERE e.import_id = p_import_id
  ) sub;

  -- Contas em aberto do tenant (contexto do painel direito). O que é CASÁVEL
  -- com cada linha vem em entries[].settle, que usa a MESMA função do match.
  SELECT coalesce(jsonb_agg(ob.js ORDER BY ob.sort_due, ob.sort_date, ob.oid), '[]'::jsonb)
    INTO v_open_bills
  FROM (
    SELECT t.id AS oid,
           public._reconcile_tx_json(t, NULL) AS js,
           t.due_date         AS sort_due,
           t.transaction_date AS sort_date
      FROM public.financial_transactions t
     WHERE t.company_id = v_import.company_id
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

  -- Movimentações JÁ realizadas da conta no período do extrato (± 7 dias), com
  -- o selo de conciliada. É o painel "sistema" ao lado do painel "extrato".
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
       AND t.is_paid IS TRUE
       AND t.cancelled_at IS NULL
       AND t.credit_card_bill_date IS NULL
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
      'period_start',        v_import.period_start,
      'period_end',          v_import.period_end,
      'ledger_balance',      v_import.ledger_balance,
      'ledger_balance_date', v_import.ledger_balance_date,
      'opening_balance',     v_import.opening_balance,
      'entry_count',         v_import.entry_count,
      'created_at',          v_import.created_at,
      'finalized_at',        v_import.finalized_at
    ),
    'statement_balance',              v_statement_bal,
    -- ⚠️ reconciled_balance e difference seguem EXATAMENTE a aritmética de
    -- 20261017200000. A diferença de valor casada NUNCA entrou aqui e não pode
    -- entrar: ela é resumo auditável, não caixa.
    'reconciled_balance',             round(coalesce(v_reconciled_bal, 0), 2),
    'difference',                     v_difference,
    'can_finalize',                   (coalesce(v_pending, 0) = 0
                                       AND abs(v_difference) <= 0.01
                                       AND v_import.status = 'open'),
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
    'ledger_movements',               v_movements
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_bank_reconciliation_state(uuid) IS
  'Payload completo da tela de conciliação: cabeçalho do extrato, totais do rodapé (banco x conciliado x diferença + can_finalize), linhas com match atual, sugestão automática (janela de ±3 dias, valor exato) e candidatos de baixa, mais contas em aberto (até 300) e movimentações realizadas da conta no período ±7 dias (até 500). entries[].suggested.candidate_count e entries[].settle.candidate_count são limitados a 10 por linha. Sugestão e baixa saem das MESMAS funções que o match valida, por isso a UI nunca oferece o que a RPC recusa. DESDE 2026-10-18 devolve também matched_value_differences: a LISTA das diferenças de valor aceitas na busca manual (cap 50, maior |diferença| primeiro, com matched_value_differences_listed/_truncated reportando a truncagem) — antes só a soma voltava e o cliente não tinha caminho pra descobrir QUAIS casamentos divergiram. O agregado matched_value_difference_total/_count continua SEM cap. reconciled_balance e difference NÃO incluem essa diferença e nunca incluíram: o saldo conciliado segue o valor do MOVIMENTO, não o da linha (invariante 9).';

-- DROP FUNCTION levou os GRANTs embora.
REVOKE ALL ON FUNCTION public.get_bank_reconciliation_state(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_list_transfer_legs(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_list_transfer_legs(uuid)  TO authenticated, service_role;

-- ===========================================================================
-- A3. Limpeza de grant herdada de 20261017200000
--     Funções de TRIGGER (SECURITY INVOKER, RETURNS trigger). O PostgREST não
--     as expõe, então o risco prático é ~zero — mas a invariante 2 daquele
--     cabeçalho diz que `anon` não executa nada da conciliação, e consistência
--     de conjunto é o que torna auditoria possível.
-- ===========================================================================

REVOKE ALL ON FUNCTION public._bank_statement_entry_immutable()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._bank_statement_entry_block_matched_delete()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._bank_statement_import_block_matched_delete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._guard_reconciled_transaction_delete()        FROM PUBLIC, anon;

-- ===========================================================================
-- PROVA, dentro da própria transação. Se algo escapar, a migration NÃO commita
-- — vale mais que um checklist manual.
-- ===========================================================================

DO $proof$
DECLARE
  v_sig  text;
  v_src  text;
  v_n    integer;
BEGIN
  -- 1. Anti-overload: só UMA _reconcile_match_candidates, e com 5 argumentos.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_reconcile_match_candidates';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'overload de _reconcile_match_candidates: % funcoes com esse nome', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_reconcile_match_candidates'
     AND pg_get_function_identity_arguments(p.oid)
         = 'p_entry_id uuid, p_query text, p_tolerance numeric, p_date_window_days integer, p_include_matched boolean';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'assinatura de _reconcile_match_candidates nao bate com os 5 argumentos esperados';
  END IF;

  -- 2. O filtro condicional entrou no corpo.
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_reconcile_match_candidates';
  IF position('coalesce(p_include_matched, false)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'o gate de p_include_matched nao entrou no corpo de _reconcile_match_candidates';
  END IF;

  -- 3. Os 7 campos novos de legs[] existem, e a chamada passa include_matched.
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reconcile_list_transfer_legs';
  FOREACH v_sig IN ARRAY ARRAY[
    'is_matched', 'matched_entry_id', 'matched_entry_posted_at',
    'matched_entry_memo', 'matched_import_id', 'other_leg_id', 'other_leg_is_matched'
  ] LOOP
    IF position(v_sig IN v_src) = 0 THEN
      RAISE EXCEPTION 'campo % nao entrou em reconcile_list_transfer_legs', v_sig;
    END IF;
  END LOOP;
  IF position('_reconcile_match_candidates(p_entry_id, NULL, 0.01, 3, true)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'reconcile_list_transfer_legs nao passa p_include_matched=true';
  END IF;

  -- 4. matched_value_differences entrou no state, e o rodapé NAO mudou.
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_bank_reconciliation_state';
  IF position('''matched_value_differences''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'matched_value_differences nao entrou em get_bank_reconciliation_state';
  END IF;
  IF position('''matched_value_differences_truncated''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'a truncagem de matched_value_differences nao e reportada';
  END IF;
  -- Campos antigos que o front-end ja consome: nenhum pode ter sumido.
  FOREACH v_sig IN ARRAY ARRAY[
    '''statement_balance''', '''reconciled_balance''', '''difference''',
    '''can_finalize''', '''pending_count''', '''matched_count''', '''ignored_count''',
    '''sign_suspect_count''', '''sign_flipped_count''',
    '''matched_value_difference_total''', '''matched_value_difference_count''',
    '''entries''', '''open_bills''', '''ledger_movements'''
  ] LOOP
    IF position(v_sig IN v_src) = 0 THEN
      RAISE EXCEPTION 'campo % desapareceu do payload de get_bank_reconciliation_state', v_sig;
    END IF;
  END LOOP;

  -- 5. anon sem EXECUTE em TUDO o que esta migration tocou; authenticated e
  --    service_role intactos nas duas RPCs publicas.
  FOREACH v_sig IN ARRAY ARRAY[
    'public._reconcile_match_candidates(uuid, text, numeric, integer, boolean)',
    'public.reconcile_list_transfer_legs(uuid)',
    'public.get_bank_reconciliation_state(uuid)',
    'public._bank_statement_entry_immutable()',
    'public._bank_statement_entry_block_matched_delete()',
    'public._bank_statement_import_block_matched_delete()',
    'public._guard_reconciled_transaction_delete()'
  ] LOOP
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon mantem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.reconcile_list_transfer_legs(uuid)',
    'public.get_bank_reconciliation_state(uuid)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated perdeu EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role perdeu EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- A interna NAO pode ter ganhado grant de authenticated no recreate.
  IF has_function_privilege('authenticated',
       'public._reconcile_match_candidates(uuid, text, numeric, integer, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ganhou EXECUTE na interna _reconcile_match_candidates';
  END IF;

  RAISE NOTICE 'conciliacao: legs marcada (7 campos), matched_value_differences no state, anon=false em 7 funcoes';
END
$proof$;

COMMIT;
