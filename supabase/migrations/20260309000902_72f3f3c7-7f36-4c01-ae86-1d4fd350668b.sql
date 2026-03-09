-- Allow deleting inventory items even if they were used in quotes by nulling the reference.
-- This preserves historical quote items while removing the inventory record.

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_inventory_id_fkey;

ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_inventory_id_fkey
  FOREIGN KEY (inventory_id)
  REFERENCES public.inventory(id)
  ON DELETE SET NULL;