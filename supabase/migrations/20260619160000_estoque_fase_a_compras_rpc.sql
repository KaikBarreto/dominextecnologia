-- Fase A — Estoque em abas (Kardex + Compras)
-- Parte 2/2: tabelas de cotação de compra + RPC atômica de movimento.
-- RLS espelhada de inventory; tudo tenant.

------------------------------------------------------------
-- 3. Tabelas de cotação de compra
------------------------------------------------------------

-- 3.1 material_purchases (a "cotação"/pedido de compra)
CREATE TABLE IF NOT EXISTS public.material_purchases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  status              text NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho','aprovada','cancelada')),
  approved_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes               text,
  created_by          uuid,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.material_purchases IS 'Cotação/pedido de compra de materiais por empresa. Aprovação escolhe um fornecedor (approved_supplier_id).';

CREATE INDEX IF NOT EXISTS idx_material_purchases_company_id ON public.material_purchases(company_id);

DROP TRIGGER IF EXISTS set_material_purchases_updated_at ON public.material_purchases;
CREATE TRIGGER set_material_purchases_updated_at
  BEFORE UPDATE ON public.material_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3.2 material_purchase_items (itens cotados na compra)
CREATE TABLE IF NOT EXISTS public.material_purchase_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  purchase_id  uuid NOT NULL REFERENCES public.material_purchases(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  quantity     numeric NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.material_purchase_items IS 'Itens (materiais) de uma cotação de compra.';

CREATE INDEX IF NOT EXISTS idx_material_purchase_items_company_id ON public.material_purchase_items(company_id);
CREATE INDEX IF NOT EXISTS idx_material_purchase_items_purchase_id ON public.material_purchase_items(purchase_id);

-- 3.3 material_purchase_suppliers (fornecedores convidados a cotar)
CREATE TABLE IF NOT EXISTS public.material_purchase_suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  purchase_id  uuid NOT NULL REFERENCES public.material_purchases(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, supplier_id)
);
COMMENT ON TABLE public.material_purchase_suppliers IS 'Fornecedores incluídos numa cotação de compra (a quem se pede preço).';

CREATE INDEX IF NOT EXISTS idx_material_purchase_suppliers_company_id ON public.material_purchase_suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_material_purchase_suppliers_purchase_id ON public.material_purchase_suppliers(purchase_id);

-- 3.4 material_purchase_quotes (preço cotado por fornecedor x item)
CREATE TABLE IF NOT EXISTS public.material_purchase_quotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  purchase_id  uuid NOT NULL REFERENCES public.material_purchases(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  unit_price   numeric NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, supplier_id, inventory_id)
);
COMMENT ON TABLE public.material_purchase_quotes IS 'Preço unitário cotado por (fornecedor, item) dentro de uma compra.';

CREATE INDEX IF NOT EXISTS idx_material_purchase_quotes_company_id ON public.material_purchase_quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_material_purchase_quotes_purchase_id ON public.material_purchase_quotes(purchase_id);

------------------------------------------------------------
-- 4. RLS espelhada de inventory pras 4 tabelas de compra
--    Predicado: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
------------------------------------------------------------

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'material_purchases',
    'material_purchase_items',
    'material_purchase_suppliers',
    'material_purchase_quotes'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_select_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_insert_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_update_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_delete_own_company', t);
  END LOOP;
END $$;

------------------------------------------------------------
-- 5. RPC atômica register_inventory_movement (SECURITY DEFINER)
--    ÚNICO caminho de escrita de movimento de estoque.
--    p_quantity é o DELTA assinado a aplicar (entrada +, saida -).
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_inventory_id       uuid,
  p_movement_type      text,
  p_quantity           numeric,
  p_supplier_id        uuid    DEFAULT NULL,
  p_unit_cost          numeric DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_service_order_id   uuid    DEFAULT NULL,
  p_related_movement_id uuid   DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_stock_before numeric;
  v_stock_after  numeric;
  v_row          public.inventory_movements;
BEGIN
  -- Valida tipo
  IF p_movement_type NOT IN ('entrada','saida','ajuste','transferencia','estorno') THEN
    RAISE EXCEPTION 'Tipo de movimento invalido: %', p_movement_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trava a linha do item e lê saldo + empresa dona
  SELECT quantity, company_id
    INTO v_stock_before, v_company_id
    FROM public.inventory
   WHERE id = p_inventory_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Isolamento tenant: o item tem que ser da empresa do usuario (super_admin passa)
  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_stock_after := COALESCE(v_stock_before, 0) + p_quantity;

  -- Aplica o saldo
  UPDATE public.inventory
     SET quantity = v_stock_after
   WHERE id = p_inventory_id;

  -- Registra o movimento (auditoria do Kardex)
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, movement_type, quantity,
    stock_before, stock_after, supplier_id, unit_cost,
    notes, service_order_id, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_movement_type, p_quantity,
    v_stock_before, v_stock_after, p_supplier_id, p_unit_cost,
    p_notes, p_service_order_id, p_related_movement_id, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid)
  IS 'Caminho atomico unico de escrita de estoque. p_quantity = delta assinado. Trava o item (FOR UPDATE), valida tenant, atualiza saldo e grava o movimento no Kardex.';

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid)
  TO authenticated;
