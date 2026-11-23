-- Separa a disponibilidade do canal WhatsApp do direito de usar cada domínio
-- de automação. O módulo whatsapp mantém a conexão; cada evento exige também
-- o módulo funcional que origina seus dados.

CREATE OR REPLACE FUNCTION public.whatsapp_gate_job_event_module()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.event_key LIKE 'os.%'
     AND public.company_has_module(NEW.company_id, 'service_operations') IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  IF NEW.event_key LIKE 'billing.%'
     AND public.company_has_module(NEW.company_id, 'cobrancas') IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_gate_job_event_module()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_gate_job_event_module() TO service_role;

DROP TRIGGER IF EXISTS whatsapp_gate_job_event_module ON public.whatsapp_send_jobs;
CREATE TRIGGER whatsapp_gate_job_event_module
  BEFORE INSERT ON public.whatsapp_send_jobs
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_gate_job_event_module();

-- Revalida o módulo no último marco transacional antes da chamada externa.
-- Isso também protege jobs antigos que já estavam pendentes quando o módulo
-- foi removido da assinatura.
CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN 'channel_module_inactive';
  END IF;
  IF v_job.event_key LIKE 'os.%'
     AND public.company_has_module(p_company_id, 'service_operations') IS NOT TRUE THEN
    RETURN 'event_module_inactive';
  END IF;
  IF v_job.event_key LIKE 'billing.%'
     AND public.company_has_module(p_company_id, 'cobrancas') IS NOT TRUE THEN
    RETURN 'event_module_inactive';
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

REVOKE ALL ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text) IS
  'Marca o início do envio após revalidar WhatsApp e o módulo funcional do evento.';
