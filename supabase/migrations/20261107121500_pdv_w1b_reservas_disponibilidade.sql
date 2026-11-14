-- PDV W1B-01: fundacao aditiva de reservas e disponibilidade de estoque.
--
-- Este slice NAO ativa o fluxo v2 e NAO altera os consumidores atuais
-- (PDV, OS, transferencia, inventario, compras ou NF-e). Ele cria somente a
-- fonte de reservas e primitivas internas para os slices seguintes.
--
-- Invariantes:
--   * estoque fisico continua em inventory_stock_levels.quantity;
--   * uma reserva aponta para exatamente um item de pre-pedido OU pedido;
--   * residual comprometido = reservado - consumido - liberado;
--   * residual garantido = residual comprometido - falta;
--   * a soma garantida nunca supera o fisico;
--   * conflito preserva o compromisso e explicita shortage_quantity;
--   * custo e snapshot do inventory.cost_price lido pelo servidor sob lock;
--   * escrita direta pelas roles da API permanece proibida.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pdv_stock_reservation_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inventory_id          uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  stock_id              uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  order_item_id         uuid REFERENCES public.pdv_order_items(id) ON DELETE RESTRICT,
  -- A FK de pre-pedido entra junto de public.pdv_preorder_items em W2.
  -- Ate la, o trigger recusa esta origem por nao conseguir provar o tenant.
  preorder_item_id      uuid,
  contract_version      smallint NOT NULL DEFAULT 2
    CONSTRAINT pdv_stock_reservation_contract_version_check
      CHECK (contract_version = 2),
  reservation_kind      text NOT NULL DEFAULT 'coverage'
    CONSTRAINT pdv_stock_reservation_kind_check
      CHECK (reservation_kind IN ('coverage', 'early')),
  state                 text NOT NULL DEFAULT 'guaranteed'
    CONSTRAINT pdv_stock_reservation_state_check
      CHECK (state IN ('guaranteed', 'conflict', 'consumed', 'released')),
  reserved_quantity     numeric NOT NULL,
  consumed_quantity     numeric NOT NULL DEFAULT 0,
  released_quantity     numeric NOT NULL DEFAULT 0,
  shortage_quantity     numeric NOT NULL DEFAULT 0,
  unit_factor_snapshot  numeric NOT NULL DEFAULT 1,
  cost_price_snapshot   numeric,
  expires_at            timestamptz,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_stock_reservation_origin_xor_check CHECK (
    (order_item_id IS NOT NULL)::integer
      + (preorder_item_id IS NOT NULL)::integer = 1
  ),
  CONSTRAINT pdv_stock_reservation_reserved_positive_check
    CHECK (reserved_quantity > 0),
  CONSTRAINT pdv_stock_reservation_consumed_nonnegative_check
    CHECK (consumed_quantity >= 0),
  CONSTRAINT pdv_stock_reservation_released_nonnegative_check
    CHECK (released_quantity >= 0),
  CONSTRAINT pdv_stock_reservation_shortage_nonnegative_check
    CHECK (shortage_quantity >= 0),
  CONSTRAINT pdv_stock_reservation_unit_factor_positive_check
    CHECK (unit_factor_snapshot > 0),
  CONSTRAINT pdv_stock_reservation_cost_nonnegative_check
    CHECK (cost_price_snapshot IS NULL OR cost_price_snapshot >= 0),
  CONSTRAINT pdv_stock_reservation_totals_check CHECK (
    consumed_quantity + released_quantity <= reserved_quantity
    AND shortage_quantity <= reserved_quantity - consumed_quantity - released_quantity
  ),
  CONSTRAINT pdv_stock_reservation_expiration_check CHECK (
    (reservation_kind = 'early' AND expires_at IS NOT NULL AND expires_at > created_at)
    OR (reservation_kind = 'coverage' AND expires_at IS NULL)
  ),
  CONSTRAINT pdv_stock_reservation_state_totals_check CHECK (
    (
      state = 'guaranteed'
      AND reserved_quantity - consumed_quantity - released_quantity > 0
      AND shortage_quantity = 0
    ) OR (
      state = 'conflict'
      AND reserved_quantity - consumed_quantity - released_quantity > 0
      AND shortage_quantity > 0
    ) OR (
      state = 'consumed'
      AND reserved_quantity - consumed_quantity - released_quantity = 0
      AND shortage_quantity = 0
      AND consumed_quantity > 0
    ) OR (
      state = 'released'
      AND reserved_quantity - consumed_quantity - released_quantity = 0
      AND shortage_quantity = 0
      AND released_quantity > 0
    )
  )
);

