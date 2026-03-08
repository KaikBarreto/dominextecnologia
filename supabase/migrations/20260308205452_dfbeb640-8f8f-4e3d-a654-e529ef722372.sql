
-- Create centralized can_manage_users function
CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND permissions @> '"fn:manage_users"'::jsonb
    )
  )
$$;

-- Drop existing policies on user_permissions
DROP POLICY IF EXISTS "Admin/gestor can manage user_permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;

-- Recreate with can_manage_users
CREATE POLICY "Managers can manage user_permissions"
ON public.user_permissions
FOR ALL
TO authenticated
USING (public.can_manage_users(auth.uid()))
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE POLICY "Users can view own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Admin/gestor can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Bootstrap first admin" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Recreate user_roles policies
CREATE POLICY "Managers can manage user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.can_manage_users(auth.uid()))
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE POLICY "Bootstrap first admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.can_bootstrap_admin());

CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Update permission_presets policies
DROP POLICY IF EXISTS "Admin/gestor can manage permission_presets" ON public.permission_presets;
DROP POLICY IF EXISTS "Authenticated users can view permission_presets" ON public.permission_presets;

CREATE POLICY "Managers can manage permission_presets"
ON public.permission_presets
FOR ALL
TO authenticated
USING (public.can_manage_users(auth.uid()))
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE POLICY "Authenticated users can view permission_presets"
ON public.permission_presets
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
