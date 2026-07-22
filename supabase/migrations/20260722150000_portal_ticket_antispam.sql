-- =====================================================================
-- Guarda anti-spam BEFORE INSERT em service_orders (origin='portal')
-- =====================================================================
-- Propósito: rejeitar chamados de portal abusivos antes de persistir,
-- sem impactar OS internas criadas por usuários autenticados.
--
-- Dois critérios de rejeição (só quando NEW.origin = 'portal'):
--   1. RATE-LIMIT: mesmo customer_id com >= 5 chamados de portal nos
--      últimos 10 minutos → RAISE EXCEPTION 'portal_ticket_rate_limited'
--   2. TAMANHO MÍNIMO: description (após trim) com < 10 chars →
--      RAISE EXCEPTION 'portal_ticket_description_too_short'
--
-- Por que BEFORE INSERT e SECURITY DEFINER:
--   O chamado entra via usuário ANÔNIMO; um BEFORE trigger SECURITY
--   DEFINER pode contar rows de service_orders ignorando a RLS de
--   leitura (que por padrão bloqueia anon). Sem SECURITY DEFINER o
--   SELECT de contagem retornaria 0 sempre e o guarda seria inútil.
--
-- Não quebra OS internas: o bloco de guarda só executa quando
--   NEW.origin = 'portal', portanto chamados com origin diferente
--   (ou mesmo origin='portal' vindo de usuário autenticado pela
--   empresa, caso existisse) são transparentes — o trigger retorna
--   NEW imediatamente.
--
-- Multi-tenant: os critérios são scoped por customer_id (que já
--   pertence a um tenant via company_id na tabela customers). Nunca
--   cruza dados entre tenants.
--
-- Pattern espelhado de public.notify_portal_ticket_created()
--   (20260721150000_notify_portal_ticket_created.sql): SECURITY
--   DEFINER + SET search_path = public + DROP TRIGGER IF EXISTS antes
--   do CREATE TRIGGER.
-- =====================================================================

BEGIN;

-- =====================================================================
-- Função do trigger BEFORE INSERT
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_portal_ticket_antispam()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_recent_count integer;
BEGIN
  -- Guarda: só atua em chamados de portal. OS internas (qualquer outro
  -- origin, ou autenticadas) passam transparentes.
  IF COALESCE(NEW.origin, '') <> 'portal' THEN
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- Critério 1: descrição mínima de 10 caracteres (após trim).
  -- Verificar ANTES do rate-limit para dar mensagem mais específica.
  -- ----------------------------------------------------------------
  IF length(trim(COALESCE(NEW.description, ''))) < 10 THEN
    RAISE EXCEPTION 'portal_ticket_description_too_short'
      USING HINT = 'A descrição do chamado deve ter pelo menos 10 caracteres.';
  END IF;

  -- ----------------------------------------------------------------
  -- Critério 2: rate-limit — o mesmo customer_id não pode criar >= 5
  -- chamados de portal nos últimos 10 minutos.
  -- SECURITY DEFINER é necessário aqui: o SELECT precisa varrer
  -- service_orders mesmo que o caller seja anon (que tem RLS de
  -- leitura bloqueada na tabela). Sem SECURITY DEFINER o COUNT
  -- retornaria 0 sempre, tornando o guarda ineficaz.
  -- ----------------------------------------------------------------
  IF NEW.customer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.service_orders so
    WHERE so.customer_id = NEW.customer_id
      AND so.origin = 'portal'
      AND so.created_at >= (now() - interval '10 minutes');

    IF v_recent_count >= 5 THEN
      RAISE EXCEPTION 'portal_ticket_rate_limited'
        USING HINT = 'Muitos chamados abertos em pouco tempo. Aguarde alguns minutos antes de tentar novamente.';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.check_portal_ticket_antispam() IS
  'BEFORE INSERT em service_orders (origin=portal): rejeita (1) descriptions < 10 chars (portal_ticket_description_too_short) e (2) customer_id com >= 5 chamados nos últimos 10 min (portal_ticket_rate_limited). SECURITY DEFINER para conseguir contar rows de service_orders mesmo com caller anon (RLS de leitura bloqueada). Só atua quando NEW.origin = ''portal'' — OS internas não são afetadas.';

-- =====================================================================
-- Trigger BEFORE INSERT
-- =====================================================================
DROP TRIGGER IF EXISTS trg_portal_ticket_antispam ON public.service_orders;

CREATE TRIGGER trg_portal_ticket_antispam
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW
  WHEN (NEW.origin = 'portal')
  EXECUTE FUNCTION public.check_portal_ticket_antispam();

COMMIT;
