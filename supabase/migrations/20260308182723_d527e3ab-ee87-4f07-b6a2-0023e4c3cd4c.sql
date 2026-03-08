CREATE POLICY "Admin/gestor can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));