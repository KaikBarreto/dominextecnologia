-- PDV W1B-03: eventos internos de entrega parcial v2. Sem ativacao publica.
BEGIN;

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS unit_cost_v2 numeric,
  ADD COLUMN IF NOT EXISTS contract_version smallint NOT NULL DEFAULT 1;

-- O Zerar Sistema remove o pedido e seus itens por cascata. A reserva continua
-- protegida por um guard nominal abaixo; a FK deixa de impedir essa cascata
-- legitima sem permitir DELETE avulso da reserva.
ALTER TABLE public.pdv_stock_reservation_items
  DROP CONSTRAINT IF EXISTS pdv_stock_reservation_items_order_item_id_fkey;
ALTER TABLE public.pdv_stock_reservation_items
  ADD CONSTRAINT pdv_stock_reservation_items_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.pdv_order_items(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.pdv_guard_stock_reservation_delete_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
     OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Reservas de estoque não podem ser excluídas fora do processo de zerar o sistema.'
    USING ERRCODE = '23514', DETAIL = 'code=pdv_stock_reservation_delete_forbidden';
END;
$function$;

REVOKE ALL ON FUNCTION public.pdv_guard_stock_reservation_delete_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_pdv_stock_reservation_delete_v2
  ON public.pdv_stock_reservation_items;
CREATE TRIGGER trg_pdv_stock_reservation_delete_v2
  BEFORE DELETE ON public.pdv_stock_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_stock_reservation_delete_v2();

ALTER TABLE public.pdv_order_items
  DROP CONSTRAINT IF EXISTS pdv_order_items_item_type_v2_check;
ALTER TABLE public.pdv_order_items
  ADD CONSTRAINT pdv_order_items_item_type_v2_check CHECK (
    item_type IS NULL OR item_type IN ('material', 'service', 'free_item')
  );
ALTER TABLE public.pdv_order_items
  DROP CONSTRAINT IF EXISTS pdv_order_items_unit_cost_v2_check;
ALTER TABLE public.pdv_order_items
  ADD CONSTRAINT pdv_order_items_unit_cost_v2_check CHECK (
    unit_cost_v2 IS NULL OR unit_cost_v2 >= 0
  );
ALTER TABLE public.pdv_order_items
  DROP CONSTRAINT IF EXISTS pdv_order_items_contract_version_check;
ALTER TABLE public.pdv_order_items
  ADD CONSTRAINT pdv_order_items_contract_version_check CHECK (
    contract_version IN (1, 2)
    AND (contract_version = 1 OR item_type IS NOT NULL)
  );

COMMENT ON COLUMN public.pdv_order_items.item_type IS
  'Tipo explicito v2. NULL somente no legado v1; inventory_id NULL nao classifica sozinho servico.';
COMMENT ON COLUMN public.pdv_order_items.unit_cost_v2 IS
  'Custo v2: NULL desconhecido; zero e custo conhecido zero. Material entregue usa o snapshot da reserva.';

CREATE TABLE public.pdv_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_deliveries_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (company_id, client_request_id)
);

CREATE TABLE public.pdv_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.pdv_deliveries(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.pdv_order_items(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.pdv_stock_reservation_items(id) ON DELETE CASCADE,
  inventory_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE NO ACTION,
  quantity numeric NOT NULL CHECK (quantity > 0),
  item_type text NOT NULL CHECK (item_type IN ('material', 'service', 'free_item')),
  unit_cost_snapshot numeric CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_delivery_item_material_links_check CHECK (
    (item_type = 'material' AND reservation_id IS NOT NULL AND inventory_movement_id IS NOT NULL)
    OR (item_type IN ('service', 'free_item') AND reservation_id IS NULL AND inventory_movement_id IS NULL)
  ),
  UNIQUE (delivery_id, order_item_id)
);

CREATE UNIQUE INDEX uniq_pdv_delivery_items_movement
  ON public.pdv_delivery_items (inventory_movement_id)
  WHERE inventory_movement_id IS NOT NULL;
CREATE INDEX idx_pdv_deliveries_order
  ON public.pdv_deliveries (company_id, order_id, created_at, id);
CREATE INDEX idx_pdv_delivery_items_order_item
  ON public.pdv_delivery_items (company_id, order_item_id, created_at, id);

ALTER TABLE public.pdv_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_delivery_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_deliveries FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.pdv_delivery_items FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_guard_delivery_append_only_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company uuid := COALESCE(OLD.company_id, NEW.company_id);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company)
       OR COALESCE(current_setting('app.pdv_purge_company', true), '') = v_company::text THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Entregas confirmadas não podem ser alteradas ou excluídas; registre uma correção compensatória.'
    USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_append_only';
