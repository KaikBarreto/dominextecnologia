-- ============================================================================
-- Isolamento real do VENDEDOR (salesperson-only) — RLS self-scope. Portado da
-- EcoSistema. Policies ADITIVAS (permissivas = OR entre si): NÃO removem nem
-- afrouxam as policies de admin/super_admin existentes; só concedem ao vendedor
-- LEITURA das PRÓPRIAS linhas via helper current_salesperson_id().
--
-- Escopo (só SELECT, nunca UPDATE self-scope — a última linha de defesa contra
-- curl; edição desses registros é operação de admin no painel master):
--   - salespeople:          SELECT da própria linha (user_id = auth.uid()).
--   - salesperson_sales:    SELECT das próprias vendas.
--   - salesperson_advances: SELECT dos próprios vales.
--   - salesperson_payments: SELECT dos próprios pagamentos.
--   - companies:            SELECT das empresas onde é o closer (salesperson_id).
--   - admin_leads:          SELECT dos leads que criou (created_by = auth.uid()).
--                           (Dominex admin_leads NÃO tem responsible_id; o vínculo
--                            de dono é created_by.)
--   - admin_tasks:          SELECT das tarefas atribuídas a si (assigned_to) OU
--                            que criou (created_by).
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- ============================================================================

-- salespeople: vendedor lê SÓ a própria linha (SELECT-only).
DROP POLICY IF EXISTS "Salesperson reads own row" ON public.salespeople;
CREATE POLICY "Salesperson reads own row" ON public.salespeople
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- salesperson_sales: vendedor lê SÓ as próprias vendas.
DROP POLICY IF EXISTS "Salesperson reads own sales" ON public.salesperson_sales;
CREATE POLICY "Salesperson reads own sales" ON public.salesperson_sales
  FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

-- salesperson_advances: vendedor lê SÓ os próprios vales/adiantamentos.
DROP POLICY IF EXISTS "Salesperson reads own advances" ON public.salesperson_advances;
CREATE POLICY "Salesperson reads own advances" ON public.salesperson_advances
  FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

-- salesperson_payments: vendedor lê SÓ os próprios pagamentos.
DROP POLICY IF EXISTS "Salesperson reads own payments" ON public.salesperson_payments;
CREATE POLICY "Salesperson reads own payments" ON public.salesperson_payments
  FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

-- companies: vendedor lê SÓ as empresas onde é o closer.
DROP POLICY IF EXISTS "Salesperson reads own companies" ON public.companies;
CREATE POLICY "Salesperson reads own companies" ON public.companies
  FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

-- admin_leads: vendedor lê SÓ os leads que criou (Dominex usa created_by).
DROP POLICY IF EXISTS "Salesperson reads own leads" ON public.admin_leads;
CREATE POLICY "Salesperson reads own leads" ON public.admin_leads
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- admin_tasks: vendedor lê as tarefas atribuídas a si OU que criou.
DROP POLICY IF EXISTS "Salesperson reads own tasks" ON public.admin_tasks;
CREATE POLICY "Salesperson reads own tasks" ON public.admin_tasks
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());
