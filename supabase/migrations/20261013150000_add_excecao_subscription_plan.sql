-- Plano comercial EXCEÇÃO: operação essencial por R$ 97/mês e até 3 usuários.
--
-- O plano reaproveita o módulo `basic` para OS, agenda, clientes, equipamentos e
-- rastreamento. Orçamentos e Financeiro, que nos demais planos também pertencem
-- ao `basic`, são bloqueados por uma restrição específica de área. O Portal do
-- Cliente não entra em included_modules, então continua protegido pelo gate
-- canônico company_has_module(company_id, 'customer_portal').
--
-- A policy RESTRICTIVE complementa as policies tenant existentes sem abrir
-- acesso novo. `anon` não é afetado: links públicos já emitidos seguem regidos
-- pelas policies públicas próprias. service_role mantém BYPASSRLS para rotinas
-- técnicas e webhooks.

INSERT INTO public.subscription_plans
  (code, name, price, max_users, description, features, included_modules, is_active)
VALUES
  (
    'excecao',
    'EXCEÇÃO',
    97,
    3,
    'Operação essencial para equipes de até 3 usuários, sem Orçamentos, Portal do Cliente e Financeiro.',
    '["Ordens de Serviço e Rastreamento","Agenda e Tarefas","Clientes","Equipamentos","3 usuários inclusos"]'::jsonb,
    '["basic","pricing_advanced","video_questions"]'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      price = EXCLUDED.price,
      max_users = EXCLUDED.max_users,
      description = EXCLUDED.description,
      features = EXCLUDED.features,
      included_modules = EXCLUDED.included_modules,
      is_active = true;

CREATE OR REPLACE FUNCTION public.company_plan_allows_product_area(
  p_company_id uuid,
  p_area text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies AS company
    WHERE company.id = p_company_id
      AND (
        (SELECT auth.role()) = 'service_role'
        OR (SELECT public.is_super_admin(auth.uid()))
        OR p_company_id = (SELECT public.get_user_company_id(auth.uid()))
      )
      AND NOT (
        company.subscription_plan = 'excecao'
        AND p_area IN ('quotes', 'finance')
      )
  );
$function$;

COMMENT ON FUNCTION public.company_plan_allows_product_area(uuid, text) IS
  'Gate server-side das áreas removidas de planos especiais. EXCEÇÃO bloqueia quotes e finance; demais planos permanecem inalterados.';

REVOKE ALL ON FUNCTION public.company_plan_allows_product_area(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_plan_allows_product_area(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_plan_allows_product_area(uuid, text)
  TO authenticated, service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subscription plan allows quotes" ON public.quotes;
CREATE POLICY "Subscription plan allows quotes"
  ON public.quotes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_plan_allows_product_area(company_id, 'quotes'))
  WITH CHECK (public.company_plan_allows_product_area(company_id, 'quotes'));

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subscription plan allows finance" ON public.financial_transactions;
CREATE POLICY "Subscription plan allows finance"
  ON public.financial_transactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_plan_allows_product_area(company_id, 'finance'))
  WITH CHECK (public.company_plan_allows_product_area(company_id, 'finance'));
