-- PDV / Fechamento de caixa: a quebra de caixa passa a gravar o papel
-- financeiro (pdv_cash_shortage / pdv_cash_surplus), e os lancamentos ja
-- gravados recebem o papel por backfill.
--
-- Defeito: pdv_close_cash_session_explicit_core_018_v2 (chamada por
-- pdv_close_cash_session_v2) gravava a diferenca do fechamento com
-- origin='pdv' e categoria 'Quebra de caixa', mas SEM pdv_financial_role. A
-- projecao do PDV (pdv_financial_projection_rows_v2) jogava a linha no
-- adaptador legado ('legacy_financial'): a SOBRA entrava como RECEITA no
-- Resumo (como se fosse venda) e a falta como despesa generica
-- ("Lancamento financeiro do PDV"). Caso real: empresa 28cb, 17 a 21/11.
--
-- Com o papel, a projecao ja tem regra propria (sem mudanca de codigo nela):
-- * dre_competence e dre_cash: receita 0; falta = despesa +valor; sobra =
--   despesa -valor (abate a quebra). O resultado do periodo nao muda, so sai
--   da linha de receita de venda.
-- * dfc: fluxo +valor (sobra) / -valor (falta), igual ao de hoje; receita e
--   despesa da linha passam a 0 (o legado repetia o valor nelas no DFC).
-- O DRE do Financeiro (tela) le por categoria/grupo, nao por este papel, e
-- nao muda. A conciliacao do Financeiro ja conhece pdv_cash_shortage/surplus.
--
-- Papel exige pdv_settlement_group_id (financial_transactions_pdv_role_check).
-- O grupo e o pedido de operacao do fechamento (cash.close.v2), o mesmo
-- operation_request_id gravado na linha de custodia da sobra/falta.
--
-- Backfill e a trava de tesouraria: a linha de quebra esta ligada a custodia
-- (pdv_cash_custody_entries.financial_transaction_id), entao o gatilho
-- tg_zz_pdv_financial_treasury_v2 barra qualquer UPDATE dela
-- (PDV_CUSTODY_FINANCIAL_IMMUTABLE). Nenhum gatilho e desligado. Dentro desta
-- transacao, e so nela, a funcao do gatilho ganha uma excecao estreita que:
-- exige um ajuste local desta migration (app.pdv_cash_adjustment_role_backfill);
-- so aceita linha origin pdv / 'Quebra de caixa' ainda sem papel; so deixa
-- mudar pdv_financial_role, pdv_settlement_group_id e updated_at; e confere
-- papel e grupo contra a linha de custodia persistida (surplus => sobra,
-- shortage => falta, grupo = operation_request_id). Logo depois do UPDATE a
-- definicao original e reexecutada byte a byte e a migration confere o md5 do
-- corpo: nenhuma outra sessao chega a ver a versao com a excecao, e o
-- COMMIT publica a funcao identica a de antes.
--
-- Fora do backfill de proposito: quebra do caixa v1 (sem sessao v2 e sem
-- custodia, ex.: Glacial 18/10). Continua no adaptador legado como despesa.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- 1. Fechamento novo grava o papel.
DO $patch_close$
DECLARE
  v_fn regprocedure:='public.pdv_close_cash_session_explicit_core_018_v2(uuid,uuid,numeric,text,text)'::regprocedure;
  v_def text;
  v_new text;
  v_cols_old text:=E'      created_by, notes\n    ) VALUES (';
  v_cols_new text:=E'      created_by, notes, pdv_financial_role, pdv_settlement_group_id\n    ) VALUES (';
  v_end_old text:=E'\n    ) RETURNING id INTO v_adjustment_id;';
  v_end_new text:=E',\n      -- Papel da quebra (20261122101000): sem ele a sobra virava receita de\n'
    || E'      -- venda no Resumo do PDV. Grupo = pedido de operacao do fechamento.\n'
    || E'      CASE WHEN v_difference > 0 THEN ''pdv_cash_surplus'' ELSE ''pdv_cash_shortage'' END,\n'
    || E'      v_claim.request_id\n    ) RETURNING id INTO v_adjustment_id;';
