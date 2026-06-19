-- 2026-06-19 — Cotação de compra "completa": suporte a itens manuais (fora do estoque)
--
-- Por quê: o CEO quer poder cotar materiais que NÃO existem no inventário (itens
-- digitados na hora), com nome livre, unidade de medida e quantidade, e o preço de
-- cada fornecedor amarrado ao ITEM da cotação (não mais ao inventory_id).
--
-- Contexto: as tabelas material_purchase_* foram criadas hoje (20260619150000 /
-- 20260619160000) e estão VAZIAS no prod (confirmado via SELECT count(*) = 0 nas 4).
-- Por isso a reestruturação é destrutiva-segura: sem migração de dados.
--
-- Mudanças:
--   material_purchase_items:
--     + material_name text  (nome do material; obrigatório na prática — usado como
--       texto livre quando manual e como snapshot quando vem do estoque)
--     + unit text           (unidade de medida: un, kg, m, ...)
--     + CHECK: item é OU do estoque (inventory_id) OU manual (material_name)
--   material_purchase_quotes:
--     + purchase_item_id uuid NOT NULL FK -> material_purchase_items ON DELETE CASCADE
--     - inventory_id (removida: a ligação ao material agora é via purchase_item_id)
--     UNIQUE antiga (purchase_id, supplier_id, inventory_id) -> (supplier_id, purchase_item_id)
--     + índice em purchase_item_id
--
-- total_price: NÃO adicionado de propósito. unit_price é canônico; o total
-- (quantity x unit_price) é calculado no front pra não ter fonte dupla de verdade.

BEGIN;

-- ============================================================
-- material_purchase_items: itens manuais + snapshot de nome/unidade
-- ============================================================

ALTER TABLE public.material_purchase_items
  ADD COLUMN IF NOT EXISTS material_name text;

ALTER TABLE public.material_purchase_items
  ADD COLUMN IF NOT EXISTS unit text;

-- Item válido = vem do estoque (inventory_id) OU é manual (material_name preenchido).
ALTER TABLE public.material_purchase_items
  DROP CONSTRAINT IF EXISTS material_purchase_items_source_chk;

ALTER TABLE public.material_purchase_items
  ADD CONSTRAINT material_purchase_items_source_chk
  CHECK (inventory_id IS NOT NULL OR material_name IS NOT NULL);

-- ============================================================
-- material_purchase_quotes: preço por (fornecedor x item da cotação)
-- ============================================================

-- Nova ligação ao item da cotação (substitui inventory_id como discriminador).
ALTER TABLE public.material_purchase_quotes
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid;

ALTER TABLE public.material_purchase_quotes
  DROP CONSTRAINT IF EXISTS material_purchase_quotes_purchase_item_id_fkey;

ALTER TABLE public.material_purchase_quotes
  ADD CONSTRAINT material_purchase_quotes_purchase_item_id_fkey
  FOREIGN KEY (purchase_item_id)
  REFERENCES public.material_purchase_items(id) ON DELETE CASCADE;

-- Tabela vazia -> pode tornar NOT NULL direto.
ALTER TABLE public.material_purchase_quotes
  ALTER COLUMN purchase_item_id SET NOT NULL;

-- UNIQUE antiga por inventory_id quebra com itens manuais (NULL não distingue).
ALTER TABLE public.material_purchase_quotes
  DROP CONSTRAINT IF EXISTS material_purchase_quotes_purchase_id_supplier_id_inventory__key;

ALTER TABLE public.material_purchase_quotes
  DROP CONSTRAINT IF EXISTS material_purchase_quotes_supplier_id_purchase_item_id_key;

ALTER TABLE public.material_purchase_quotes
  ADD CONSTRAINT material_purchase_quotes_supplier_id_purchase_item_id_key
  UNIQUE (supplier_id, purchase_item_id);

-- inventory_id em quotes não tem mais uso (ligação é via purchase_item_id).
ALTER TABLE public.material_purchase_quotes
  DROP CONSTRAINT IF EXISTS material_purchase_quotes_inventory_id_fkey;

ALTER TABLE public.material_purchase_quotes
  DROP COLUMN IF EXISTS inventory_id;

CREATE INDEX IF NOT EXISTS idx_material_purchase_quotes_purchase_item_id
  ON public.material_purchase_quotes (purchase_item_id);

COMMIT;
