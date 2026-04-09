
-- Add billing schedule visibility and billing responsible to contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS show_billing_in_schedule boolean NOT NULL DEFAULT true;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS billing_responsible_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add UPDATE policy for os-photos storage bucket (missing, causes upload failures on some devices)
CREATE POLICY "Authenticated users can update OS photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'os-photos')
WITH CHECK (bucket_id = 'os-photos');
