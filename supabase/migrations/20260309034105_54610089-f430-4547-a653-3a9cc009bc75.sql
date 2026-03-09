
ALTER TABLE public.cost_resource_items
  ADD COLUMN total_cost numeric NULL,
  ADD COLUMN total_units numeric NULL,
  ADD COLUMN qty_per_gift numeric NULL;
