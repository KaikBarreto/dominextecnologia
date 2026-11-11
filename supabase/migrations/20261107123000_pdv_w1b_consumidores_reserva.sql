-- PDV W1B-02: todos os consumidores negativos respeitam reservas garantidas.
--
-- Este slice ainda NAO ativa entrega/PDV v2. A protecao fica acoplada a
-- inventory_stock_levels, a porta fisica real, portanto cobre movimento manual,
-- OS, transferencia e o commit legado do PDV sem duplicar regras de dominio.
-- Entradas permanecem neutras: reposicao nao resolve conflito automaticamente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Guard canônico no saldo fisico.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_guard_reserved_stock_level_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_guaranteed numeric := 0;
BEGIN
  IF NEW.quantity >= OLD.quantity THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.inventory_id IS DISTINCT FROM OLD.inventory_id
     OR NEW.stock_id IS DISTINCT FROM OLD.stock_id THEN
    RAISE EXCEPTION 'Não foi possível concluir a movimentação porque o material ou o local foi alterado durante a operação.'
      USING ERRCODE = '23514',
            DETAIL = 'code=stock_reservation_scope_immutable';
  END IF;

  SELECT COALESCE(sum(
      r.reserved_quantity - r.consumed_quantity - r.released_quantity
      - r.shortage_quantity
    ), 0)
    INTO v_guaranteed
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = OLD.company_id
     AND r.inventory_id = OLD.inventory_id
     AND r.stock_id = OLD.stock_id
     AND r.state IN ('guaranteed', 'conflict');

  -- Estoque negativo legado continua permitido quando nao ha garantia ativa.
  IF v_guaranteed > 0 AND NEW.quantity < v_guaranteed THEN
    RAISE EXCEPTION 'Estoque disponível insuficiente: parte da quantidade está reservada para pedidos.'
      USING ERRCODE = '23514',
            DETAIL = format(
              'code=stock_reserved_quantity_conflict physical_after=%s guaranteed=%s inventory_id=%s stock_id=%s',
              NEW.quantity, v_guaranteed, OLD.inventory_id, OLD.stock_id
            ),
            HINT = 'Reduza a quantidade ou reconcilie as reservas em conflito.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.pdv_guard_reserved_stock_level_v2() IS
  'Guard W1B-02: qualquer reducao do saldo fisico precisa preservar a soma garantida. Entradas nao alteram conflitos. Erros tecnicos devem ser mapeados para copy PT-BR no caller.';

REVOKE ALL ON FUNCTION public.pdv_guard_reserved_stock_level_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_pdv_guard_reserved_stock_level_v2
  ON public.inventory_stock_levels;
CREATE TRIGGER trg_pdv_guard_reserved_stock_level_v2
  BEFORE UPDATE OF quantity ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_reserved_stock_level_v2();

CREATE OR REPLACE FUNCTION public.pdv_guard_reserved_stock_level_delete_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Cascata legitima da exclusao do tenant: o pai ja nao existe. Fora deste
  -- caso, material/local com reserva continua protegido.
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_stock_reservation_items r
     WHERE r.company_id = OLD.company_id
       AND r.inventory_id = OLD.inventory_id
       AND r.stock_id = OLD.stock_id
       AND r.state IN ('guaranteed', 'conflict')
       AND r.reserved_quantity - r.consumed_quantity - r.released_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Não é possível remover este saldo enquanto houver pedidos com estoque reservado.'
      USING ERRCODE = '23514',
            DETAIL = 'code=stock_level_has_active_reservations';
  END IF;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.pdv_guard_reserved_stock_level_delete_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_pdv_guard_reserved_stock_level_delete_v2
  ON public.inventory_stock_levels;
CREATE TRIGGER trg_pdv_guard_reserved_stock_level_delete_v2
  BEFORE DELETE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_reserved_stock_level_delete_v2();

