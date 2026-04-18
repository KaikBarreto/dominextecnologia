-- 1. Add columns to quotes for financial integration tracking
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS financial_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

-- 2. Seed system categories for all existing companies (idempotent)
INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active)
SELECT c.id, v.name, v.type, v.color, v.icon, v.dre_group, true, true
FROM public.companies c
CROSS JOIN (VALUES
  ('Tarifas e Taxas', 'saida', '#f59e0b', 'Receipt', 'impostos'),
  ('CMV - Materiais', 'saida', '#8b5cf6', 'Package', 'cmv'),
  ('CMV - Mão de Obra Avulsa', 'saida', '#06b6d4', 'Wrench', 'cmv'),
  ('Vendas de Serviços', 'entrada', '#10b981', 'Briefcase', 'opex')
) AS v(name, type, color, icon, dre_group)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_categories fc
  WHERE fc.company_id = c.id AND fc.name = v.name AND fc.type = v.type
);

-- 3. Trigger to auto-create these system categories for new companies
CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active)
  VALUES
    (NEW.id, 'Tarifas e Taxas', 'saida', '#f59e0b', 'Receipt', 'impostos', true, true),
    (NEW.id, 'CMV - Materiais', 'saida', '#8b5cf6', 'Package', 'cmv', true, true),
    (NEW.id, 'CMV - Mão de Obra Avulsa', 'saida', '#06b6d4', 'Wrench', 'cmv', true, true),
    (NEW.id, 'Vendas de Serviços', 'entrada', '#10b981', 'Briefcase', 'opex', true, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_system_financial_categories ON public.companies;
CREATE TRIGGER trg_seed_system_financial_categories
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_system_financial_categories();