-- =============================================================================
-- WhatsApp: lembretes agendados voltam a enfileirar + "nova cobrança" não avisa
-- cobrança com vencimento distante.
--
-- Parte 1 (regressão da 20261115120000_customer_whatsapp_recipient_routing):
--   whatsapp_enqueue_transactional_job / whatsapp_resolve_recipients /
--   whatsapp_enqueue_scheduled_os_reminder_job passaram a exigir
--   tenant_subscription_allows_access(), que só libera service_role, super_admin
--   ou usuário da própria empresa. O pg_cron roda como postgres SEM JWT
--   (auth.role() = NULL), então os dois crons SQL do WhatsApp passaram a
--   enfileirar zero, calados, desde 16/11.
--
--   Conserto ESCOPADO aos dois pontos de entrada de cron (tenant_subscription_
--   allows_access NÃO é alterada: é usada em RLS e em vários caminhos de cron
--   que nunca rodaram em produção). Quando a sessão não tem identidade, a função
--   assume service_role só durante a própria execução e restaura o valor
--   anterior ao final. Seguro porque as duas funções só têm EXECUTE para
--   postgres e service_role (REVOKE de PUBLIC/anon/authenticated reafirmado
--   abaixo): sem JWT, só sessão direta do banco (cron/migration) chega aqui.
--   auth.role() lê request.jwt.claim.role e depois request.jwt.claims->>'role';
--   como só agimos quando ambos estão vazios, setar request.jwt.claims basta.
--
-- Parte 2: enqueue_whatsapp_charge_created() enfileirava billing.created no
--   instante em que a cobrança era materializada. O Asaas materializa o ciclo
--   de assinatura ~40 dias antes (e parcelas com meses de antecedência), e o
--   cliente final pagava o link do mês errado. Agora só avisa se o vencimento
--   está a até 10 dias (current_date, mesma convenção dos lembretes de
--   cobrança); o resto é avisado pelo billing.before_due. Jobs billing.created
--   ainda na fila para vencimento distante saem como skipped.
--
-- Base: definições vigentes em produção em 2026-11-19 (pg_get_functiondef).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Parte 1a: lembretes de cobrança (cron whatsapp-enqueue-due-reminders)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_due_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_before integer;
  v_after integer;
  v_event text;
  v_count integer := 0;
  v_id uuid;
  v_prev_claims text;
  v_assumed_service boolean := false;
