-- ESTOQUE: ACL por local (stock_access) — controle de acesso por local de estoque
--
-- Objetivo (feedback CEO): um local de estoque pode ser RESTRITO a usuários específicos.
--   * Local ABERTO (padrão, sem regra) = todos da empresa veem/mexem (comportamento atual).
--   * Local RESTRITO = só usuários marcados + admin/gestor sempre + super_admin.
--   * Presença de >=1 linha em stock_access p/ um stock_id  ⇒ RESTRITO.
--     Zero linhas ⇒ ABERTO (fail-open no vazio, para não quebrar o que existe hoje).
--
-- Escopo: VISIBILIDADE + ESCRITA. Usuário restrito não vê NEM movimenta/edita local
--   que não é dele. Gate em duas camadas:
--     (1) RLS: SELECT/INSERT/UPDATE/DELETE de stocks/inventory_stock_levels/inventory_movements
--         acrescentam can_access_stock (mantendo isolamento por company + bypass super_admin).
--     (2) RPCs SECURITY DEFINER de estoque (furam RLS por rodar como owner) ganham guard
--         no topo: register_inventory_movement, transfer_stock_between (origem E destino),
--         set_stock_materials, add_group_to_stock, set_inventory_presence.
--
-- Reaproveita helpers existentes: is_super_admin, is_admin_or_gestor, get_user_company_id.
-- Migration idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).

------------------------------------------------------------
-- 1. Tabela stock_access (quem pode acessar um local restrito)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  stock_id   uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_id, user_id)
);
COMMENT ON TABLE public.stock_access IS
  'ACL por local de estoque. >=1 linha p/ um stock_id ⇒ local restrito (só os user_id listados + admin/gestor + super_admin). Zero linhas ⇒ local aberto (todos da empresa).';

CREATE INDEX IF NOT EXISTS idx_stock_access_stock ON public.stock_access(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_access_user  ON public.stock_access(user_id);

ALTER TABLE public.stock_access ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------
-- 2. can_access_stock(_user_id, _stock_id) — decide acesso a um local.
--    SECURITY DEFINER + STABLE: lê stock_access sem cair na RLS da própria tabela
--    (evita recursão) e pode ser chamada de dentro das policies de outras tabelas.
--    Regra: super_admin OU admin/gestor OU local aberto (sem linhas) OU usuário listado.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_stock(_user_id uuid, _stock_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.is_admin_or_gestor(_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.stock_access sa WHERE sa.stock_id = _stock_id)
    OR EXISTS (SELECT 1 FROM public.stock_access sa
                WHERE sa.stock_id = _stock_id AND sa.user_id = _user_id);
$$;

COMMENT ON FUNCTION public.can_access_stock(uuid, uuid) IS
  'true se _user_id pode acessar o local _stock_id: super_admin OU admin/gestor OU local aberto (sem linhas em stock_access) OU usuário listado. Usada em RLS e nas RPCs de estoque.';

GRANT EXECUTE ON FUNCTION public.can_access_stock(uuid, uuid) TO authenticated, service_role;

------------------------------------------------------------
-- 3. RLS de stock_access
--    SELECT: qualquer autenticado da MESMA empresa (a UI precisa listar quem tem acesso).
--    INSERT/UPDATE/DELETE: só admin/gestor da mesma empresa (+ super_admin).
------------------------------------------------------------

DROP POLICY IF EXISTS "stock_access_select_own_company" ON public.stock_access;
CREATE POLICY "stock_access_select_own_company" ON public.stock_access
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "stock_access_insert_admin_gestor" ON public.stock_access;
CREATE POLICY "stock_access_insert_admin_gestor" ON public.stock_access
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  );

DROP POLICY IF EXISTS "stock_access_update_admin_gestor" ON public.stock_access;
CREATE POLICY "stock_access_update_admin_gestor" ON public.stock_access
  FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  );

DROP POLICY IF EXISTS "stock_access_delete_admin_gestor" ON public.stock_access;
CREATE POLICY "stock_access_delete_admin_gestor" ON public.stock_access
  FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  );

------------------------------------------------------------
-- 4. Regatear SELECT de stocks: some da lista o local restrito que o user não acessa.
--    Mantém isolamento por company + bypass super_admin.
------------------------------------------------------------

DROP POLICY IF EXISTS "stocks_select_own_company" ON public.stocks;
CREATE POLICY "stocks_select_own_company" ON public.stocks
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), id))
  );

