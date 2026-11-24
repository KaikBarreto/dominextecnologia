-- =============================================================================
-- WhatsApp: novo aviso "OS criada" (event_key = 'os.criada'), opt-in.
--
-- Pedido da KGIE: quando uma OS é aberta, o cliente final recebe uma mensagem
-- dizendo que o caso está sendo cuidado. Desligado por padrão: a preferência
-- fica em company_whatsapp_settings.automation_preferences
-- #>> '{os,events,criada,enabled}' (ausente = false). Sem mudança de schema de
-- tabela (JSONB), então types.ts não muda.
--
-- Chave em português ('os.criada'), como os.a_caminho/os.concluida. NÃO usar
-- 'os.created': 'created' já é o aviso de cobrança (billing.created) e as duas
-- convivem nos mesmos dicionários do frontend/worker.
--
-- O que muda:
--   1. CHECKs de event_key (whatsapp_send_jobs e whatsapp_template_bindings)
--      aceitam 'os.criada'.
--   2. whatsapp_enqueue_transactional_job: 'os.criada' respeita a preferência
--      opt-in (default false). Base = definição vigente em produção.
--   3. whatsapp_event_window_group: 'os.criada' usa a janela 'reminders'
--      (o cliente não está esperando essa mensagem naquele minuto; aviso fora
--      de hora é o que gera denúncia).
--   4. Gatilho AFTER INSERT em service_orders enfileira 'os.criada' com 3 min
--      de folga (dá tempo de corrigir a data logo após criar; o worker relê a
--      OS na hora do envio). Só OS unitária criada por pessoa:
--        entry_type = 'os', customer_id presente, sem contract_id, sem
--        recurrence_group_id, status diferente de cancelada/concluida e origin
--        na LISTA PERMITIDA ('manual','portal','public_api'). Origem nova ou
--        de importação/lote ('contract','auvo','migracao_legacy', ...) nunca
--        dispara. O gatilho NUNCA impede a criação da OS (PWA offline é
--        contrato): falha no enfileiramento vira WARNING.
--      Sem backfill: OS já existente não recebe aviso.
--   5. whatsapp_validate_os_created_notice + whatsapp_begin_send_job_dispatch:
--      no marco de despacho, 'os.criada' só sai se a OS ainda existir, for
--      'os', do mesmo cliente, não cancelada/concluída, o aviso ainda estiver
--      ligado e a visita (se houver data) ainda não tiver passado no fuso da
--      empresa (mesma convenção do lembrete agendado).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CHECKs de event_key
-- -----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_template_bindings
  DROP CONSTRAINT IF EXISTS whatsapp_template_bindings_event_key_check;
ALTER TABLE public.whatsapp_template_bindings
  ADD CONSTRAINT whatsapp_template_bindings_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder', 'os.criada', 'os.a_caminho', 'os.em_andamento', 'os.concluida',
    'billing.created', 'billing.before_due', 'billing.due_today', 'billing.after_due'
  )) NOT VALID;
ALTER TABLE public.whatsapp_template_bindings
  VALIDATE CONSTRAINT whatsapp_template_bindings_event_key_check;

ALTER TABLE public.whatsapp_send_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_send_jobs_event_key_check;
ALTER TABLE public.whatsapp_send_jobs
  ADD CONSTRAINT whatsapp_send_jobs_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder', 'os.criada', 'os.a_caminho', 'os.em_andamento', 'os.concluida',
    'billing.created', 'billing.before_due', 'billing.due_today', 'billing.after_due'
  )) NOT VALID;
ALTER TABLE public.whatsapp_send_jobs
  VALIDATE CONSTRAINT whatsapp_send_jobs_event_key_check;

