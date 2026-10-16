-- Financeiro completo passa a fazer parte do Módulo Básico.
--
-- Regra comercial (CEO, 2026-10-16):
--   * Essencial, Pro, Business e Personalizado recebem Contas a Pagar/Receber,
--     DRE, DFC, relatórios e Cobranças online sem adicional;
--   * o plano EXCEÇÃO continua sem qualquer acesso à área financeira;
--   * NFS-e permanece um produto fiscal próprio.
--
-- Não reprifica companies.subscription_value nem cobranças persistidas. O código
-- legado `finance_advanced` é mantido como entitlement interno gratuito para não
-- quebrar snapshots, links ou integrações antigas.

BEGIN;

UPDATE public.subscription_modules
   SET price = 0,
       is_active = true,
       description = 'Contas a Pagar e Receber, DRE, DFC e relatórios, inclusos no Módulo Básico.'
 WHERE code = 'finance_advanced';

UPDATE public.subscription_modules
   SET price = 0,
       is_active = true,
       description = 'Cobranças online por Pix, boleto ou cartão, inclusas no Módulo Básico; exige conexão da conta Asaas da empresa.'
 WHERE code = 'cobrancas';

UPDATE public.subscription_modules
   SET description = 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos/PMOC, Financeiro Completo, Precificação Avançada, Perguntas em Vídeo e 5 usuários.'
 WHERE code = 'basic';

-- Planos prontos: append idempotente sem apagar os demais módulos contratados.
UPDATE public.subscription_plans
   SET included_modules = CASE
         WHEN jsonb_typeof(included_modules) = 'array'
           THEN included_modules || '["finance_advanced"]'::jsonb
         ELSE '["finance_advanced"]'::jsonb
       END
 WHERE code IN ('start', 'avancado', 'master')
   AND (
     jsonb_typeof(included_modules) IS DISTINCT FROM 'array'
     OR NOT (included_modules ? 'finance_advanced')
   );

UPDATE public.subscription_plans
   SET included_modules = CASE
         WHEN jsonb_typeof(included_modules) = 'array'
           THEN included_modules || '["cobrancas"]'::jsonb
         ELSE '["cobrancas"]'::jsonb
       END
 WHERE code IN ('start', 'avancado', 'master')
   AND (
     jsonb_typeof(included_modules) IS DISTINCT FROM 'array'
     OR NOT (included_modules ? 'cobrancas')
   );

-- Personalizado usa company_modules como snapshot por tenant.
INSERT INTO public.company_modules (company_id, module_code, quantity)
SELECT company.id, module.code, 1
  FROM public.companies AS company
 CROSS JOIN (VALUES ('finance_advanced'), ('cobrancas')) AS module(code)
 WHERE company.subscription_plan = 'personalizado'
ON CONFLICT (company_id, module_code) DO NOTHING;

-- O Exceção nunca herda Financeiro, inclusive se vier de downgrade de um plano
-- personalizado que já possuía o entitlement materializado.
DELETE FROM public.company_modules AS module
USING public.companies AS company
 WHERE company.id = module.company_id
   AND company.subscription_plan = 'excecao'
   AND module.module_code IN ('finance_advanced', 'cobrancas');

UPDATE public.subscription_plans
   SET included_modules = COALESCE(included_modules, '[]'::jsonb) - 'finance_advanced' - 'cobrancas'
 WHERE code = 'excecao';

-- Defense-in-depth do Exceção. Policies RESTRICTIVE complementam o isolamento
-- tenant existente: não abrem acesso para ninguém e só retiram o Financeiro do
-- plano Exceção. `anon` não é afetado (links públicos emitidos continuam
-- regidos pelas policies próprias) e service_role mantém BYPASSRLS.
DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'financial_transactions',
    'financial_accounts',
    'financial_categories',
    'cost_centers',
    'credit_card_bills',
    'tenant_payment_accounts',
    'tenant_charges',
    'tenant_subscriptions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Subscription plan allows finance', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.company_plan_allows_product_area(company_id, ''finance'')) '
      || 'WITH CHECK (public.company_plan_allows_product_area(company_id, ''finance''))',
      'Subscription plan allows finance',
      table_name
    );
  END LOOP;
END
$policies$;

COMMIT;
