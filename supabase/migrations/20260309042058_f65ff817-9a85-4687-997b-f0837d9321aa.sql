-- Tighten multi-tenant isolation for profiles and user_roles
-- Goal: tenant managers can only see/manage users within their own company;
-- super_admin keeps global visibility/management.

-- 1) Helper: get company_id for an arbitrary profile (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_profile_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id
$$;

-- 2) PROFILES policies
DO $$
BEGIN
  -- Drop overly permissive policies (if they exist)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='System managers can view all profiles') THEN
    EXECUTE 'DROP POLICY "System managers can view all profiles" ON public.profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='System managers can update any profile') THEN
    EXECUTE 'DROP POLICY "System managers can update any profile" ON public.profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Full permission users can view all profiles') THEN
    EXECUTE 'DROP POLICY "Full permission users can view all profiles" ON public.profiles';
  END IF;
END $$;

-- Managers: read/update only within own company
CREATE POLICY "System managers can view company profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  can_manage_system(auth.uid())
  AND company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "System managers can update company profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  can_manage_system(auth.uid())
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  can_manage_system(auth.uid())
  AND company_id = get_user_company_id(auth.uid())
);

-- Super admin: global visibility/management
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Super admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 3) USER_ROLES policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Managers can manage user_roles') THEN
    EXECUTE 'DROP POLICY "Managers can manage user_roles" ON public.user_roles';
  END IF;
END $$;

-- Managers: only manage roles for users in their own company
CREATE POLICY "Managers can manage company user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  can_manage_users(auth.uid())
  AND public.get_profile_company_id(user_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  can_manage_users(auth.uid())
  AND public.get_profile_company_id(user_id) = public.get_user_company_id(auth.uid())
);

-- Super admin: global role management
CREATE POLICY "Super admins can manage user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
);
