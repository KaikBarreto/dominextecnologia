-- Corrige referências ambíguas entre colunas da CTE e variáveis OUT da RPC.
-- Nenhum saldo ou movimento é alterado; somente o corpo da função é substituído.
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
    SELECT c.*, c.fiscal_balance - c.operational_balance AS divergence
    FROM calculated c
    WHERE (
      p_include_zero
      OR c.fiscal_balance <> 0
      OR c.operational_balance <> 0
    )
      AND (
        NOT p_only_divergent
        OR c.fiscal_balance <> c.operational_balance
      )
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

REVOKE ALL ON FUNCTION public.fiscal_inventory_report(
  timestamptz, uuid[], uuid[], integer[], text, boolean, boolean, boolean, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fiscal_inventory_report(
  timestamptz, uuid[], uuid[], integer[], text, boolean, boolean, boolean, integer, integer
) TO authenticated, service_role;
