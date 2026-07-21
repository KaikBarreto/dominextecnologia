-- ONDA 1 — Overhaul de Estoque: FUNDAÇÃO de dados
-- Separar CATÁLOGO (inventory) de SALDO (inventory_stock_levels), permitindo
-- N estoques por empresa (stocks) que compartilham os mesmos materiais.
-- Introduz grupos de material (material_groups) substituindo categorias fixas.
--
-- Invariantes:
--   * inventory.quantity vira ESPELHO (sum dos levels) via trigger, pra não
--     quebrar consumidores legados (OS, orçamento, export) nesta onda.
--   * EXATAMENTE 1 estoque default por empresa (índice único parcial + RPC atômica).
--   * Não é possível excluir o estoque principal nem o último estoque (2 guards).
-- RLS: espelha a forma exata das policies de inventory
--   (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())).
-- Migration idempotente (IF NOT EXISTS / DROP ... IF EXISTS) e sem perda de saldo.

------------------------------------------------------------
-- 1. Tabela stocks (os "estoques" da empresa)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.stocks IS 'Estoques (locais/depósitos) de uma empresa. Compartilham o catálogo inventory; saldo por estoque vive em inventory_stock_levels.';

CREATE INDEX IF NOT EXISTS idx_stocks_company_id ON public.stocks(company_id);
-- EXATAMENTE 1 default por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stocks_default_per_company
  ON public.stocks(company_id) WHERE is_default;

DROP TRIGGER IF EXISTS set_stocks_updated_at ON public.stocks;
CREATE TRIGGER set_stocks_updated_at
  BEFORE UPDATE ON public.stocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 2. Tabela material_groups (grupos de material — substituem categorias fixas)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.material_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  color       text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
COMMENT ON TABLE public.material_groups IS 'Grupos de material por empresa (CRUD). Substituem inventory.category (mantida como legado).';

CREATE INDEX IF NOT EXISTS idx_material_groups_company_id ON public.material_groups(company_id);

DROP TRIGGER IF EXISTS set_material_groups_updated_at ON public.material_groups;
CREATE TRIGGER set_material_groups_updated_at
  BEFORE UPDATE ON public.material_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- inventory ganha group_id (category fica como legado, NÃO dropar)
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.material_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_group_id ON public.inventory(group_id);

------------------------------------------------------------
-- 3. Tabela inventory_stock_levels (saldo + mínimo POR material×estoque)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_stock_levels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  stock_id     uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quantity     numeric NOT NULL DEFAULT 0,
  min_quantity numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, stock_id)
);
COMMENT ON TABLE public.inventory_stock_levels IS 'Saldo (quantity) e mínimo (min_quantity) de um material (inventory_id) num estoque (stock_id). Fonte de verdade do saldo por estoque.';

CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_company_id ON public.inventory_stock_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_stock_id ON public.inventory_stock_levels(stock_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_inventory_id ON public.inventory_stock_levels(inventory_id);

DROP TRIGGER IF EXISTS set_inventory_stock_levels_updated_at ON public.inventory_stock_levels;
CREATE TRIGGER set_inventory_stock_levels_updated_at
  BEFORE UPDATE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 4. inventory_movements ganha stock_id (backfill mais adiante)
------------------------------------------------------------

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS stock_id uuid REFERENCES public.stocks(id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_stock_id ON public.inventory_movements(stock_id);

-- coluna de idempotência da transferência (dedup por client request id)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS client_request_id text;
-- UNIQUE parcial: só movimentos que trazem client_request_id são deduplicados,
-- por (empresa, request id). NULL não colide (índice parcial).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_movements_client_request
  ON public.inventory_movements(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

------------------------------------------------------------
-- 5. RLS espelhada de inventory pras 3 tabelas novas
--    Predicado: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
------------------------------------------------------------

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'stocks',
    'material_groups',
    'inventory_stock_levels'
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
-- 6. Guards de exclusão de stocks (espírito do last_admin_guard: 2 invariantes)
--    (a) não excluir o estoque principal (is_default = true)
--    (b) não excluir o último estoque da empresa
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_delete_protected_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count int;
BEGIN
  -- (a) estoque principal não pode ser excluído
  IF OLD.is_default THEN
    RAISE EXCEPTION 'não é possível excluir o estoque principal; defina outro como principal antes'
      USING ERRCODE = 'raise_exception';
  END IF;

  -- (b) último estoque da empresa não pode ser excluído
  SELECT count(*) INTO v_count
    FROM public.stocks
   WHERE company_id = OLD.company_id;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'não é possível excluir o último estoque da empresa'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_protected_stock ON public.stocks;
CREATE TRIGGER trg_prevent_delete_protected_stock
  BEFORE DELETE ON public.stocks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_protected_stock();

------------------------------------------------------------
-- 7. Trigger de sincronização do legado inventory.quantity
--    inventory.quantity = SUM(inventory_stock_levels.quantity) do material.
--    AFTER INSERT/UPDATE/DELETE em inventory_stock_levels.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_inventory_quantity_from_levels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inv uuid;
BEGIN
  v_inv := COALESCE(NEW.inventory_id, OLD.inventory_id);
  IF v_inv IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.inventory i
     SET quantity = COALESCE((
           SELECT SUM(l.quantity)
             FROM public.inventory_stock_levels l
            WHERE l.inventory_id = v_inv
         ), 0)
   WHERE i.id = v_inv;

  -- Se o inventory_id mudou num UPDATE (raro), sincroniza o antigo também
  IF TG_OP = 'UPDATE' AND NEW.inventory_id IS DISTINCT FROM OLD.inventory_id THEN
    UPDATE public.inventory i
       SET quantity = COALESCE((
             SELECT SUM(l.quantity)
               FROM public.inventory_stock_levels l
              WHERE l.inventory_id = OLD.inventory_id
           ), 0)
     WHERE i.id = OLD.inventory_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_quantity ON public.inventory_stock_levels;
CREATE TRIGGER trg_sync_inventory_quantity
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_quantity_from_levels();

------------------------------------------------------------
-- 8. Migration de dados (idempotente, crítica — não perder saldo)
------------------------------------------------------------

DO $$
DECLARE
  r_company       RECORD;
  v_stock_id      uuid;
  v_levels_ins    int := 0;
  v_mov_backfill  int := 0;
  v_groups_ins    int := 0;
  v_grp_match     int := 0;
  v_group_names   text[] := ARRAY['Peças','Filtros','Gases','Ferramentas','Materiais','Equipamentos','Outros'];
  v_gname         text;
  v_rc            int;
  v_sort          int;
BEGIN
  -- Para cada empresa que tem material no catálogo
  FOR r_company IN
    SELECT DISTINCT company_id
      FROM public.inventory
     WHERE company_id IS NOT NULL
  LOOP
    -- (a) garante 1 estoque default por empresa
    SELECT id INTO v_stock_id
      FROM public.stocks
     WHERE company_id = r_company.company_id AND is_default
     LIMIT 1;

    IF v_stock_id IS NULL THEN
      -- pode existir stock não-default? nesta onda inicial, não. cria o default.
      INSERT INTO public.stocks (company_id, name, is_default, sort_order)
      VALUES (r_company.company_id, 'Estoque Principal', true, 0)
      RETURNING id INTO v_stock_id;
    END IF;

    -- (b) cria os levels no estoque default a partir do saldo legado
    --     (só pros materiais que ainda não têm level nesse estoque)
    INSERT INTO public.inventory_stock_levels
      (company_id, inventory_id, stock_id, quantity, min_quantity)
    SELECT i.company_id, i.id, v_stock_id,
           COALESCE(i.quantity, 0), i.min_quantity
      FROM public.inventory i
     WHERE i.company_id = r_company.company_id
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory_stock_levels l
          WHERE l.inventory_id = i.id AND l.stock_id = v_stock_id
       );
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_levels_ins := v_levels_ins + v_rc;

    -- (c) backfill inventory_movements.stock_id no default onde NULL
    UPDATE public.inventory_movements
       SET stock_id = v_stock_id
     WHERE company_id = r_company.company_id
       AND stock_id IS NULL;
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_mov_backfill := v_mov_backfill + v_rc;

    -- (d) grupos default por empresa
    v_sort := 0;
    FOREACH v_gname IN ARRAY v_group_names LOOP
      INSERT INTO public.material_groups (company_id, name, sort_order)
      VALUES (r_company.company_id, v_gname, v_sort)
      ON CONFLICT (company_id, name) DO NOTHING;
      GET DIAGNOSTICS v_rc = ROW_COUNT;
      v_groups_ins := v_groups_ins + v_rc;
      v_sort := v_sort + 1;
    END LOOP;
  END LOOP;

  -- (d cont.) match de inventory.category -> material_groups.name (case-insensitive/trim)
  --           só onde group_id ainda é NULL. Categoria sem match fica NULL.
  UPDATE public.inventory i
     SET group_id = g.id
    FROM public.material_groups g
   WHERE g.company_id = i.company_id
     AND i.group_id IS NULL
     AND i.category IS NOT NULL
     AND lower(btrim(i.category)) = lower(btrim(g.name));
  GET DIAGNOSTICS v_grp_match = ROW_COUNT;

  RAISE NOTICE 'Backfill estoque: % levels criados, % movimentos com stock_id, % grupos criados, % materiais casados a grupo.',
    v_levels_ins, v_mov_backfill, v_groups_ins, v_grp_match;
END $$;

-- Depois do backfill, tornar inventory_movements.stock_id NOT NULL.
-- (só se todos os movimentos já têm stock_id — senão a migration para e sinaliza)
DO $$
DECLARE
  v_null int;
BEGIN
  SELECT count(*) INTO v_null FROM public.inventory_movements WHERE stock_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % movimentos ainda sem stock_id', v_null;
  END IF;

  -- idempotente: só aplica se ainda for nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='inventory_movements'
       AND column_name='stock_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.inventory_movements ALTER COLUMN stock_id SET NOT NULL;
  END IF;
END $$;

------------------------------------------------------------
-- 9. VERIFICAÇÃO de saldo: por empresa, SUM(levels no default) == SUM(inventory.quantity)
--    Aborta a migration se divergir.
------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  v_bad int := 0;
BEGIN
  FOR r IN
    SELECT i.company_id,
           COALESCE(SUM(i.quantity),0) AS inv_sum,
           COALESCE((
             SELECT SUM(l.quantity)
               FROM public.inventory_stock_levels l
               JOIN public.stocks s ON s.id = l.stock_id AND s.is_default
              WHERE l.company_id = i.company_id
           ),0) AS lvl_sum
      FROM public.inventory i
     WHERE i.company_id IS NOT NULL
     GROUP BY i.company_id
  LOOP
    IF r.inv_sum <> r.lvl_sum THEN
      RAISE WARNING 'DIVERGENCIA empresa %: inventory=%, levels_default=%', r.company_id, r.inv_sum, r.lvl_sum;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Verificacao de saldo falhou em % empresas — migration abortada', v_bad;
  ELSE
    RAISE NOTICE 'Verificacao de saldo OK: SUM(levels default) == SUM(inventory.quantity) em todas as empresas.';
  END IF;
END $$;

------------------------------------------------------------
-- 10. RPC set_default_stock — troca atômica do estoque principal
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_default_stock(p_stock_id uuid)
RETURNS public.stocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_row          public.stocks;
BEGIN
  SELECT company_id INTO v_company_id
    FROM public.stocks
   WHERE id = p_stock_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: estoque de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- zera os outros defaults da empresa (evita colisao do unique parcial)
  UPDATE public.stocks
     SET is_default = false
   WHERE company_id = v_company_id AND is_default AND id <> p_stock_id;

  UPDATE public.stocks
     SET is_default = true
   WHERE id = p_stock_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.set_default_stock(uuid)
  IS 'Define o estoque principal (is_default) da empresa de forma atomica. Valida tenant do caller.';

GRANT EXECUTE ON FUNCTION public.set_default_stock(uuid) TO authenticated, service_role;

------------------------------------------------------------
-- 11. RPC register_inventory_movement — nova assinatura com p_stock_id opcional
--     Compatível com a antiga (p_stock_id DEFAULT NULL -> usa estoque default).
--     Agora move o SALDO no inventory_stock_levels (não mais inventory.quantity
--     direto — a trigger sync_inventory_quantity_from_levels reflete no legado).
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_inventory_id       uuid,
  p_movement_type      text,
  p_quantity           numeric,
  p_supplier_id        uuid    DEFAULT NULL,
  p_unit_cost          numeric DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_service_order_id   uuid    DEFAULT NULL,
  p_related_movement_id uuid   DEFAULT NULL,
  p_stock_id           uuid    DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_stock_id     uuid;
  v_stock_before numeric;
  v_stock_after  numeric;
  v_row          public.inventory_movements;
BEGIN
  IF p_movement_type NOT IN ('entrada','saida','ajuste','transferencia','estorno') THEN
    RAISE EXCEPTION 'Tipo de movimento invalido: %', p_movement_type USING ERRCODE = 'check_violation';
  END IF;

  -- empresa dona do item
  SELECT company_id INTO v_company_id FROM public.inventory WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- resolve estoque alvo: parametro ou default da empresa
  v_stock_id := p_stock_id;
  IF v_stock_id IS NULL THEN
    SELECT id INTO v_stock_id FROM public.stocks
     WHERE company_id = v_company_id AND is_default LIMIT 1;
    IF v_stock_id IS NULL THEN
      RAISE EXCEPTION 'Empresa % nao tem estoque principal definido', v_company_id USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    -- valida que o stock informado é da mesma empresa
    PERFORM 1 FROM public.stocks WHERE id = v_stock_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque de outra empresa: %', v_stock_id USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- trava o level (cria com saldo 0 se ainda não existe) e lê saldo
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, v_stock_id, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  SELECT quantity INTO v_stock_before
    FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id
   FOR UPDATE;

  v_stock_after := COALESCE(v_stock_before, 0) + p_quantity;

  UPDATE public.inventory_stock_levels
     SET quantity = v_stock_after
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id;

  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, supplier_id, unit_cost,
    notes, service_order_id, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, v_stock_id, p_movement_type, p_quantity,
    v_stock_before, v_stock_after, p_supplier_id, p_unit_cost,
    p_notes, p_service_order_id, p_related_movement_id, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  IS 'Caminho atomico unico de escrita de estoque. p_quantity = delta assinado. p_stock_id opcional (NULL = estoque principal). Move o saldo no inventory_stock_levels; inventory.quantity reflete via trigger.';

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

------------------------------------------------------------
-- 12. RPC transfer_stock_between — transferência atômica entre estoques
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_stock_between(
  p_inventory_id     uuid,
  p_from_stock       uuid,
  p_to_stock         uuid,
  p_qty              numeric,
  p_notes            text DEFAULT NULL,
  p_client_request_id text DEFAULT NULL
)
RETURNS SETOF public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id    uuid;
  v_user_company  uuid;
  v_from_before   numeric;
  v_from_after    numeric;
  v_to_before     numeric;
  v_to_after      numeric;
  v_mov_from      public.inventory_movements;
  v_mov_to        public.inventory_movements;
  v_dup           public.inventory_movements;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade da transferencia deve ser positiva' USING ERRCODE = 'check_violation';
  END IF;
  IF p_from_stock = p_to_stock THEN
    RAISE EXCEPTION 'Estoque de origem e destino devem ser diferentes' USING ERRCODE = 'check_violation';
  END IF;

  -- empresa dona do item
  SELECT company_id INTO v_company_id FROM public.inventory WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- IDEMPOTENCIA: se já processamos este client_request_id, retorna os movimentos existentes
  IF p_client_request_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE company_id = v_company_id AND client_request_id = p_client_request_id
    ) THEN
      RETURN QUERY
        SELECT * FROM public.inventory_movements
         WHERE company_id = v_company_id AND client_request_id = p_client_request_id
         ORDER BY quantity;  -- negativo (from) antes do positivo (to)
      RETURN;
    END IF;
  END IF;

  -- valida que ambos os estoques são da empresa
  PERFORM 1 FROM public.stocks WHERE id = p_from_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de origem invalido/de outra empresa: %', p_from_stock USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.stocks WHERE id = p_to_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de destino invalido/de outra empresa: %', p_to_stock USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- garante os dois levels e trava (ORIGEM primeiro, DESTINO depois — ordem estável)
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, p_from_stock, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, p_to_stock, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  SELECT quantity INTO v_from_before
    FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id AND stock_id = p_from_stock
   FOR UPDATE;
  SELECT quantity INTO v_to_before
    FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id AND stock_id = p_to_stock
   FOR UPDATE;

  IF COALESCE(v_from_before,0) < p_qty THEN
    RAISE EXCEPTION 'Saldo insuficiente no estoque de origem: disponivel %, solicitado %', COALESCE(v_from_before,0), p_qty
      USING ERRCODE = 'check_violation';
  END IF;

  v_from_after := v_from_before - p_qty;
  v_to_after   := COALESCE(v_to_before,0) + p_qty;

  UPDATE public.inventory_stock_levels SET quantity = v_from_after
   WHERE inventory_id = p_inventory_id AND stock_id = p_from_stock;
  UPDATE public.inventory_stock_levels SET quantity = v_to_after
   WHERE inventory_id = p_inventory_id AND stock_id = p_to_stock;

  -- movimento negativo na ORIGEM
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, client_request_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_from_stock, 'transferencia', -p_qty,
    v_from_before, v_from_after, p_notes, p_client_request_id, auth.uid()
  )
  RETURNING * INTO v_mov_from;

  -- movimento positivo no DESTINO, linkado ao de origem.
  -- client_request_id vai só no PRIMEIRO (unique parcial impede dois iguais);
  -- o segundo se liga por related_movement_id.
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_to_stock, 'transferencia', p_qty,
    v_to_before, v_to_after, p_notes, v_mov_from.id, auth.uid()
  )
  RETURNING * INTO v_mov_to;

  -- fecha o link bidirecional
  UPDATE public.inventory_movements SET related_movement_id = v_mov_to.id WHERE id = v_mov_from.id;
  v_mov_from.related_movement_id := v_mov_to.id;

  RETURN NEXT v_mov_from;
  RETURN NEXT v_mov_to;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.transfer_stock_between(uuid,uuid,uuid,numeric,text,text)
  IS 'Transfere p_qty de um material entre dois estoques da mesma empresa, atomico e idempotente (p_client_request_id). Grava par de movimentos transferencia (- na origem, + no destino) linkados por related_movement_id.';

GRANT EXECUTE ON FUNCTION public.transfer_stock_between(uuid,uuid,uuid,numeric,text,text)
  TO authenticated, service_role;
