-- Drop existing restrictive policies on service_orders
DROP POLICY IF EXISTS "Admins and gestors can manage OS" ON public.service_orders;
DROP POLICY IF EXISTS "Admins and gestors can view all OS" ON public.service_orders;
DROP POLICY IF EXISTS "Technicians can update own assigned OS" ON public.service_orders;
DROP POLICY IF EXISTS "Users can view own assigned OS" ON public.service_orders;

-- Create permissive policies for all authenticated users
CREATE POLICY "Authenticated users can view service_orders" 
ON public.service_orders 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert service_orders" 
ON public.service_orders 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update service_orders" 
ON public.service_orders 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete service_orders" 
ON public.service_orders 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Also fix equipment, inventory, financial_transactions, leads, pmoc tables
DROP POLICY IF EXISTS "Admins and gestors can manage equipment" ON public.equipment;
CREATE POLICY "Authenticated users can manage equipment" 
ON public.equipment 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage inventory" ON public.inventory;
CREATE POLICY "Authenticated users can manage inventory" 
ON public.inventory 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Financeiro can manage transactions" ON public.financial_transactions;
CREATE POLICY "Authenticated users can manage transactions" 
ON public.financial_transactions 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Comercial can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view assigned leads" ON public.leads;
CREATE POLICY "Authenticated users can manage leads" 
ON public.leads 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Comercial can manage interactions" ON public.lead_interactions;
DROP POLICY IF EXISTS "Users can view lead interactions" ON public.lead_interactions;
CREATE POLICY "Authenticated users can manage lead_interactions" 
ON public.lead_interactions 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage PMOC contracts" ON public.pmoc_contracts;
CREATE POLICY "Authenticated users can manage pmoc_contracts" 
ON public.pmoc_contracts 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage PMOC schedules" ON public.pmoc_schedules;
CREATE POLICY "Authenticated users can manage pmoc_schedules" 
ON public.pmoc_schedules 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);