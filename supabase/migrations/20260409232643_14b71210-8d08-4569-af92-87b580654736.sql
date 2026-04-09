
-- Add billing_responsible_ids array column to contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS billing_responsible_ids uuid[] DEFAULT '{}';

-- Allow authenticated users to delete form_responses
CREATE POLICY "Authenticated users can delete form_responses"
ON public.form_responses
FOR DELETE
USING (auth.uid() IS NOT NULL);
