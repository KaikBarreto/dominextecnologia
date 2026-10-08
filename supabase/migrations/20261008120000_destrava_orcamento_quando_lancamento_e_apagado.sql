-- ════════════════════════════════════════════════════════════════════════════
-- Orcamento travado quando o lancamento financeiro e apagado pelo Financeiro
-- ════════════════════════════════════════════════════════════════════════════
--
-- A ARMADILHA (provada em producao, empresa "Alo gas Juquitiba", orcamento #99):
--
-- A FK `quotes_financial_transaction_id_fkey` e `ON DELETE SET NULL`. No
-- instante em que a transacao e apagada, o Postgres JA zera
-- `quotes.financial_transaction_id` -- mas `quotes.financial_generated_at`
-- continua preenchido. O orcamento fica num estado impossivel na tela:
--
--   * "Aprovar orcamento" (src/pages/Quotes.tsx) exige
--     `(status = 'enviado' OR status = 'rascunho') AND financial_generated_at IS NULL`
--     -> nao aparece, porque `financial_generated_at` sobrou;
--   * "Desfazer lancamento" exige `financial_transaction_id IS NOT NULL`
--     -> nao aparece, porque a FK acabou de zerar o ponteiro;
--   * `approveQuoteFinancial` (src/hooks/useQuoteConversion.ts) ainda recusa
--     com "Lancamentos financeiros ja foram gerados para este orcamento".
--
-- As duas acoes somem ao mesmo tempo e o orcamento fica TRAVADO pra sempre.
--
-- O gatilho abaixo TEM que ser BEFORE DELETE. No AFTER DELETE o
-- `ON DELETE SET NULL` da FK ja rodou, `financial_transaction_id` ja e NULL e o
-- `WHERE financial_transaction_id = OLD.id` casaria ZERO linhas -- sem erro
-- nenhum, so com o orcamento travado. Se algum dia alguem "simplificar" isto
-- pra AFTER, o bug volta em silencio.
--
-- O front (`deleteTransactionCascade`, `deleteTransactionsBatch`) tambem limpa
-- a quote, mas so nos caminhos que ele conhece. Este gatilho e a rede de
-- seguranca no banco: vale pra QUALQUER delete (tela de Movimentacoes, lote,
-- RPC, edge function, SQL manual).
--
-- PARCELAMENTO: quando a aprovacao gerou N parcelas, somente a 1a parcela e
-- apontada por `quotes.financial_transaction_id`. O filtro e exatamente
-- `financial_transaction_id = OLD.id` -- NUNCA alargar pra
-- `installment_group_id` nem pra `parent_transaction_id`: apagar uma parcela do
-- meio (ou uma linha filha, tipo tarifa de recebimento) nao pode destravar um
-- orcamento cuja receita-mae continua viva.
--
-- SECURITY DEFINER: quem apaga a transacao e o usuario autenticado, e a RLS de
-- UPDATE de `quotes` nao pode bloquear a reversao em silencio (UPDATE barrado
-- por RLS afeta 0 linhas e nao levanta erro).

CREATE OR REPLACE FUNCTION public.reset_quote_financial_link_on_transaction_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reverte o orcamento ao estado "aprovado mas sem lancamento" -- exatamente
  -- o que a acao "Desfazer lancamento" da tela de Orcamentos faz hoje.
  --
  -- O status so e rebaixado pra 'enviado' quando era 'aprovado' E o orcamento
  -- nao virou OS. 'convertido', 'rejeitado' e 'rascunho' ficam como estao.
  --
  -- `to_jsonb(q) ->> 'converted_to_os_id'` em vez da coluna crua, de proposito:
  -- hoje `public.quotes` NAO tem a coluna `converted_to_os_id` neste banco
  -- (o front declara o campo em `useQuotes.ts`/`useQuoteConversion.ts`, mas a
  -- coluna nunca foi criada -- divergencia conhecida de schema). Referenciar a
  -- coluna direto faria o gatilho estourar 42703 em TODO delete de lancamento.
  -- Com `to_jsonb`, a chave ausente devolve NULL (= "nao virou OS", que e a
  -- verdade enquanto a coluna nao existe) e, no dia em que a coluna for criada,
  -- a guarda passa a valer sozinha, sem precisar reescrever o gatilho.
  UPDATE public.quotes q
     SET financial_generated_at  = NULL,
         financial_transaction_id = NULL,
         status = CASE
                    WHEN q.status = 'aprovado'
                     AND (to_jsonb(q) ->> 'converted_to_os_id') IS NULL
                    THEN 'enviado'
                    ELSE q.status
                  END,
         updated_at = now()
   WHERE q.financial_transaction_id = OLD.id;

  RETURN OLD;  -- obrigatorio: em BEFORE DELETE, retornar NULL CANCELA o delete.
END;
$$;

-- Trigger function nao e chamavel via SQL/PostgREST (RETURNS trigger), mas e
-- SECURITY DEFINER e escreve em `quotes`: nao fica exposta por default ACL.
REVOKE ALL ON FUNCTION public.reset_quote_financial_link_on_transaction_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_quote_financial_link_on_transaction_delete() FROM anon;
REVOKE ALL ON FUNCTION public.reset_quote_financial_link_on_transaction_delete() FROM authenticated;

DROP TRIGGER IF EXISTS trg_reset_quote_financial_link_on_delete ON public.financial_transactions;

CREATE TRIGGER trg_reset_quote_financial_link_on_delete
  BEFORE DELETE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_quote_financial_link_on_transaction_delete();

-- ════════════════════════════════════════════════════════════════════════════
-- Backfill: destrava os orcamentos que JA ficaram orfaos antes do gatilho
-- ════════════════════════════════════════════════════════════════════════════
-- Generico de proposito (sem id chumbado). Em 2026-10-08 havia exatamente 1
-- linha nesse estado em toda a base: orcamento #99 da "Alo gas Juquitiba"
-- (R$ 109,90, financial_generated_at 2026-09-25 21:29, status 'aprovado').
DO $$
DECLARE
  v_afetados INT;
BEGIN
  UPDATE public.quotes q
     SET financial_generated_at = NULL,
         status = CASE
                    WHEN q.status = 'aprovado'
                     AND (to_jsonb(q) ->> 'converted_to_os_id') IS NULL
                    THEN 'enviado'
                    ELSE q.status
                  END,
         updated_at = now()
   WHERE q.financial_generated_at IS NOT NULL
     AND q.financial_transaction_id IS NULL;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  RAISE NOTICE 'Orcamentos orfaos destravados: %', v_afetados;
END $$;
