-- Distribuição de lucros e aplicação financeira são movimentos patrimoniais.
-- Eles alteram o caixa e o patrimônio, mas não são despesas do período.
--
-- Esta migration já estava aplicada em produção; o arquivo restaura a
-- paridade do histórico local para que os deploys seguintes sejam auditáveis.

BEGIN;

UPDATE public.financial_categories
SET dre_group = 'outros'
WHERE is_system = true
  AND (
    (name = 'Distribuição de lucros' AND type = 'saida' AND dfc_group = 'financiamento')
    OR
    (name = 'Aplicação financeira' AND type = 'saida' AND dfc_group = 'investimento')
  );

CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $seed$
BEGIN
  INSERT INTO public.financial_categories (
    company_id, name, type, color, icon, dre_group, dfc_group, is_system, is_active
  )
  VALUES
    (NEW.id, 'Tarifas e Taxas',             'saida',   '#f59e0b', 'Receipt',          'impostos', NULL,            true, true),
    (NEW.id, 'CSP - Materiais',             'saida',   '#8b5cf6', 'Package',          'cmv',      NULL,            true, true),
    (NEW.id, 'CSP - Mão de Obra Avulsa',    'saida',   '#06b6d4', 'Wrench',           'cmv',      NULL,            true, true),
    (NEW.id, 'Vendas de Serviços',          'entrada', '#10b981', 'Briefcase',        'opex',     NULL,            true, true),
    (NEW.id, 'Pagamento de Fatura',         'saida',   '#6366f1', 'CreditCard',       NULL,       NULL,            true, true),
    (NEW.id, 'Transferência entre contas',  'saida',   '#64748b', 'RefreshCw',        NULL,       NULL,            true, true),
    (NEW.id, 'Aporte de sócios',            'entrada', '#0ea5e9', 'HandCoins',        'outros',   'financiamento', true, true),
    (NEW.id, 'Distribuição de lucros',      'saida',   '#f97316', 'Handshake',        'outros',   'financiamento', true, true),
    (NEW.id, 'Aplicação financeira',        'saida',   '#0d9488', 'Landmark',         'outros',   'investimento',  true, true),
    (NEW.id, 'Resgate de aplicação',        'entrada', '#14b8a6', 'TrendingUp',       'outros',   'investimento',  true, true),
    (NEW.id, 'Aquisição de ativos',         'saida',   '#7c3aed', 'Building2',        'outros',   'investimento',  true, true),
    (NEW.id, 'Venda de ativos',             'entrada', '#16a34a', 'BadgeDollarSign', 'outros',   'investimento',  true, true),
    (NEW.id, 'Empréstimos recebidos',       'entrada', '#2563eb', 'Banknote',         'outros',   'financiamento', true, true),
    (NEW.id, 'Amortização de empréstimos',  'saida',   '#dc2626', 'Landmark',         'outros',   'financiamento', true, true)
  ON CONFLICT (company_id, name) DO NOTHING;

  RETURN NEW;
END;
$seed$;

COMMENT ON FUNCTION public.seed_system_financial_categories() IS
  'Semeia as categorias financeiras de sistema de uma empresa nova. Movimentos patrimoniais ficam fora da DRE e entram no grupo apropriado do DFC.';

COMMENT ON COLUMN public.financial_categories.dre_group IS
  'Onde a categoria entra no resultado: impostos, cmv, opex ou nao_operacional afetam a DRE; outros fica fora da DRE. O grupo DFC é independente e classifica o movimento de caixa.';

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.financial_categories
    WHERE is_system = true
      AND name IN ('Distribuição de lucros', 'Aplicação financeira')
      AND dre_group IS DISTINCT FROM 'outros'
  ) THEN
    RAISE EXCEPTION 'Categorias patrimoniais ainda estão compondo a DRE';
  END IF;
END;
$assert$;

COMMIT;
