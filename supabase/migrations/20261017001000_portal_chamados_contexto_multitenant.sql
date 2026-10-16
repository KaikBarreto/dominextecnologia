-- Chamados de portal: valida customer/company/contract no mesmo tenant e
-- direciona a notificação para a nova aba Chamados.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_valid_portal_ticket_context(
  _customer_id uuid,
  _company_id uuid,
  _contract_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = _customer_id
      AND c.company_id = _company_id
      AND public.is_customer_in_active_portal(c.id)
      AND (
        _contract_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.contracts ct
          WHERE ct.id = _contract_id
            AND ct.customer_id = c.id
            AND ct.company_id = c.company_id
            AND ct.status NOT IN ('cancelled', 'inactive')
        )
      )
  );
$fn$;

COMMENT ON FUNCTION public.is_valid_portal_ticket_context(uuid, uuid, uuid) IS
  'Valida o contexto multi-tenant de INSERT anon em service_orders: cliente com portal ativo, company_id correspondente e contract_id opcional pertencente ao mesmo cliente/tenant.';

REVOKE ALL ON FUNCTION public.is_valid_portal_ticket_context(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_portal_ticket_context(uuid, uuid, uuid) TO anon;

DROP POLICY IF EXISTS "Public can create portal tickets" ON public.service_orders;
CREATE POLICY "Public can create portal tickets"
  ON public.service_orders
  FOR INSERT
  TO anon
  WITH CHECK (
    origin = 'portal'
    AND customer_id IS NOT NULL
    AND company_id IS NOT NULL
    AND public.is_valid_portal_ticket_context(customer_id, company_id, contract_id)
  );

CREATE OR REPLACE FUNCTION public.notify_portal_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_customer_name text;
BEGIN
  IF COALESCE(NEW.origin, '') <> 'portal' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id
    AND c.company_id = NEW.company_id;

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
    '/ordens-servico?aba=chamados&os=' || NEW.id::text,
    'wrench',
    now() + interval '30 days'
  FROM public.profiles p
  WHERE p.company_id = NEW.company_id
    AND p.user_id IS NOT NULL;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.notify_portal_ticket_created() IS
  'Notifica usuários do mesmo tenant após INSERT de chamado do portal e aponta para a aba Chamados com a OS aberta.';

COMMIT;
