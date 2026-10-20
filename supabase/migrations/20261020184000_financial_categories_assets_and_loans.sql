-- Categorias de sistema para ativos e emprestimos no DFC direto.
--
-- Invariantes:
--   * a funcao abaixo continua sendo o unico seed para empresas novas;
--   * o backfill nao altera categoria homonima criada pelo cliente;
--   * nenhum lancamento historico e recategorizado (transactions guardam texto);
--   * executar a migration novamente nao cria duplicatas.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $seed$
BEGIN
  INSERT INTO public.financial_categories (
    company_id,
    name,
    type,
    color,
    icon,
    dre_group,
    dfc_group,
    is_system,
    is_active
  )
  VALUES
    -- Categorias preexistentes, preservadas sem reclassificacao.
    (NEW.id, 'Tarifas e Taxas',             'saida',   '#f59e0b', 'Receipt',          'impostos',        NULL,            true, true),
    (NEW.id, 'CSP - Materiais',             'saida',   '#8b5cf6', 'Package',          'cmv',             NULL,            true, true),
    (NEW.id, 'CSP - Mão de Obra Avulsa',    'saida',   '#06b6d4', 'Wrench',           'cmv',             NULL,            true, true),
    (NEW.id, 'Vendas de Serviços',          'entrada', '#10b981', 'Briefcase',        'opex',            NULL,            true, true),
    (NEW.id, 'Pagamento de Fatura',         'saida',   '#6366f1', 'CreditCard',       NULL,              NULL,            true, true),
    (NEW.id, 'Transferência entre contas',  'saida',   '#64748b', 'RefreshCw',        NULL,              NULL,            true, true),
    (NEW.id, 'Aporte de sócios',            'entrada', '#0ea5e9', 'HandCoins',        'outros',          'financiamento', true, true),
    (NEW.id, 'Distribuição de lucros',      'saida',   '#f97316', 'Handshake',        'nao_operacional', 'financiamento', true, true),
    (NEW.id, 'Aplicação financeira',        'saida',   '#0d9488', 'Landmark',         'nao_operacional', 'investimento',  true, true),
    (NEW.id, 'Resgate de aplicação',        'entrada', '#14b8a6', 'TrendingUp',       'outros',          'investimento',  true, true),
    -- Categorias de ativos e emprestimos.
    (NEW.id, 'Aquisição de ativos',         'saida',   '#7c3aed', 'Building2',        'outros',          'investimento',  true, true),
    (NEW.id, 'Venda de ativos',             'entrada', '#16a34a', 'BadgeDollarSign', 'outros',          'investimento',  true, true),
    (NEW.id, 'Empréstimos recebidos',       'entrada', '#2563eb', 'Banknote',         'outros',          'financiamento', true, true),
    (NEW.id, 'Amortização de empréstimos',  'saida',   '#dc2626', 'Landmark',         'outros',          'financiamento', true, true)
  ON CONFLICT (company_id, name) DO NOTHING;

  RETURN NEW;
END;
$seed$;

COMMENT ON FUNCTION public.seed_system_financial_categories() IS
  'Semeia as categorias financeiras de sistema de uma empresa nova. ON CONFLICT por empresa e nome preserva categoria homonima ja cadastrada pelo cliente.';

-- Empresas existentes recebem somente as categorias ausentes. A chave unica
-- (company_id, name) garante que uma categoria homonima do cliente permanece
-- intacta, inclusive type, DRE/DFC, cor, icone e flags.
DO $backfill$
DECLARE
  v_before integer;
  v_after integer;
  v_companies integer;
BEGIN
  SELECT count(*) INTO v_companies FROM public.companies;
  SELECT count(*) INTO v_before
  FROM public.financial_categories
  WHERE name IN (
    'Aquisição de ativos',
    'Venda de ativos',
    'Empréstimos recebidos',
    'Amortização de empréstimos'
  );

  INSERT INTO public.financial_categories (
    company_id,
    name,
    type,
    color,
    icon,
    dre_group,
    dfc_group,
    is_system,
    is_active
  )
  SELECT
    c.id,
    v.name,
    v.type,
    v.color,
    v.icon,
    v.dre_group,
    v.dfc_group,
    true,
    true
  FROM public.companies c
  CROSS JOIN (VALUES
    ('Aquisição de ativos',        'saida',   '#7c3aed', 'Building2',        'outros', 'investimento'),
    ('Venda de ativos',            'entrada', '#16a34a', 'BadgeDollarSign', 'outros', 'investimento'),
    ('Empréstimos recebidos',      'entrada', '#2563eb', 'Banknote',         'outros', 'financiamento'),
    ('Amortização de empréstimos', 'saida',   '#dc2626', 'Landmark',         'outros', 'financiamento')
  ) AS v(name, type, color, icon, dre_group, dfc_group)
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT count(*) INTO v_after
  FROM public.financial_categories
  WHERE name IN (
    'Aquisição de ativos',
    'Venda de ativos',
    'Empréstimos recebidos',
    'Amortização de empréstimos'
  );

  IF v_after <> v_companies * 4 THEN
    RAISE EXCEPTION
      'Categorias de ativos e emprestimos incompletas: esperadas %, encontradas %',
      v_companies * 4, v_after;
  END IF;

  RAISE NOTICE
    'Categorias de ativos e emprestimos: % antes, % depois (+%) em % empresas',
    v_before, v_after, v_after - v_before, v_companies;
END
$backfill$;

COMMIT;