------------------------------------------------------------
-- 5. Regatear inventory_stock_levels (saldo por local) nas 4 operações.
--    can_access_stock avalia o stock_id da linha. admin/gestor passam (retornam true).
------------------------------------------------------------

DROP POLICY IF EXISTS "inventory_stock_levels_select_own_company" ON public.inventory_stock_levels;
CREATE POLICY "inventory_stock_levels_select_own_company" ON public.inventory_stock_levels
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), stock_id))
  );

DROP POLICY IF EXISTS "inventory_stock_levels_insert_own_company" ON public.inventory_stock_levels;
CREATE POLICY "inventory_stock_levels_insert_own_company" ON public.inventory_stock_levels
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), stock_id))
  );

DROP POLICY IF EXISTS "inventory_stock_levels_update_own_company" ON public.inventory_stock_levels;
CREATE POLICY "inventory_stock_levels_update_own_company" ON public.inventory_stock_levels
  FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), stock_id))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), stock_id))
  );

DROP POLICY IF EXISTS "inventory_stock_levels_delete_own_company" ON public.inventory_stock_levels;
CREATE POLICY "inventory_stock_levels_delete_own_company" ON public.inventory_stock_levels
  FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND public.can_access_stock(auth.uid(), stock_id))
  );

------------------------------------------------------------
-- 6. Regatear inventory_movements.
--    SELECT: hoje é "Users view own inventory_movements" (via inventory.company_id).
--            Reescreve para casar company E can_access_stock(stock_id).
--            (stock_id é NOT NULL desde a migration 20260721160000.)
--    INSERT: as duas policies existentes ganham can_access_stock(stock_id) para impedir
--            que um usuário restrito insira movimento direto num local que não pode acessar.
--    (não há policy de UPDATE/DELETE em movements — RLS default-deny; escrita real via RPC.)
------------------------------------------------------------

DROP POLICY IF EXISTS "Users view own inventory_movements" ON public.inventory_movements;
CREATE POLICY "Users view own inventory_movements" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.inventory i
         WHERE i.id = inventory_movements.inventory_id
           AND i.company_id = get_user_company_id(auth.uid())
      )
      AND public.can_access_stock(auth.uid(), inventory_movements.stock_id)
    )
  );

DROP POLICY IF EXISTS "System managers can create any movement" ON public.inventory_movements;
CREATE POLICY "System managers can create any movement" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    can_manage_system(auth.uid())
    AND public.can_access_stock(auth.uid(), inventory_movements.stock_id)
  );

DROP POLICY IF EXISTS "Users can create movements for their OS" ON public.inventory_movements;
CREATE POLICY "Users can create movements for their OS" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_stock(auth.uid(), inventory_movements.stock_id)
    AND (
      (service_order_id IS NULL) OR (EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = inventory_movements.service_order_id
           AND (so.technician_id = auth.uid() OR so.created_by = auth.uid() OR can_manage_system(auth.uid()))
      ))
    )
  );

------------------------------------------------------------
-- 7. Guard nas RPCs SECURITY DEFINER de estoque (rodam como owner → furam RLS).
--    Todas recebem stock_id (direto ou via inventory). Guard no TOPO, após resolver
--    empresa/tenant. Corpo preservado byte-a-byte a partir das últimas versões:
--      register_inventory_movement  -> migration 20260722160000
--      transfer_stock_between       -> migration 20260722163000 (origem E destino)
--      set_stock_materials          -> migration 20260722160000
--      add_group_to_stock           -> migration 20260722160000
--      set_inventory_presence       -> migration 20260722160000 (stock por presença; guarda todos os alvos)
------------------------------------------------------------

