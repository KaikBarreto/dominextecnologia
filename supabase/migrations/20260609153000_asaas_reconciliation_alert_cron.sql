-- =============================================================================
-- asaas_reconciliation_alert(): roda os checks e cria alertas admin (idempotente)
-- + cron diário asaas-reconciliation-daily (prevenção #7)
-- =============================================================================
-- Por quê: ninguém vai abrir a tela de auditoria todo dia. O cron varre as
-- anomalias 1x/dia e, pra cada anomalia NOVA, deixa um admin_notifications.
-- Idempotente: NÃO duplica o alerta do mesmo (issue_type, ref) no mesmo dia —
-- se o cron rodar de novo (ou for re-disparado), não enche a caixa de repetidos.
--
-- SQL PURO via cron: não chama edge, não precisa de segredo no Vault. A função
-- é SECURITY DEFINER (lê subscription_payments / admin_financial_transactions e
-- escreve admin_notifications com privilegio do dono).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.asaas_reconciliation_alert()
RETURNS INTEGER  -- quantos alertas NOVOS foram criados nesta execucao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     RECORD;
  v_created INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT issue_type, ref, detail, description
    FROM public.asaas_reconciliation_check()
  LOOP
    -- Idempotência: já existe alerta deste (issue_type, ref) criado HOJE?
    IF NOT EXISTS (
      SELECT 1
      FROM public.admin_notifications n
      WHERE n.type = 'asaas_reconciliation'
        AND n.data->>'issue_type' = v_row.issue_type
        AND n.data->>'ref'        = v_row.ref
        AND n.created_at >= date_trunc('day', now())
    ) THEN
      INSERT INTO public.admin_notifications (type, title, message, data)
      VALUES (
        'asaas_reconciliation',
        'Anomalia na cobranca Asaas: ' || v_row.issue_type,
        v_row.description || ' (' || v_row.detail || ')',
        jsonb_build_object(
          'issue_type',  v_row.issue_type,
          'ref',         v_row.ref,
          'detail',      v_row.detail,
          'description', v_row.description
        )
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  IF v_created > 0 THEN
    RAISE NOTICE 'asaas_reconciliation_alert: % alerta(s) novo(s) criado(s).', v_created;
  END IF;

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_alert() TO service_role;

COMMENT ON FUNCTION public.asaas_reconciliation_alert() IS
  'Roda asaas_reconciliation_check() e cria admin_notifications (type=asaas_reconciliation) pra cada anomalia nova do dia. Chamada pelo cron asaas-reconciliation-daily.';

-- Garante extensão (já habilitada em migrations anteriores)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove agendamento anterior se existir (idempotente em re-deploys)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-reconciliation-daily') THEN
    PERFORM cron.unschedule('asaas-reconciliation-daily');
    RAISE NOTICE 'Cron asaas-reconciliation-daily anterior removido antes de reagendar.';
  END IF;
END $$;

-- Agenda: todo dia às 08:00 ('0 8 * * *'). SQL puro — chama a função direto.
SELECT cron.schedule(
  'asaas-reconciliation-daily',
  '0 8 * * *',
  $cron$ SELECT public.asaas_reconciliation_alert(); $cron$
);
