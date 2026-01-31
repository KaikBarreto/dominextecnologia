-- Drop existing restrictive policies on customers
DROP POLICY IF EXISTS "Admins and gestors can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Comercial can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;

-- Create permissive policies for all authenticated users
CREATE POLICY "Authenticated users can view customers" 
ON public.customers 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update customers" 
ON public.customers 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete customers" 
ON public.customers 
FOR DELETE 
USING (auth.uid() IS NOT NULL);