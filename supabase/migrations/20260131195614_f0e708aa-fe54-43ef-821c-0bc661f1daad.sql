-- Create storage bucket for OS photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('os-photos', 'os-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload OS photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'os-photos' 
  AND auth.uid() IS NOT NULL
);

-- Allow public read access to OS photos
CREATE POLICY "Public can view OS photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'os-photos');

-- Allow users to delete their own photos
CREATE POLICY "Users can delete OS photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'os-photos' 
  AND auth.uid() IS NOT NULL
);