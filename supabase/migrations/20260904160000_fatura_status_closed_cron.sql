-- ============================================================================
-- Persistir o status "closed" (fatura fechada) de credit_card_bills
-- ============================================================================
--
-- CONTEXTO:
--   Hoje credit_card_bills.status nasce 'open' e só sai de 'open' quando a
--   fatura é paga ('partial'/'paid'). O estado "Fechada" existia SÓ na tela:
--   effectiveBillStatus() em src/hooks/useCreditCardBills.ts deriva
--   'open' + fechamento alcançado → 'closed' na hora de renderizar.
--
--   Consequência: não dava pra consultar fatura fechada em SQL nem em
--   relatório — o banco dizia 'open' pra uma fatura que a tela mostra
--   "Fechada" há semanas.
--
-- A RÉGUA DO FECHAMENTO (>= e não >):
--   "Fechou" = hoje em America/Sao_Paulo >= closing_date, ou seja o PRÓPRIO
--   DIA do fechamento já conta como fechada. É a regra que a tela usa
--   (`!isBefore(today, closingDate)`) e a que a RPC pay_credit_card_bill
--   validou — está documentada em detalhe no comentário da migration
--   20260904110000_cartao_fatura_rpc_pagamento.sql. Aqui ela é reusada como
--   `closing_date <= hoje`, que é a mesma coisa lida do outro lado.
--
--   Nunca current_date cru: pegaria UTC e erraria a virada do dia.
--
-- FRONTEIRAS:
--   - só promove fatura 'open'. Fatura 'paid'/'partial' NÃO é tocada — o
--     status de pagamento é mais informativo que "fechada" e é dele que a
--     revert_credit_card_bill_payment depende.
--   - effectiveBillStatus continua no front como rede de segurança: entre o
--     dia do fechamento e a próxima execução do cron, a tela já mostra
--     "Fechada" mesmo com o banco em 'open'. Os dois caminhos usam a MESMA
--     régua, então não há divergência possível de resultado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_due_credit_card_bills()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today   date;
  v_updated integer;
BEGIN
  -- Fuso do Brasil, igual à RPC de pagamento. now() AT TIME ZONE resolve a
  -- virada do dia; current_date responderia em UTC.
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  UPDATE public.credit_card_bills
     SET status = 'closed'
   WHERE status = 'open'
     AND closing_date <= v_today;   -- inclusivo: o próprio dia do fechamento já fecha

  -- ROW_COUNT tem que ser lido no MESMO bloco PL/pgSQL do UPDATE.
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated;
END;
$function$;

COMMENT ON FUNCTION public.close_due_credit_card_bills() IS
  'Promove a status closed toda fatura de cartão ainda open cujo closing_date já chegou (hoje em America/Sao_Paulo >= closing_date, inclusive o próprio dia). Não toca em faturas paid/partial. Retorna quantas faturas promoveu. Roda 1x/dia via pg_cron (close-credit-card-bills-daily).';

-- Só o cron (postgres) e o backend privilegiado precisam disso. Nenhum
-- usuário final chama esta função pela tela.
REVOKE EXECUTE ON FUNCTION public.close_due_credit_card_bills() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_due_credit_card_bills() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_due_credit_card_bills() TO service_role;

-- ----------------------------------------------------------------------------
-- Agendamento diário (pg_cron já é usado neste projeto: generate-payroll-daily,
-- prune-db-health-daily, asaas-reconciliation-daily, ...)
-- ----------------------------------------------------------------------------
-- 05:10 UTC = 02:10 em São Paulo — logo depois da virada do dia no fuso que a
-- função usa, e fora da janela de pico.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('close-credit-card-bills-daily')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-credit-card-bills-daily');

    PERFORM cron.schedule(
      'close-credit-card-bills-daily',
      '10 5 * * *',
      $job$ SELECT public.close_due_credit_card_bills(); $job$
    );

    RAISE NOTICE 'cron close-credit-card-bills-daily agendado (10 5 * * *)';
  ELSE
    RAISE NOTICE 'pg_cron ausente — funcao criada, agendamento pulado';
  END IF;
END
$cron$;
