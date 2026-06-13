-- Alinha o catálogo de categorias financeiras do painel admin (Auctus) ao
-- conjunto canônico do EcoSistema, porém com "Venda" como categoria ÚNICA
-- (sem separar "Primeira Venda"/first_sale).
--
-- Por quê: padronizar cores/labels/ícones do financeiro admin com o repo de
-- referência, garantindo pílulas com texto branco legível e ordem consistente.
--
-- Regras respeitadas:
--   * Idempotente: UPSERT via ON CONFLICT (name) DO UPDATE.
--   * NÃO renomeia `name` de sale/renewal/asaas_fee/partner_contribution/other_income
--     (referenciados em RPC register_manual_company_payment, webhook Asaas e
--     admin_financial_transactions.category por TEXTO).
--   * Categorias fora do alvo (ex: upgrade, tools) NÃO são deletadas — apenas
--     desativadas (is_active=false), preservando histórico de transações legível.
--   * is_system=true mantido nas categorias de sistema.

-- 1) UPSERT do catálogo alvo --------------------------------------------------
INSERT INTO public.admin_financial_categories
  (name, label, type, color, icon, is_system, sort_order, is_active)
VALUES
  -- Receitas
  ('sale',                 'Venda',                 'income',  '#22c55e', 'ShoppingCart',   true,  1,  true),
  ('renewal',              'Renovação',             'income',  '#3b82f6', 'RefreshCw',      true,  2,  true),
  ('partner_contribution', 'Aporte de Sócios',      'income',  '#8b5cf6', 'Handshake',      true,  3,  true),
  ('other_income',         'Outros Recebimentos',   'income',  '#0ea5e9', 'Plus',           true,  4,  true),
  -- Despesas
  ('salary',               'Salários',              'expense', '#ec4899', 'Users',          true,  10, true),
  ('commission',           'Comissões',             'expense', '#f97316', 'Percent',        true,  11, true),
  ('advance',              'Vales e Adiantamentos', 'expense', '#d946ef', 'Wallet',         true,  12, true),
  ('marketing',            'Marketing',             'expense', '#f59e0b', 'Megaphone',      true,  13, true),
  ('development',          'Desenvolvimento',       'expense', '#06b6d4', 'Code',           true,  14, true),
  ('infrastructure',       'Infraestrutura',        'expense', '#0891b2', 'Server',         true,  15, true),
  ('administrative',       'Administrativo',        'expense', '#6366f1', 'Building',       true,  16, true),
  ('impostos',             'Impostos',              'expense', '#eab308', 'Landmark',       true,  17, true),
  ('asaas_fee',            'Tarifas Asaas',         'expense', '#64748b', 'CreditCard',     true,  18, true),
  ('other_expense',        'Outras Despesas',       'expense', '#6b7280', 'MoreHorizontal', true,  19, true)
ON CONFLICT (name) DO UPDATE SET
  label      = EXCLUDED.label,
  type       = EXCLUDED.type,
  color      = EXCLUDED.color,
  icon       = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active  = true,
  updated_at = now();

-- 2) Desativação segura das categorias fora do alvo --------------------------
-- Nunca DELETE: preserva o histórico de admin_financial_transactions que aponta
-- por TEXTO para esses `name` (ex: 'upgrade', 'tools', e quaisquer outras antigas).
UPDATE public.admin_financial_categories
SET is_active = false,
    updated_at = now()
WHERE name NOT IN (
  'sale', 'renewal', 'partner_contribution', 'other_income',
  'salary', 'commission', 'advance', 'marketing', 'development',
  'infrastructure', 'administrative', 'impostos', 'asaas_fee', 'other_expense'
);
