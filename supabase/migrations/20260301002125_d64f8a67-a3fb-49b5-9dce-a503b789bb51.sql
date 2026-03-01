CREATE POLICY "Authenticated users can update pmoc_generated_os"
ON public.pmoc_generated_os
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);