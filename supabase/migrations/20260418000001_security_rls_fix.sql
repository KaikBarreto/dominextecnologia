-- =============================================================================
-- MIGRAÇÃO DE SEGURANÇA: Correção de RLS policies permissivas
-- Auditoria de segurança e LGPD — 2026-04-18
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. customers — remover USING (true), isolar por company_id + portal token
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view customers for portal" ON public.customers;

CREATE POLICY "Customers visible to own company"
  ON public.customers FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Public can view customer by portal token"
  ON public.customers FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT customer_id FROM public.customer_portals
      WHERE token = current_setting('request.headers.x-portal-token', true)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. service_orders — remover USING (true), isolar por tenant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Public can view service orders by customer" ON public.service_orders;

-- Policy para usuários autenticados (já existe "admin/gestor can manage"
-- nas migrations anteriores — apenas adicionamos a ausente para SELECT tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'service_orders'
      AND policyname = 'Service orders visible to own company'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Service orders visible to own company"
        ON public.service_orders FOR SELECT
        TO authenticated
        USING (company_id = get_user_company_id(auth.uid()))
    $policy$;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. employees — remover USING (true), isolar por company_id
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can manage employees" ON public.employees;

CREATE POLICY "Employees visible to own company"
  ON public.employees FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Managers can manage own company employees"
  ON public.employees FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. company_settings — remover USING (true) público
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view company_settings" ON public.company_settings;

CREATE POLICY "Company settings visible to own company"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Public can view company settings by portal token"
  ON public.company_settings FOR SELECT
  TO anon
  USING (
    company_id IN (
      SELECT cp.company_id FROM public.customer_portals cp
      WHERE cp.token = current_setting('request.headers.x-portal-token', true)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. equipment — remover USING (true) público
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view equipment for portal" ON public.equipment;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'equipment'
      AND policyname = 'Equipment visible to own company'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Equipment visible to own company"
        ON public.equipment FOR SELECT
        TO authenticated
        USING (company_id = get_user_company_id(auth.uid()))
    $policy$;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 6. technician_locations — remover USING (true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view locations by service_order" ON public.technician_locations;

CREATE POLICY "Locations visible to own company"
  ON public.technician_locations FOR SELECT
  TO authenticated
  USING (
    service_order_id IN (
      SELECT id FROM public.service_orders
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. service_ratings — verificar token real em vez de USING (true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view rating by token" ON public.service_ratings;
DROP POLICY IF EXISTS "Public can update rating by token" ON public.service_ratings;

CREATE POLICY "Public can view rating by valid token"
  ON public.service_ratings FOR SELECT
  TO anon
  USING (
    token = current_setting('request.headers.x-rating-token', true)
    AND current_setting('request.headers.x-rating-token', true) <> ''
  );

CREATE POLICY "Public can update rating by valid token"
  ON public.service_ratings FOR UPDATE
  TO anon
  USING (
    token = current_setting('request.headers.x-rating-token', true)
    AND current_setting('request.headers.x-rating-token', true) <> ''
  )
  WITH CHECK (
    token = current_setting('request.headers.x-rating-token', true)
    AND current_setting('request.headers.x-rating-token', true) <> ''
  );

-- ---------------------------------------------------------------------------
-- 8. quotes / quote_items — verificar token real
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can update quote by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can view quote_items" ON public.quote_items;

CREATE POLICY "Public can view quote by valid token"
  ON public.quotes FOR SELECT
  TO anon
  USING (
    share_token = current_setting('request.headers.x-share-token', true)
    AND current_setting('request.headers.x-share-token', true) <> ''
  );

CREATE POLICY "Public can update quote by valid token"
  ON public.quotes FOR UPDATE
  TO anon
  USING (
    share_token = current_setting('request.headers.x-share-token', true)
    AND current_setting('request.headers.x-share-token', true) <> ''
  )
  WITH CHECK (
    share_token = current_setting('request.headers.x-share-token', true)
    AND current_setting('request.headers.x-share-token', true) <> ''
  );

CREATE POLICY "Public can view quote_items by valid quote"
  ON public.quote_items FOR SELECT
  TO anon
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE share_token = current_setting('request.headers.x-share-token', true)
      AND current_setting('request.headers.x-share-token', true) <> ''
    )
  );

-- ---------------------------------------------------------------------------
-- 9. form_responses — remover USING (true) público
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view form_responses" ON public.form_responses;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'form_responses'
      AND policyname = 'Form responses visible to own company'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Form responses visible to own company"
        ON public.form_responses FOR SELECT
        TO authenticated
        USING (
          service_order_id IN (
            SELECT id FROM public.service_orders
            WHERE company_id = get_user_company_id(auth.uid())
          )
        )
    $policy$;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 10. DELETE cross-tenant — isolar por company_id em 5 tabelas críticas
-- ---------------------------------------------------------------------------

-- financial_transactions
DROP POLICY IF EXISTS "Authenticated users can delete financial_transactions" ON public.financial_transactions;
CREATE POLICY "Managers can delete own company financial_transactions"
  ON public.financial_transactions FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()));

-- contract_occurrences
DROP POLICY IF EXISTS "Authenticated users can delete contract_occurrences" ON public.contract_occurrences;
CREATE POLICY "Managers can delete own company contract_occurrences"
  ON public.contract_occurrences FOR DELETE
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM public.contracts
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_manage_system(auth.uid())
  );

-- contract_items
DROP POLICY IF EXISTS "Authenticated users can delete contract_items" ON public.contract_items;
CREATE POLICY "Managers can delete own company contract_items"
  ON public.contract_items FOR DELETE
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM public.contracts
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_manage_system(auth.uid())
  );

-- service_order_assignees
DROP POLICY IF EXISTS "Authenticated users can delete service_order_assignees" ON public.service_order_assignees;
CREATE POLICY "Managers can delete own company service_order_assignees"
  ON public.service_order_assignees FOR DELETE
  TO authenticated
  USING (
    service_order_id IN (
      SELECT id FROM public.service_orders
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_manage_system(auth.uid())
  );

-- os_photos
DROP POLICY IF EXISTS "Authenticated users can delete os_photos" ON public.os_photos;
CREATE POLICY "Managers can delete own company os_photos"
  ON public.os_photos FOR DELETE
  TO authenticated
  USING (
    service_order_id IN (
      SELECT id FROM public.service_orders
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_manage_system(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 11. os_photos INSERT — remover WITH CHECK (true) aberta
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert os_photos" ON public.os_photos;
CREATE POLICY "Technicians can insert photos for own company OS"
  ON public.os_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    service_order_id IN (
      SELECT id FROM public.service_orders
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 12. inventory / inventory_movements — remover USING (true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view inventory" ON public.inventory;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname LIKE '%view%'
    AND qual = 'true'
  ) THEN
    -- Remover qualquer política SELECT pública existente
    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE tablename = 'inventory' AND cmd = 'SELECT' AND qual = 'true'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory', r.policyname);
    END LOOP;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory'
    AND policyname = 'Inventory visible to own company'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Inventory visible to own company"
        ON public.inventory FOR SELECT
        TO authenticated
        USING (company_id = get_user_company_id(auth.uid()))
    $policy$;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 13. Storage buckets employee-photos e time-photos — tornar privados
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE name IN ('employee-photos', 'time-photos');
