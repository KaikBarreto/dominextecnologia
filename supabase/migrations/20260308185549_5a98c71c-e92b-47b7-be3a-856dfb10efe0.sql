
-- 1. Add white label columns to company_settings
ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS white_label_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS white_label_logo_url text,
  ADD COLUMN IF NOT EXISTS white_label_primary_color text;

-- 2. Create function to check if user has full permissions (27+)
CREATE OR REPLACE FUNCTION public.has_full_permissions(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND is_active = true
      AND jsonb_array_length(permissions) >= 27
  )
$$;

-- 3. Add RLS policy so users with full permissions can view all profiles
CREATE POLICY "Full permission users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (has_full_permissions(auth.uid()));