-- 7.1 register_inventory_movement (guard no local resolvido v_stock_id)
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

  -- ACL: usuário restrito não pode movimentar local que não acessa
  IF NOT public.can_access_stock(auth.uid(), v_stock_id) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- trava o level (cria com saldo 0 se ainda não existe) e lê saldo.
  -- movimento neste local = item passa a existir ali: is_present=true.
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  VALUES (v_company_id, p_inventory_id, v_stock_id, 0, true)
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

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 7.2 transfer_stock_between (guard ORIGEM e DESTINO)
CREATE OR REPLACE FUNCTION public.transfer_stock_between(
  p_inventory_id      uuid,
  p_from_stock        uuid,
  p_to_stock          uuid,
  p_qty               numeric,
  p_notes             text DEFAULT NULL,
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
  v_to_before     numeric;
  v_from_after    numeric;
  v_to_after      numeric;
  v_mov_from      public.inventory_movements;
  v_mov_to        public.inventory_movements;
  -- lock em ordem estável por stock_id
  v_level         RECORD;
BEGIN
  -- Validações básicas -------------------------------------------------------
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade da transferencia deve ser positiva'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_from_stock = p_to_stock THEN
    RAISE EXCEPTION 'Estoque de origem e destino devem ser diferentes'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Empresa dona do item -----------------------------------------------------
  SELECT company_id INTO v_company_id
    FROM public.inventory
   WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ACL: transferência exige acesso aos DOIS locais (origem e destino).
  IF NOT public.can_access_stock(auth.uid(), p_from_stock) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_stock(auth.uid(), p_to_stock) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- Idempotência: retorna o PAR se este client_request_id já foi processado ----
  IF p_client_request_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE company_id = v_company_id
         AND client_request_id = p_client_request_id
    ) THEN
      RETURN QUERY
        SELECT m.*
          FROM public.inventory_movements m
         WHERE m.company_id = v_company_id
           AND (
             m.client_request_id = p_client_request_id
             OR m.id = (
               SELECT related_movement_id
                 FROM public.inventory_movements
                WHERE company_id = v_company_id
                  AND client_request_id = p_client_request_id
                LIMIT 1
             )
           )
         ORDER BY m.quantity;  -- negativo (origem) antes do positivo (destino)
      RETURN;
    END IF;
  END IF;

  -- Valida que ambos os estoques são da empresa --------------------------------
  PERFORM 1 FROM public.stocks
   WHERE id = p_from_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de origem invalido/de outra empresa: %', p_from_stock
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.stocks
   WHERE id = p_to_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de destino invalido/de outra empresa: %', p_to_stock
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Garante que ambos os levels existem (cria com qty 0 se não existirem) -----
  -- Origem: presença como estava (não forçamos nada na origem).
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, p_from_stock, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  -- Destino: recebe saldo, então nasce presente (is_present=true) desde o INSERT.
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  VALUES (v_company_id, p_inventory_id, p_to_stock, 0, true)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  -- LOCK ESTÁVEL: trava os dois levels em ÚNICA query ordenada por stock_id ----
  FOR v_level IN
    SELECT stock_id, quantity
      FROM public.inventory_stock_levels
     WHERE inventory_id = p_inventory_id
       AND stock_id IN (p_from_stock, p_to_stock)
     ORDER BY stock_id        -- ordem estável e determinística
     FOR UPDATE
  LOOP
    IF v_level.stock_id = p_from_stock THEN
      v_from_before := v_level.quantity;
    ELSE
      v_to_before := v_level.quantity;
    END IF;
  END LOOP;

  -- Valida saldo suficiente na origem ------------------------------------------
  IF COALESCE(v_from_before, 0) < p_qty THEN
    RAISE EXCEPTION 'Saldo insuficiente no estoque de origem: disponivel %, solicitado %',
      COALESCE(v_from_before, 0), p_qty
      USING ERRCODE = 'check_violation';
  END IF;

  v_from_after := v_from_before - p_qty;
  v_to_after   := COALESCE(v_to_before, 0) + p_qty;

  -- Atualiza os saldos ---------------------------------------------------------
  UPDATE public.inventory_stock_levels
     SET quantity = v_from_after
   WHERE inventory_id = p_inventory_id AND stock_id = p_from_stock;

  UPDATE public.inventory_stock_levels
     SET quantity   = v_to_after,
         is_present = true
   WHERE inventory_id = p_inventory_id AND stock_id = p_to_stock;

  -- Movimento negativo na ORIGEM -----------------------------------------------
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, client_request_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_from_stock, 'transferencia', -p_qty,
    v_from_before, v_from_after, p_notes, p_client_request_id, auth.uid()
  )
  RETURNING * INTO v_mov_from;

  -- Movimento positivo no DESTINO, linkado ao de origem -----------------------
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_to_stock, 'transferencia', p_qty,
    v_to_before, v_to_after, p_notes, v_mov_from.id, auth.uid()
  )
  RETURNING * INTO v_mov_to;

  -- Fecha o link bidirecional --------------------------------------------------
  UPDATE public.inventory_movements
     SET related_movement_id = v_mov_to.id
   WHERE id = v_mov_from.id;
  v_mov_from.related_movement_id := v_mov_to.id;

  RETURN NEXT v_mov_from;
  RETURN NEXT v_mov_to;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock_between(uuid, uuid, uuid, numeric, text, text)
  TO authenticated, service_role;

