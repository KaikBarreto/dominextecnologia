
CREATE TABLE public.service_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  nps_score integer,
  quality_rating integer,
  punctuality_rating integer,
  professionalism_rating integer,
  comment text,
  rated_by_name text,
  rated_at timestamp with time zone,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_ratings_service_order_id_key UNIQUE (service_order_id),
  CONSTRAINT service_ratings_token_key UNIQUE (token),
  CONSTRAINT nps_score_range CHECK (nps_score IS NULL OR (nps_score >= 0 AND nps_score <= 10)),
  CONSTRAINT quality_rating_range CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
  CONSTRAINT punctuality_rating_range CHECK (punctuality_rating IS NULL OR (punctuality_rating >= 1 AND punctuality_rating <= 5)),
  CONSTRAINT professionalism_rating_range CHECK (professionalism_rating IS NULL OR (professionalism_rating >= 1 AND professionalism_rating <= 5))
);

ALTER TABLE public.service_ratings ENABLE ROW LEVEL SECURITY;

-- Public can view rating by token (for the rating page)
CREATE POLICY "Public can view rating by token"
ON public.service_ratings
FOR SELECT
USING (true);

-- Public can update rating via token (submit the rating)
CREATE POLICY "Public can update rating by token"
ON public.service_ratings
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Authenticated users can insert (auto-create on concluida)
CREATE POLICY "Authenticated users can insert service_ratings"
ON public.service_ratings
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete service_ratings"
ON public.service_ratings
FOR DELETE
USING (auth.uid() IS NOT NULL);
