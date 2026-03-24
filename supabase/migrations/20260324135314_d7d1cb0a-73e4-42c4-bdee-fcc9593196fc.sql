
-- Add payment_method and installment fields to financial_transactions
ALTER TABLE public.financial_transactions 
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS installment_group_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installment_total integer;

-- Create storage bucket for financial receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-receipts', 'financial-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload receipts
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'financial-receipts');

-- Allow authenticated users to view receipts
CREATE POLICY "Anyone can view receipts"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'financial-receipts');

-- Allow authenticated users to delete their receipts
CREATE POLICY "Authenticated users can delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'financial-receipts');