-- 7.3 set_stock_materials (guard no p_stock_id)
CREATE OR REPLACE FUNCTION public.set_stock_materials(
  p_stock_id     uuid,
  p_inventory_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_blocked      text;
  v_valid_ids    uuid[];
BEGIN
  -- empresa dona do estoque
  SELECT company_id INTO v_company_id FROM public.stocks WHERE id = p_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: estoque de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ACL: usuário restrito não configura catálogo de local que não acessa
  IF NOT public.can_access_stock(auth.uid(), p_stock_id) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- só materiais que pertencem à empresa (ignora ids intrusos/de outra empresa)
  SELECT COALESCE(array_agg(i.id), ARRAY[]::uuid[]) INTO v_valid_ids
    FROM public.inventory i
   WHERE i.company_id = v_company_id
     AND i.id = ANY (COALESCE(p_inventory_ids, ARRAY[]::uuid[]));

  -- TRAVA: não desmarcar material com saldo > 0 neste local
  SELECT string_agg(i.name, ', ' ORDER BY i.name) INTO v_blocked
    FROM public.inventory_stock_levels l
    JOIN public.inventory i ON i.id = l.inventory_id
   WHERE l.stock_id   = p_stock_id
     AND l.company_id = v_company_id
     AND l.is_present = true
     AND l.quantity   > 0
     AND NOT (l.inventory_id = ANY (v_valid_ids));

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'presence_has_balance: %', v_blocked USING ERRCODE = 'check_violation';
  END IF;

  -- garante levels dos materiais marcados e marca presente
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, iid, p_stock_id, 0, true
    FROM unnest(v_valid_ids) AS iid
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true;

  -- desmarca os demais materiais da empresa neste local
  UPDATE public.inventory_stock_levels l
     SET is_present = false
   WHERE l.stock_id   = p_stock_id
     AND l.company_id = v_company_id
     AND NOT (l.inventory_id = ANY (v_valid_ids))
     AND l.is_present = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_stock_materials(uuid, uuid[]) TO authenticated, service_role;

-- 7.4 add_group_to_stock (guard no p_stock_id)
CREATE OR REPLACE FUNCTION public.add_group_to_stock(
  p_stock_id uuid,
  p_group_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_grp_company  uuid;
  v_user_company uuid;
BEGIN
  -- empresa dona do estoque
  SELECT company_id INTO v_company_id FROM public.stocks WHERE id = p_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: estoque de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ACL: usuário restrito não configura catálogo de local que não acessa
  IF NOT public.can_access_stock(auth.uid(), p_stock_id) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- grupo tem que ser da mesma empresa
  SELECT company_id INTO v_grp_company FROM public.material_groups WHERE id = p_group_id;
  IF NOT FOUND OR v_grp_company <> v_company_id THEN
    RAISE EXCEPTION 'Grupo invalido/de outra empresa: %', p_group_id USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, i.id, p_stock_id, 0, true
    FROM public.inventory i
   WHERE i.company_id = v_company_id
     AND i.group_id   = p_group_id
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_group_to_stock(uuid, uuid) TO authenticated, service_role;

-- 7.5 set_inventory_presence (define presença de UM material em vários locais;
--     guarda cada local marcado — usuário restrito não pode incluir local que não acessa)
CREATE OR REPLACE FUNCTION public.set_inventory_presence(
  p_inventory_id uuid,
  p_stock_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_blocked      text;
  v_valid_ids    uuid[];
  v_sid          uuid;
BEGIN
  -- empresa dona do item
  SELECT company_id INTO v_company_id FROM public.inventory WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- só locais que realmente pertencem à empresa (ignora ids intrusos/de outra empresa)
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO v_valid_ids
    FROM public.stocks s
   WHERE s.company_id = v_company_id
     AND s.id = ANY (COALESCE(p_stock_ids, ARRAY[]::uuid[]));

  -- ACL: usuário restrito não pode marcar presença em local que não acessa
  FOREACH v_sid IN ARRAY v_valid_ids LOOP
    IF NOT public.can_access_stock(auth.uid(), v_sid) THEN
      RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- TRAVA: não deixar desmarcar (remover presença de) local com saldo > 0
  SELECT string_agg(s.name, ', ' ORDER BY s.name) INTO v_blocked
    FROM public.inventory_stock_levels l
    JOIN public.stocks s ON s.id = l.stock_id
   WHERE l.inventory_id = p_inventory_id
     AND l.company_id  = v_company_id
     AND l.is_present   = true
     AND l.quantity     > 0
     AND NOT (l.stock_id = ANY (v_valid_ids));

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'presence_has_balance: %', v_blocked USING ERRCODE = 'check_violation';
  END IF;

  -- garante levels dos locais marcados (qty=0 on-demand) e marca presente
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, p_inventory_id, sid, 0, true
    FROM unnest(v_valid_ids) AS sid
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true;

  -- desmarca os demais locais da empresa (só os que já têm level; sem saldo, garantido pela trava)
  UPDATE public.inventory_stock_levels l
     SET is_present = false
   WHERE l.inventory_id = p_inventory_id
     AND l.company_id  = v_company_id
     AND NOT (l.stock_id = ANY (v_valid_ids))
     AND l.is_present   = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_inventory_presence(uuid, uuid[]) TO authenticated, service_role;

------------------------------------------------------------
-- 8. RPCs de administração da ACL (só admin/gestor da empresa dona do local).
------------------------------------------------------------

-- 8.1 get_stock_access(p_stock_id) -> {"restricted": bool, "user_ids": [uuid,...]}
CREATE OR REPLACE FUNCTION public.get_stock_access(p_stock_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_user_ids   uuid[];
BEGIN
  SELECT company_id INTO v_company_id FROM public.stocks WHERE id = p_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    is_super_admin(auth.uid())
    OR (v_company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'sem permissao para gerenciar acesso deste local' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(sa.user_id ORDER BY sa.created_at), ARRAY[]::uuid[])
    INTO v_user_ids
    FROM public.stock_access sa
   WHERE sa.stock_id = p_stock_id;

  RETURN jsonb_build_object(
    'restricted', (array_length(v_user_ids, 1) IS NOT NULL),
    'user_ids',   to_jsonb(v_user_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.get_stock_access(uuid) IS
  'Retorna {restricted: bool, user_ids: [uuid]} da ACL de um local. restricted=true se ha linhas. Só admin/gestor da empresa dona (ou super_admin).';

GRANT EXECUTE ON FUNCTION public.get_stock_access(uuid) TO authenticated, service_role;

-- 8.2 set_stock_access(p_stock_id, p_restricted, p_user_ids) -> void (atômico)
CREATE OR REPLACE FUNCTION public.set_stock_access(
  p_stock_id   uuid,
  p_restricted boolean,
  p_user_ids   uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_valid_ids  uuid[];
BEGIN
  SELECT company_id INTO v_company_id FROM public.stocks WHERE id = p_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    is_super_admin(auth.uid())
    OR (v_company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'sem permissao para gerenciar acesso deste local' USING ERRCODE = '42501';
  END IF;

  -- limpa a ACL atual (num só statement, atômico dentro da função)
  DELETE FROM public.stock_access WHERE stock_id = p_stock_id;

  -- p_restricted=false -> local vira aberto (fica sem linhas). Nada a inserir.
  IF NOT p_restricted THEN
    RETURN;
  END IF;

  -- p_restricted=true -> só usuários que pertencem à MESMA empresa do local (dedup).
  -- company_id herdado do stock — nunca confia em company do client.
  -- profiles.user_id = auth.uid() (profiles.id é o PK interno, NÃO o auth id).
  SELECT COALESCE(array_agg(DISTINCT p.user_id), ARRAY[]::uuid[]) INTO v_valid_ids
    FROM public.profiles p
   WHERE p.company_id = v_company_id
     AND p.user_id = ANY (COALESCE(p_user_ids, ARRAY[]::uuid[]));

  INSERT INTO public.stock_access (company_id, stock_id, user_id)
  SELECT v_company_id, p_stock_id, uid
    FROM unnest(v_valid_ids) AS uid
  ON CONFLICT (stock_id, user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.set_stock_access(uuid, boolean, uuid[]) IS
  'Configura a ACL de um local atomicamente. p_restricted=false esvazia (local aberto). p_restricted=true substitui a lista por p_user_ids (dedup, só usuarios da mesma empresa). Só admin/gestor da empresa dona (ou super_admin).';

GRANT EXECUTE ON FUNCTION public.set_stock_access(uuid, boolean, uuid[]) TO authenticated, service_role;
