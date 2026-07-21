-- =====================================================================
-- Notificação in-app quando um CHAMADO é aberto pelo portal público
-- =====================================================================
-- Propósito: quando um cliente final abre um chamado pelo portal
-- (src/pages/CustomerPortal.tsx -> insert em service_orders com
-- origin='portal'), disparar UMA notificação no sino (user_notifications)
-- para TODOS os usuários da empresa (tenant) dona daquele chamado.
--
-- Por que TRIGGER de banco e não edge/front:
--   O chamado entra via usuário ANÔNIMO (o cliente final não está logado
--   como usuário do tenant). Só um gatilho SECURITY DEFINER no próprio
--   INSERT consegue notificar de forma confiável, ignorando a RLS de
--   user_notifications (que só permite INSERT via service_role/definer).
--
-- Pattern espelhado de public.notify_terms_update()
-- (20260615190000_notify_terms_update.sql): INSERT ... SELECT gera 1 row
-- por usuário-alvo, SECURITY DEFINER + SET search_path.
--
-- 🚨 INVARIANTE MULTI-TENANT: notifica SOMENTE usuários de NEW.company_id
-- (join profiles.company_id = NEW.company_id, user_id = auth uid). Nunca
-- cross-tenant (lembrete eterno: incidente white-label 1.8.4). company_id
-- NULL => não notifica.
-- =====================================================================

BEGIN;

-- =====================================================================
-- Função do trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_portal_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_customer_name text;
BEGIN
  -- Guarda: só chamados do portal e com tenant definido. Sem company_id
  -- não há a quem notificar sem vazar cross-tenant.
  IF COALESCE(NEW.origin, '') <> 'portal' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nome do cliente (pode ser NULL se o chamado veio sem customer_id).
  SELECT c.name INTO v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  -- Uma notificação por usuário da MESMA empresa. Escopo restrito a
  -- NEW.company_id — nenhum outro tenant é tocado.
  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, icon, expires_at
  )
  SELECT
    p.user_id,
    'portal_ticket_created',
    'Novo chamado aberto',
    'O cliente ' || COALESCE(NULLIF(v_customer_name, ''), 'do portal')
      || ' abriu um chamado: '
      || COALESCE(NULLIF(NEW.description, ''), 'sem descrição'),
    '/ordens-servico',
    'wrench',
    now() + interval '30 days'
  FROM public.profiles p
  WHERE p.company_id = NEW.company_id
    AND p.user_id IS NOT NULL;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.notify_portal_ticket_created() IS
  'AFTER INSERT em service_orders (origin=portal): cria 1 notificação (type=portal_ticket_created) no sino para cada usuário da empresa NEW.company_id. SECURITY DEFINER pra contornar a RLS de user_notifications; restrito a NEW.company_id (isolamento multi-tenant). action_url aponta pra /ordens-servico (lista de OS do app logado — mesma rota do card DashboardCriticalOS; /os-tecnico/:id é rota PÚBLICA do técnico, fora do auth wall, inadequada pro sino do usuário logado).';

-- =====================================================================
-- Trigger
-- =====================================================================
DROP TRIGGER IF EXISTS trg_notify_portal_ticket_created ON public.service_orders;

CREATE TRIGGER trg_notify_portal_ticket_created
  AFTER INSERT ON public.service_orders
  FOR EACH ROW
  WHEN (NEW.origin = 'portal')
  EXECUTE FUNCTION public.notify_portal_ticket_created();

COMMIT;
