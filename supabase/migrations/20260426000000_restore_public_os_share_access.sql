-- =============================================================================
-- Restaurar acesso público (anon) à visão de OS via link compartilhado
-- =============================================================================
-- Contexto:
--   A migração 20260418200001_security_rls_fix.sql removeu as policies públicas
--   das tabelas usadas pela rota /os-tecnico/:id?modo=cliente sem criar
--   substituto para o role `anon`. Resultado: links de OS compartilhados com
--   clientes ficaram quebrados (PGRST116 / "OS não encontrada").
--
-- Modelo de segurança:
--   O UUID da OS é o próprio token de acesso. UUIDs v4 (128 bits) são
--   inviáveis de adivinhar por força bruta. Esse é o modelo original do
--   sistema e o que dá suporte ao share-link existente em
--   buildServiceOrderShareLink().
--
--   Concedemos APENAS SELECT para `anon` — nunca INSERT/UPDATE/DELETE.
--   Mutações continuam restritas a usuários autenticados via policies já
--   existentes (admin/gestor/técnico atribuído).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- service_orders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view service orders by share link" ON public.service_orders;
CREATE POLICY "Public can view service orders by share link"
  ON public.service_orders FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- customers — exibir nome/endereço do cliente da OS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view customers via shared OS" ON public.customers;
CREATE POLICY "Public can view customers via shared OS"
  ON public.customers FOR SELECT
  TO anon
  USING (id IN (SELECT customer_id FROM public.service_orders));

-- ---------------------------------------------------------------------------
-- equipment + equipment_categories — equipamento da OS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view equipment via shared OS" ON public.equipment;
CREATE POLICY "Public can view equipment via shared OS"
  ON public.equipment FOR SELECT
  TO anon
  USING (
    id IN (SELECT equipment_id FROM public.service_orders WHERE equipment_id IS NOT NULL)
    OR id IN (SELECT equipment_id FROM public.service_order_equipment WHERE equipment_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Public can view equipment_categories via shared OS" ON public.equipment_categories;
CREATE POLICY "Public can view equipment_categories via shared OS"
  ON public.equipment_categories FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- service_order_equipment — múltiplos equipamentos por OS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view service_order_equipment via shared OS" ON public.service_order_equipment;
CREATE POLICY "Public can view service_order_equipment via shared OS"
  ON public.service_order_equipment FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- form_templates / form_questions / form_responses — checklist da OS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view form_templates via shared OS" ON public.form_templates;
CREATE POLICY "Public can view form_templates via shared OS"
  ON public.form_templates FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Public can view form_questions via shared OS" ON public.form_questions;
CREATE POLICY "Public can view form_questions via shared OS"
  ON public.form_questions FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Public can view form_responses via shared OS" ON public.form_responses;
CREATE POLICY "Public can view form_responses via shared OS"
  ON public.form_responses FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- service_types — categoria/cor do tipo de serviço
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='service_types') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public can view service_types via shared OS" ON public.service_types';
    EXECUTE 'CREATE POLICY "Public can view service_types via shared OS" ON public.service_types FOR SELECT TO anon USING (true)';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- company_settings — branding white label da empresa
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view company_settings via shared OS" ON public.company_settings;
CREATE POLICY "Public can view company_settings via shared OS"
  ON public.company_settings FOR SELECT
  TO anon
  USING (company_id IN (SELECT company_id FROM public.service_orders));

-- ---------------------------------------------------------------------------
-- os_photos — fotos da OS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view os_photos via shared OS" ON public.os_photos;
CREATE POLICY "Public can view os_photos via shared OS"
  ON public.os_photos FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- technician_locations — rastreamento ao vivo do técnico
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view technician_locations via shared OS" ON public.technician_locations;
CREATE POLICY "Public can view technician_locations via shared OS"
  ON public.technician_locations FOR SELECT
  TO anon
  USING (service_order_id IN (SELECT id FROM public.service_orders));

-- ---------------------------------------------------------------------------
-- service_order_assignees — fallback para localizar técnico
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view service_order_assignees via shared OS" ON public.service_order_assignees;
CREATE POLICY "Public can view service_order_assignees via shared OS"
  ON public.service_order_assignees FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- profiles — nome/avatar do técnico mostrado ao cliente
-- Restringe a perfis de usuários que são técnicos ou assignees de alguma OS,
-- evitando expor todos os perfis da plataforma a anônimos.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view profiles via shared OS" ON public.profiles;
CREATE POLICY "Public can view profiles via shared OS"
  ON public.profiles FOR SELECT
  TO anon
  USING (
    user_id IN (
      SELECT technician_id FROM public.service_orders WHERE technician_id IS NOT NULL
      UNION
      SELECT user_id FROM public.service_order_assignees WHERE user_id IS NOT NULL
    )
  );
