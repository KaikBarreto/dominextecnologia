-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Create new policies that allow admins and gestors to manage roles

-- Users can view their own roles
CREATE POLICY "Users can view own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins and gestors can view all roles
CREATE POLICY "Admins and gestors can view all roles"
ON public.user_roles
FOR SELECT
USING (public.is_admin_or_gestor(auth.uid()));

-- Admins and gestors can insert roles
CREATE POLICY "Admins and gestors can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.is_admin_or_gestor(auth.uid()));

-- Admins and gestors can update roles
CREATE POLICY "Admins and gestors can update roles"
ON public.user_roles
FOR UPDATE
USING (public.is_admin_or_gestor(auth.uid()));

-- Admins and gestors can delete roles
CREATE POLICY "Admins and gestors can delete roles"
ON public.user_roles
FOR DELETE
USING (public.is_admin_or_gestor(auth.uid()));

-- Also ensure the first user can bootstrap their own admin role if no admins exist
CREATE OR REPLACE FUNCTION public.can_bootstrap_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  )
$$;

-- Allow bootstrapping first admin
CREATE POLICY "First user can bootstrap admin"
ON public.user_roles
FOR INSERT
WITH CHECK (
  public.can_bootstrap_admin() AND 
  auth.uid() = user_id AND 
  role = 'admin'
);