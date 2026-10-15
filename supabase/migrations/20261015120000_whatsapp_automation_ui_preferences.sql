-- =============================================================================
-- Preferências provider-agnostic da central de mensagens do WhatsApp.
--
-- Esta migration NÃO escolhe Meta/BSP/Evolution e NÃO cria envio. Ela persiste
-- apenas as decisões de produto que continuam válidas com qualquer provedor:
-- regras por evento e autorização individual do cliente.
-- =============================================================================

ALTER TABLE public.company_whatsapp_settings
  ADD COLUMN IF NOT EXISTS automation_preferences jsonb NOT NULL DEFAULT
  '{
    "version": 1,
    "os": {
      "includeLink": true,
      "events": {
        "a_caminho": {"enabled": true, "template": "automatic"},
        "em_andamento": {"enabled": true, "template": "automatic"},
        "concluida": {"enabled": true, "template": "automatic"}
      }
    },
    "billing": {
      "includeAmount": true,
      "includePaymentLink": true,
      "includeCreatedBy": false,
      "includeDescription": true,
      "events": {
        "created": {"enabled": true, "template": "automatic"},
        "before_due": {"enabled": true, "template": "cordial"},
        "due_today": {"enabled": true, "template": "objective"},
        "after_due": {"enabled": true, "template": "cordial"}
      },
      "daysBeforeDue": 3,
      "daysAfterDue": 2
    }
  }'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_whatsapp_settings_automation_preferences_object'
  ) THEN
    ALTER TABLE public.company_whatsapp_settings
      ADD CONSTRAINT company_whatsapp_settings_automation_preferences_object
      CHECK (jsonb_typeof(automation_preferences) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.company_whatsapp_settings.automation_preferences IS
  'Configuração versionada e independente do provedor para automações de OS e cobrança.';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

COMMENT ON COLUMN public.customers.whatsapp_notifications_enabled IS
  'Autorização administrativa para mensagens automáticas. Opt-out recebido pelo WhatsApp sempre prevalece.';

CREATE OR REPLACE FUNCTION public.track_customer_whatsapp_preference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_notifications_enabled IS TRUE THEN
      NEW.whatsapp_opt_in_at := now();
      NEW.whatsapp_opt_out_at := NULL;
    END IF;
  ELSIF NEW.whatsapp_notifications_enabled IS TRUE
        AND COALESCE(OLD.whatsapp_notifications_enabled, false) IS FALSE THEN
      NEW.whatsapp_opt_in_at := now();
      NEW.whatsapp_opt_out_at := NULL;
  ELSIF NEW.whatsapp_notifications_enabled IS FALSE
        AND COALESCE(OLD.whatsapp_notifications_enabled, false) IS TRUE THEN
      NEW.whatsapp_opt_out_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS track_customer_whatsapp_preference ON public.customers;
CREATE TRIGGER track_customer_whatsapp_preference
  BEFORE INSERT OR UPDATE OF whatsapp_notifications_enabled
  ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.track_customer_whatsapp_preference();
