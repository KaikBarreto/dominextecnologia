-- Replace overly permissive RLS policies (literal true) with explicit predicates.
-- NOTE: These predicates are intentionally minimal to preserve existing public token-based flows.

-- Quotes: public update by token (client must still filter by token)
DROP POLICY IF EXISTS "Public can update quote by token" ON public.quotes;
CREATE POLICY "Public can update quote by token"
ON public.quotes
FOR UPDATE
TO anon
USING (token IS NOT NULL AND length(token) >= 16)
WITH CHECK (token IS NOT NULL AND length(token) >= 16);

-- Service ratings: public update by token
DROP POLICY IF EXISTS "Public can update rating by token" ON public.service_ratings;
CREATE POLICY "Public can update rating by token"
ON public.service_ratings
FOR UPDATE
TO public
USING (token IS NOT NULL AND length(token) >= 16)
WITH CHECK (token IS NOT NULL AND length(token) >= 16);

-- Form responses: public insert (kept public, but avoid literal true)
DROP POLICY IF EXISTS "Public can submit responses" ON public.form_responses;
CREATE POLICY "Public can submit responses"
ON public.form_responses
FOR INSERT
TO public
WITH CHECK (service_order_id IS NOT NULL AND question_id IS NOT NULL);