END;
$function$;
REVOKE ALL ON FUNCTION public.pdv_guard_delivery_append_only_v2()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_pdv_deliveries_append_only
  BEFORE UPDATE OR DELETE ON public.pdv_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_delivery_append_only_v2();
CREATE TRIGGER trg_pdv_delivery_items_append_only
  BEFORE UPDATE OR DELETE ON public.pdv_delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_delivery_append_only_v2();

CREATE OR REPLACE FUNCTION public.pdv_complete_delivery_internal_v2(
  p_company_id uuid,
  p_order_id uuid,
  p_client_request_id uuid,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_hash text;
  v_lines jsonb;
  v_existing public.pdv_deliveries%ROWTYPE;
  v_delivery public.pdv_deliveries%ROWTYPE;
  v_line jsonb;
  v_item record;
  v_item_id uuid;
  v_reservation_id uuid;
  v_qty numeric;
  v_delivered numeric;
  v_reservation public.pdv_stock_reservation_items%ROWTYPE;
  v_consumed public.pdv_stock_reservation_items%ROWTYPE;
  v_movement public.inventory_movements%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_client_request_id IS NULL OR p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item válido para registrar a entrega.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_payload_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_lines) line
     WHERE jsonb_typeof(line) <> 'object'
        OR NOT (line ? 'order_item_id')
        OR NOT (line ? 'quantity')
        OR (line - ARRAY['order_item_id','reservation_id','quantity']::text[]) <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Cada item da entrega deve informar somente item, reserva e quantidade.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_line_shape_invalid';
  END IF;
  BEGIN
    SELECT jsonb_agg(
      jsonb_build_object(
        'order_item_id', NULLIF(line->>'order_item_id','')::uuid,
        'reservation_id', NULLIF(line->>'reservation_id','')::uuid,
        'quantity', trim_scale(NULLIF(line->>'quantity','')::numeric)
      )
      ORDER BY NULLIF(line->>'order_item_id','')::uuid,
               NULLIF(line->>'reservation_id','')::uuid NULLS FIRST
    ) INTO v_lines
    FROM jsonb_array_elements(p_lines) line;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Item ou quantidade inválida na entrega.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_line_invalid';
  END;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_lines) l
     WHERE NULLIF(l->>'order_item_id','')::uuid IS NULL
        OR NULLIF(l->>'quantity','')::numeric IS NULL
        OR NULLIF(l->>'quantity','')::numeric <= 0
        OR (l->>'quantity') IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'Item ou quantidade inválida na entrega.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_line_invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lines) l
    GROUP BY NULLIF(l->>'order_item_id','')::uuid HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'O mesmo item foi informado mais de uma vez na entrega.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_duplicate_item';
  END IF;

  v_hash := encode(digest(v_lines::text, 'sha256'), 'hex');

  SELECT d.* INTO v_existing
    FROM public.pdv_deliveries d
   WHERE d.company_id = p_company_id AND d.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.order_id IS DISTINCT FROM p_order_id
       OR v_existing.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Esta solicitação de entrega já foi usada com dados diferentes.'
        USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'delivery_id', v_existing.id,
      'already_completed', true,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_item_id', di.order_item_id, 'quantity', di.quantity,
          'movement_id', di.inventory_movement_id
        ) ORDER BY di.id), '[]'::jsonb)
        FROM public.pdv_delivery_items di WHERE di.delivery_id = v_existing.id
      )
    );
  END IF;

  PERFORM 1 FROM public.pdv_orders o
   WHERE o.id = p_order_id AND o.company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado para esta empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_delivery_order_tenant_mismatch';
  END IF;

  -- Locks dos itens e pares materiais em ordem deterministica.
  PERFORM oi.id
    FROM public.pdv_order_items oi
    JOIN (
      SELECT DISTINCT NULLIF(l->>'order_item_id','')::uuid id
      FROM jsonb_array_elements(v_lines) l
    ) x ON x.id = oi.id
   WHERE oi.order_id = p_order_id AND oi.company_id = p_company_id
   ORDER BY oi.id FOR UPDATE OF oi;

  PERFORM i.id
    FROM public.inventory i
    JOIN public.pdv_stock_reservation_items r ON r.inventory_id = i.id
    JOIN (
      SELECT DISTINCT NULLIF(l->>'order_item_id','')::uuid id
      FROM jsonb_array_elements(v_lines) l
    ) x ON x.id = r.order_item_id
   WHERE r.company_id = p_company_id AND r.state IN ('guaranteed','conflict')
   ORDER BY i.id FOR UPDATE OF i;

  PERFORM s.id
    FROM public.stocks s
    JOIN public.pdv_stock_reservation_items r ON r.stock_id = s.id
    JOIN (
      SELECT DISTINCT NULLIF(l->>'order_item_id','')::uuid id
      FROM jsonb_array_elements(v_lines) l
    ) x ON x.id = r.order_item_id
   WHERE r.company_id = p_company_id AND r.state IN ('guaranteed','conflict')
   ORDER BY s.id FOR UPDATE OF s;

  PERFORM sl.id
    FROM public.inventory_stock_levels sl
    JOIN public.pdv_stock_reservation_items r
      ON r.inventory_id = sl.inventory_id AND r.stock_id = sl.stock_id
    JOIN (
      SELECT DISTINCT NULLIF(l->>'order_item_id','')::uuid id
      FROM jsonb_array_elements(v_lines) l
    ) x ON x.id = r.order_item_id
   WHERE r.company_id = p_company_id AND r.state IN ('guaranteed','conflict')
   ORDER BY sl.inventory_id, sl.stock_id FOR UPDATE OF sl;

  INSERT INTO public.pdv_deliveries (
    company_id, order_id, client_request_id, payload_hash
  ) VALUES (p_company_id, p_order_id, p_client_request_id, v_hash)
  RETURNING * INTO v_delivery;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_item_id := NULLIF(v_line->>'order_item_id','')::uuid;
    v_reservation_id := NULLIF(v_line->>'reservation_id','')::uuid;
    v_qty := NULLIF(v_line->>'quantity','')::numeric;
    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0
       OR v_qty::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Item ou quantidade inválida na entrega.'
        USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_line_invalid';
    END IF;

    SELECT oi.id, oi.company_id, oi.order_id, oi.inventory_id, oi.quantity,
           oi.item_type, oi.unit_cost_v2, oi.contract_version
      INTO v_item
      FROM public.pdv_order_items oi
     WHERE oi.id = v_item_id AND oi.order_id = p_order_id
       AND oi.company_id = p_company_id
     FOR UPDATE;
    IF NOT FOUND OR v_item.contract_version <> 2 OR v_item.item_type IS NULL THEN
      RAISE EXCEPTION 'Item do pedido não está preparado para entrega v2.'
        USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_item_not_v2';
    END IF;

    SELECT COALESCE(sum(di.quantity),0) INTO v_delivered
      FROM public.pdv_delivery_items di WHERE di.order_item_id = v_item_id;
    IF v_delivered + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'A quantidade informada supera o saldo ainda disponível para entrega.'
        USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_quantity_exceeded';
    END IF;

    v_movement := NULL;
    v_reservation := NULL;
    IF v_item.item_type = 'material' THEN
      IF v_item.inventory_id IS NULL THEN
        RAISE EXCEPTION 'Material da entrega não possui vínculo com o estoque.'
          USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_material_without_inventory';
      END IF;
      IF v_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Informe a reserva e o local usados para entregar este material.'
          USING ERRCODE = '22023', DETAIL = 'code=pdv_delivery_reservation_required';
      END IF;
      SELECT r.* INTO v_reservation
        FROM public.pdv_stock_reservation_items r
       WHERE r.id = v_reservation_id
         AND r.company_id = p_company_id AND r.order_item_id = v_item_id
         AND r.state IN ('guaranteed','conflict')
       FOR UPDATE;
      IF NOT FOUND OR v_reservation.inventory_id IS DISTINCT FROM v_item.inventory_id THEN
        RAISE EXCEPTION 'A reserva deste material não está disponível para entrega.'
          USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_reservation_unavailable';
      END IF;

      v_consumed := public.pdv_consume_stock_reservation_internal_v2(
        p_company_id, v_reservation.id, v_qty
      );
      v_movement := public.register_inventory_movement(
        v_item.inventory_id, 'saida', -v_qty, NULL,
        v_reservation.cost_price_snapshot,
        'Entrega PDV v2 ' || v_delivery.id::text,
        NULL, NULL, v_reservation.stock_id
      );
    ELSIF v_item.inventory_id IS NOT NULL OR v_reservation_id IS NOT NULL THEN
      RAISE EXCEPTION 'Serviço ou item livre não pode movimentar estoque nesta entrega.'
        USING ERRCODE = '23514', DETAIL = 'code=pdv_delivery_nonmaterial_with_inventory';
    END IF;

    INSERT INTO public.pdv_delivery_items (
      company_id, delivery_id, order_item_id, reservation_id,
      inventory_movement_id, quantity, item_type, unit_cost_snapshot
    ) VALUES (
      p_company_id, v_delivery.id, v_item_id,
      CASE WHEN v_item.item_type = 'material' THEN v_reservation.id ELSE NULL END,
      CASE WHEN v_item.item_type = 'material' THEN v_movement.id ELSE NULL END,
      v_qty, v_item.item_type,
      CASE WHEN v_item.item_type = 'material'
           THEN v_reservation.cost_price_snapshot ELSE v_item.unit_cost_v2 END
    );

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'order_item_id', v_item_id, 'quantity', v_qty,
      'movement_id', CASE WHEN v_item.item_type = 'material' THEN v_movement.id ELSE NULL END
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id, 'already_completed', false, 'items', v_items
  );
EXCEPTION WHEN unique_violation THEN
  SELECT d.* INTO v_existing FROM public.pdv_deliveries d
   WHERE d.company_id = p_company_id AND d.client_request_id = p_client_request_id;
  IF FOUND AND v_existing.order_id = p_order_id AND v_existing.payload_hash = v_hash THEN
    RETURN jsonb_build_object(
      'delivery_id', v_existing.id,
      'already_completed', true,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_item_id', di.order_item_id, 'quantity', di.quantity,
          'movement_id', di.inventory_movement_id
        ) ORDER BY di.id), '[]'::jsonb)
        FROM public.pdv_delivery_items di WHERE di.delivery_id = v_existing.id
      )
    );
  END IF;
  RAISE;
END;
$function$;

COMMENT ON FUNCTION public.pdv_complete_delivery_internal_v2(uuid,uuid,uuid,jsonb) IS
  'Primitiva interna aditiva de entrega parcial. Material consome reserva+cadastra Kardex na mesma transacao; servico/item livre nao move estoque. W2/W1C ainda sao gates para ativacao.';
REVOKE ALL ON FUNCTION public.pdv_complete_delivery_internal_v2(uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
