-- Restaura Cobranças como add-on pago após a inclusão do restante do
-- Financeiro no Módulo Básico.
--
-- Regra comercial (CEO, 2026-10-16):
--   * Contas, movimentações, DRE, DFC e relatórios pertencem à base;
--   * Cobranças online e Assinaturas recorrentes exigem o módulo `cobrancas`;
--   * o add-on custa R$ 150/mês e não é concedido por nenhum plano pronto;
--   * checkouts públicos e webhooks já emitidos continuam operando para não
--     interromper recebimentos existentes.

BEGIN;

UPDATE public.subscription_modules
   SET name = 'Cobranças',
       description = 'Cobre seus clientes online por Pix, boleto ou cartão via Asaas (sua própria conta), com links de pagamento, baixa automática e assinaturas recorrentes.',
       price = 150,
       type = 'addon',
       sort_order = 13,
       is_active = true
 WHERE code = 'cobrancas';

UPDATE public.subscription_modules
   SET description = 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Financeiro Completo, Precificação Avançada, Perguntas em Vídeo e 5 usuários.'
 WHERE code = 'basic';

-- Nenhum plano pronto concede Cobranças. O Personalizado só recebe o módulo
-- quando ele estiver explicitamente selecionado e pago.
UPDATE public.subscription_plans
   SET included_modules = COALESCE(included_modules, '[]'::jsonb) - 'cobrancas'
 WHERE COALESCE(included_modules, '[]'::jsonb) ? 'cobrancas';

-- A migration incorreta foi criada no commit de 2026-10-16 17:59:24 +01 e
-- concedeu Cobranças a todos os Personalizados. Remove apenas concessões
-- posteriores a esse marco, preservando contratos pagos que já existiam antes.
DELETE FROM public.company_modules AS module
USING public.companies AS company
 WHERE company.id = module.company_id
   AND company.subscription_plan = 'personalizado'
   AND module.module_code = 'cobrancas'
   AND module.activated_at >= TIMESTAMPTZ '2026-10-16 16:59:24+00';

-- Defense-in-depth: esconder a UI não basta. Leituras autenticadas dos dados
-- de Cobranças e Assinaturas também exigem o entitlement. Policies públicas de
-- checkout não são alteradas e service_role mantém BYPASSRLS para webhooks.
DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_payment_accounts',
    'tenant_charges',
    'tenant_subscriptions',
    'tenant_payment_webhook_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Cobranças exige módulo contratado', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING ((SELECT public.is_super_admin(auth.uid())) OR public.company_has_module(company_id, ''cobrancas'')) '
      || 'WITH CHECK ((SELECT public.is_super_admin(auth.uid())) OR public.company_has_module(company_id, ''cobrancas''))',
      'Cobranças exige módulo contratado',
      table_name
    );
  END LOOP;
END
$policies$;

COMMIT;