-- -----------------------------------------------------------------------------
-- 2. Enfileiramento: preferência opt-in de 'os.criada'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_transactional_job(
  p_company_id uuid,
  p_customer_id uuid,
  p_event_key text,
  p_source_type text,
  p_source_id uuid,
  p_dedupe_key text,
  p_next_attempt_at timestamp with time zone DEFAULT now()
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_connection public.whatsapp_connections%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_recipient record;
  v_inserted_id uuid;
  v_first_job_id uuid;
  v_enabled boolean := false;
  v_recipient_dedupe text;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  IF public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings
   WHERE company_id = p_company_id;
  IF v_settings.id IS NULL OR v_settings.enabled IS NOT TRUE
     OR v_settings.active_connection_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections
   WHERE id = v_settings.active_connection_id
     AND company_id = p_company_id
     AND status = 'connected';
  IF v_connection.id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.is_deleted IS FALSE
       AND c.whatsapp_notifications_enabled IS TRUE
  ) THEN RETURN NULL; END IF;

  IF p_event_key LIKE 'os.%' THEN
    v_enabled := CASE p_event_key
      -- Opt-in: ausente = desligado (sem coluna trigger_* legada de fallback).
      WHEN 'os.criada' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,criada,enabled}')::boolean, false)
      WHEN 'os.a_caminho' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,a_caminho,enabled}')::boolean, v_settings.trigger_a_caminho)
      WHEN 'os.em_andamento' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,em_andamento,enabled}')::boolean, v_settings.trigger_em_andamento)
      WHEN 'os.concluida' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,concluida,enabled}')::boolean, v_settings.trigger_concluida)
      ELSE false END;
  ELSIF p_event_key LIKE 'billing.%' THEN
    v_enabled := COALESCE(
      (v_settings.automation_preferences #>> ARRAY['billing','events',split_part(p_event_key,'.',2),'enabled'])::boolean,
      false
    );
  ELSE
    RETURN NULL;
  END IF;
  IF v_enabled IS NOT TRUE THEN RETURN NULL; END IF;

  FOR v_recipient IN
    SELECT *
      FROM public.whatsapp_resolve_recipients(p_company_id, p_customer_id, p_event_key)
  LOOP
    v_recipient_dedupe := format(
      '%s:recipient:%s',
      p_dedupe_key,
      md5(v_recipient.normalized_phone)
    );
    v_inserted_id := NULL;

    INSERT INTO public.whatsapp_send_jobs (
      company_id, connection_id, provider, customer_id, event_key,
      source_type, source_id, dedupe_key, next_attempt_at,
      recipient_kind, customer_contact_id, recipient_route_id
    ) VALUES (
      p_company_id, v_connection.id, v_connection.provider, p_customer_id, p_event_key,
      p_source_type, p_source_id, v_recipient_dedupe, COALESCE(p_next_attempt_at, now()),
      v_recipient.recipient_kind, v_recipient.customer_contact_id, v_recipient.recipient_route_id
    )
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_first_job_id IS NULL AND v_inserted_id IS NOT NULL THEN
      v_first_job_id := v_inserted_id;
    END IF;
  END LOOP;

  RETURN v_first_job_id;
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid, uuid, text, text, uuid, text, timestamptz) IS
  'Enfileira um job por telefone destinatario, com dedupe independente e roteamento resolvido exclusivamente no servidor. os.criada e opt-in (ausente = desligado).';

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid, uuid, text, text, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid, uuid, text, text, uuid, text, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Grupo de janela: 'os.criada' -> reminders
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_event_window_group(p_event_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN COALESCE(p_event_key, '') IN ('os.scheduled_reminder', 'os.criada') THEN 'reminders'
           WHEN COALESCE(p_event_key, '') LIKE 'os.%' THEN 'transactional'
           ELSE 'reminders'
         END;
$function$;

COMMENT ON FUNCTION public.whatsapp_event_window_group(text) IS
  'Grupo de janela: os.scheduled_reminder, os.criada e billing.* usam reminders; demais os.* usam transactional; desconhecido falha fechado em reminders.';

REVOKE ALL ON FUNCTION public.whatsapp_event_window_group(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_event_window_group(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Gatilho AFTER INSERT em service_orders
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_service_order_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Só OS unitária criada por ação de pessoa. LISTA PERMITIDA de origens:
  --   manual     -> tela de OS, agenda (schedule_create_service_order_with_override),
  --                 orçamento -> OS (generate_service_order_from_quote), PWA offline;
  --   portal     -> chamado do portal convertido pela equipe (convert_portal_call_to_service_order);
  --   public_api -> agendamento unitário via API pública (public_api_create_service_order).
  -- contract / auvo / migracao_legacy / origem desconhecida: nunca.
  IF NEW.entry_type IS DISTINCT FROM 'os'
     OR NEW.customer_id IS NULL
     OR NEW.contract_id IS NOT NULL
     OR NEW.recurrence_group_id IS NOT NULL
     OR NEW.origin IS NULL
     OR NEW.origin NOT IN ('manual', 'portal', 'public_api')
     OR NEW.status::text IN ('cancelada', 'concluida') THEN
    RETURN NEW;
  END IF;

  -- Nunca impedir a criação da OS: qualquer falha do enfileiramento vira aviso.
  BEGIN
    PERFORM public.whatsapp_enqueue_transactional_job(
      NEW.company_id, NEW.customer_id, 'os.criada', 'service_order', NEW.id,
      format('os.criada:%s', NEW.id), now() + interval '3 minutes'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whatsapp os.criada nao enfileirado (os=%): % %', NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enqueue_whatsapp_service_order_created() IS
  'AFTER INSERT em service_orders: enfileira o aviso opt-in os.criada (+3 min) so para OS unitaria (sem contrato/recorrencia) de origem permitida (manual, portal, public_api). Falha nunca bloqueia a criacao da OS.';

REVOKE ALL ON FUNCTION public.enqueue_whatsapp_service_order_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enqueue_whatsapp_service_order_created ON public.service_orders;
CREATE TRIGGER enqueue_whatsapp_service_order_created
  AFTER INSERT ON public.service_orders
  FOR EACH ROW
  WHEN (
    NEW.entry_type = 'os'
    AND NEW.customer_id IS NOT NULL
    AND NEW.contract_id IS NULL
    AND NEW.recurrence_group_id IS NULL
  )
  EXECUTE FUNCTION public.enqueue_whatsapp_service_order_created();

-- -----------------------------------------------------------------------------
-- 5. Validação no marco de despacho
-- -----------------------------------------------------------------------------
-- Retornos: 'valid' | 'job_unavailable' | 'source_unavailable' |
--           'customer_changed' | 'automation_disabled' | 'status_changed' |
--           'timezone_unavailable' | 'appointment_passed'
CREATE OR REPLACE FUNCTION public.whatsapp_validate_os_created_notice(
  p_job_id uuid,
  p_company_id uuid
)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_enabled text;
  v_date date;
  v_time time;
  v_timezone text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'os.criada'
     AND j.source_type = 'service_order'
     AND j.status = 'processing';
  IF v_job.id IS NULL THEN RETURN 'job_unavailable'; END IF;

  -- service_orders não tem soft delete: OS excluída some da tabela.
  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = v_job.source_id
     AND so.company_id = p_company_id;
  IF v_order.id IS NULL OR v_order.entry_type IS DISTINCT FROM 'os' THEN
    RETURN 'source_unavailable';
  END IF;
  IF v_job.customer_id IS DISTINCT FROM v_order.customer_id THEN
    RETURN 'customer_changed';
  END IF;

  SELECT s.automation_preferences #>> '{os,events,criada,enabled}' INTO v_enabled
    FROM public.company_whatsapp_settings s
   WHERE s.company_id = p_company_id
     AND s.enabled IS TRUE;
  IF COALESCE(v_enabled, 'false') <> 'true' THEN RETURN 'automation_disabled'; END IF;

  -- Concluída também sai: "estamos cuidando" depois do "concluída" confunde.
  IF v_order.status::text IN ('cancelada', 'concluida') THEN RETURN 'status_changed'; END IF;

  v_date := v_order.scheduled_date;
  v_time := v_order.scheduled_time;
  IF jsonb_typeof(v_order.schedule_plan) = 'array' AND jsonb_array_length(v_order.schedule_plan) > 0 THEN
    v_date := (v_order.schedule_plan->0->>'date')::date;
    v_time := (v_order.schedule_plan->0->>'time')::time;
  END IF;

  IF v_date IS NOT NULL THEN
    v_timezone := public.whatsapp_company_timezone(p_company_id);
    IF v_timezone IS NULL THEN RETURN 'timezone_unavailable'; END IF;
    IF v_time IS NOT NULL THEN
      IF now() >= ((v_date + v_time) AT TIME ZONE v_timezone) THEN
        RETURN 'appointment_passed';
      END IF;
    ELSIF (now() AT TIME ZONE v_timezone)::date > v_date THEN
      RETURN 'appointment_passed';
    END IF;
  END IF;

  RETURN 'valid';
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_validate_os_created_notice(uuid, uuid) IS
  'Revalida o aviso os.criada no marco de despacho: OS existe, entry_type os, mesmo cliente, aviso ligado, nao cancelada/concluida e visita (se houver) ainda nao passou no fuso da empresa.';

REVOKE ALL ON FUNCTION public.whatsapp_validate_os_created_notice(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_validate_os_created_notice(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch(p_job_id uuid, p_company_id uuid, p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_validation text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.status = 'processing'
   FOR UPDATE;
  IF v_job.id IS NULL OR v_job.dispatch_started_at IS NOT NULL THEN
    RETURN 'job_unavailable';
  END IF;

  IF v_job.event_key = 'os.scheduled_reminder' THEN
    v_validation := public.whatsapp_validate_scheduled_os_reminder(
      p_job_id, p_company_id, p_phone
    );
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  ELSIF v_job.event_key = 'os.criada' THEN
    v_validation := public.whatsapp_validate_os_created_notice(p_job_id, p_company_id);
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  END IF;

  UPDATE public.whatsapp_send_jobs j
     SET dispatch_started_at = now(),
         locked_at = now()
   WHERE j.id = v_job.id
     AND j.company_id = v_job.company_id
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NULL;
  IF NOT FOUND THEN RETURN 'job_unavailable'; END IF;
  RETURN 'ready';
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text) TO service_role;