BEGIN
  v_def:=pg_get_functiondef(v_fn);
  IF position('pdv_cash_surplus' IN v_def)>0 THEN
    RAISE NOTICE 'fechamento ja grava o papel da quebra; nada a fazer';
    RETURN;
  END IF;
  IF (length(v_def)-length(replace(v_def,v_cols_old,'')))/length(v_cols_old)<>1
     OR (length(v_def)-length(replace(v_def,v_end_old,'')))/length(v_end_old)<>1 THEN
    RAISE EXCEPTION 'pdv_close_cash_session_explicit_core_018_v2 mudou: ancora do INSERT da quebra nao encontrada exatamente uma vez';
  END IF;
  v_new:=replace(replace(v_def,v_cols_old,v_cols_new),v_end_old,v_end_new);
  EXECUTE v_new;
  IF position('pdv_cash_surplus' IN pg_get_functiondef(v_fn))=0 THEN
    RAISE EXCEPTION 'patch do fechamento nao foi aplicado';
  END IF;
  RAISE NOTICE 'fechamento passa a gravar pdv_cash_shortage/pdv_cash_surplus';
END
$patch_close$;

-- 2. Backfill dos lancamentos ja gravados.
DO $backfill$
DECLARE
  v_guard regprocedure:='public.pdv_guard_financial_treasury_v2()'::regprocedure;
  v_guard_def text;
  v_guard_md5 text;
  v_patched text;
  v_anchor text:='  -- Excecao estreita: cancelamento de VENDA do PDV.';
  v_exception text;
  v_candidates integer;
  v_shortage integer;
  v_surplus integer;
  v_incoherent integer;
  v_without_custody integer;
  v_updated integer;
BEGIN
  CREATE TEMP TABLE pdv_cash_adjustment_backfill ON COMMIT DROP AS
  SELECT ft.id transaction_id,ft.company_id,
         CASE entry.entry_kind WHEN 'surplus' THEN 'pdv_cash_surplus' ELSE 'pdv_cash_shortage' END new_role,
         entry.operation_request_id new_group_id
    FROM public.financial_transactions ft
    JOIN public.pdv_cash_custody_entries entry
      ON entry.financial_transaction_id=ft.id AND entry.company_id=ft.company_id
     AND entry.entry_kind IN ('shortage','surplus')
     AND entry.source_type='financial_transaction'
    JOIN public.pdv_cash_sessions session
      ON session.id=entry.session_id AND session.company_id=ft.company_id
     AND session.contract_version=2
   WHERE ft.origin='pdv' AND ft.category='Quebra de caixa'
     AND ft.pdv_financial_role IS NULL AND ft.pdv_settlement_group_id IS NULL
     AND ft.pdv_cash_session_id=entry.session_id
     AND entry.operation_request_id IS NOT NULL
     AND ((entry.entry_kind='surplus' AND ft.transaction_type::text='entrada' AND entry.amount=ft.amount)
       OR (entry.entry_kind='shortage' AND ft.transaction_type::text='saida' AND entry.amount=-ft.amount));

  SELECT count(*),count(*) FILTER (WHERE new_role='pdv_cash_shortage'),
         count(*) FILTER (WHERE new_role='pdv_cash_surplus')
    INTO v_candidates,v_shortage,v_surplus
    FROM pdv_cash_adjustment_backfill;
  IF EXISTS(SELECT 1 FROM pdv_cash_adjustment_backfill GROUP BY transaction_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'lancamento de quebra ligado a mais de uma linha de custodia; revisar antes do backfill';
  END IF;

  -- Quebra sem papel ligada a custodia mas que nao bate (sinal, valor,
  -- sessao, grupo): para tudo, nao adivinha.
  SELECT count(*) INTO v_incoherent
    FROM public.financial_transactions ft
   WHERE ft.origin='pdv' AND ft.category='Quebra de caixa'
     AND ft.pdv_financial_role IS NULL
     AND EXISTS(SELECT 1 FROM public.pdv_cash_custody_entries entry
                 WHERE entry.financial_transaction_id=ft.id)
     AND NOT EXISTS(SELECT 1 FROM pdv_cash_adjustment_backfill candidate
                     WHERE candidate.transaction_id=ft.id);
  IF v_incoherent>0 THEN
    RAISE EXCEPTION '% lancamento(s) de quebra ligados a custodia nao conferem com a linha de custodia; revisar',v_incoherent;
  END IF;

  SELECT count(*) INTO v_without_custody
    FROM public.financial_transactions ft
   WHERE ft.origin='pdv' AND ft.category='Quebra de caixa'
     AND ft.pdv_financial_role IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.pdv_cash_custody_entries entry
                     WHERE entry.financial_transaction_id=ft.id);

  RAISE NOTICE 'backfill quebra de caixa: % candidato(s) (% falta, % sobra); % quebra(s) do caixa v1 sem custodia ficam como estao',
    v_candidates,v_shortage,v_surplus,v_without_custody;
  IF v_candidates=0 THEN
    RETURN;
  END IF;

  -- Excecao temporaria, so nesta transacao (ver cabecalho).
  v_guard_def:=pg_get_functiondef(v_guard);
  SELECT md5(procedure.prosrc) INTO v_guard_md5 FROM pg_proc procedure WHERE procedure.oid=v_guard;
  IF (length(v_guard_def)-length(replace(v_guard_def,v_anchor,'')))/length(v_anchor)<>1 THEN
    RAISE EXCEPTION 'pdv_guard_financial_treasury_v2 mudou: ancora da excecao nao encontrada exatamente uma vez';
  END IF;
  v_exception:=$exc$  -- BACKFILL 20261122101000 (temporario, removido na mesma transacao):
  -- classifica a quebra de caixa ja gravada com o papel da custodia.
  IF TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.pdv_cash_adjustment_role_backfill', true), '') = '20261122101000'
     AND OLD.origin = 'pdv' AND OLD.category = 'Quebra de caixa'
     AND OLD.pdv_financial_role IS NULL AND OLD.pdv_settlement_group_id IS NULL
     AND (to_jsonb(NEW) - ARRAY['pdv_financial_role', 'pdv_settlement_group_id', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['pdv_financial_role', 'pdv_settlement_group_id', 'updated_at'])
     AND EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries entry
        WHERE entry.financial_transaction_id = OLD.id
          AND entry.company_id = OLD.company_id
          AND entry.session_id = OLD.pdv_cash_session_id
          AND entry.operation_request_id = NEW.pdv_settlement_group_id
          AND NEW.pdv_financial_role = CASE entry.entry_kind
                WHEN 'surplus' THEN 'pdv_cash_surplus'
                WHEN 'shortage' THEN 'pdv_cash_shortage' END
     )
  THEN
    RETURN NEW;
  END IF;

