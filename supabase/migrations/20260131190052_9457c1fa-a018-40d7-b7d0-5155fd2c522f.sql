-- Corrigir search_path nas funções
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

-- Corrigir policies permissivas para os_photos
DROP POLICY IF EXISTS "Users can add photos to OS" ON public.os_photos;
CREATE POLICY "Users can add photos to own OS" ON public.os_photos 
FOR INSERT TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_orders so 
    WHERE so.id = service_order_id 
    AND (so.technician_id = auth.uid() OR so.created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
  )
);

-- Corrigir policies permissivas para inventory_movements
DROP POLICY IF EXISTS "Authenticated users can create movements" ON public.inventory_movements;
CREATE POLICY "Users can create movements for their OS" ON public.inventory_movements 
FOR INSERT TO authenticated 
WITH CHECK (
  service_order_id IS NULL OR EXISTS (
    SELECT 1 FROM public.service_orders so 
    WHERE so.id = service_order_id 
    AND (so.technician_id = auth.uid() OR so.created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
  )
);
CREATE POLICY "Admins can create any movement" ON public.inventory_movements 
FOR INSERT TO authenticated 
WITH CHECK (public.is_admin_or_gestor(auth.uid()));