BEGIN
  -- Cron (pg_cron) roda sem JWT. Sem identidade, assume service_role só durante
  -- esta execução para passar pela guarda de assinatura das funções de fila.
  -- Só postgres/service_role têm EXECUTE nesta função.
  IF auth.role() IS NULL THEN
    v_prev_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_assumed_service := true;
  END IF;

  FOR r IN
    SELECT tc.*, s.automation_preferences
      FROM public.tenant_charges tc
      JOIN public.company_whatsapp_settings s ON s.company_id = tc.company_id
     WHERE tc.customer_id IS NOT NULL
       AND tc.due_date IS NOT NULL
       AND tc.status IN ('PENDING','OVERDUE')
       AND s.enabled IS TRUE
       AND s.active_connection_id IS NOT NULL
  LOOP
    v_before := GREATEST(COALESCE((r.automation_preferences #>> '{billing,daysBeforeDue}')::integer, 3), 1);
    v_after := GREATEST(COALESCE((r.automation_preferences #>> '{billing,daysAfterDue}')::integer, 2), 1);
    v_event := CASE
      WHEN r.due_date = current_date + v_before THEN 'billing.before_due'
      WHEN r.due_date = current_date THEN 'billing.due_today'
      WHEN r.due_date = current_date - v_after THEN 'billing.after_due'
      ELSE NULL END;
    IF v_event IS NOT NULL THEN
      v_id := public.whatsapp_enqueue_transactional_job(
        r.company_id, r.customer_id, v_event, 'tenant_charge', r.id,
        format('%s:%s:%s', v_event, r.id, current_date), now()
      );
      IF v_id IS NOT NULL THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  IF v_assumed_service THEN
    PERFORM set_config('request.jwt.claims', COALESCE(v_prev_claims, ''), true);
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_due_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_due_reminders() TO service_role;

-- -----------------------------------------------------------------------------
-- Parte 1b: lembrete de OS agendada (cron whatsapp-enqueue-scheduled-os-reminders)
-- Janela inalterada: só scheduled_date = hoje local + offset (e same_day só
-- antes do horário), então religar não gera lembrete de visita que já passou.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_scheduled_os_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_local_now timestamp;
  v_timing text;
  v_offset integer;
  v_scheduled_at timestamptz;
  v_dedupe_key text;
  v_id uuid;
  v_count integer := 0;
  v_prev_claims text;
  v_assumed_service boolean := false;
BEGIN
  -- Cron (pg_cron) roda sem JWT. Sem identidade, assume service_role só durante
  -- esta execução para passar pela guarda de assinatura das funções de fila.
  -- Só postgres/service_role têm EXECUTE nesta função.
  IF auth.role() IS NULL THEN
    v_prev_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_assumed_service := true;
  END IF;

  -- O cron de recuperacao ja chama o worker a cada minuto. Suprimimos o trigger
  -- por INSERT durante este lote para nao gerar um HTTP wake por candidata que
  -- apenas colidiu com a chave idempotente.
  PERFORM set_config('app.suppress_whatsapp_worker_notify', 'true', true);

  FOR r IN
    WITH bounded_orders AS (
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             so.scheduled_date, so.scheduled_time, so.schedule_plan
        FROM public.service_orders so
       WHERE so.entry_type = 'os'
         AND so.status IN ('agendada'::public.os_status, 'pendente'::public.os_status)
         AND so.scheduled_time IS NOT NULL
         AND so.scheduled_date BETWEEN ((now() AT TIME ZONE 'UTC')::date - 2)
                                     AND ((now() AT TIME ZONE 'UTC')::date + 2)
      UNION
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             so.scheduled_date, so.scheduled_time, so.schedule_plan
        FROM public.service_orders so
       WHERE so.entry_type = 'os'
         AND so.status IN ('agendada'::public.os_status, 'pendente'::public.os_status)
         AND jsonb_array_length(so.schedule_plan) > 0
         AND (so.schedule_plan->0->>'date')
             BETWEEN (((now() AT TIME ZONE 'UTC')::date - 2)::text)
                 AND (((now() AT TIME ZONE 'UTC')::date + 2)::text)
    ), candidates AS (
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             COALESCE(
               CASE WHEN jsonb_array_length(so.schedule_plan) > 0
                    THEN (so.schedule_plan->0->>'date')::date END,
               so.scheduled_date
             ) AS scheduled_date,
             COALESCE(
               CASE WHEN jsonb_array_length(so.schedule_plan) > 0
                    THEN (so.schedule_plan->0->>'time')::time END,
               so.scheduled_time
             ) AS scheduled_time,
             s.enabled, s.active_connection_id, s.automation_preferences,
             public.whatsapp_company_timezone(so.company_id) AS timezone
        FROM bounded_orders so
        JOIN public.company_whatsapp_settings s ON s.company_id = so.company_id
    )
    SELECT * FROM candidates c
     WHERE c.entry_type = 'os'
       AND c.customer_id IS NOT NULL
       AND c.scheduled_date IS NOT NULL
       AND c.scheduled_time IS NOT NULL
       AND c.status::text IN ('agendada', 'pendente')
       AND c.enabled IS TRUE
       AND c.active_connection_id IS NOT NULL
       AND c.timezone IS NOT NULL
       AND COALESCE(c.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') = 'true'
  LOOP
    v_timing := CASE
      WHEN r.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day' THEN 'same_day'
      ELSE 'day_before'
    END;
    v_offset := CASE WHEN v_timing = 'same_day' THEN 0 ELSE 1 END;
    IF r.timezone IS NULL THEN CONTINUE; END IF;
    v_local_now := now() AT TIME ZONE r.timezone;
    v_scheduled_at := (r.scheduled_date + r.scheduled_time) AT TIME ZONE r.timezone;
    v_dedupe_key := format(
      'os.scheduled_reminder:%s:at=%s:timing=%s',
      r.id,
      floor(EXTRACT(EPOCH FROM v_scheduled_at))::bigint,
      v_timing
    );

    IF r.scheduled_date = v_local_now::date + v_offset
       AND (v_offset <> 0 OR now() < v_scheduled_at) THEN
      BEGIN
        v_id := public.whatsapp_enqueue_scheduled_os_reminder_job(
          r.company_id,
          r.customer_id,
          r.id,
          v_dedupe_key,
          v_scheduled_at,
          v_timing,
          now()
        );
        IF v_id IS NOT NULL THEN v_count := v_count + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Uma OS inconsistente nao pode impedir os demais tenants do lote.
        RAISE WARNING 'Falha ao enfileirar lembrete WhatsApp da OS %: %', r.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  IF v_assumed_service THEN
    PERFORM set_config('request.jwt.claims', COALESCE(v_prev_claims, ''), true);
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminders() TO service_role;

-- -----------------------------------------------------------------------------
-- Parte 2a: "nova cobrança" só avisa vencimento próximo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_charge_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Corte aprovado pelo CEO (2026-11-19): o Asaas materializa ciclos de
  -- assinatura ~40 dias antes e parcelas com meses de antecedência. Avisar no
  -- ato fazia o cliente final pagar o link do mês seguinte antes do atual.
  -- Vencimento além do corte é avisado pelo lembrete billing.before_due.
  c_max_days_ahead CONSTANT integer := 10;
BEGIN
  IF NEW.asaas_payment_id IS NOT NULL
     AND NEW.status IN ('PENDING','OVERDUE')
     AND (NEW.due_date IS NULL OR NEW.due_date <= current_date + c_max_days_ahead)
     AND (TG_OP = 'INSERT' OR OLD.asaas_payment_id IS NULL OR OLD.status = 'PENDING_CREATION') THEN
    PERFORM public.whatsapp_enqueue_transactional_job(
      NEW.company_id, NEW.customer_id, 'billing.created', 'tenant_charge', NEW.id,
      format('billing.created:%s', NEW.id), now()
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Parte 2b: tira da fila, sem envio, billing.created de vencimento distante
-- (só status de espera; processing fica com o worker e sent nunca é tocado)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.whatsapp_send_jobs j
     SET status = 'skipped',
         last_error_code = 'due_date_far',
         last_error = 'Vencimento distante: o cliente será avisado pelo lembrete antes do vencimento.',
         locked_at = NULL
    FROM public.tenant_charges tc
   WHERE tc.id = j.source_id
     AND j.source_type = 'tenant_charge'
     AND j.event_key = 'billing.created'
     AND j.status IN ('pending', 'retry')
     AND tc.due_date > current_date + 10;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'billing.created de vencimento distante retirados da fila: %', v_rows;
END $$;
