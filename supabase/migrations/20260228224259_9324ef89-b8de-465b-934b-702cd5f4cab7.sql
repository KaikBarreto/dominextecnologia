
-- Create storage bucket for customer photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-photos', 'customer-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for customer photos
CREATE POLICY "Public read customer photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-photos');

CREATE POLICY "Authenticated upload customer photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'customer-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update customer photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'customer-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated delete customer photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'customer-photos' AND auth.uid() IS NOT NULL);
