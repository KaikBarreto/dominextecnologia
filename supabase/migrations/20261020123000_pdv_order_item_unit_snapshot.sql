-- Snapshot da unidade comercial no item da venda.
-- O cupom/historico nao pode mudar quando o cadastro do produto for alterado.

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS unit text;

UPDATE public.pdv_order_items AS item
SET unit = COALESCE(NULLIF(BTRIM(inventory.unit), ''), 'un')
FROM public.inventory AS inventory
WHERE inventory.id = item.inventory_id
  AND inventory.company_id = item.company_id
  AND (item.unit IS NULL OR BTRIM(item.unit) = '');

UPDATE public.pdv_order_items
SET unit = 'un'
WHERE unit IS NULL OR BTRIM(unit) = '';

CREATE OR REPLACE FUNCTION public.pdv_fill_order_item_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.unit := NULLIF(BTRIM(NEW.unit), '');

  -- Na substituicao atomica, a RPC recria os itens sem confiar em campos
  -- extras do cliente. Preserva primeiro a unidade da venda original.
  IF NEW.unit IS NULL THEN
    SELECT source_item.unit
      INTO NEW.unit
      FROM public.pdv_orders AS target_order
      JOIN public.pdv_order_items AS source_item
        ON source_item.order_id = target_order.replaces_order_id
     WHERE target_order.id = NEW.order_id
       AND target_order.company_id = NEW.company_id
       AND source_item.company_id = NEW.company_id
       AND source_item.sort_order = NEW.sort_order
       AND source_item.inventory_id IS NOT DISTINCT FROM NEW.inventory_id
     LIMIT 1;
  END IF;

  IF NEW.unit IS NULL AND NEW.inventory_id IS NOT NULL THEN
    SELECT NULLIF(BTRIM(inventory.unit), '')
      INTO NEW.unit
      FROM public.inventory AS inventory
     WHERE inventory.id = NEW.inventory_id
       AND inventory.company_id = NEW.company_id;
  END IF;

  NEW.unit := COALESCE(NEW.unit, 'un');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pdv_fill_order_item_unit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pdv_order_items_fill_unit ON public.pdv_order_items;
CREATE TRIGGER trg_pdv_order_items_fill_unit
BEFORE INSERT OR UPDATE OF unit, inventory_id, order_id, company_id, sort_order
ON public.pdv_order_items
FOR EACH ROW
EXECUTE FUNCTION public.pdv_fill_order_item_unit();

ALTER TABLE public.pdv_order_items
  ALTER COLUMN unit SET NOT NULL;

ALTER TABLE public.pdv_order_items
  DROP CONSTRAINT IF EXISTS pdv_order_items_unit_not_blank;
ALTER TABLE public.pdv_order_items
  ADD CONSTRAINT pdv_order_items_unit_not_blank CHECK (BTRIM(unit) <> '');

COMMENT ON COLUMN public.pdv_order_items.unit IS
  'Snapshot da unidade comercial no momento da venda (un, kg, m etc.).';
