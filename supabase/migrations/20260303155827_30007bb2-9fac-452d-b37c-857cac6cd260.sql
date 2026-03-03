
-- Permission presets (cargos)
CREATE TABLE public.permission_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/gestor can manage permission_presets" ON public.permission_presets
  FOR ALL TO authenticated
  USING (is_admin_or_gestor(auth.uid()))
  WITH CHECK (is_admin_or_gestor(auth.uid()));

CREATE POLICY "Authenticated users can view permission_presets" ON public.permission_presets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_permission_presets_updated_at
  BEFORE UPDATE ON public.permission_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User permissions
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  preset_id UUID REFERENCES public.permission_presets(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/gestor can manage user_permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (is_admin_or_gestor(auth.uid()))
  WITH CHECK (is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Security definer function to check permissions without recursion
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT permissions FROM public.user_permissions WHERE user_id = _user_id AND is_active = true),
    '[]'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.user_permissions WHERE user_id = _user_id),
    true
  )
$$;