-- ---------------------------------------------------------------------------
-- 2. Primitiva para a entrega futura consumir a SUA reserva antes do Kardex.
--    Ambas as operacoes precisam ocorrer na mesma transacao; falha no movimento
--    reverte o consumo. Esta funcao nao entrega nem cria movimento.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_consume_stock_reservation_internal_v2(
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
  v_guaranteed numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'pdv_reservation_consume_quantity_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_row
    FROM public.pdv_stock_reservation_items r
   WHERE r.id = p_reservation_id;
  IF NOT FOUND OR v_row.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'pdv_reservation_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM public.inventory_stock_levels sl
   WHERE sl.company_id = p_company_id
     AND sl.inventory_id = v_row.inventory_id
     AND sl.stock_id = v_row.stock_id
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
  v_guaranteed := v_residual - v_row.shortage_quantity;

  IF v_row.state NOT IN ('guaranteed', 'conflict')
     OR p_quantity > v_guaranteed THEN
    RAISE EXCEPTION 'pdv_reservation_consume_exceeds_guarantee'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pdv_stock_reservation_items
     SET consumed_quantity = consumed_quantity + p_quantity,
         state = CASE
           WHEN v_residual - p_quantity = 0 THEN 'consumed'
           WHEN shortage_quantity > 0 THEN 'conflict'
           ELSE 'guaranteed'
         END
   WHERE id = p_reservation_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.pdv_consume_stock_reservation_internal_v2(uuid,uuid,numeric) IS
  'Consome somente a parte garantida da propria reserva. Caller de entrega deve, na mesma transacao, registrar a saida no Kardex. Em lote, materializa/deduplica/ordena pares antes das chamadas. W1B-02 nao ativa entrega.';

REVOKE ALL ON FUNCTION public.pdv_consume_stock_reservation_internal_v2(uuid,uuid,numeric)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Contagem soberana: recalcula a falta de forma deterministica.
--    Reservas mais antigas preservam garantia; o deficit recai primeiro nas
--    mais novas (created_at DESC, id DESC). Reposicao comum nao chama isto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_reconcile_reservations_for_count_internal_v2(
  p_company_id uuid,
  p_inventory_id uuid,
  p_stock_id uuid,
  p_counted_quantity numeric,
  p_inventory_count_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_count_company uuid;
  v_row record;
  v_residual numeric;
  v_committed numeric := 0;
  v_shortage_total numeric := 0;
  v_shortage_remaining numeric := 0;
  v_row_shortage numeric;
  v_conflicts integer := 0;
BEGIN
  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'inventory_count_quantity_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT ic.company_id INTO v_count_company
    FROM public.inventory_counts ic
   WHERE ic.id = p_inventory_count_id;
  IF NOT FOUND OR v_count_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'inventory_count_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM public.inventory_stock_levels sl
   WHERE sl.company_id = p_company_id
     AND sl.inventory_id = p_inventory_id
     AND sl.stock_id = p_stock_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_count_stock_level_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM r.id
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = p_inventory_id
     AND r.stock_id = p_stock_id
     AND r.state IN ('guaranteed', 'conflict')
   ORDER BY r.created_at, r.id
   FOR UPDATE;

  SELECT COALESCE(sum(
      r.reserved_quantity - r.consumed_quantity - r.released_quantity
    ), 0)
    INTO v_committed
    FROM public.pdv_stock_reservation_items r
   WHERE r.company_id = p_company_id
     AND r.inventory_id = p_inventory_id
     AND r.stock_id = p_stock_id
     AND r.state IN ('guaranteed', 'conflict');

  v_shortage_total := GREATEST(v_committed - p_counted_quantity, 0);
  v_shortage_remaining := v_shortage_total;

  FOR v_row IN
    SELECT r.id, r.reserved_quantity, r.consumed_quantity, r.released_quantity
      FROM public.pdv_stock_reservation_items r
     WHERE r.company_id = p_company_id
       AND r.inventory_id = p_inventory_id
       AND r.stock_id = p_stock_id
       AND r.state IN ('guaranteed', 'conflict')
     ORDER BY r.created_at DESC, r.id DESC
     FOR UPDATE
  LOOP
    v_residual := v_row.reserved_quantity - v_row.consumed_quantity - v_row.released_quantity;
    v_row_shortage := LEAST(v_residual, v_shortage_remaining);

    UPDATE public.pdv_stock_reservation_items
       SET shortage_quantity = v_row_shortage,
           state = CASE WHEN v_row_shortage > 0 THEN 'conflict' ELSE 'guaranteed' END
     WHERE id = v_row.id;

    IF v_row_shortage > 0 THEN
      v_conflicts := v_conflicts + 1;
    END IF;
    v_shortage_remaining := v_shortage_remaining - v_row_shortage;
  END LOOP;

  IF v_shortage_total > 0 THEN
    INSERT INTO public.pdv_reconciliation_issues (
      company_id, issue_domain, issue_code, resource_type, resource_id, evidence
    ) VALUES (
      p_company_id,
      'stock',
      'reservation_shortage',
      'inventory_count',
      p_inventory_count_id,
      jsonb_build_object(
        'inventory_id', p_inventory_id,
        'stock_id', p_stock_id,
        'counted_quantity', p_counted_quantity,
        'committed_quantity', v_committed,
        'shortage_quantity', v_shortage_total,
        'allocation', 'newest_first'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'committed_quantity', v_committed,
    'shortage_quantity', v_shortage_total,
    'conflicting_reservations', v_conflicts
  );
END;
$function$;

COMMENT ON FUNCTION public.pdv_reconcile_reservations_for_count_internal_v2(uuid,uuid,uuid,numeric,uuid) IS
  'Somente a finalizacao do inventario chama esta primitiva: a contagem e soberana, deficit vira shortage deterministico e issue auditavel. Entrada comum nunca limpa conflito.';

REVOKE ALL ON FUNCTION public.pdv_reconcile_reservations_for_count_internal_v2(uuid,uuid,uuid,numeric,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Finalizacao de inventario com pre-lock completo e conflito auditavel.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_inventory_count(
  p_count_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_company_id uuid;
  v_status text;
  v_user_company uuid;
  v_numero integer;
  r_item record;
  v_current numeric;
  v_delta numeric;
  v_adjusted integer := 0;
  v_diff_value numeric := 0;
  v_reconcile jsonb;
  v_conflicts integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para finalizar o inventário.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_auth_required';
  END IF;

  SELECT profile.company_id
    INTO v_user_company
    FROM public.profiles profile
   WHERE profile.user_id = v_uid
     AND profile.is_active IS TRUE;
  v_is_super := public.is_super_admin(v_uid);
  IF v_user_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_active_profile_required';
  END IF;

  -- Primeiro lemos sem lock para negar tenant/entitlements/ACL antes de travar
  -- qualquer linha operacional. O cabeçalho é relido com lock após os gates.
  SELECT company_id, status, numero
    INTO v_company_id, v_status, v_numero
    FROM public.inventory_counts
   WHERE id = p_count_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventário não encontrado: %', p_count_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_super AND v_company_id IS DISTINCT FROM v_user_company THEN
    RAISE EXCEPTION 'Acesso negado: inventário de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_super
     AND public.tenant_subscription_allows_access(v_company_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A assinatura da empresa não permite finalizar inventários.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_subscription_denied';
  END IF;
  IF NOT v_is_super
     AND public.company_has_module(v_company_id, 'basic') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo de estoque não está disponível para esta empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_module_denied';
  END IF;
  IF NOT v_is_super AND (
    public.user_has_permission(v_uid, 'screen:inventory') IS DISTINCT FROM true
    OR public.user_has_permission(v_uid, 'fn:manage_inventory') IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para finalizar inventários.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_permission_denied';
  END IF;

  -- Falha fechado para qualquer material/local fora do tenant. A ACL cobre
  -- tanto os locais declarados no cabeçalho quanto todos os itens da contagem.
  IF EXISTS (
    SELECT 1
      FROM public.inventory_count_stocks count_stock
      LEFT JOIN public.stocks stock ON stock.id = count_stock.stock_id
     WHERE count_stock.count_id = p_count_id
       AND (
         count_stock.company_id IS DISTINCT FROM v_company_id
         OR stock.company_id IS DISTINCT FROM v_company_id
         OR (NOT v_is_super
             AND public.can_access_stock(v_uid, count_stock.stock_id) IS DISTINCT FROM true)
       )
  ) OR EXISTS (
    SELECT 1
      FROM public.inventory_count_items count_item
      LEFT JOIN public.inventory material ON material.id = count_item.inventory_id
      LEFT JOIN public.stocks stock ON stock.id = count_item.stock_id
     WHERE count_item.count_id = p_count_id
       AND (
         count_item.company_id IS DISTINCT FROM v_company_id
         OR material.company_id IS DISTINCT FROM v_company_id
         OR stock.company_id IS DISTINCT FROM v_company_id
         OR material.customer_id IS DISTINCT FROM stock.customer_id
         OR (NOT v_is_super
             AND public.can_access_stock(v_uid, count_item.stock_id) IS DISTINCT FROM true)
       )
  ) THEN
    RAISE EXCEPTION 'A contagem contém material ou local sem acesso nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_scope_denied';
  END IF;

  SELECT company_id, status, numero
    INTO v_company_id, v_status, v_numero
    FROM public.inventory_counts
   WHERE id = p_count_id
   FOR UPDATE;
  IF NOT FOUND OR (NOT v_is_super AND v_company_id IS DISTINCT FROM v_user_company) THEN
    RAISE EXCEPTION 'Acesso negado: inventário indisponível.'
      USING ERRCODE = '42501', DETAIL = 'code=inventory_count_scope_changed';
  END IF;

  IF v_status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'count_id', p_count_id,
      'already_finalized', true,
      'items_adjusted', 0,
      'diff_value', 0,
      'reservation_conflicts', 0
    );
  END IF;

  IF v_status <> 'aberto' THEN
    RAISE EXCEPTION 'Inventário não está aberto (status=%)', v_status USING ERRCODE = '23514';
  END IF;

  IF p_notes IS NOT NULL THEN
    UPDATE public.inventory_counts SET notes = p_notes WHERE id = p_count_id;
  END IF;

  -- Ordem global: materiais -> locais -> levels -> reservas.
  PERFORM i.id
    FROM public.inventory i
    JOIN (
      SELECT DISTINCT ci.inventory_id
        FROM public.inventory_count_items ci
       WHERE ci.count_id = p_count_id AND ci.counted_qty IS NOT NULL
    ) pairs ON pairs.inventory_id = i.id
   ORDER BY i.id
   FOR UPDATE OF i;

  PERFORM s.id
    FROM public.stocks s
    JOIN (
      SELECT DISTINCT ci.stock_id
        FROM public.inventory_count_items ci
       WHERE ci.count_id = p_count_id AND ci.counted_qty IS NOT NULL
    ) pairs ON pairs.stock_id = s.id
   ORDER BY s.id
   FOR UPDATE OF s;

  -- Levels ausentes so nascem depois dos locks de material/local.
  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity
  )
  SELECT v_company_id, ci.inventory_id, ci.stock_id, 0
    FROM public.inventory_count_items ci
   WHERE ci.count_id = p_count_id AND ci.counted_qty IS NOT NULL
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  PERFORM sl.id
    FROM public.inventory_stock_levels sl
    JOIN public.inventory_count_items ci
      ON ci.inventory_id = sl.inventory_id AND ci.stock_id = sl.stock_id
   WHERE ci.count_id = p_count_id AND ci.counted_qty IS NOT NULL
   ORDER BY sl.inventory_id, sl.stock_id
   FOR UPDATE OF sl;

  PERFORM r.id
    FROM public.pdv_stock_reservation_items r
    JOIN public.inventory_count_items ci
      ON ci.inventory_id = r.inventory_id AND ci.stock_id = r.stock_id
   WHERE ci.count_id = p_count_id
     AND ci.counted_qty IS NOT NULL
     AND r.state IN ('guaranteed', 'conflict')
   ORDER BY r.inventory_id, r.stock_id, r.created_at, r.id
   FOR UPDATE OF r;

  FOR r_item IN
    SELECT id, inventory_id, stock_id, counted_qty, unit_cost
      FROM public.inventory_count_items
     WHERE count_id = p_count_id
       AND counted_qty IS NOT NULL
     ORDER BY inventory_id, stock_id
  LOOP
    SELECT quantity INTO v_current
      FROM public.inventory_stock_levels
     WHERE company_id = v_company_id
       AND inventory_id = r_item.inventory_id
       AND stock_id = r_item.stock_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory_count_stock_level_tenant_mismatch'
        USING ERRCODE = '42501';
    END IF;

    v_reconcile := public.pdv_reconcile_reservations_for_count_internal_v2(
      v_company_id,
      r_item.inventory_id,
      r_item.stock_id,
      r_item.counted_qty,
      p_count_id
    );
    v_conflicts := v_conflicts
      + COALESCE((v_reconcile->>'conflicting_reservations')::integer, 0);

    v_delta := r_item.counted_qty - COALESCE(v_current, 0);
    IF v_delta <> 0 THEN
      PERFORM public.register_inventory_movement(
        p_inventory_id => r_item.inventory_id,
        p_movement_type => 'ajuste',
        p_quantity => v_delta,
        p_supplier_id => NULL,
        p_unit_cost => r_item.unit_cost,
        p_notes => 'Inventário #' || COALESCE(v_numero::text, '?'),
        p_service_order_id => NULL,
        p_related_movement_id => NULL,
        p_stock_id => r_item.stock_id
      );

      v_adjusted := v_adjusted + 1;
      v_diff_value := v_diff_value + (v_delta * COALESCE(r_item.unit_cost, 0));
    END IF;
  END LOOP;

  UPDATE public.inventory_counts
     SET status = 'finalizado', finalized_at = now()
   WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'count_id', p_count_id,
    'already_finalized', false,
    'items_adjusted', v_adjusted,
    'diff_value', v_diff_value,
    'reservation_conflicts', v_conflicts
  );
END;
$function$;

COMMENT ON FUNCTION public.finalize_inventory_count(uuid,text) IS
  'Finaliza inventario com perfil ativo, tenant/assinatura/modulo/permissoes/ACL validados antes dos locks. A contagem fisica e soberana; deficit de reservas vira shortage+issue antes do ajuste, sem fabricar saldo ou entregar. Retry por status nao reaplica.';

REVOKE ALL ON FUNCTION public.finalize_inventory_count(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_inventory_count(uuid,text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Consumo de OS: mesma semantica, agora com pre-lock de todos os pares.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_os_material_consumption(
  p_service_order_id uuid,
  p_lines            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_is_super     boolean;
  v_is_manager   boolean;
  v_is_assigned  boolean;
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

  SELECT profile.company_id
    INTO v_user_company
    FROM public.profiles profile
   WHERE profile.user_id = v_uid
     AND profile.is_active IS TRUE;
  IF v_user_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE = '42501', DETAIL = 'code=os_material_active_profile_required';
  END IF;

  v_is_super := public.is_super_admin(v_uid);
  v_is_manager := public.is_admin_or_gestor(v_uid);

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

  IF NOT v_is_super
     AND public.tenant_subscription_allows_access(v_so.company_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A assinatura da empresa não permite registrar consumo de materiais.'
      USING ERRCODE = '42501', DETAIL = 'code=os_material_subscription_denied';
  END IF;
  -- OS e Estoque pertencem ao kit básico; um único entitlement canônico cobre
  -- as duas telas sem inventar códigos de módulo paralelos.
  IF NOT v_is_super
     AND public.company_has_module(v_so.company_id, 'basic') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Os módulos de Ordens de Serviço e Estoque não estão disponíveis.'
      USING ERRCODE = '42501', DETAIL = 'code=os_material_module_denied';
  END IF;

  v_is_assigned := v_so.technician_id = v_uid
    OR v_so.created_by = v_uid
    OR public.is_service_order_assignee(p_service_order_id, v_uid);

  -- Exceção de produto: técnico/criador/responsável da OS pode confirmar o que
  -- usou em campo. Fora dessa posse, somente gestor com tela E ação explícitas.
  IF NOT v_is_super AND NOT v_is_assigned AND (
    NOT v_is_manager
    OR public.user_has_permission(v_uid, 'screen:service_orders') IS DISTINCT FROM true
    OR public.user_has_permission(v_uid, 'fn:edit_os') IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas um responsável da OS ou gestor autorizado pode registrar o consumo de materiais.'
      USING ERRCODE = '42501', DETAIL = 'code=os_material_permission_denied';
  END IF;

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

  -- Linhas antigas que serão removidas/estornadas também precisam manter tenant,
  -- cliente e ACL. Sem isso, payload vazio contornaria o local restrito.
  IF EXISTS (
    SELECT 1
      FROM public.service_order_materials material_line
      LEFT JOIN public.inventory material ON material.id = material_line.inventory_id
      LEFT JOIN public.stocks stock ON stock.id = material_line.stock_id
     WHERE material_line.service_order_id = p_service_order_id
       AND (
         material_line.company_id IS DISTINCT FROM v_so.company_id
         OR material.company_id IS DISTINCT FROM v_so.company_id
         OR stock.company_id IS DISTINCT FROM v_so.company_id
         OR material.customer_id IS DISTINCT FROM stock.customer_id
         OR (material.customer_id IS NOT NULL
             AND material.customer_id IS DISTINCT FROM v_so.customer_id)
         OR public.can_access_stock(v_uid, material_line.stock_id) IS DISTINCT FROM true
       )
  ) THEN
    RAISE EXCEPTION 'Um material já lançado pertence a outro estoque ou local sem acesso.'
      USING ERRCODE = '42501', DETAIL = 'code=os_material_existing_scope_denied';
  END IF;

  -- Só depois de validar tenant/material/local/ACL adquirimos o mutex da OS.
  PERFORM pg_advisory_xact_lock(
    hashtext('commit_os_material_consumption:' || p_service_order_id::text)
  );
  PERFORM 1
    FROM public.service_order_materials
   WHERE service_order_id = p_service_order_id
   FOR UPDATE;

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
  -- W1B-02: pre-lock de todos os pares antes de qualquer movimento.
  -- Ordem global do contrato: materiais -> locais -> levels -> reservas.
  PERFORM i.id
    FROM public.inventory i
    JOIN (
      SELECT DISTINCT (elem->>'inventory_id')::uuid AS inventory_id
        FROM jsonb_array_elements(v_ops) AS elem
    ) pairs ON pairs.inventory_id = i.id
   ORDER BY i.id
   FOR UPDATE OF i;

  PERFORM s.id
    FROM public.stocks s
    JOIN (
      SELECT DISTINCT (elem->>'stock_id')::uuid AS stock_id
        FROM jsonb_array_elements(v_ops) AS elem
    ) pairs ON pairs.stock_id = s.id
   ORDER BY s.id
   FOR UPDATE OF s;

  -- Materializa/deduplica levels somente depois dos locks de material/local.
  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity
  )
  SELECT DISTINCT
    v_so.company_id,
    (elem->>'inventory_id')::uuid,
    (elem->>'stock_id')::uuid,
    0
  FROM jsonb_array_elements(v_ops) AS elem
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  PERFORM sl.id
    FROM public.inventory_stock_levels sl
    JOIN (
      SELECT DISTINCT
        (elem->>'inventory_id')::uuid AS inventory_id,
        (elem->>'stock_id')::uuid AS stock_id
      FROM jsonb_array_elements(v_ops) AS elem
    ) pairs
      ON pairs.inventory_id = sl.inventory_id
     AND pairs.stock_id = sl.stock_id
   WHERE sl.company_id = v_so.company_id
   ORDER BY sl.inventory_id, sl.stock_id
   FOR UPDATE OF sl;

  PERFORM r.id
    FROM public.pdv_stock_reservation_items r
    JOIN (
      SELECT DISTINCT
        (elem->>'inventory_id')::uuid AS inventory_id,
        (elem->>'stock_id')::uuid AS stock_id
      FROM jsonb_array_elements(v_ops) AS elem
    ) pairs
      ON pairs.inventory_id = r.inventory_id
     AND pairs.stock_id = r.stock_id
   WHERE r.company_id = v_so.company_id
     AND r.state IN ('guaranteed', 'conflict')
   ORDER BY r.inventory_id, r.stock_id, r.created_at, r.id
   FOR UPDATE OF r;

  FOR v_op IN
    SELECT elem
      FROM jsonb_array_elements(v_ops) WITH ORDINALITY AS queued(elem, ordinal)
     ORDER BY ordinal
  LOOP
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

COMMENT ON FUNCTION public.commit_os_material_consumption(uuid,jsonb) IS
  'Confirma consumo de materiais da OS após perfil ativo, tenant, assinatura, módulo básico, posse ou tela+ação de gestor e ACL dos locais. Materiais/locais são validados antes do mutex e pares são materializados, deduplicados e ordenados antes dos deltas.';

REVOKE ALL ON FUNCTION public.commit_os_material_consumption(uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_os_material_consumption(uuid,jsonb)
  TO authenticated, service_role;

COMMIT;
