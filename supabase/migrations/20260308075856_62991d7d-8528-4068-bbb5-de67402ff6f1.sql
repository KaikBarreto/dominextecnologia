ALTER TABLE public.customers 
ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
ADD COLUMN deleted_at timestamptz;