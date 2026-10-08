-- ════════════════════════════════════════════════════════════════════════════
-- Orcamento travado em 'convertido' quando a OS gerada por ele e apagada
-- ════════════════════════════════════════════════════════════════════════════
--
-- A ARMADILHA (anunciada no topo de `20261008130000_par_orcamento_os_converter_em_os.sql`,
-- que criou o par de colunas; esta migration e a rede de seguranca que faltava):
--
-- A FK `quotes_converted_to_os_id_fkey` e `ON DELETE SET NULL`. No instante em
-- que a OS e apagada, o Postgres JA zera `quotes.converted_to_os_id` -- mas
-- `quotes.status` continua `'convertido'`. O orcamento fica num estado
-- impossivel na tela de Orcamentos (`src/pages/Quotes.tsx`):
--
--   * "Converter em OS" exige `status = 'aprovado' AND !converted_to_os_id`
--     -> nao aparece, porque o status sobrou em 'convertido';
--   * "Aprovar orcamento" exige `status IN ('enviado','rascunho')`
--     -> nao aparece, porque o status nao e nenhum dos dois;
--   * "Rejeitar" exige `status = 'enviado'` -> tambem nao aparece.
--
-- Resultado: o orcamento perde a OS e NENHUM caminho de UI o tira de
-- 'convertido'. Fica travado pra sempre. E a MESMA familia de bug do orcamento
-- #99 da "Alo gas Juquitiba" (ver `20261008120000_destrava_orcamento_quando_
-- lancamento_e_apagado.sql`): FK `SET NULL` zera o ponteiro e o campo-irmao
-- sobra preenchido.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE O STATUS VOLTA PRA 'aprovado', SEMPRE
-- ────────────────────────────────────────────────────────────────────────────
--
-- Um orcamento so consegue virar 'convertido' PARTINDO de 'aprovado' -- e o
-- gate da propria UI (`status === 'aprovado' && !q.converted_to_os_id` em
-- `src/pages/Quotes.tsx`, e `useQuoteConversion.convertToServiceOrder`). Logo,
-- o inverso fiel de "converteu" e "voltou a estar aprovado, sem OS".
--
-- NAO se consulta `financial_transaction_id` nem `financial_generated_at` aqui,
-- e NAO se rebaixa pra 'enviado'. Vinculo financeiro e assunto do gatilho
-- irmao, que roda em OUTRA tabela (`financial_transactions`) e por outro
-- evento. Existe caso legitimo de orcamento aprovado SEM nenhum lancamento: a
-- aprovacao do cliente pelo link publico quando
-- `company_settings.quote_public_approval_creates_receivable` esta desligado.
-- Rebaixar pra 'enviado' nesse caso APAGARIA uma aprovacao real do cliente.
--
-- Status diferente de 'convertido' fica intacto -- o CASE garante. Apagar uma
-- OS nao pode mexer no status de um orcamento que nao foi convertido nela.
--
-- ⚠️ BEFORE DELETE e OBRIGATORIO. No AFTER DELETE o `ON DELETE SET NULL` da FK
-- ja rodou, `converted_to_os_id` ja e NULL e o `WHERE converted_to_os_id =
-- OLD.id` casaria ZERO linhas -- sem erro nenhum, so com o orcamento travado.
-- Se algum dia alguem "simplificar" isto pra AFTER, o bug volta em silencio.
--
-- ⚠️ SECURITY DEFINER e OBRIGATORIO. Quem apaga a OS e o usuario autenticado, e
-- a RLS de UPDATE de `quotes` (`Users manage own company quotes`) barraria a
-- reversao em silencio: UPDATE barrado por RLS afeta 0 linhas e NAO levanta
-- erro. O filtro por `converted_to_os_id = OLD.id` ja confina a escrita a
-- orcamento da mesma empresa da OS (a conversao so vincula dentro do tenant),
-- entao o DEFINER nao abre superfície cross-tenant.
--
-- `updated_at` nao e setado aqui de proposito: `quotes` ja tem
-- `update_quotes_updated_at` (BEFORE UPDATE -> `update_updated_at_column`), que
-- estampa a coluna sozinho.
--
-- NAO HA BACKFILL. Em 2026-10-08, na base inteira: 109 orcamentos, ZERO com
-- `status = 'convertido'`, ZERO com `converted_to_os_id` preenchido, ZERO OS com
-- `quote_id` preenchido. A janela de exposicao so abre na primeira conversao
-- real -- e este gatilho entra antes dela.

CREATE OR REPLACE FUNCTION public.reset_quote_conversion_on_service_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quotes q
     SET converted_to_os_id = NULL,
         status = CASE
                    WHEN q.status = 'convertido' THEN 'aprovado'
                    ELSE q.status
                  END
   WHERE q.converted_to_os_id = OLD.id;

  RETURN OLD;  -- obrigatorio: em BEFORE DELETE, retornar NULL CANCELA o delete.
END;
$$;

-- Trigger function nao e chamavel via SQL/PostgREST (RETURNS trigger), mas e
-- SECURITY DEFINER e escreve em `quotes`: nao fica exposta por default ACL.
REVOKE ALL ON FUNCTION public.reset_quote_conversion_on_service_order_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_quote_conversion_on_service_order_delete() FROM anon;
REVOKE ALL ON FUNCTION public.reset_quote_conversion_on_service_order_delete() FROM authenticated;

DROP TRIGGER IF EXISTS trg_reset_quote_conversion_on_os_delete ON public.service_orders;

CREATE TRIGGER trg_reset_quote_conversion_on_os_delete
  BEFORE DELETE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_quote_conversion_on_service_order_delete();

-- Os 10 gatilhos que ja existiam em `service_orders` sao todos de
-- INSERT/UPDATE (tg_set_company_id_service_orders, trg_enforce_pmoc_conformity,
-- trg_ensure_public_short_code, trg_ensure_service_rating_on_conclude,
-- trg_notify_portal_ticket_created, trg_portal_ticket_antispam,
-- trg_service_orders_set_created_by, trg_service_orders_stamp_check_author,
-- trg_service_orders_track_pause_resume, update_service_orders_updated_at).
-- Este e o PRIMEIRO de DELETE na tabela: nao ha ordem de disparo a disputar.
