-- Estoque fiscal canônico para NF-e/NFC-e.
-- Somente autorização oficial cria efeito; cancelamento cria estorno append-only.

ALTER TABLE public.nfe_documents
  ADD COLUMN IF NOT EXISTS stock_id uuid REFERENCES public.stocks(id) ON DELETE RESTRICT;
ALTER TABLE public.nfce_documents
  ADD COLUMN IF NOT EXISTS stock_id uuid REFERENCES public.stocks(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_nfe_documents_stock_id ON public.nfe_documents(stock_id);
CREATE INDEX IF NOT EXISTS idx_nfce_documents_stock_id ON public.nfce_documents(stock_id);

CREATE TABLE IF NOT EXISTS public.fiscal_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  document_model smallint NOT NULL CHECK (document_model IN (55, 65)),
  document_id uuid NOT NULL,
  document_number bigint,
  access_key text,
  item_key text NOT NULL,
  source_event text NOT NULL CHECK (source_event IN ('authorized', 'cancelled')),
  direction text NOT NULL CHECK (direction IN ('entrada', 'saida')),
  quantity numeric NOT NULL CHECK (quantity <> 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_inventory_movement_identity_unique
    UNIQUE (company_id, document_model, document_id, item_key, source_event)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_inventory_movements_company_occurred
  ON public.fiscal_inventory_movements(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inventory_movements_stock_inventory
  ON public.fiscal_inventory_movements(stock_id, inventory_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_fiscal_inventory_movements_document
  ON public.fiscal_inventory_movements(document_model, document_id);

CREATE TABLE IF NOT EXISTS public.fiscal_inventory_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE RESTRICT,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  quantity_delta numeric NOT NULL CHECK (quantity_delta <> 0),
  target_balance numeric NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_inventory_opening_company_effective
  ON public.fiscal_inventory_opening_balances(company_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inventory_opening_stock_inventory
  ON public.fiscal_inventory_opening_balances(stock_id, inventory_id, effective_at);

ALTER TABLE public.fiscal_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_inventory_opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages fiscal inventory movements" ON public.fiscal_inventory_movements;
CREATE POLICY "service role manages fiscal inventory movements"
  ON public.fiscal_inventory_movements FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads accessible fiscal inventory movements" ON public.fiscal_inventory_movements;
CREATE POLICY "company reads accessible fiscal inventory movements"
  ON public.fiscal_inventory_movements FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_access_stock((SELECT auth.uid()), stock_id)
  );

DROP POLICY IF EXISTS "service role manages fiscal inventory opening balances" ON public.fiscal_inventory_opening_balances;
CREATE POLICY "service role manages fiscal inventory opening balances"
  ON public.fiscal_inventory_opening_balances FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads accessible fiscal inventory opening balances" ON public.fiscal_inventory_opening_balances;
CREATE POLICY "company reads accessible fiscal inventory opening balances"
  ON public.fiscal_inventory_opening_balances FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_access_stock((SELECT auth.uid()), stock_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.fiscal_inventory_movements FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_inventory_opening_balances FROM authenticated, anon;
GRANT SELECT ON public.fiscal_inventory_movements, public.fiscal_inventory_opening_balances TO authenticated;
GRANT ALL ON public.fiscal_inventory_movements, public.fiscal_inventory_opening_balances TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_inventory_insert_authorization(
  p_model integer,
  p_document_id uuid,
  p_company_id uuid,
  p_stock_id uuid,
  p_direction text,
  p_number bigint,
  p_access_key text,
  p_payload jsonb,
  p_occurred_at timestamptz
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_model NOT IN (55, 65) OR p_direction NOT IN ('entrada', 'saida') OR p_stock_id IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stocks s
    WHERE s.id = p_stock_id AND s.company_id = p_company_id AND s.customer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'O local fiscal não pertence à empresa do documento.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.fiscal_inventory_movements (
    company_id, stock_id, inventory_id, document_model, document_id,
    document_number, access_key, item_key, source_event, direction,
    quantity, unit_cost, occurred_at
  )
  SELECT
    p_company_id,
    p_stock_id,
    (item.value->>'inventoryId')::uuid,
    p_model,
    p_document_id,
    p_number,
    p_access_key,
    coalesce(nullif(item.value->>'sourceItemId', ''), nullif(item.value->>'id', ''), item.ordinality::text),
    'authorized',
    p_direction,
    abs(coalesce(nullif(item.value->>'quantity', '')::numeric, 0))
      * CASE WHEN p_direction = 'entrada' THEN 1 ELSE -1 END,
    greatest(coalesce(inventory.cost_price, 0), 0),
    coalesce(p_occurred_at, now())
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_payload->'items') = 'array' THEN p_payload->'items' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS item(value, ordinality)
  JOIN public.inventory inventory
    ON inventory.id = CASE
      WHEN coalesce(item.value->>'inventoryId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item.value->>'inventoryId')::uuid ELSE NULL END
   AND inventory.company_id = p_company_id
   AND inventory.customer_id IS NULL
  WHERE coalesce(nullif(item.value->>'quantity', '')::numeric, 0) <> 0
  ON CONFLICT (company_id, document_model, document_id, item_key, source_event) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_inventory_insert_authorization(integer, uuid, uuid, uuid, text, bigint, text, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_inventory_insert_authorization(integer, uuid, uuid, uuid, text, bigint, text, jsonb, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_inventory_document_status_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_model integer := CASE WHEN TG_TABLE_NAME = 'nfe_documents' THEN 55 ELSE 65 END;
  v_direction text := CASE WHEN TG_TABLE_NAME = 'nfe_documents' THEN NEW.direction ELSE 'saida' END;
BEGIN
  IF NEW.status = 'authorized' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'authorized') THEN
      PERFORM public.fiscal_inventory_insert_authorization(
        v_model, NEW.id, NEW.company_id, NEW.stock_id, v_direction,
        NEW.number, NEW.access_key, NEW.draft_payload,
        coalesce(NEW.authorized_at, NEW.updated_at, now())
      );
    END IF;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'cancelled') THEN
      INSERT INTO public.fiscal_inventory_movements (
        company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, source_event, direction,
        quantity, unit_cost, occurred_at
      )
      SELECT company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, 'cancelled', direction,
        -quantity, unit_cost, coalesce(NEW.cancelled_at, NEW.updated_at, now())
      FROM public.fiscal_inventory_movements
      WHERE company_id = NEW.company_id
        AND document_model = v_model
        AND document_id = NEW.id
        AND source_event = 'authorized'
      ON CONFLICT (company_id, document_model, document_id, item_key, source_event) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_inventory_document_status_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fiscal_inventory_nfe_status ON public.nfe_documents;
CREATE TRIGGER fiscal_inventory_nfe_status
AFTER INSERT OR UPDATE OF status ON public.nfe_documents
FOR EACH ROW EXECUTE FUNCTION public.fiscal_inventory_document_status_trigger();

DROP TRIGGER IF EXISTS fiscal_inventory_nfce_status ON public.nfce_documents;
CREATE TRIGGER fiscal_inventory_nfce_status
AFTER INSERT OR UPDATE OF status ON public.nfce_documents
FOR EACH ROW EXECUTE FUNCTION public.fiscal_inventory_document_status_trigger();

-- Backfill repetível: primeiro materializa a autorização, depois o estorno dos cancelados.
DO $$
DECLARE row_record record;
BEGIN
  FOR row_record IN
    SELECT id, company_id, stock_id, direction, number, access_key, draft_payload,
      coalesce(authorized_at, updated_at, created_at) AS occurred_at, status,
      coalesce(cancelled_at, updated_at, created_at) AS cancelled_at
    FROM public.nfe_documents
    WHERE stock_id IS NOT NULL AND status IN ('authorized', 'cancelled')
  LOOP
    PERFORM public.fiscal_inventory_insert_authorization(
      55, row_record.id, row_record.company_id, row_record.stock_id,
      row_record.direction, row_record.number, row_record.access_key,
      row_record.draft_payload, row_record.occurred_at
    );
    IF row_record.status = 'cancelled' THEN
      INSERT INTO public.fiscal_inventory_movements (
        company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, source_event, direction,
        quantity, unit_cost, occurred_at
      )
      SELECT company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, 'cancelled', direction,
        -quantity, unit_cost, row_record.cancelled_at
      FROM public.fiscal_inventory_movements
      WHERE company_id = row_record.company_id AND document_model = 55
        AND document_id = row_record.id AND source_event = 'authorized'
      ON CONFLICT (company_id, document_model, document_id, item_key, source_event) DO NOTHING;
    END IF;
  END LOOP;

  FOR row_record IN
    SELECT id, company_id, stock_id, number, access_key, draft_payload,
      coalesce(authorized_at, updated_at, created_at) AS occurred_at, status,
      coalesce(cancelled_at, updated_at, created_at) AS cancelled_at
    FROM public.nfce_documents
    WHERE stock_id IS NOT NULL AND status IN ('authorized', 'cancelled')
  LOOP
    PERFORM public.fiscal_inventory_insert_authorization(
      65, row_record.id, row_record.company_id, row_record.stock_id,
      'saida', row_record.number, row_record.access_key,
      row_record.draft_payload, row_record.occurred_at
    );
    IF row_record.status = 'cancelled' THEN
      INSERT INTO public.fiscal_inventory_movements (
        company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, source_event, direction,
        quantity, unit_cost, occurred_at
      )
      SELECT company_id, stock_id, inventory_id, document_model, document_id,
        document_number, access_key, item_key, 'cancelled', direction,
        -quantity, unit_cost, row_record.cancelled_at
      FROM public.fiscal_inventory_movements
      WHERE company_id = row_record.company_id AND document_model = 65
        AND document_id = row_record.id AND source_event = 'authorized'
      ON CONFLICT (company_id, document_model, document_id, item_key, source_event) DO NOTHING;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_resolve_source_stock(
  p_source_type text,
  p_source_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.get_user_company_id((SELECT auth.uid()));
  v_stock uuid;
BEGIN
  IF v_company IS NULL OR p_source_id IS NULL THEN RETURN NULL; END IF;
  IF p_source_type = 'pdv_sale' THEN
    SELECT stock_id INTO v_stock FROM public.pdv_orders
    WHERE id = p_source_id AND company_id = v_company;
  ELSIF p_source_type IN ('pdv_purchase', 'inventory_purchase') THEN
    SELECT compra.stock_id INTO v_stock
    FROM public.compra_ordens ordem
    JOIN public.compras compra ON compra.id = ordem.compra_id AND compra.company_id = ordem.company_id
    WHERE ordem.id = p_source_id AND ordem.company_id = v_company;
  ELSE
    RAISE EXCEPTION 'Origem fiscal inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_stock IS NOT NULL AND public.can_access_stock((SELECT auth.uid()), v_stock) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não possui acesso ao local da operação.' USING ERRCODE = '42501';
  END IF;
  RETURN v_stock;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_resolve_source_stock(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_resolve_source_stock(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fiscal_inventory_add_opening_balance(
  p_stock_id uuid,
  p_inventory_id uuid,
  p_target_balance numeric,
  p_effective_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL
) RETURNS public.fiscal_inventory_opening_balances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_company uuid := public.get_user_company_id(v_uid);
  v_current numeric;
  v_delta numeric;
  v_row public.fiscal_inventory_opening_balances;
BEGIN
  IF v_company IS NULL OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão fiscal inválida.' USING ERRCODE = '42501';
  END IF;
  IF public.fiscal_user_can_emit_goods(v_uid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não possui permissão para ajustar o estoque fiscal.' USING ERRCODE = '42501';
  END IF;
  IF p_target_balance IS NULL OR p_effective_at IS NULL THEN
    RAISE EXCEPTION 'Material, local, saldo e data são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stocks
    WHERE id = p_stock_id AND company_id = v_company AND customer_id IS NULL
  )
     OR public.can_access_stock(v_uid, p_stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não possui acesso ao local informado.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE id = p_inventory_id AND company_id = v_company AND customer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'O material não pertence à empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_stock_id::text || ':' || p_inventory_id::text, 0));
  SELECT coalesce((SELECT sum(quantity) FROM public.fiscal_inventory_movements
                    WHERE company_id = v_company AND stock_id = p_stock_id
                      AND inventory_id = p_inventory_id AND occurred_at <= p_effective_at), 0)
       + coalesce((SELECT sum(quantity_delta) FROM public.fiscal_inventory_opening_balances
                    WHERE company_id = v_company AND stock_id = p_stock_id
                      AND inventory_id = p_inventory_id AND effective_at <= p_effective_at), 0)
    INTO v_current;
  v_delta := p_target_balance - v_current;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'O saldo fiscal já está no valor informado.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fiscal_inventory_opening_balances(
    company_id, stock_id, inventory_id, quantity_delta, target_balance,
    effective_at, notes, created_by
  ) VALUES (
    v_company, p_stock_id, p_inventory_id, v_delta, p_target_balance,
    p_effective_at, nullif(btrim(p_notes), ''), v_uid
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_inventory_add_opening_balance(uuid, uuid, numeric, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_inventory_add_opening_balance(uuid, uuid, numeric, timestamptz, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fiscal_inventory_report(
  p_at timestamptz DEFAULT now(),
  p_stock_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_models integer[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_only_divergent boolean DEFAULT false,
  p_include_zero boolean DEFAULT false,
  p_include_archived boolean DEFAULT false,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  stock_id uuid, stock_name text, inventory_id uuid, sku text, material_name text,
  unit text, group_id uuid, group_name text, group_color text,
  fiscal_balance numeric, operational_balance numeric, divergence numeric,
  cost_price numeric, fiscal_value numeric, operational_value numeric,
  total_count bigint, total_fiscal_value numeric, total_operational_value numeric,
  total_divergence_value numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_company uuid := public.get_user_company_id(v_uid);
BEGIN
  IF v_company IS NULL OR p_at IS NULL THEN RETURN; END IF;
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'O limite deve ficar entre 1 e 500.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH accessible_stocks AS (
    SELECT s.id, s.name FROM public.stocks s
    WHERE s.company_id = v_company AND s.customer_id IS NULL
      AND (p_stock_ids IS NULL OR s.id = ANY(p_stock_ids))
      AND public.can_access_stock(v_uid, s.id)
  ), pairs AS (
    SELECT l.stock_id, l.inventory_id FROM public.inventory_stock_levels l
    JOIN accessible_stocks s ON s.id = l.stock_id WHERE l.company_id = v_company
    UNION
    SELECT m.stock_id, m.inventory_id FROM public.inventory_movements m
    JOIN accessible_stocks s ON s.id = m.stock_id
    WHERE m.company_id = v_company AND m.customer_id IS NULL AND m.created_at <= p_at
    UNION
    SELECT m.stock_id, m.inventory_id FROM public.fiscal_inventory_movements m
    JOIN accessible_stocks s ON s.id = m.stock_id
    WHERE m.company_id = v_company AND m.occurred_at <= p_at
      AND (p_models IS NULL OR m.document_model::integer = ANY(p_models))
    UNION
    SELECT o.stock_id, o.inventory_id FROM public.fiscal_inventory_opening_balances o
    JOIN accessible_stocks s ON s.id = o.stock_id
    WHERE o.company_id = v_company AND o.effective_at <= p_at
  ), calculated AS (
    SELECT s.id AS stock_id, s.name AS stock_name, i.id AS inventory_id,
      i.sku, i.name AS material_name, i.unit, i.group_id,
      g.name AS group_name, g.color AS group_color,
      coalesce((SELECT sum(m.quantity) FROM public.fiscal_inventory_movements m
        WHERE m.company_id = v_company AND m.stock_id = s.id AND m.inventory_id = i.id
          AND m.occurred_at <= p_at AND (p_models IS NULL OR m.document_model::integer = ANY(p_models))), 0)
      + coalesce((SELECT sum(o.quantity_delta) FROM public.fiscal_inventory_opening_balances o
        WHERE o.company_id = v_company AND o.stock_id = s.id AND o.inventory_id = i.id
          AND o.effective_at <= p_at), 0) AS fiscal_balance,
      coalesce((SELECT sum(m.quantity) FROM public.inventory_movements m
        WHERE m.company_id = v_company AND m.stock_id = s.id AND m.inventory_id = i.id
          AND m.customer_id IS NULL AND m.created_at <= p_at), 0) AS operational_balance,
      coalesce(i.cost_price, 0) AS cost_price
    FROM pairs p
    JOIN accessible_stocks s ON s.id = p.stock_id
    JOIN public.inventory i ON i.id = p.inventory_id AND i.company_id = v_company
    LEFT JOIN public.material_groups g ON g.id = i.group_id AND g.company_id = i.company_id
    WHERE i.customer_id IS NULL
      AND (p_group_ids IS NULL OR i.group_id = ANY(p_group_ids))
      AND (p_include_archived OR i.archived_at IS NULL)
      AND (coalesce(btrim(p_query), '') = '' OR i.name ILIKE '%' || btrim(p_query) || '%'
        OR coalesce(i.sku, '') ILIKE '%' || btrim(p_query) || '%')
  ), filtered AS (
    SELECT *, fiscal_balance - operational_balance AS divergence
    FROM calculated
    WHERE (p_include_zero OR fiscal_balance <> 0 OR operational_balance <> 0)
      AND (NOT p_only_divergent OR fiscal_balance <> operational_balance)
  )
  SELECT f.stock_id, f.stock_name, f.inventory_id, f.sku, f.material_name,
    f.unit, f.group_id, f.group_name, f.group_color,
    f.fiscal_balance, f.operational_balance, f.divergence,
    f.cost_price, f.fiscal_balance * f.cost_price,
    f.operational_balance * f.cost_price,
    count(*) OVER (),
    sum(f.fiscal_balance * f.cost_price) OVER (),
    sum(f.operational_balance * f.cost_price) OVER (),
    sum(f.divergence * f.cost_price) OVER ()
  FROM filtered f
  ORDER BY abs(f.divergence) DESC, f.stock_name, f.material_name, f.inventory_id
  LIMIT p_limit OFFSET greatest(p_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_inventory_report(timestamptz, uuid[], uuid[], integer[], text, boolean, boolean, boolean, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_inventory_report(timestamptz, uuid[], uuid[], integer[], text, boolean, boolean, boolean, integer, integer)
  TO authenticated, service_role;

-- A função já pode existir em ambientes que receberam uma versão anterior do
-- relatório. O PostgreSQL não permite alterar RETURNS TABLE via OR REPLACE.
DROP FUNCTION IF EXISTS public.fiscal_inventory_movements_report(
  timestamptz, timestamptz, uuid[], uuid[], integer[], text[], text, integer, integer
);

CREATE OR REPLACE FUNCTION public.fiscal_inventory_movements_report(
  p_date_start timestamptz DEFAULT NULL,
  p_date_end timestamptz DEFAULT NULL,
  p_stock_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_models integer[] DEFAULT NULL,
  p_events text[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, occurred_at timestamptz, stock_id uuid, stock_name text,
  inventory_id uuid, sku text, material_name text, unit text,
  group_id uuid, group_name text, document_model smallint, document_id uuid,
  document_number bigint, access_key text, source_event text, direction text,
  quantity numeric, balance_before numeric, balance_after numeric,
  unit_cost numeric, total_cost numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_company uuid := public.get_user_company_id(v_uid);
BEGIN
  IF v_company IS NULL THEN RETURN; END IF;
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'O limite deve ficar entre 1 e 500.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH events AS (
    SELECT m.id, m.occurred_at, m.stock_id, m.inventory_id,
      m.document_model, m.document_id, m.document_number, m.access_key,
      m.source_event, m.direction, m.quantity, m.unit_cost
    FROM public.fiscal_inventory_movements m
    WHERE m.company_id = v_company
    UNION ALL
    SELECT o.id, o.effective_at, o.stock_id, o.inventory_id,
      0::smallint, o.id, NULL::bigint, NULL::text,
      'opening'::text,
      CASE WHEN o.quantity_delta >= 0 THEN 'entrada'::text ELSE 'saida'::text END,
      o.quantity_delta, greatest(coalesce(i.cost_price, 0), 0)
    FROM public.fiscal_inventory_opening_balances o
    JOIN public.inventory i ON i.id = o.inventory_id AND i.company_id = o.company_id
    WHERE o.company_id = v_company
  ), eligible AS (
    SELECT e.*, s.name AS stock_name, i.sku, i.name AS material_name, i.unit,
      i.group_id, g.name AS group_name
    FROM events e
    JOIN public.stocks s ON s.id = e.stock_id AND s.company_id = v_company
    JOIN public.inventory i ON i.id = e.inventory_id AND i.company_id = v_company
    LEFT JOIN public.material_groups g ON g.id = i.group_id AND g.company_id = i.company_id
    WHERE public.can_access_stock(v_uid, e.stock_id)
      AND (p_stock_ids IS NULL OR e.stock_id = ANY(p_stock_ids))
      AND (p_group_ids IS NULL OR i.group_id = ANY(p_group_ids))
  ), ledger AS (
    SELECT e.*,
      sum(e.quantity) OVER (
        PARTITION BY e.stock_id, e.inventory_id
        ORDER BY e.occurred_at, e.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS balance_after
    FROM eligible e
  ), filtered AS (
    SELECT * FROM ledger e
    WHERE (p_date_start IS NULL OR e.occurred_at >= p_date_start)
      AND (p_date_end IS NULL OR e.occurred_at <= p_date_end)
      AND (p_models IS NULL OR e.document_model = 0 OR e.document_model::integer = ANY(p_models))
      AND (p_events IS NULL OR e.source_event = ANY(p_events))
      AND (coalesce(btrim(p_query), '') = '' OR e.material_name ILIKE '%' || btrim(p_query) || '%'
        OR coalesce(e.sku, '') ILIKE '%' || btrim(p_query) || '%'
        OR coalesce(e.access_key, '') ILIKE '%' || btrim(p_query) || '%'
        OR coalesce(e.document_number::text, '') ILIKE '%' || btrim(p_query) || '%')
  )
  SELECT e.id, e.occurred_at, e.stock_id, e.stock_name,
    e.inventory_id, e.sku, e.material_name, e.unit,
    e.group_id, e.group_name, e.document_model, e.document_id, e.document_number,
    e.access_key, e.source_event, e.direction, e.quantity,
    e.balance_after - e.quantity, e.balance_after, e.unit_cost,
    e.quantity * e.unit_cost, count(*) OVER ()
  FROM filtered e
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT p_limit OFFSET greatest(p_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_inventory_movements_report(timestamptz, timestamptz, uuid[], uuid[], integer[], text[], text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_inventory_movements_report(timestamptz, timestamptz, uuid[], uuid[], integer[], text[], text, integer, integer)
  TO authenticated, service_role;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.fiscal_inventory_movements', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.fiscal_inventory_opening_balances', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'O estoque fiscal permite escrita direta indevida.';
  END IF;
END $$;
