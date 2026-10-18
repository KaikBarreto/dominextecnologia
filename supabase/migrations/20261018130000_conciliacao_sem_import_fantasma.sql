-- ============================================================================
-- Conciliação bancária: import fantasma nunca mais sobra na tela
-- 2026-10-18
--
-- POR QUÊ (defeito reproduzido no QA real, no navegador):
--   `create_bank_statement_import` cria a linha de `bank_statement_imports`
--   ANTES de inserir as entries. Quando a 2ª trava de dedup (conteúdo, caso
--   Santander que reemite FITID) descartava TODAS as linhas do arquivo, o
--   import ficava no banco com `status='open'` e `entry_count=0`. Resultado na
--   lista de extratos: dois cartões idênticos, mesmo nome de arquivo, mesmo
--   período —
--
--     "Continuar conciliação / Todas as linhas resolvidas, falta finalizar"  ← VAZIO
--     "Continuar conciliação / Faltam 3 de 3 linhas"                         ← o de verdade
--
--   O vazio CONVIDAVA a finalizar e abria uma tela sem nenhuma linha. Pior:
--   `opening_balance = ledger - 0`, logo `difference = 0` e `pending_count = 0`
--   → `can_finalize = true`. Dava pra concluir uma conciliação que não
--   conciliou nada, e isso entrava no histórico como conciliação concluída.
--
-- O QUE MUDA (só corpo de função + 1 linha de lixo de QA; nenhuma tabela,
-- coluna, índice ou policy é tocada):
--   1. create_bank_statement_import  — se nada novo entrou, APAGA o import que
--      ela mesma acabou de criar e devolve `nothing_new = true`. Nada é
--      escondido: skipped_dup_count + skipped_samples seguem no payload.
--   2. finalize_bank_reconciliation  — recusa extrato sem nenhuma linha (a
--      guarda antiga era verdadeira por vacuidade no caso degenerado).
--   3. get_bank_reconciliation_state — `can_finalize` exige total_entries > 0;
--      passa a expor `total_entries` e `is_empty`.
--   4. get_statement_imports        — passa a expor `is_empty` e `can_finalize`
--      por extrato, pra o cartão parar de dizer "tudo resolvido" pro vazio.
--
-- CONSEQUÊNCIA ACEITA (documentada no COMMENT da função): apagar o import
-- fantasma libera o `UNIQUE (company_id, account_id, file_hash)` daquele
-- arquivo. Reimportar o MESMO arquivo deixa de cair em `already_imported` e
-- volta a passar pelo dedup de conteúdo, reportando as duplicatas linha a
-- linha. Isso é MELHOR que antes: a resposta honesta ("estas N linhas já
-- constavam", com amostras) em vez de "já importado" apontando pra um
-- registro vazio.
--
-- CONTRATO: SÓ ACRESCENTA campos (`nothing_new`, `is_empty`, `total_entries`,
-- `can_finalize`). Nenhum campo existente foi removido ou renomeado — a tela
-- atual continua válida.
--
-- Idempotente: CREATE OR REPLACE (nunca DROP+CREATE — DROP FUNCTION leva os
-- GRANTs embora) + DELETE com guarda. Rodar 2x não quebra.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. create_bank_statement_import — nada novo entrou ⇒ nenhum import sobra
-- ────────────────────────────────────────────────────────────────────────────
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

  -- Conta de cartão fora: conciliar fatura linha a linha é exatamente a baixa
  -- individual de compra de cartão que a invariante 5 proíbe. O cartão entra
  -- por outro caminho (pagar a FATURA pela linha do extrato bancário).
  IF v_account.type = 'cartao' THEN
    RAISE EXCEPTION 'Não é possível importar extrato para uma conta de cartão de crédito. Importe o extrato da conta bancária e use o destino "Pagar fatura de cartão".'
      USING ERRCODE = '22023';
  END IF;

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
      -- nothing_new é sobre "o arquivo não trouxe linha nova E nenhum import
      -- foi criado". O caminho already_imported NÃO é esse caso: existe um
      -- import de verdade pra retomar, por isso false aqui.
      'nothing_new',       false,
      'import_id',         v_existing.id,
      'status',            v_existing.status,
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
    opening_balance, entry_count, status, created_by
  ) VALUES (
    v_company_id, p_account_id, p_file_name, p_file_hash,
    nullif(btrim(coalesce(p_bank_id, '')), ''),
    nullif(btrim(coalesce(p_acct_id, '')), ''),
    p_period_start, p_period_end, p_ledger_balance, p_ledger_balance_date,
    0, 0, 'open', auth.uid()
  )
  RETURNING id INTO v_import_id;

  -- ── AS DUAS TRAVAS DE DEDUP (invariante 8) ──────────────────────────────
  -- incoming  : payload com content_key + ordem de chegada.
  -- ranked    : batch_rank = qual OCORRÊNCIA daquele conteúdo é esta linha
  --             DENTRO do arquivo (preserva 2 pagamentos legitimamente iguais
  --             no mesmo dia pro mesmo fornecedor).
  -- existing  : quantas linhas daquele mesmo conteúdo JÁ existem na conta
  --             (content_key calculado on-the-fly: sem coluna nova, sem
  --             backfill; import é raro e o scan por conta é barato).
  -- Insere só o que excede o que já existe. A 1ª trava (ON CONFLICT dedup_key)
  -- fica como rede de segurança.
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
  -- Antes desta migration a linha de import criada lá acima ficava no banco
  -- com entry_count = 0 e status 'open'. Na tela isso virava um 2º cartão
  -- "Continuar conciliação / Todas as linhas resolvidas, falta finalizar",
  -- idêntico ao import de verdade (mesmo arquivo, mesmo período), que abria
  -- uma conciliação SEM NENHUMA LINHA. E como opening = ledger - 0, a
  -- diferença fechava em zero e dava pra FINALIZAR um extrato que não
  -- conciliou nada — conciliação vazia entrando no histórico como concluída.
  --
  -- Só chega aqui quem não caiu no already_imported (aquele retorna antes),
  -- ou seja: a linha de import é SEMPRE recém-criada por esta chamada. Apagar
  -- é descartar o que esta transação acabou de criar, nunca dado de cliente.
  -- O guard `NOT EXISTS` é cinto de segurança: se por qualquer motivo houver
  -- entry pendurada, o import fica e o fluxo normal segue.
  IF coalesce(v_inserted, 0) = 0 THEN
    DELETE FROM public.bank_statement_imports i
     WHERE i.id = v_import_id
       AND NOT EXISTS (
         SELECT 1 FROM public.bank_statement_entries e WHERE e.import_id = i.id
       );
    GET DIAGNOSTICS v_ghost_deleted = ROW_COUNT;

    IF v_ghost_deleted = 1 THEN
      -- Nada é escondido: skipped_dup_count + skipped_samples continuam no
      -- retorno, então a tela mostra exatamente o que foi descartado.
      RETURN jsonb_build_object(
        'already_imported',      false,
        'nothing_new',           true,
        'import_id',             NULL,
        'status',                NULL,
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

-- ──────────────────────────────────────────────────────────────────────────
-- 2. finalize_bank_reconciliation — extrato sem linha não finaliza
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_bank_reconciliation(p_import_id uuid)
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
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_write(v_import.company_id);

  IF v_import.status = 'finalized' THEN
    RAISE EXCEPTION 'Este extrato já foi finalizado.' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(v_import.opening_balance, 0)
         + coalesce(SUM(e.effective_amount) FILTER (WHERE e.status <> 'ignored'), 0),
         count(*) FILTER (WHERE e.status = 'pending'),
         count(*)
    INTO v_reconciled, v_pending, v_total
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  -- Extrato SEM NENHUMA LINHA não se finaliza. A guarda de baixo é verdadeira
  -- por vacuidade no caso degenerado (0 pendentes, e difference = ledger -
  -- (ledger - 0) = 0), então sem este bloco dava pra concluir uma conciliação
  -- que não conciliou nada — inclusive por chamada direta à RPC, sem UI.
  IF coalesce(v_total, 0) = 0 THEN
    RAISE EXCEPTION 'Este extrato não tem nenhuma linha para conciliar.'
      USING ERRCODE = 'P0001',
            DETAIL  = format('import=%s total_entries=0', p_import_id);
  END IF;

  v_difference := round(coalesce(v_import.ledger_balance, 0) - coalesce(v_reconciled, 0), 2);

  -- NUNCA criar lançamento-tampão pra forçar o zero. Se não fecha, não fecha:
  -- a diferença é informação, não obstáculo a ser contornado.
  IF coalesce(v_pending, 0) > 0 OR abs(v_difference) > 0.01 THEN
    RAISE EXCEPTION 'Conciliação incompleta: % linha(s) pendente(s) e diferença de R$ %.',
      coalesce(v_pending, 0), to_char(v_difference, 'FM999999990.00')
      USING ERRCODE = 'P0001',
            DETAIL  = format('pending=%s difference=%s', coalesce(v_pending, 0), v_difference);
  END IF;

  UPDATE public.bank_statement_imports
     SET status       = 'finalized',
         finalized_at = now(),
         finalized_by = auth.uid()
   WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'import_id',          p_import_id,
    'status',             'finalized',
    'reconciled_balance', round(coalesce(v_reconciled, 0), 2),
    'difference',         v_difference,
    'finalized_at',       now()
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. get_bank_reconciliation_state — can_finalize exige linha; expõe is_empty
-- ──────────────────────────────────────────────────────────────────────────
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
      -- entry_count é o CONTADOR gravado na linha de import; total_entries
      -- abaixo é a contagem REAL das entries. Divergência entre os dois é
      -- sintoma, por isso os dois vão no payload.
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
    -- ⚠️ total_entries > 0 é parte da trava: import sem nenhuma linha tem
    -- pending_count = 0 e difference = 0 (verdadeiro por vacuidade) e passava
    -- direto no can_finalize, oferecendo "Finalizar" numa conciliação vazia.
    'can_finalize',                   (coalesce(v_pending, 0) = 0
                                       AND abs(v_difference) <= 0.01
                                       AND v_import.status = 'open'
                                       AND coalesce(v_total_entries, 0) > 0),
    -- is_empty existe pra a UI distinguir "tudo resolvido" de "não tem nada":
    -- os dois casos dão pending_count = 0 e a tela escolhia a frase errada.
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
    'ledger_movements',               v_movements
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. get_statement_imports — expõe is_empty / can_finalize por extrato
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_statement_imports(p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result     jsonb;
BEGIN
  SELECT company_id INTO v_company_id
    FROM public.financial_accounts
   WHERE id = p_account_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_company_id);

  SELECT coalesce(jsonb_agg(row_json ORDER BY sort_open DESC, created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      CASE WHEN i.status = 'open' THEN 1 ELSE 0 END AS sort_open,
      i.created_at,
      jsonb_build_object(
        'id',              i.id,
        'account_id',      i.account_id,
        'file_name',       i.file_name,
        'bank_id',         i.bank_id,
        'acct_id',         i.acct_id,
        'period_start',    i.period_start,
        'period_end',      i.period_end,
        'created_at',      i.created_at,
        'finalized_at',    i.finalized_at,
        'status',          i.status,
        'ledger_balance',  i.ledger_balance,
        'opening_balance', i.opening_balance,
        'total_entries',   coalesce(agg.total_entries, 0),
        'pending_count',   coalesce(agg.pending_count, 0),
        'matched_count',   coalesce(agg.matched_count, 0),
        'ignored_count',   coalesce(agg.ignored_count, 0),
        'difference',      round(
                             coalesce(i.ledger_balance, 0)
                             - (coalesce(i.opening_balance, 0) + coalesce(agg.reconciled_sum, 0))
                           , 2),
        -- is_empty / can_finalize: 'total_entries = 0' e 'tudo conciliado'
        -- davam os MESMOS pending_count = 0 e difference = 0, e o cartão da
        -- lista dizia "Todas as linhas resolvidas, falta finalizar" pra um
        -- extrato sem nenhuma linha. Campos novos, nada removido.
        'is_empty',        (coalesce(agg.total_entries, 0) = 0),
        'can_finalize',    (
                             i.status = 'open'
                             AND coalesce(agg.total_entries, 0) > 0
                             AND coalesce(agg.pending_count, 0) = 0
                             AND abs(round(
                                   coalesce(i.ledger_balance, 0)
                                   - (coalesce(i.opening_balance, 0) + coalesce(agg.reconciled_sum, 0))
                                 , 2)) <= 0.01
                           )
      ) AS row_json
    FROM public.bank_statement_imports i
    LEFT JOIN LATERAL (
      SELECT count(*)                                          AS total_entries,
             count(*) FILTER (WHERE e.status = 'pending')       AS pending_count,
             count(*) FILTER (WHERE e.status = 'matched')       AS matched_count,
             count(*) FILTER (WHERE e.status = 'ignored')       AS ignored_count,
             coalesce(SUM(e.effective_amount)
                      FILTER (WHERE e.status <> 'ignored'), 0)  AS reconciled_sum
        FROM public.bank_statement_entries e
       WHERE e.import_id = i.id
    ) agg ON true
    WHERE i.account_id = p_account_id
  ) sub;

  RETURN v_result;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. COMMENTs
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) IS
'Cria o import e as linhas do extrato .OFX com as DUAS travas de dedup (UNIQUE account_id+dedup_key e conteúdo occurrence-aware via bank_entry_content_key). Reimportar o mesmo arquivo devolve already_imported=true com o import existente, sem estourar. Nada é descartado em silêncio: skipped_dup_count + skipped_samples (até 20) voltam no payload. opening_balance é derivado das linhas efetivamente inseridas. Conta de cartão é recusada. DESDE 2026-10-18: quando NENHUMA linha nova entra (todas descartadas pelo dedup de conteúdo — caso Santander que reemite FITID — ou arquivo sem linha), a função APAGA a linha de import que ela mesma acabou de criar e devolve nothing_new=true com import_id=NULL. Antes sobrava um import fantasma (status open, entry_count=0) que virava um 2º cartão "Continuar conciliação" na lista, abria uma tela sem linhas e, por ter opening = ledger - 0, aparecia como can_finalize=true — dava pra concluir conciliação vazia. CONSEQUÊNCIA ACEITA: apagar o fantasma libera o UNIQUE (company_id, account_id, file_hash) daquele arquivo, então reimportar o MESMO arquivo não cai mais em already_imported e volta a reportar as duplicatas linha a linha (resposta mais honesta que "já importado" sobre um registro vazio). nothing_new=false no caminho already_imported: ali existe import de verdade pra retomar.';

COMMENT ON FUNCTION public.finalize_bank_reconciliation(uuid) IS
'Fecha o extrato. Só aceita com ZERO linhas pendentes E diferença de no máximo R$ 0,01. Nunca oferece lançamento-tampão para forçar o zero: diferença é informação, não obstáculo. value_difference dos matches manuais NÃO entra nesta conta. DESDE 2026-10-18 recusa extrato SEM NENHUMA LINHA ("Este extrato não tem nenhuma linha para conciliar."): no caso degenerado pending_count=0 e difference = ledger - (ledger - 0) = 0, então a guarda de pendentes/diferença era verdadeira por vacuidade e finalizar o vazio passava — inclusive por chamada direta à RPC, sem UI.';

COMMENT ON FUNCTION public.get_bank_reconciliation_state(uuid) IS
'Payload completo da tela de conciliação: cabeçalho do extrato, totais do rodapé (banco x conciliado x diferença + can_finalize), linhas com match atual, sugestão automática (janela de ±3 dias, valor exato) e candidatos de baixa, mais contas em aberto (até 300) e movimentações realizadas da conta no período ±7 dias (até 500). entries[].suggested.candidate_count e entries[].settle.candidate_count são limitados a 10 por linha. Sugestão e baixa saem das MESMAS funções que o match valida, por isso a UI nunca oferece o que a RPC recusa. DESDE 2026-10-18 devolve também matched_value_differences: a LISTA das diferenças de valor aceitas na busca manual (cap 50, maior |diferença| primeiro, com matched_value_differences_listed/_truncated reportando a truncagem) — antes só a soma voltava e o cliente não tinha caminho pra descobrir QUAIS casamentos divergiram. O agregado matched_value_difference_total/_count continua SEM cap. reconciled_balance e difference NÃO incluem essa diferença e nunca incluíram: o saldo conciliado segue o valor do MOVIMENTO, não o da linha (invariante 9). TAMBÉM DESDE 2026-10-18: can_finalize exige total_entries > 0 (extrato sem linha tinha pending_count=0 e difference=0 por vacuidade e oferecia Finalizar numa conciliação vazia) e o payload passa a trazer total_entries (contagem REAL das entries) + is_empty, pra a UI distinguir "tudo resolvido" de "não tem nada" — os dois davam pending_count=0 e a tela escolhia a frase errada. import.entry_count segue sendo o CONTADOR gravado na linha de import; divergir de total_entries é sintoma.';

COMMENT ON FUNCTION public.get_statement_imports(uuid) IS
'Lista os extratos importados de uma conta, com "open" primeiro (retomar) e "finalized" depois (histórico), cada um com total/pending/matched/ignored e a diferença atual. É isso que faz a retomada sobreviver a reload: o progresso vive no banco. DESDE 2026-10-18 cada item traz também is_empty (total_entries = 0) e can_finalize (open + total_entries > 0 + 0 pendentes + |diferença| <= 0,01): sem eles o cartão de um extrato VAZIO ficava idêntico ao de um extrato todo conciliado ("Todas as linhas resolvidas, falta finalizar"), porque os dois dão pending_count = 0.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. GRANTs — CREATE OR REPLACE preserva a ACL, mas o REVOKE do anon é
--    NOMINAL de propósito: o Supabase concede EXECUTE pro anon por default em
--    função nova de public, e REVOKE FROM PUBLIC não remove grant explícito de
--    papel. Barato de repetir, caro de esquecer.
-- ────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_bank_reconciliation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_bank_reconciliation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_bank_reconciliation(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_bank_reconciliation_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bank_reconciliation_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_state(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_statement_imports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_statement_imports(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_statement_imports(uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Limpeza PONTUAL do lixo de QA — uma linha, por id, com guarda tripla.
--    NÃO é varredura: fantasma de outra empresa é dado de cliente e sai só
--    depois de cruzar uso real e confirmar com quem é dono (incidente Glacial
--    2026-06-06/07). Aqui o id é conhecido, a empresa é a de QA e a linha tem
--    ZERO entries — as três condições estão no WHERE, então se o estado mudou
--    o DELETE simplesmente não acha nada.
--    O irmão 87ccd645-412a-4281-9943-92fa859fa539 (3 linhas) NÃO é tocado.
-- ────────────────────────────────────────────────────────────────────────────

DO $cleanup$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.bank_statement_imports i
   WHERE i.id         = '824ad2ab-cb45-42a7-aaa8-ae93be24a52c'
     AND i.company_id = '293900d9-174a-4db9-9be1-febe5c2baa30'
     AND i.status     = 'open'
     AND NOT EXISTS (
       SELECT 1 FROM public.bank_statement_entries e WHERE e.import_id = i.id
     );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'limpeza import fantasma de QA 824ad2ab…: % linha(s) apagada(s)', v_deleted;
END
$cleanup$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. PROVA — a migration falha alto se algo não ficou no lugar.
-- ────────────────────────────────────────────────────────────────────────────

DO $proof$
DECLARE
  v_fn    text;
  v_sigs  text[] := ARRAY[
    'create_bank_statement_import(uuid,text,text,text,text,date,date,numeric,date,jsonb)',
    'finalize_bank_reconciliation(uuid)',
    'get_bank_reconciliation_state(uuid)',
    'get_statement_imports(uuid)'
  ];
  v_src   text;
  v_n     integer;
BEGIN
  -- 8.1 anon NÃO pode executar nenhuma das quatro.
  FOREACH v_fn IN ARRAY v_sigs LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ainda tem EXECUTE em %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated PERDEU EXECUTE em %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role PERDEU EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  -- 8.2 o corpo novo realmente está no catálogo.
  v_src := pg_get_functiondef('public.create_bank_statement_import(uuid,text,text,text,text,date,date,numeric,date,jsonb)'::regprocedure);
  IF position('''nothing_new''' IN v_src) = 0 OR position('v_ghost_deleted' IN v_src) = 0 THEN
    RAISE EXCEPTION 'create_bank_statement_import sem o descarte do import fantasma';
  END IF;

  v_src := pg_get_functiondef('public.finalize_bank_reconciliation(uuid)'::regprocedure);
  IF position('nenhuma linha para conciliar' IN v_src) = 0 THEN
    RAISE EXCEPTION 'finalize_bank_reconciliation sem a guarda de extrato vazio';
  END IF;

  v_src := pg_get_functiondef('public.get_bank_reconciliation_state(uuid)'::regprocedure);
  IF position('''is_empty''' IN v_src) = 0 OR position('v_total_entries, 0) > 0' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_bank_reconciliation_state sem is_empty / sem total_entries no can_finalize';
  END IF;

  v_src := pg_get_functiondef('public.get_statement_imports(uuid)'::regprocedure);
  IF position('''is_empty''' IN v_src) = 0 OR position('''can_finalize''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_statement_imports sem is_empty / can_finalize';
  END IF;

  -- 8.3 o fantasma de QA saiu e o irmão de 3 linhas continua inteiro.
  SELECT count(*) INTO v_n FROM public.bank_statement_imports
   WHERE id = '824ad2ab-cb45-42a7-aaa8-ae93be24a52c';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'import fantasma de QA 824ad2ab… ainda existe';
  END IF;

  SELECT count(*) INTO v_n FROM public.bank_statement_entries
   WHERE import_id = '87ccd645-412a-4281-9943-92fa859fa539';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'import de QA 87ccd645… deveria ter 3 linhas, tem %', v_n;
  END IF;

  RAISE NOTICE 'OK: 4 funções atualizadas, anon sem EXECUTE, fantasma de QA fora, 87ccd645… intacto com 3 linhas';
END
$proof$;

COMMIT;
