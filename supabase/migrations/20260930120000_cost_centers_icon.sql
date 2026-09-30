-- Adiciona coluna de ícone aos centros de custo (a cor já existe: color).
-- Nullable de propósito e SEM default: null = UI usa fallback visual.
-- Sem backfill — nenhum centro de custo existente muda de aparência por
-- causa desta migration. Guarda o NOME de um ícone Lucide (ex: 'Wallet'),
-- mesmo formato usado em public.financial_categories.icon.
ALTER TABLE public.cost_centers ADD COLUMN IF NOT EXISTS icon text;

COMMENT ON COLUMN public.cost_centers.icon IS
  'Nome de um ícone Lucide (ex: Wallet) usado para representar o centro de custo. Null = UI usa ícone de fallback.';
