-- ESTOQUE: presença de material por local (fase 1)
-- Origem: feedback Engetec (Davi) — cada local de estoque com seu próprio catálogo.
--
-- Modelo: reaproveita inventory_stock_levels (fonte de verdade do saldo, 1 linha por
-- inventory×stock) adicionando a coluna is_present. Uma linha is_present=true significa
-- "este material pertence a este local". Sem tabela nova.
--
-- Invariantes desta migration:
--   * inventory.quantity continua ESPELHO da SUM dos levels (trigger existente intocado).
--   * Escrita de presença SÓ via RPC security-definer (client nunca dá UPDATE em is_present).
--   * Rollout não some com nada: backfill garante is_present=true em TODO par
--     (material × local) da MESMA empresa. Volume conferido no prod (2026-07-22):
--     matriz completa (item×stock por company) = 891; levels existentes = 848 →
--     no máximo ~43 linhas novas. INSERT único idempotente, sem risco de volume.
--   * Trava CEO: não remover presença de local que tem quantity > 0 (RAISE 'presence_has_balance').
-- Migration idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).

------------------------------------------------------------
-- 1. Coluna is_present (default true — todo level existente vira "presente")
------------------------------------------------------------

ALTER TABLE public.inventory_stock_levels
  ADD COLUMN IF NOT EXISTS is_present boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.inventory_stock_levels.is_present IS
  'Presença do material neste local. true = pertence ao catálogo do local. Escrita SÓ via RPC (set_inventory_presence / add_group_to_stock / set_stock_materials / register_inventory_movement).';

------------------------------------------------------------
-- 2. Backfill "default todos": para CADA empresa, garantir uma linha is_present=true
--    para TODO par (inventory × stocks) da MESMA company_id. Pares já existentes ficam
--    is_present=true (já é o default da coluna nova). Pares faltantes entram qty=0.
--    ⚠️ Estritamente por company_id — o JOIN casa i.company_id = s.company_id.
------------------------------------------------------------

DO $$
DECLARE
  v_ins int;
BEGIN
  INSERT INTO public.inventory_stock_levels
    (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT i.company_id, i.id, s.id, 0, true
    FROM public.inventory i
    JOIN public.stocks s ON s.company_id = i.company_id
   WHERE i.company_id IS NOT NULL
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  RAISE NOTICE 'Backfill presença: % levels (material×local) criados como is_present=true.', v_ins;
END $$;

------------------------------------------------------------
-- 3. RPC set_inventory_presence(p_inventory_id, p_stock_ids uuid[])
--    Define exatamente em quais locais o material está presente.
--    - Locais em p_stock_ids  -> is_present=true (cria level qty=0 faltante).
--    - Demais locais da empresa -> is_present=false.
--    - BLOQUEIA desmarcar local com quantity > 0 (RAISE 'presence_has_balance: <nomes>').
--    company_id derivado do auth.uid() — NUNCA confia em company_id do client.
------------------------------------------------------------

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

COMMENT ON FUNCTION public.set_inventory_presence(uuid, uuid[]) IS
  'Define os locais em que um material esta presente (is_present). Bloqueia desmarcar local com saldo>0 (presence_has_balance). Valida tenant do caller.';

GRANT EXECUTE ON FUNCTION public.set_inventory_presence(uuid, uuid[]) TO authenticated, service_role;

------------------------------------------------------------
-- 4. RPC add_group_to_stock(p_stock_id, p_group_id)
--    is_present=true para TODOS os materiais do grupo naquele local (cria levels qty=0).
------------------------------------------------------------

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

COMMENT ON FUNCTION public.add_group_to_stock(uuid, uuid) IS
  'Marca presenca (is_present=true) de todos os materiais de um grupo num local. Valida tenant do caller.';

GRANT EXECUTE ON FUNCTION public.add_group_to_stock(uuid, uuid) TO authenticated, service_role;

------------------------------------------------------------
-- 5. RPC set_stock_materials(p_stock_id, p_inventory_ids uuid[])
--    Configura o catálogo inteiro de um local:
--    - Materiais em p_inventory_ids -> is_present=true (cria level qty=0 faltante).
--    - Demais materiais da empresa nesse local -> is_present=false.
--    - MESMA trava: não desmarcar material com quantity > 0 naquele local.
------------------------------------------------------------

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

COMMENT ON FUNCTION public.set_stock_materials(uuid, uuid[]) IS
  'Configura o catalogo (presenca) de um local inteiro. Bloqueia desmarcar material com saldo>0 (presence_has_balance). Valida tenant do caller.';

GRANT EXECUTE ON FUNCTION public.set_stock_materials(uuid, uuid[]) TO authenticated, service_role;

------------------------------------------------------------
-- 6. register_inventory_movement: entrada/uso num local marca is_present=true.
--    É o caminho único de escrita — item que entra/movimenta num local passa a existir ali.
--    Reescrita idêntica à v11 da migration base, com is_present=true no ON CONFLICT do level
--    e no UPDATE do saldo. Nenhum outro comportamento muda.
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

COMMENT ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  IS 'Caminho atomico unico de escrita de estoque. p_quantity = delta assinado. p_stock_id opcional (NULL = estoque principal). Move o saldo no inventory_stock_levels (marca is_present=true no local afetado); inventory.quantity reflete via trigger.';

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

------------------------------------------------------------
-- 7. RLS: is_present só pode ser ESCRITO via RPC security-definer.
--    O client (role authenticated) ainda pode UPDATE min_quantity / INSERT levels
--    (fluxo de estoque mínimo inline + count), mas NÃO pode alterar is_present
--    direto — isso é privilégio das RPCs.
--    Sinal: RPCs rodam como owner (current_user='postgres'); client roda como
--    'authenticated'. O trigger bloqueia mudança de is_present fora do owner.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_inventory_presence_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Só bloqueia quando a presença de fato MUDA e o autor não é o owner
  -- (as RPCs security-definer rodam como owner e passam livremente).
  IF NEW.is_present IS DISTINCT FROM OLD.is_present
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'presence_write_forbidden: presenca de material so pode ser alterada via RPC'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_inventory_presence_write ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_presence_write
  BEFORE UPDATE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_presence_write();