COMMENT ON TABLE public.pdv_stock_reservation_items IS
  'Reserva v2 por item/material/local. Nao move o fisico; entrega futura consome a reserva e cria o Kardex. Escrita somente por primitivas internas.';
COMMENT ON COLUMN public.pdv_stock_reservation_items.preorder_item_id IS
  'Origem antecipada. FK e uso entram com pdv_preorder_items em W2; antes disso o trigger bloqueia inserts desta origem.';
COMMENT ON COLUMN public.pdv_stock_reservation_items.shortage_quantity IS
  'Parte do residual comprometido sem cobertura fisica confirmada. Continua auditavel, mas nao compoe a garantia.';
COMMENT ON COLUMN public.pdv_stock_reservation_items.cost_price_snapshot IS
  'Custo padrao historico congelado pelo servidor. NULL = desconhecido; zero = custo conhecido igual a zero.';

CREATE INDEX IF NOT EXISTS idx_pdv_stock_reservation_company_pair
  ON public.pdv_stock_reservation_items (company_id, inventory_id, stock_id);

CREATE INDEX IF NOT EXISTS idx_pdv_stock_reservation_active_pair
  ON public.pdv_stock_reservation_items (company_id, inventory_id, stock_id, created_at, id)
  WHERE state IN ('guaranteed', 'conflict');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_stock_reservation_active_order_item
  ON public.pdv_stock_reservation_items (order_item_id, stock_id)
  WHERE order_item_id IS NOT NULL AND state IN ('guaranteed', 'conflict');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_stock_reservation_active_preorder_item
  ON public.pdv_stock_reservation_items (preorder_item_id, stock_id)
  WHERE preorder_item_id IS NOT NULL AND state IN ('guaranteed', 'conflict');

DROP TRIGGER IF EXISTS set_pdv_stock_reservation_updated_at
  ON public.pdv_stock_reservation_items;
CREATE TRIGGER set_pdv_stock_reservation_updated_at
  BEFORE UPDATE ON public.pdv_stock_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.pdv_validate_stock_reservation_scope_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_inventory_company uuid;
  v_inventory_customer uuid;
  v_inventory_archived timestamptz;
  v_stock_company uuid;
  v_stock_customer uuid;
  v_source_company uuid;
  v_source_inventory uuid;
BEGIN
  SELECT i.company_id, i.customer_id, i.archived_at
    INTO v_inventory_company, v_inventory_customer, v_inventory_archived
    FROM public.inventory i
   WHERE i.id = NEW.inventory_id;

  IF NOT FOUND OR v_inventory_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'pdv_reservation_inventory_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF v_inventory_customer IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_customer_stock_not_supported'
      USING ERRCODE = '0A000';
  END IF;
  IF v_inventory_archived IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_inventory_archived'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.company_id, s.customer_id
    INTO v_stock_company, v_stock_customer
    FROM public.stocks s
   WHERE s.id = NEW.stock_id;

  IF NOT FOUND
     OR v_stock_company IS DISTINCT FROM NEW.company_id
     OR v_stock_customer IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_stock_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.order_item_id IS NOT NULL THEN
    SELECT oi.company_id, oi.inventory_id
      INTO v_source_company, v_source_inventory
      FROM public.pdv_order_items oi
     WHERE oi.id = NEW.order_item_id;

    IF NOT FOUND
       OR v_source_company IS DISTINCT FROM NEW.company_id
       OR v_source_inventory IS DISTINCT FROM NEW.inventory_id THEN
      RAISE EXCEPTION 'pdv_reservation_order_item_scope_mismatch'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF to_regclass('public.pdv_preorder_items') IS NULL THEN
      RAISE EXCEPTION 'pdv_preorder_reservation_contract_not_available'
        USING ERRCODE = '0A000';
    END IF;

    EXECUTE
      'SELECT company_id, inventory_id FROM public.pdv_preorder_items WHERE id = $1'
      INTO v_source_company, v_source_inventory
      USING NEW.preorder_item_id;

    IF v_source_company IS NULL
       OR v_source_company IS DISTINCT FROM NEW.company_id
       OR v_source_inventory IS DISTINCT FROM NEW.inventory_id THEN
      RAISE EXCEPTION 'pdv_reservation_preorder_item_scope_mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.pdv_validate_stock_reservation_scope_v2() IS
  'Guard de tenant/material/local/origem das reservas v2. Pre-pedido permanece bloqueado ate W2 criar sua entidade canônica.';

