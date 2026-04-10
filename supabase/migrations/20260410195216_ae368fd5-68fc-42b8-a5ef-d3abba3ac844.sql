
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS snapshot_data jsonb DEFAULT NULL;

COMMENT ON COLUMN public.service_orders.snapshot_data IS 'Frozen snapshot of related data (customer, equipment, technician, service_type, etc.) saved when OS is completed';