$exc$;
  v_patched:=replace(v_guard_def,v_anchor,v_exception||v_anchor);
  EXECUTE v_patched;

  PERFORM set_config('app.pdv_cash_adjustment_role_backfill','20261122101000',true);
  UPDATE public.financial_transactions ft
     SET pdv_financial_role=candidate.new_role,
         pdv_settlement_group_id=candidate.new_group_id
    FROM pdv_cash_adjustment_backfill candidate
   WHERE ft.id=candidate.transaction_id
     AND ft.company_id=candidate.company_id
     AND ft.pdv_financial_role IS NULL;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  PERFORM set_config('app.pdv_cash_adjustment_role_backfill','',true);

  -- Restaura a definicao original e prova que e a mesma.
  EXECUTE v_guard_def;
  IF (SELECT md5(procedure.prosrc) FROM pg_proc procedure WHERE procedure.oid=v_guard)<>v_guard_md5 THEN
    RAISE EXCEPTION 'pdv_guard_financial_treasury_v2 nao voltou identico a definicao original';
  END IF;

  IF v_updated<>v_candidates THEN
    RAISE EXCEPTION 'backfill atualizou % de % lancamento(s) de quebra',v_updated,v_candidates;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.financial_transactions ft
      JOIN pdv_cash_adjustment_backfill candidate ON candidate.transaction_id=ft.id
     WHERE ft.pdv_financial_role IS DISTINCT FROM candidate.new_role
        OR ft.pdv_settlement_group_id IS DISTINCT FROM candidate.new_group_id
  ) THEN
    RAISE EXCEPTION 'backfill gravou papel/grupo divergente da custodia';
  END IF;
  RAISE NOTICE 'backfill quebra de caixa: % lancamento(s) classificados; trava de tesouraria restaurada (md5 %)',
    v_updated,v_guard_md5;
END
$backfill$;

COMMIT;