REVOKE ALL ON FUNCTION public.pdv_validate_stock_reservation_scope_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_pdv_stock_reservation_scope_v2
  ON public.pdv_stock_reservation_items;
CREATE TRIGGER trg_validate_pdv_stock_reservation_scope_v2
  BEFORE INSERT OR UPDATE ON public.pdv_stock_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_validate_stock_reservation_scope_v2();

ALTER TABLE public.pdv_stock_reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_stock_reservation_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pdv_stock_reservation_items
  FROM PUBLIC, anon, authenticated, service_role;

-- Leitura segura: nao retorna custo, preco, cliente ou informacao financeira.
CREATE OR REPLACE FUNCTION public.pdv_get_stock_availability_v2(
  p_inventory_id uuid,
  p_stock_id uuid
)
RETURNS TABLE (
  inventory_id uuid,
  stock_id uuid,
  physical_quantity numeric,
  committed_quantity numeric,
  guaranteed_quantity numeric,
  shortage_quantity numeric,
  available_quantity numeric,
  has_conflict boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := auth.role();
  v_company_id uuid;
  v_stock_company uuid;
  v_inventory_customer uuid;
  v_stock_customer uuid;
  v_physical numeric := 0;
  v_committed numeric := 0;
  v_shortage numeric := 0;
  v_guaranteed numeric := 0;
BEGIN
  IF v_uid IS NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Sessao expirada.' USING ERRCODE = '42501';
  END IF;

  SELECT i.company_id, i.customer_id
    INTO v_company_id, v_inventory_customer
    FROM public.inventory i
   WHERE i.id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.company_id, s.customer_id
    INTO v_stock_company, v_stock_customer
    FROM public.stocks s
   WHERE s.id = p_stock_id;
  IF NOT FOUND
     OR v_stock_company IS DISTINCT FROM v_company_id
     OR v_inventory_customer IS NOT NULL
     OR v_stock_customer IS NOT NULL THEN
    RAISE EXCEPTION 'Material e local nao pertencem ao mesmo estoque da empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF v_role IS DISTINCT FROM 'service_role'
     AND NOT public.is_super_admin(v_uid) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles profile
       WHERE profile.user_id = v_uid
         AND profile.company_id = v_company_id
         AND profile.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao estoque de outra empresa.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_stock_active_profile_required';
    END IF;
    IF public.tenant_subscription_allows_access(v_company_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Assinatura sem acesso ao estoque.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_stock_subscription_denied';
    END IF;
    IF public.user_has_permission(v_uid, 'screen:inventory') IS DISTINCT FROM true
       AND public.user_has_permission(v_uid, 'screen:pdv') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sem permissao para consultar a disponibilidade do estoque.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_stock_screen_denied';
    END IF;
    IF public.can_access_stock(v_uid, p_stock_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sem acesso a este local de estoque.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_stock_acl_denied';
    END IF;
  END IF;
  IF NOT public.is_super_admin(v_uid)
     AND public.company_has_module(v_company_id, 'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Modulo PDV indisponivel.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_stock_module_denied';
  END IF;

  SELECT COALESCE(sl.quantity, 0)
    INTO v_physical
    FROM public.inventory_stock_levels sl
   WHERE sl.inventory_id = p_inventory_id
     AND sl.stock_id = p_stock_id;
  v_physical := COALESCE(v_physical, 0);

  SELECT
    COALESCE(sum(r.reserved_quantity - r.consumed_quantity - r.released_quantity), 0),
    COALESCE(sum(r.shortage_quantity), 0)
    INTO v_committed, v_shortage
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = v_company_id
     AND r.inventory_id = p_inventory_id
     AND r.stock_id = p_stock_id
     AND r.state IN ('guaranteed', 'conflict');

  -- Durante a coexistencia W1B-01, consumidores legados ainda podem reduzir o
  -- fisico sem marcar o conflito. A leitura falha fechado: deriva a falta
  -- minima necessaria sem apagar a falta persistida (reposicao nao resolve
  -- conflito automaticamente).
  v_shortage := LEAST(
    v_committed,
    GREATEST(v_shortage, v_committed - v_physical, 0)
  );
  v_guaranteed := GREATEST(v_committed - v_shortage, 0);

  RETURN QUERY SELECT
    p_inventory_id,
    p_stock_id,
    v_physical,
    v_committed,
    v_guaranteed,
    v_shortage,
    CASE
      WHEN v_shortage > 0 THEN 0::numeric
      ELSE GREATEST(v_physical - v_guaranteed, 0)
    END,
    v_shortage > 0;
END;
$function$;

COMMENT ON FUNCTION public.pdv_get_stock_availability_v2(uuid, uuid) IS
  'Leitura v2 de fisico/comprometido/garantido/falta/disponivel por material e local, sem expor custo. Exige perfil ativo, tenant, vigencia, modulo PDV, tela nominal de Estoque/PDV e ACL do local.';

REVOKE ALL ON FUNCTION public.pdv_get_stock_availability_v2(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_stock_availability_v2(uuid, uuid)
  TO authenticated, service_role;

-- Primitiva interna. O lock do level serializa todas as reservas do par.
CREATE OR REPLACE FUNCTION public.pdv_reserve_stock_internal_v2(
  p_company_id uuid,
  p_inventory_id uuid,
  p_stock_id uuid,
  p_order_item_id uuid,
  p_preorder_item_id uuid,
  p_quantity numeric,
  p_reservation_kind text DEFAULT 'coverage',
  p_expires_at timestamptz DEFAULT NULL,
  p_unit_factor numeric DEFAULT 1
)
RETURNS public.pdv_stock_reservation_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_stock_company uuid;
  v_stock_customer uuid;
  v_physical numeric;
  v_guaranteed numeric;
  v_has_conflict boolean;
  v_row public.pdv_stock_reservation_items;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'pdv_reservation_quantity_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_unit_factor IS NULL OR p_unit_factor <= 0 THEN
    RAISE EXCEPTION 'pdv_reservation_unit_factor_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_reservation_kind NOT IN ('coverage', 'early') THEN
    RAISE EXCEPTION 'pdv_reservation_kind_invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_order_item_id IS NULL) = (p_preorder_item_id IS NULL) THEN
    RAISE EXCEPTION 'pdv_reservation_origin_invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_reservation_kind = 'early' AND p_expires_at IS NULL)
     OR (p_reservation_kind = 'coverage' AND p_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'pdv_reservation_expiration_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT i.* INTO v_inventory
    FROM public.inventory i
   WHERE i.id = p_inventory_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_inventory.company_id IS DISTINCT FROM p_company_id
     OR v_inventory.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_inventory_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF v_inventory.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_inventory_archived'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.company_id, s.customer_id
    INTO v_stock_company, v_stock_customer
    FROM public.stocks s
   WHERE s.id = p_stock_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_stock_company IS DISTINCT FROM p_company_id
     OR v_stock_customer IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_stock_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity
  ) VALUES (
    p_company_id, p_inventory_id, p_stock_id, 0
  ) ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  SELECT sl.quantity INTO v_physical
    FROM public.inventory_stock_levels sl
   WHERE sl.inventory_id = p_inventory_id
     AND sl.stock_id = p_stock_id
     AND sl.company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdv_reservation_stock_level_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  -- Trava tambem as reservas existentes; o level acima e o mutex do par.
  PERFORM r.id
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = p_inventory_id
     AND r.stock_id = p_stock_id
     AND r.state IN ('guaranteed', 'conflict')
   ORDER BY r.created_at, r.id
   FOR UPDATE;

  SELECT
    COALESCE(sum(
      r.reserved_quantity - r.consumed_quantity - r.released_quantity
      - r.shortage_quantity
    ), 0),
    COALESCE(bool_or(r.shortage_quantity > 0), false)
    INTO v_guaranteed, v_has_conflict
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = p_inventory_id
     AND r.stock_id = p_stock_id
     AND r.state IN ('guaranteed', 'conflict');

  IF v_has_conflict THEN
    RAISE EXCEPTION 'pdv_reservation_pair_in_conflict' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_physical, 0) - v_guaranteed < p_quantity THEN
    RAISE EXCEPTION 'pdv_reservation_insufficient_stock' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.pdv_stock_reservation_items (
    company_id, inventory_id, stock_id, order_item_id, preorder_item_id,
    reservation_kind, state, reserved_quantity, unit_factor_snapshot,
    cost_price_snapshot, expires_at
  ) VALUES (
    p_company_id, p_inventory_id, p_stock_id, p_order_item_id, p_preorder_item_id,
    p_reservation_kind, 'guaranteed', p_quantity, p_unit_factor,
    v_inventory.cost_price, p_expires_at
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.pdv_reserve_stock_internal_v2(uuid,uuid,uuid,uuid,uuid,numeric,text,timestamptz,numeric) IS
  'Primitiva interna UNITARIA de reserva v2. Serializa material/local, congela custo no servidor e impede garantia acima do fisico. Caller multi-item deve materializar, deduplicar e ordenar todos os pares (inventory_id, stock_id) antes das chamadas. W1B-01 nao ativa consumidores. Sem EXECUTE para roles da API.';

REVOKE ALL ON FUNCTION public.pdv_reserve_stock_internal_v2(uuid,uuid,uuid,uuid,uuid,numeric,text,timestamptz,numeric)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_release_stock_reservation_internal_v2(
  p_company_id uuid,
  p_reservation_id uuid,
  p_quantity numeric
)
RETURNS public.pdv_stock_reservation_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.pdv_stock_reservation_items;
  v_residual numeric;
  v_new_shortage numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'pdv_reservation_release_quantity_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_row
    FROM public.pdv_stock_reservation_items r
   WHERE r.id = p_reservation_id
   FOR UPDATE;
  IF NOT FOUND OR v_row.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'pdv_reservation_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_residual := v_row.reserved_quantity - v_row.consumed_quantity - v_row.released_quantity;
  IF v_row.state NOT IN ('guaranteed', 'conflict') OR p_quantity > v_residual THEN
    RAISE EXCEPTION 'pdv_reservation_release_exceeds_residual'
      USING ERRCODE = '23514';
  END IF;

  -- Libera primeiro a parte descoberta, preservando a garantia remanescente.
  v_new_shortage := GREATEST(v_row.shortage_quantity - p_quantity, 0);

  UPDATE public.pdv_stock_reservation_items
     SET released_quantity = released_quantity + p_quantity,
         shortage_quantity = v_new_shortage,
         state = CASE
           WHEN v_residual - p_quantity = 0 THEN 'released'
           WHEN v_new_shortage > 0 THEN 'conflict'
           ELSE 'guaranteed'
         END
   WHERE id = p_reservation_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.pdv_release_stock_reservation_internal_v2(uuid,uuid,numeric) IS
  'Primitiva interna UNITARIA que libera residual sem criar entrada fisica. Em conflito, reduz primeiro a falta. Caller multi-item deve materializar, deduplicar e ordenar todos os pares (inventory_id, stock_id) antes das chamadas. W1B-01 nao ativa consumidores.';

REVOKE ALL ON FUNCTION public.pdv_release_stock_reservation_internal_v2(uuid,uuid,numeric)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_set_stock_reservation_shortage_internal_v2(
  p_company_id uuid,
  p_reservation_id uuid,
  p_shortage_quantity numeric
)
RETURNS public.pdv_stock_reservation_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.pdv_stock_reservation_items;
  v_residual numeric;
  v_physical numeric;
  v_other_guaranteed numeric;
BEGIN
  IF p_shortage_quantity IS NULL OR p_shortage_quantity < 0 THEN
    RAISE EXCEPTION 'pdv_reservation_shortage_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_row
    FROM public.pdv_stock_reservation_items r
   WHERE r.id = p_reservation_id;
  IF NOT FOUND OR v_row.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'pdv_reservation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(sl.quantity, 0) INTO v_physical
    FROM public.inventory_stock_levels sl
   WHERE sl.inventory_id = v_row.inventory_id
     AND sl.stock_id = v_row.stock_id
     AND sl.company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdv_reservation_stock_level_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM r.id
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = v_row.inventory_id
     AND r.stock_id = v_row.stock_id
     AND r.state IN ('guaranteed', 'conflict')
   ORDER BY r.created_at, r.id
   FOR UPDATE;

  SELECT r.* INTO v_row
    FROM public.pdv_stock_reservation_items r
   WHERE r.id = p_reservation_id
   FOR UPDATE;

  v_residual := v_row.reserved_quantity - v_row.consumed_quantity - v_row.released_quantity;
  IF v_row.state NOT IN ('guaranteed', 'conflict')
     OR p_shortage_quantity > v_residual THEN
    RAISE EXCEPTION 'pdv_reservation_shortage_exceeds_residual'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum(
      r.reserved_quantity - r.consumed_quantity - r.released_quantity
      - r.shortage_quantity
    ), 0)
    INTO v_other_guaranteed
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = v_row.inventory_id
     AND r.stock_id = v_row.stock_id
     AND r.state IN ('guaranteed', 'conflict')
     AND r.id <> p_reservation_id;

  IF v_other_guaranteed + (v_residual - p_shortage_quantity)
       > GREATEST(COALESCE(v_physical, 0), 0) THEN
    RAISE EXCEPTION 'pdv_reservation_guarantee_exceeds_physical'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pdv_stock_reservation_items
     SET shortage_quantity = p_shortage_quantity,
         state = CASE WHEN p_shortage_quantity > 0 THEN 'conflict' ELSE 'guaranteed' END
   WHERE id = p_reservation_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.pdv_set_stock_reservation_shortage_internal_v2(uuid,uuid,numeric) IS
  'Primitiva interna UNITARIA para a contagem futura explicitar/conciliar falta sem alterar o fisico ou entregar automaticamente. Caller multi-item deve materializar, deduplicar e ordenar todos os pares (inventory_id, stock_id) antes das chamadas. W1B-01 nao ativa consumidores.';

REVOKE ALL ON FUNCTION public.pdv_set_stock_reservation_shortage_internal_v2(uuid,uuid,numeric)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_transfer_stock_reservation_origin_internal_v2(
  p_company_id uuid,
  p_reservation_id uuid,
  p_order_item_id uuid
)
RETURNS public.pdv_stock_reservation_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.pdv_stock_reservation_items;
  v_order_company uuid;
  v_order_inventory uuid;
BEGIN
  SELECT r.* INTO v_row
    FROM public.pdv_stock_reservation_items r
   WHERE r.id = p_reservation_id
   FOR UPDATE;
  IF NOT FOUND OR v_row.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'pdv_reservation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.preorder_item_id IS NULL OR v_row.order_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_reservation_origin_not_preorder'
      USING ERRCODE = '23514';
  END IF;

  SELECT oi.company_id, oi.inventory_id
    INTO v_order_company, v_order_inventory
    FROM public.pdv_order_items oi
   WHERE oi.id = p_order_item_id;
  IF NOT FOUND
     OR v_order_company IS DISTINCT FROM p_company_id
     OR v_order_inventory IS DISTINCT FROM v_row.inventory_id THEN
    RAISE EXCEPTION 'pdv_reservation_order_item_scope_mismatch'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.pdv_stock_reservation_items
     SET preorder_item_id = NULL,
         order_item_id = p_order_item_id,
         reservation_kind = 'coverage',
         expires_at = NULL
   WHERE id = p_reservation_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.pdv_transfer_stock_reservation_origin_internal_v2(uuid,uuid,uuid) IS
  'Primitiva interna UNITARIA da conversao W2: troca a origem pre-pedido por item do pedido na mesma transacao, sem liberar/re-reservar. Caller multi-item deve materializar, deduplicar e ordenar todos os pares (inventory_id, stock_id) antes das chamadas. W1B-01 nao ativa consumidores.';

REVOKE ALL ON FUNCTION public.pdv_transfer_stock_reservation_origin_internal_v2(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
