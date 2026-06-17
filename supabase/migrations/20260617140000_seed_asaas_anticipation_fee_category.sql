-- Semeia a categoria financeira (painel admin Auctus) para a TAXA DE ANTECIPAÇÃO
-- do Asaas (`asaas_anticipation_fee`), irmã da tarifa comum `asaas_fee`.
--
-- Por quê: a integração Asaas passou a gerar despesas com
-- category='asaas_anticipation_fee' em admin_financial_transactions. Sem a linha
-- de categoria correspondente, a pílula da UI cai no fallback e mostra o código
-- cru ("asaas_anticipation_fee") em vez de um rótulo PT-BR com ícone.
--
-- Estilo espelhado da linha existente:
--   asaas_fee | 'Tarifas Asaas' | expense | #64748b | CreditCard | is_system | 18
--
-- Idempotente: UNIQUE(name) existe (admin_financial_categories_name_key) →
-- UPSERT via ON CONFLICT (name) DO UPDATE dos campos de exibição.
-- Ícone FastForward (lucide-react, PascalCase): metáfora de "antecipar" no tempo.

INSERT INTO public.admin_financial_categories
  (name, label, type, color, icon, is_system, sort_order, is_active)
VALUES
  ('asaas_anticipation_fee', 'Antecipações Asaas', 'expense', '#64748b', 'FastForward', true, 19, true)
ON CONFLICT (name) DO UPDATE SET
  label      = EXCLUDED.label,
  type       = EXCLUDED.type,
  color      = EXCLUDED.color,
  icon       = EXCLUDED.icon,
  is_system  = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order,
  is_active  = true,
  updated_at = now();
