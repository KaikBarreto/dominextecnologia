-- Cliente: despesas pagas diretamente e estoque segregado por cliente.
--
-- Invariantes:
--   * estoque geral: stocks.customer_id, inventory.customer_id e
--     inventory_movements.customer_id são NULL;
--   * estoque de cliente: os três customer_id são iguais e pertencem à company_id;
--   * existe no máximo um stock por cliente;
--   * estoque de cliente não entra na posição/baixo estoque/catálogo geral;
--   * consumo em OS aceita estoque geral ou o estoque do próprio cliente da OS;
--   * customer_paid_expenses não cria lançamento no Financeiro da prestadora.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Escopo de cliente no estoque
-- ---------------------------------------------------------------------------

ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_request_id text;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT;

UPDATE public.inventory_movements m
   SET customer_id = i.customer_id
  FROM public.inventory i
 WHERE i.id = m.inventory_id
   AND m.customer_id IS DISTINCT FROM i.customer_id;

CREATE INDEX IF NOT EXISTS idx_stocks_customer_id
  ON public.stocks(customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stocks_company_customer
  ON public.stocks(company_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_customer_id
  ON public.inventory(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_customer_active
  ON public.inventory(company_id, customer_id, archived_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_customer_request
  ON public.inventory(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_customer_id
  ON public.inventory_movements(customer_id) WHERE customer_id IS NOT NULL;

-- O UNIQUE global antigo impedia o mesmo SKU em empresas/clientes distintos.
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_sku_key;
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_company_id_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_general_sku
  ON public.inventory(company_id, sku)
  WHERE customer_id IS NULL AND sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_customer_sku
  ON public.inventory(company_id, customer_id, sku)
  WHERE customer_id IS NOT NULL AND sku IS NOT NULL;

ALTER TABLE public.stocks
  DROP CONSTRAINT IF EXISTS stocks_customer_not_default_check;
ALTER TABLE public.stocks
  ADD CONSTRAINT stocks_customer_not_default_check
  CHECK (customer_id IS NULL OR is_default IS FALSE);

COMMENT ON COLUMN public.stocks.customer_id IS
  'NULL = estoque geral da prestadora; preenchido = estoque segregado e exclusivo do cliente.';
COMMENT ON COLUMN public.inventory.customer_id IS
  'NULL = material do catálogo geral; preenchido = material exclusivo do estoque do cliente.';
COMMENT ON COLUMN public.inventory.archived_at IS
  'Arquivamento lógico. Materiais de cliente com histórico nunca são excluídos fisicamente.';
COMMENT ON COLUMN public.inventory_movements.customer_id IS
  'Snapshot do escopo do movimento: NULL para estoque geral ou o cliente do material/local.';

-- Policies históricas permitem escrita ampla no tenant. Estes guards impedem
-- forjar customer_id de outro tenant e aplicam o gate funcional no servidor.
CREATE OR REPLACE FUNCTION public.guard_customer_scoped_stock_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_company uuid;
  v_uid uuid := auth.uid();
  v_can_manage boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Estoque/material de cliente não pode ser excluído; use arquivamento lógico.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.customer_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'O cliente de um estoque/material é imutável.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT company_id INTO v_customer_company FROM public.customers WHERE id = NEW.customer_id;
  IF NOT FOUND OR v_customer_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa do estoque/material.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'stocks' AND NEW.is_default THEN
    RAISE EXCEPTION 'Estoque de cliente não pode ser o estoque principal.' USING ERRCODE = '23514';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT (
      public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
      OR public.has_full_permissions(v_uid)
      OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
        AND up.is_active = true AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory'))
    ) INTO v_can_manage;
    IF public.get_user_company_id(v_uid) IS DISTINCT FROM NEW.company_id
       OR NOT COALESCE(v_can_manage, false)
       OR NOT public.tenant_subscription_allows_access(NEW.company_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar estoque de cliente.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'O cliente de um estoque/material é imutável.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) IS
  'Confirma consumo por delta e preserva idempotência; material/local devem ser gerais ou pertencer ao mesmo cliente da OS.';
REVOKE ALL ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Consultas gerais não incluem catálogo/saldo de cliente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_accessible_inventory_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT inv.id
    FROM public.inventory inv
   WHERE inv.company_id = public.get_user_company_id(auth.uid())
     AND inv.customer_id IS NULL
     AND inv.archived_at IS NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.inventory_stock_levels l
          JOIN public.stocks s ON s.id = l.stock_id AND s.customer_id IS NULL
         WHERE l.inventory_id = inv.id
           AND l.is_present = true
           AND public.can_access_stock(auth.uid(), l.stock_id)
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.inventory_stock_levels l WHERE l.inventory_id = inv.id
       )
     );
$$;

CREATE OR REPLACE FUNCTION public.get_stock_balance_at_date(
  p_at timestamptz,
  p_stock_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  stock_id uuid, stock_name text, inventory_id uuid, sku text, name text, unit text,
  saldo numeric, cost_price numeric, sale_price numeric, valor numeric, projecao numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_company_id uuid;
BEGIN
  IF p_at IS NULL THEN RAISE EXCEPTION 'p_at é obrigatório'; END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.id, s.name, i.id, i.sku, i.name, i.unit,
         sum(m.quantity)::numeric,
         COALESCE(i.cost_price, 0)::numeric,
         COALESCE(i.sale_price, 0)::numeric,
         (sum(m.quantity) * COALESCE(i.cost_price, 0))::numeric,
         (sum(m.quantity) * COALESCE(i.sale_price, 0))::numeric
    FROM public.inventory_movements m
    JOIN public.inventory i ON i.id = m.inventory_id
    JOIN public.stocks s ON s.id = m.stock_id
   WHERE m.company_id = v_company_id
     AND m.customer_id IS NULL AND i.customer_id IS NULL AND s.customer_id IS NULL
     AND i.archived_at IS NULL
     AND m.created_at <= p_at
     AND (p_stock_ids IS NULL OR m.stock_id = ANY(p_stock_ids))
     AND public.can_access_stock(auth.uid(), s.id)
   GROUP BY s.id, s.name, i.id, i.sku, i.name, i.unit, i.cost_price, i.sale_price
  HAVING sum(m.quantity) <> 0
   ORDER BY s.name,
     (CASE WHEN i.sku ~ '^[0-9]+$' THEN i.sku::bigint END) NULLS LAST,
     i.sku, i.name;
END;
$$;

CREATE OR REPLACE VIEW public.inventory_low_stock
WITH (security_invoker = true)
AS
SELECT isl.company_id, isl.inventory_id, i.name AS material_name,
       i.sku AS material_sku, isl.stock_id, s.name AS stock_name,
       isl.quantity, isl.min_quantity, i.unit,
       (isl.min_quantity - isl.quantity) AS deficit, i.cost_price
  FROM public.inventory_stock_levels isl
  JOIN public.inventory i ON i.id = isl.inventory_id
  JOIN public.stocks s ON s.id = isl.stock_id
 WHERE i.customer_id IS NULL AND s.customer_id IS NULL
   AND i.archived_at IS NULL
   AND isl.min_quantity IS NOT NULL AND isl.min_quantity > 0
   AND isl.quantity < isl.min_quantity AND isl.is_present = true
 ORDER BY s.name, i.name;

GRANT SELECT ON public.inventory_low_stock TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_accessible_inventory_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_balance_at_date(timestamptz, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_default_stock(p_stock_id uuid)
RETURNS public.stocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_user_company uuid;
  v_row public.stocks;
BEGIN
  SELECT company_id INTO v_company_id FROM public.stocks
   WHERE id = p_stock_id AND customer_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque geral não encontrado: %', p_stock_id USING ERRCODE = 'P0002';
  END IF;
  v_user_company := public.get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: estoque de outra empresa.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.stocks SET is_default = false
   WHERE company_id = v_company_id AND customer_id IS NULL AND is_default AND id <> p_stock_id;
  UPDATE public.stocks SET is_default = true WHERE id = p_stock_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_stock_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stocks WHERE company_id = NEW.id AND customer_id IS NULL
  ) THEN
    INSERT INTO public.stocks (company_id, customer_id, name, is_default, sort_order)
    VALUES (NEW.id, NULL, 'Estoque Principal', true, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_customer_scoped_stock_write ON public.stocks;
CREATE TRIGGER trg_guard_customer_scoped_stock_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.stocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_scoped_stock_write();
DROP TRIGGER IF EXISTS trg_guard_customer_scoped_inventory_write ON public.inventory;
CREATE TRIGGER trg_guard_customer_scoped_inventory_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_scoped_stock_write();

-- Impede combinação material/local/tenant inválida, inclusive em escrita direta.
CREATE OR REPLACE FUNCTION public.guard_customer_stock_level_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inventory_company uuid;
  v_inventory_customer uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
  v_uid uuid := auth.uid();
  v_can_manage boolean;
  v_inventory_id uuid;
  v_stock_id uuid;
  v_company_id uuid;
BEGIN
  v_inventory_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.inventory_id ELSE NEW.inventory_id END;
  v_stock_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.stock_id ELSE NEW.stock_id END;
  v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

  SELECT company_id, customer_id
    INTO v_inventory_company, v_inventory_customer
    FROM public.inventory WHERE id = v_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.' USING ERRCODE = '23503';
  END IF;

  SELECT company_id, customer_id
    INTO v_stock_company, v_stock_customer
    FROM public.stocks WHERE id = v_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Local de estoque não encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_inventory_company IS DISTINCT FROM v_stock_company
     OR v_company_id IS DISTINCT FROM v_inventory_company THEN
    RAISE EXCEPTION 'Material e local de estoque devem pertencer à mesma empresa.'
      USING ERRCODE = '23514';
  END IF;
  IF v_inventory_customer IS DISTINCT FROM v_stock_customer THEN
    RAISE EXCEPTION 'Material e local de estoque devem pertencer ao mesmo cliente.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' AND v_inventory_customer IS NOT NULL THEN
    RAISE EXCEPTION 'Nível de estoque de cliente não pode ser excluído; use arquivamento lógico.'
      USING ERRCODE = '23514';
  END IF;
  -- Dentro das RPCs SECURITY DEFINER, current_user é o owner; escrita direta
  -- roda como authenticated e precisa do gate funcional.
  IF v_inventory_customer IS NOT NULL
     AND current_user NOT IN ('postgres', 'service_role') THEN
    SELECT (
      public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
      OR public.has_full_permissions(v_uid)
      OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
        AND up.is_active = true AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory'))
    ) INTO v_can_manage;
    IF public.get_user_company_id(v_uid) IS DISTINCT FROM v_inventory_company
       OR NOT COALESCE(v_can_manage, false)
       OR NOT public.tenant_subscription_allows_access(v_inventory_company) THEN
      RAISE EXCEPTION 'Sem permissão para alterar saldo de estoque de cliente.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_customer_stock_level_scope ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_customer_stock_level_scope
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_stock_level_scope();

CREATE OR REPLACE FUNCTION public.guard_inventory_movement_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inventory_company uuid;
  v_inventory_customer uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
  v_os_company uuid;
  v_os_customer uuid;
  v_uid uuid := auth.uid();
  v_can_manage boolean;
BEGIN
  SELECT company_id, customer_id
    INTO v_inventory_company, v_inventory_customer
    FROM public.inventory WHERE id = NEW.inventory_id;
  SELECT company_id, customer_id
    INTO v_stock_company, v_stock_customer
    FROM public.stocks WHERE id = NEW.stock_id;

  IF v_inventory_company IS NULL OR v_stock_company IS NULL THEN
    RAISE EXCEPTION 'Material ou local de estoque não encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_inventory_company IS DISTINCT FROM v_stock_company
     OR NEW.company_id IS DISTINCT FROM v_inventory_company
     OR v_inventory_customer IS DISTINCT FROM v_stock_customer THEN
    RAISE EXCEPTION 'Movimento incompatível com o tenant/cliente do material e do local.'
      USING ERRCODE = '23514';
  END IF;

  NEW.customer_id := v_inventory_customer;

  IF NEW.service_order_id IS NOT NULL THEN
    SELECT company_id, customer_id INTO v_os_company, v_os_customer
      FROM public.service_orders WHERE id = NEW.service_order_id;
    IF NOT FOUND OR v_os_company IS DISTINCT FROM v_inventory_company THEN
      RAISE EXCEPTION 'Ordem de serviço não pertence à empresa do movimento.'
        USING ERRCODE = '23514';
    END IF;
    IF v_inventory_customer IS NOT NULL
       AND v_inventory_customer IS DISTINCT FROM v_os_customer THEN
      RAISE EXCEPTION 'Estoque de cliente só pode ser consumido em OS do mesmo cliente.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_inventory_customer IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT (
      public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
      OR public.has_full_permissions(v_uid)
      OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
        AND up.is_active = true AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory'))
    ) INTO v_can_manage;
    IF public.get_user_company_id(v_uid) IS DISTINCT FROM v_inventory_company
       OR NOT COALESCE(v_can_manage, false)
       OR NOT public.tenant_subscription_allows_access(v_inventory_company) THEN
      RAISE EXCEPTION 'Sem permissão para movimentar estoque de cliente.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_inventory_movement_scope ON public.inventory_movements;
CREATE TRIGGER trg_guard_inventory_movement_scope
  BEFORE INSERT OR UPDATE OF company_id, inventory_id, stock_id, customer_id, service_order_id
  ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_scope();

CREATE OR REPLACE FUNCTION public.guard_os_material_customer_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_os_company uuid;
  v_os_customer uuid;
  v_inventory_company uuid;
  v_inventory_customer uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
BEGIN
  SELECT company_id, customer_id INTO v_os_company, v_os_customer
    FROM public.service_orders WHERE id = NEW.service_order_id;
  SELECT company_id, customer_id INTO v_inventory_company, v_inventory_customer
    FROM public.inventory WHERE id = NEW.inventory_id;
  SELECT company_id, customer_id INTO v_stock_company, v_stock_customer
    FROM public.stocks WHERE id = NEW.stock_id;

  IF v_os_company IS NULL OR v_inventory_company IS NULL OR v_stock_company IS NULL THEN
    RAISE EXCEPTION 'OS, material ou local de estoque não encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_os_company
     OR v_inventory_company IS DISTINCT FROM v_os_company
     OR v_stock_company IS DISTINCT FROM v_os_company
     OR v_inventory_customer IS DISTINCT FROM v_stock_customer THEN
    RAISE EXCEPTION 'Material/local incompatível com a empresa ou cliente da OS.'
      USING ERRCODE = '23514';
  END IF;
  IF v_inventory_customer IS NOT NULL
     AND v_inventory_customer IS DISTINCT FROM v_os_customer THEN
    RAISE EXCEPTION 'Estoque de cliente só pode ser consumido em OS do mesmo cliente.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_os_material_customer_scope ON public.service_order_materials;
CREATE TRIGGER trg_guard_os_material_customer_scope
  BEFORE INSERT OR UPDATE OF company_id, service_order_id, inventory_id, stock_id
  ON public.service_order_materials
  FOR EACH ROW EXECUTE FUNCTION public.guard_os_material_customer_scope();

-- ---------------------------------------------------------------------------
-- 2. Despesas pagas pelo cliente (fora do Financeiro da prestadora)
-- ---------------------------------------------------------------------------

CREATE TABLE public.customer_paid_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (btrim(description) <> ''),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT current_date,
  category text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_paid_expenses_void_pair_check CHECK (
    (voided_at IS NULL AND voided_by IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL)
  )
);

CREATE INDEX idx_customer_paid_expenses_company_customer_date
  ON public.customer_paid_expenses(company_id, customer_id, expense_date DESC);
CREATE INDEX idx_customer_paid_expenses_active
  ON public.customer_paid_expenses(company_id, customer_id)
  WHERE voided_at IS NULL;

COMMENT ON TABLE public.customer_paid_expenses IS
  'Despesas custeadas diretamente pelo cliente. Não integra financial_transactions nem o caixa/DRE da prestadora; correções são feitas por void.';

CREATE OR REPLACE FUNCTION public.guard_customer_paid_expense_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer_company uuid;
  v_can_manage boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'Despesa estornada é imutável.' USING ERRCODE = '23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Campos de identidade da despesa são imutáveis.' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT company_id INTO v_customer_company
    FROM public.customers WHERE id = NEW.customer_id;
  IF NOT FOUND OR NEW.company_id IS DISTINCT FROM v_customer_company THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa informada.' USING ERRCODE = '23514';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT (
      public.is_admin_or_gestor(v_uid)
      OR public.is_super_admin(v_uid)
      OR public.has_full_permissions(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.user_permissions up
         WHERE up.user_id = v_uid AND up.is_active = true
           AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_finance')
      )
    ) INTO v_can_manage;
    IF v_uid IS NULL
       OR public.get_user_company_id(v_uid) IS DISTINCT FROM NEW.company_id
       OR NOT COALESCE(v_can_manage, false)
       OR NOT public.tenant_subscription_allows_access(NEW.company_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar despesas do cliente.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(v_uid, NEW.created_by);
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL THEN
      RAISE EXCEPTION 'Uma despesa nova não pode nascer estornada.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.voided_at IS NOT NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      NEW.voided_at := now();
      NEW.voided_by := v_uid;
    ELSE
      NEW.voided_at := COALESCE(NEW.voided_at, now());
      NEW.voided_by := COALESCE(NEW.voided_by, v_uid);
    END IF;
  ELSIF NEW.voided_by IS NOT NULL THEN
    RAISE EXCEPTION 'voided_by exige voided_at.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_customer_paid_expense_write
  BEFORE INSERT OR UPDATE ON public.customer_paid_expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_paid_expense_write();
CREATE TRIGGER trg_customer_paid_expenses_updated_at
  BEFORE UPDATE ON public.customer_paid_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_paid_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_paid_expenses_select_entitled_tenant"
  ON public.customer_paid_expenses FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "customer_paid_expenses_insert_finance_manager"
  ON public.customer_paid_expenses FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.tenant_subscription_allows_access(company_id)
    AND (
      (SELECT public.is_admin_or_gestor(auth.uid()))
      OR (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_full_permissions(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.user_permissions up
         WHERE up.user_id = (SELECT auth.uid()) AND up.is_active = true
           AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_finance')
      )
    )
  );

CREATE POLICY "customer_paid_expenses_update_finance_manager"
  ON public.customer_paid_expenses FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.tenant_subscription_allows_access(company_id)
    AND (
      (SELECT public.is_admin_or_gestor(auth.uid()))
      OR (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_full_permissions(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.user_permissions up
         WHERE up.user_id = (SELECT auth.uid()) AND up.is_active = true
           AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_finance')
      )
    )
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.tenant_subscription_allows_access(company_id)
  );

REVOKE ALL ON public.customer_paid_expenses FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.customer_paid_expenses TO authenticated;
GRANT ALL ON public.customer_paid_expenses TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Movimentação transacional com escopo de cliente (assinatura 9 args)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_inventory_id        uuid,
  p_movement_type       text,
  p_quantity            numeric,
  p_supplier_id         uuid    DEFAULT NULL,
  p_unit_cost           numeric DEFAULT NULL,
  p_notes               text    DEFAULT NULL,
  p_service_order_id    uuid    DEFAULT NULL,
  p_related_movement_id uuid    DEFAULT NULL,
  p_stock_id            uuid    DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_id uuid;
  v_archived_at timestamptz;
  v_user_company uuid;
  v_stock_id uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
  v_os_company uuid;
  v_os_customer uuid;
  v_os_technician uuid;
  v_os_created_by uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_can_manage boolean;
  v_row public.inventory_movements;
BEGIN
  IF v_uid IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501';
  END IF;
  IF p_movement_type NOT IN ('entrada','saida','ajuste','transferencia','estorno','consumo') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido: %', p_movement_type USING ERRCODE = '23514';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'A quantidade do movimento deve ser diferente de zero.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, customer_id, archived_at
    INTO v_company_id, v_customer_id, v_archived_at
    FROM public.inventory
   WHERE id = p_inventory_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado: %', p_inventory_id USING ERRCODE = 'P0002';
  END IF;
  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Material arquivado não pode ser movimentado.' USING ERRCODE = '23514';
  END IF;

  v_user_company := public.get_user_company_id(v_uid);
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (v_company_id = v_user_company OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa.' USING ERRCODE = '42501';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'Assinatura sem acesso ao estoque.' USING ERRCODE = '42501';
  END IF;

  v_stock_id := p_stock_id;
  IF v_stock_id IS NULL THEN
    IF v_customer_id IS NULL THEN
      SELECT id INTO v_stock_id
        FROM public.stocks
       WHERE company_id = v_company_id AND customer_id IS NULL AND is_default
       LIMIT 1;
    ELSE
      SELECT id INTO v_stock_id
        FROM public.stocks
       WHERE company_id = v_company_id AND customer_id = v_customer_id
       LIMIT 1;
    END IF;
    IF v_stock_id IS NULL THEN
      RAISE EXCEPTION 'Não existe local de estoque compatível com o material.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT company_id, customer_id INTO v_stock_company, v_stock_customer
    FROM public.stocks WHERE id = v_stock_id;
  IF NOT FOUND
     OR v_stock_company IS DISTINCT FROM v_company_id
     OR v_stock_customer IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION 'Material e local de estoque não pertencem ao mesmo tenant/cliente.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_stock(v_uid, v_stock_id)
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Sem acesso a este local de estoque.' USING ERRCODE = '42501';
  END IF;

  IF p_service_order_id IS NOT NULL THEN
    SELECT company_id, customer_id, technician_id, created_by
      INTO v_os_company, v_os_customer, v_os_technician, v_os_created_by
      FROM public.service_orders WHERE id = p_service_order_id;
    IF NOT FOUND OR v_os_company IS DISTINCT FROM v_company_id THEN
      RAISE EXCEPTION 'Ordem de serviço não pertence à empresa do movimento.' USING ERRCODE = '42501';
    END IF;
    IF v_customer_id IS NOT NULL AND v_customer_id IS DISTINCT FROM v_os_customer THEN
      RAISE EXCEPTION 'Estoque de cliente só pode ser consumido em OS do mesmo cliente.' USING ERRCODE = '42501';
    END IF;
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT public.is_super_admin(v_uid)
       AND NOT public.can_manage_system(v_uid)
       AND v_os_technician IS DISTINCT FROM v_uid
       AND v_os_created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Sem permissão para movimentar materiais desta OS.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_customer_id IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT (
      public.is_admin_or_gestor(v_uid)
      OR public.is_super_admin(v_uid)
      OR public.has_full_permissions(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.user_permissions up
         WHERE up.user_id = v_uid AND up.is_active = true
           AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory')
      )
    ) INTO v_can_manage;
    IF NOT COALESCE(v_can_manage, false) THEN
      RAISE EXCEPTION 'Sem permissão para movimentar estoque de cliente.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers sp
     WHERE sp.id = p_supplier_id AND sp.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor não pertence à empresa do movimento.' USING ERRCODE = '42501';
  END IF;
  IF p_related_movement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_movements rm
     WHERE rm.id = p_related_movement_id
       AND rm.company_id = v_company_id
       AND rm.customer_id IS NOT DISTINCT FROM v_customer_id
  ) THEN
    RAISE EXCEPTION 'Movimento relacionado não pertence ao mesmo tenant/cliente.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity, min_quantity, is_present
  ) VALUES (
    v_company_id, p_inventory_id, v_stock_id, 0, NULL, true
  )
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true;

  SELECT quantity INTO v_stock_before
    FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id
   FOR UPDATE;

  v_stock_after := COALESCE(v_stock_before, 0) + p_quantity;
  UPDATE public.inventory_stock_levels
     SET quantity = v_stock_after
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id;

  INSERT INTO public.inventory_movements (
    inventory_id, company_id, customer_id, stock_id, movement_type, quantity,
    stock_before, stock_after, supplier_id, unit_cost, notes,
    service_order_id, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, v_customer_id, v_stock_id, p_movement_type, p_quantity,
    v_stock_before, v_stock_after, p_supplier_id, p_unit_cost, p_notes,
    p_service_order_id, p_related_movement_id, v_uid
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. CRUD transacional mínimo de material do estoque do cliente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_customer_stock_item(
  p_customer_id uuid,
  p_name text,
  p_sku text,
  p_unit text,
  p_initial_quantity numeric,
  p_min_quantity numeric,
  p_cost_price numeric,
  p_notes text,
  p_client_request_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_name text;
  v_stock_id uuid;
  v_inventory_id uuid;
  v_can_manage boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL OR NULLIF(btrim(p_unit), '') IS NULL THEN
    RAISE EXCEPTION 'Nome e unidade são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_initial_quantity, 0) < 0 OR p_min_quantity < 0
     OR COALESCE(p_cost_price, 0) < 0 THEN
    RAISE EXCEPTION 'Quantidade, mínimo e custo não podem ser negativos.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_client_request_id), '') IS NULL THEN
    RAISE EXCEPTION 'client_request_id é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, c.name INTO v_company_id, v_customer_name
    FROM public.customers c WHERE c.id = p_customer_id;
  IF NOT FOUND
     OR (v_company_id IS DISTINCT FROM public.get_user_company_id(v_uid)
         AND NOT public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Cliente não pertence à empresa do usuário.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin(v_uid)
     AND NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'Assinatura sem acesso ao estoque.' USING ERRCODE = '42501';
  END IF;

  SELECT (
    public.is_admin_or_gestor(v_uid)
    OR public.is_super_admin(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = v_uid AND up.is_active = true
         AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory')
    )
  ) INTO v_can_manage;
  IF NOT COALESCE(v_can_manage, false) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar estoque de cliente.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('customer-stock-item:' || v_company_id::text || ':' || p_client_request_id));
  SELECT id INTO v_inventory_id FROM public.inventory
   WHERE company_id = v_company_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory
       WHERE id = v_inventory_id AND customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'client_request_id já usado em outro escopo.' USING ERRCODE = '23505';
    END IF;
    RETURN v_inventory_id;
  END IF;

  INSERT INTO public.stocks (company_id, customer_id, name, is_default, sort_order)
  VALUES (v_company_id, p_customer_id, 'Estoque — ' || v_customer_name, false, 0)
  ON CONFLICT (company_id, customer_id) WHERE customer_id IS NOT NULL
  DO UPDATE SET customer_id = EXCLUDED.customer_id
  RETURNING id INTO v_stock_id;

  INSERT INTO public.inventory (
    company_id, customer_id, name, sku, unit, quantity, min_quantity,
    cost_price, notes, client_request_id
  ) VALUES (
    v_company_id, p_customer_id, btrim(p_name), NULLIF(btrim(p_sku), ''),
    btrim(p_unit), 0, p_min_quantity, p_cost_price,
    NULLIF(btrim(p_notes), ''), p_client_request_id
  ) RETURNING id INTO v_inventory_id;

  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity, min_quantity, is_present
  ) VALUES (
    v_company_id, v_inventory_id, v_stock_id, 0, p_min_quantity, true
  );

  IF COALESCE(p_initial_quantity, 0) > 0 THEN
    PERFORM public.register_inventory_movement(
      v_inventory_id, 'entrada', p_initial_quantity, NULL, p_cost_price,
      'Saldo inicial do estoque do cliente', NULL, NULL, v_stock_id
    );
  END IF;
  RETURN v_inventory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer_stock_item(
  p_inventory_id uuid,
  p_name text,
  p_sku text,
  p_unit text,
  p_min_quantity numeric,
  p_cost_price numeric,
  p_notes text
)
RETURNS public.inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_id uuid;
  v_can_manage boolean;
  v_row public.inventory;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(p_name), '') IS NULL OR NULLIF(btrim(p_unit), '') IS NULL
     OR p_min_quantity < 0 OR COALESCE(p_cost_price, 0) < 0 THEN
    RAISE EXCEPTION 'Dados do material inválidos.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, customer_id INTO v_company_id, v_customer_id
    FROM public.inventory WHERE id = p_inventory_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Material ativo do estoque de cliente não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  SELECT (
    public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
      AND up.is_active = true AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory'))
  ) INTO v_can_manage;
  IF (v_company_id IS DISTINCT FROM public.get_user_company_id(v_uid) AND NOT public.is_super_admin(v_uid))
     OR NOT COALESCE(v_can_manage, false)
     OR (NOT public.is_super_admin(v_uid) AND NOT public.tenant_subscription_allows_access(v_company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este material.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory SET
    name = btrim(p_name), sku = NULLIF(btrim(p_sku), ''), unit = btrim(p_unit),
    min_quantity = p_min_quantity, cost_price = p_cost_price,
    notes = NULLIF(btrim(p_notes), '')
  WHERE id = p_inventory_id RETURNING * INTO v_row;

  UPDATE public.inventory_stock_levels l
     SET min_quantity = p_min_quantity
    FROM public.stocks s
   WHERE l.inventory_id = p_inventory_id AND s.id = l.stock_id
     AND s.customer_id = v_customer_id;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_customer_stock_item(p_inventory_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_id uuid;
  v_balance numeric;
  v_can_manage boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501'; END IF;
  SELECT company_id, customer_id INTO v_company_id, v_customer_id
    FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND OR v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Material de estoque de cliente não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  SELECT (
    public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
      AND up.is_active = true AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_inventory'))
  ) INTO v_can_manage;
  IF (v_company_id IS DISTINCT FROM public.get_user_company_id(v_uid) AND NOT public.is_super_admin(v_uid))
     OR NOT COALESCE(v_can_manage, false)
     OR (NOT public.is_super_admin(v_uid) AND NOT public.tenant_subscription_allows_access(v_company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para arquivar este material.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id FOR UPDATE;
  SELECT COALESCE(sum(quantity), 0) INTO v_balance
    FROM public.inventory_stock_levels WHERE inventory_id = p_inventory_id;
  IF v_balance <> 0 THEN
    RAISE EXCEPTION 'Zere o saldo do material antes de arquivá-lo.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.inventory SET archived_at = COALESCE(archived_at, now()) WHERE id = p_inventory_id;
  UPDATE public.inventory_stock_levels SET is_present = false WHERE inventory_id = p_inventory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_stock_item(uuid,text,text,text,numeric,numeric,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_customer_stock_item(uuid,text,text,text,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_customer_stock_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_stock_item(uuid,text,text,text,numeric,numeric,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_customer_stock_item(uuid,text,text,text,numeric,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_customer_stock_item(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Commit idempotente do consumo da OS, com pareamento cliente/material/local
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_os_material_consumption(
  p_service_order_id uuid,
  p_lines            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_is_super     boolean;
  v_can_manage   boolean;
  v_user_company uuid;
  v_so           record;

  v_line         jsonb;
  v_op           jsonb;
  v_ops          jsonb := '[]'::jsonb;
  v_keep         uuid[] := ARRAY[]::uuid[];

  v_line_id      uuid;
  v_inv          uuid;
  v_stock        uuid;
  v_stock_name   text;
  v_inv_customer uuid;
  v_stock_customer uuid;
  v_qty          numeric;
  v_notes        text;
  v_inv_changed  boolean;

  v_row          public.service_order_materials%ROWTYPE;
  v_row_id       uuid;
  v_target       numeric;
  v_delta        numeric;
  v_cost         numeric;
  v_type         text;
  v_mov_notes    text;
  v_mov          public.inventory_movements;

  v_committed    jsonb := '[]'::jsonb;
  v_warnings     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para registrar o consumo de materiais.'
      USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Lista de materiais inválida.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_is_super     := public.is_super_admin(v_uid);
  v_can_manage   := public.can_manage_system(v_uid);
  v_user_company := public.get_user_company_id(v_uid);

  -- Mutex por OS: duplo clique / duas abas esperam a primeira terminar.
  -- Advisory lock (e não FOR UPDATE na OS) para não travar quem só está editando a OS.
  PERFORM pg_advisory_xact_lock(hashtext('commit_os_material_consumption:' || p_service_order_id::text));

  SELECT so.id, so.company_id, so.customer_id, so.technician_id, so.created_by, so.order_number
    INTO v_so
    FROM public.service_orders so
   WHERE so.id = p_service_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Guard 1: isolamento por empresa
  IF NOT (v_is_super OR v_so.company_id = v_user_company) THEN
    RAISE EXCEPTION 'Acesso negado: esta ordem de serviço é de outra empresa.'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: posse da OS (espelha a policy de inventory_movements)
  IF NOT (v_is_super OR v_can_manage OR v_so.technician_id = v_uid OR v_so.created_by = v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: apenas o técnico responsável, quem criou a ordem de serviço ou um gestor pode registrar o consumo de materiais.'
      USING ERRCODE = '42501';
  END IF;

  -- Trava as linhas já existentes desta OS (protege contra chamada concorrente).
  PERFORM 1 FROM public.service_order_materials
   WHERE service_order_id = p_service_order_id
   FOR UPDATE;

  ----------------------------------------------------------
  -- PASSO A — valida o payload inteiro ANTES de mexer em qualquer coisa.
  ----------------------------------------------------------
  FOR v_line IN SELECT elem FROM jsonb_array_elements(p_lines) AS elem LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'Lista de materiais inválida.' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_line_id := NULLIF(v_line->>'id', '')::uuid;
    v_inv     := NULLIF(v_line->>'inventory_id', '')::uuid;
    v_stock   := NULLIF(v_line->>'stock_id', '')::uuid;
    v_qty     := NULLIF(v_line->>'quantity', '')::numeric;

    IF v_inv IS NULL OR v_stock IS NULL THEN
      RAISE EXCEPTION 'Informe o material e o local de estoque de cada item.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada material precisa ser maior que zero.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_line_id IS NOT NULL AND v_line_id = ANY(v_keep) THEN
      RAISE EXCEPTION 'O mesmo item de material foi enviado duas vezes.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- material e local da MESMA empresa e do MESMO escopo de cliente.
    SELECT i.customer_id INTO v_inv_customer
      FROM public.inventory i
     WHERE i.id = v_inv
       AND i.company_id = v_so.company_id
       AND i.archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material ativo não encontrado no estoque desta empresa.'
        USING ERRCODE = '42501';
    END IF;

    SELECT s.name, s.customer_id INTO v_stock_name, v_stock_customer
      FROM public.stocks s
     WHERE s.id = v_stock AND s.company_id = v_so.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Local de estoque não encontrado nesta empresa.'
        USING ERRCODE = '42501';
    END IF;

    IF v_inv_customer IS DISTINCT FROM v_stock_customer THEN
      RAISE EXCEPTION 'Material e local de estoque devem pertencer ao mesmo cliente.'
        USING ERRCODE = '42501';
    END IF;
    IF v_inv_customer IS NOT NULL AND v_inv_customer IS DISTINCT FROM v_so.customer_id THEN
      RAISE EXCEPTION 'Estoque de cliente só pode ser consumido em OS do mesmo cliente.'
        USING ERRCODE = '42501';
    END IF;

    -- ACL por local (a mesma de can_access_stock; RLS não cobre SECURITY DEFINER)
    IF NOT public.can_access_stock(v_uid, v_stock) THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão no local de estoque "%".', v_stock_name
        USING ERRCODE = '42501';
    END IF;

    -- linha existente precisa ser DESTA OS
    IF v_line_id IS NOT NULL THEN
      PERFORM 1 FROM public.service_order_materials m
        WHERE m.id = v_line_id AND m.service_order_id = p_service_order_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos itens não pertence a esta ordem de serviço.'
          USING ERRCODE = '42501';
      END IF;
      v_keep := v_keep || v_line_id;
    END IF;
  END LOOP;

  ----------------------------------------------------------
  -- PASSO B — sincroniza o rascunho e monta a fila de operações de estoque.
  --   Cada operação = (linha, material, local, quantidade ALVO). O movimento real
  --   sai do delta contra committed_quantity no momento da execução.
  ----------------------------------------------------------

  -- B1. linha que existe no banco e não veio no payload = removida → alvo 0 e apaga
  FOR v_row IN
    SELECT * FROM public.service_order_materials
     WHERE service_order_id = p_service_order_id
       AND NOT (id = ANY(v_keep))
     ORDER BY created_at
  LOOP
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'row_id',       v_row.id,
      'inventory_id', v_row.inventory_id,
      'stock_id',     v_row.stock_id,
      'target',       0::numeric,
      'unit_cost',    v_row.unit_cost,
      'notes',        v_row.notes,
      'delete_after', true
    ));
  END LOOP;

  -- B2. linhas do payload (novas e existentes)
  FOR v_line IN SELECT elem FROM jsonb_array_elements(p_lines) AS elem LOOP
    v_line_id := NULLIF(v_line->>'id', '')::uuid;
    v_inv     := NULLIF(v_line->>'inventory_id', '')::uuid;
    v_stock   := NULLIF(v_line->>'stock_id', '')::uuid;
    v_qty     := NULLIF(v_line->>'quantity', '')::numeric;
    v_notes   := NULLIF(btrim(COALESCE(v_line->>'notes', '')), '');

    IF v_line_id IS NULL THEN
      -- linha nova criada direto no resumo de finalização
      INSERT INTO public.service_order_materials (
        company_id, service_order_id, inventory_id, stock_id,
        quantity, committed_quantity, notes, created_by
      ) VALUES (
        v_so.company_id, p_service_order_id, v_inv, v_stock,
        v_qty, 0, v_notes, v_uid
      )
      RETURNING * INTO v_row;
    ELSE
      SELECT * INTO v_row FROM public.service_order_materials
       WHERE id = v_line_id FOR UPDATE;

      -- Trocou de material ou de local com quantidade já movimentada?
      -- Estorna TUDO no par antigo antes de reapontar a linha — senão o saldo
      -- voltaria no lugar errado.
      IF v_row.inventory_id IS DISTINCT FROM v_inv OR v_row.stock_id IS DISTINCT FROM v_stock THEN
        v_inv_changed := (v_row.inventory_id IS DISTINCT FROM v_inv);

        IF v_row.committed_quantity <> 0 THEN
          v_ops := v_ops || jsonb_build_array(jsonb_build_object(
            'row_id',       v_row.id,
            'inventory_id', v_row.inventory_id,
            'stock_id',     v_row.stock_id,
            'target',       0::numeric,
            'unit_cost',    v_row.unit_cost,
            'notes',        v_row.notes,
            'delete_after', false
          ));
        END IF;

        UPDATE public.service_order_materials
           SET inventory_id = v_inv,
               stock_id     = v_stock,
               -- material novo = custo tem que reancorar no cost_price dele
               unit_cost    = CASE WHEN v_inv_changed THEN NULL ELSE unit_cost END
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;

      UPDATE public.service_order_materials
         SET quantity = v_qty,
             notes    = v_notes
       WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;

    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'row_id',       v_row.id,
      'inventory_id', v_inv,
      'stock_id',     v_stock,
      'target',       v_qty,
      'unit_cost',    NULL,           -- null = usa o unit_cost já gravado na linha
      'notes',        v_notes,
      'delete_after', false
    ));
  END LOOP;

  ----------------------------------------------------------
  -- PASSO C — executa a fila: delta → movimento → atualiza a âncora.
  ----------------------------------------------------------
  FOR v_op IN SELECT elem FROM jsonb_array_elements(v_ops) AS elem LOOP
    v_row_id := (v_op->>'row_id')::uuid;
    v_inv    := (v_op->>'inventory_id')::uuid;
    v_stock  := (v_op->>'stock_id')::uuid;
    v_target := (v_op->>'target')::numeric;

    SELECT * INTO v_row FROM public.service_order_materials WHERE id = v_row_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE; -- defensivo: linha sumiu no meio do caminho
    END IF;

    v_delta := v_target - COALESCE(v_row.committed_quantity, 0);

    IF v_delta <> 0 THEN
      -- Custo: congela no PRIMEIRO commit e reusa depois (inclusive no estorno),
      -- para devolução valorizar exatamente igual ao consumo.
      v_cost := COALESCE((v_op->>'unit_cost')::numeric, v_row.unit_cost);
      IF v_cost IS NULL THEN
        SELECT i.cost_price INTO v_cost FROM public.inventory i WHERE i.id = v_inv;
        UPDATE public.service_order_materials
           SET unit_cost = v_cost
         WHERE id = v_row_id AND unit_cost IS NULL;
      END IF;

      v_type := CASE WHEN v_delta > 0 THEN 'consumo' ELSE 'estorno' END;

      v_mov_notes := CASE WHEN v_delta > 0
                          THEN 'Consumo na OS #'
                          ELSE 'Estorno de consumo na OS #'
                     END
                     || v_so.order_number::text
                     || COALESCE(' — ' || NULLIF(btrim(COALESCE(v_op->>'notes', '')), ''), '');

      SELECT * INTO v_mov FROM public.register_inventory_movement(
        p_inventory_id        => v_inv,
        p_movement_type       => v_type,
        -- consumo sai do estoque (delta negativo); estorno devolve (positivo)
        p_quantity            => CASE WHEN v_delta > 0 THEN -v_delta ELSE abs(v_delta) END,
        p_supplier_id         => NULL,
        p_unit_cost           => v_cost,
        p_notes               => v_mov_notes,
        p_service_order_id    => p_service_order_id,
        p_related_movement_id => NULL,
        p_stock_id            => v_stock
      );

      v_committed := v_committed || jsonb_build_array(jsonb_build_object(
        'line_id',       v_row_id,
        'inventory_id',  v_inv,
        'stock_id',      v_stock,
        'movement_id',   v_mov.id,
        'movement_type', v_type,
        'quantity',      abs(v_delta),
        'stock_after',   v_mov.stock_after
      ));

      -- Saldo negativo NÃO é erro (decisão do CEO): avisa e segue.
      IF v_mov.stock_after < 0 THEN
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'line_id',            v_row_id,
          'inventory_id',       v_inv,
          'stock_id',           v_stock,
          'resulting_quantity', v_mov.stock_after,
          'reason',             'saldo_negativo'
        ));
      END IF;
    END IF;

    UPDATE public.service_order_materials
       SET committed_quantity = v_target
     WHERE id = v_row_id;

    IF COALESCE((v_op->>'delete_after')::boolean, false) THEN
      DELETE FROM public.service_order_materials WHERE id = v_row_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('committed', v_committed, 'warnings', v_warnings);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_low_stock_on_level_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_material_name text;
  v_stock_name    text;
  v_was_below     boolean;
  v_is_below      boolean;
BEGIN
  -- Estoque de cliente é acompanhado na ficha do cliente e não gera alerta geral.
  IF EXISTS (
    SELECT 1
      FROM public.inventory i
      JOIN public.stocks s ON s.id = NEW.stock_id
     WHERE i.id = NEW.inventory_id
       AND (i.customer_id IS NOT NULL OR s.customer_id IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Material AUSENTE deste local não gera alerta (presença manda mais que mínimo).
  IF NEW.is_present IS FALSE THEN
    RETURN NEW;
  END IF;

  -- Sem mínimo configurado (ou mínimo <= 0) => nada a monitorar.
  IF NEW.min_quantity IS NULL OR NEW.min_quantity <= 0 THEN
    RETURN NEW;
  END IF;

  -- Estado atual: abaixo do mínimo?
  v_is_below := NEW.quantity < NEW.min_quantity;

  IF NOT v_is_below THEN
    RETURN NEW; -- continua ok, nada a notificar
  END IF;

  -- Estado anterior: já estava abaixo? (usa o mínimo vigente na época).
  -- Se OLD.min_quantity é NULL/<=0, não havia monitoramento antes => tratamos
  -- como "não estava abaixo" para permitir a primeira notificação.
  v_was_below := (
    OLD.min_quantity IS NOT NULL
    AND OLD.min_quantity > 0
    AND OLD.quantity < OLD.min_quantity
  );

  -- Só notifica na TRANSIÇÃO ok -> abaixo (anti-spam principal).
  IF v_was_below THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.name INTO v_material_name
  FROM public.inventory i
  WHERE i.id = NEW.inventory_id;

  SELECT s.name INTO v_stock_name
  FROM public.stocks s
  WHERE s.id = NEW.stock_id;

  -- Insere 1 notificação por usuário ADMIN ativo da empresa.
  -- Anti-dup extra: pula se já há notificação NÃO-LIDA do mesmo tipo, material
  -- e local para aquele usuário nas últimas 24h (evita re-notificar em ping-pong
  -- de saldo dentro de um dia). O casamento por material/local é feito pela
  -- action_url que carrega os ids em querystring.
  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, icon, expires_at
  )
  SELECT DISTINCT
    p.user_id,
    'inventory_low_stock',
    'Estoque baixo',
    'O material "' || COALESCE(NULLIF(v_material_name, ''), 'sem nome')
      || '" está abaixo do mínimo em '
      || COALESCE(NULLIF(v_stock_name, ''), 'estoque')
      || ' (' || trim(to_char(NEW.quantity, 'FM999999990.####'))
      || '/' || trim(to_char(NEW.min_quantity, 'FM999999990.####')) || ').',
    '/inventory?low=1&material=' || NEW.inventory_id::text
      || '&stock=' || NEW.stock_id::text,
    'AlertTriangle',
    now() + interval '30 days'
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.user_id
   AND ur.role = 'admin'::app_role
  WHERE p.company_id = NEW.company_id
    AND p.user_id IS NOT NULL
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_notifications un
      WHERE un.user_id = p.user_id
        AND un.type = 'inventory_low_stock'
        AND un.read_at IS NULL
        AND un.created_at > now() - interval '24 hours'
        AND un.action_url = '/inventory?low=1&material=' || NEW.inventory_id::text
          || '&stock=' || NEW.stock_id::text
    );

  RETURN NEW;
END;
$function$;

-- Trigger inalterado (AFTER UPDATE OF quantity, min_quantity). Reemitido idempotente

COMMIT;
