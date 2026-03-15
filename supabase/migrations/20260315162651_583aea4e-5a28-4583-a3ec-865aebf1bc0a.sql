-- Create storage bucket for team photos
INSERT INTO storage.buckets (id, name, public) VALUES ('team-photos', 'team-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for team-photos bucket
CREATE POLICY "Authenticated users can upload team photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'team-photos');

CREATE POLICY "Authenticated users can update team photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'team-photos');

CREATE POLICY "Anyone can view team photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'team-photos');

CREATE POLICY "Authenticated users can delete team photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'team-photos');