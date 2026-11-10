BEGIN;

-- Fonte canônica da Curva ABC do estoque. Entrega as três bases de decisão
-- separadamente: saídas/consumo, vendas efetivas do PDV e capital no saldo
-- atual. A classificação A/B/C fica no cliente para permitir alternância sem
-- nova consulta, mas todos os valores e filtros de segurança nascem aqui.
CREATE OR REPLACE FUNCTION public.get_inventory_abc_report(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_stock_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  inventory_id uuid,
  sku text,
  material_name text,
  unit text,
  image_url text,
  group_id uuid,
  group_name text,
  group_color text,
  current_balance numeric,
  minimum_balance numeric,
  unit_cost numeric,
  sale_price numeric,
  stock_value numeric,
  usage_quantity numeric,
  usage_value numeric,
  pdv_quantity numeric,
  pdv_revenue numeric,
  pdv_cost numeric,
  pdv_margin numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $report$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'subscription_access_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_permission(v_user_id, 'screen:inventory') THEN
    RAISE EXCEPTION 'inventory_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;
  IF p_stock_ids IS NOT NULL AND EXISTS (
    SELECT 1
      FROM unnest(p_stock_ids) filter_id
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.stocks s
        WHERE s.id = filter_id
          AND s.company_id = v_company_id
          AND s.customer_id IS NULL
          AND public.can_access_stock(v_user_id, s.id)
     )
  ) THEN
    RAISE EXCEPTION 'invalid_stock_filter' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH accessible_stocks AS MATERIALIZED (
    SELECT s.id
      FROM public.stocks s
     WHERE s.company_id = v_company_id
       AND s.customer_id IS NULL
       AND public.can_access_stock(v_user_id, s.id)
       AND (p_stock_ids IS NULL OR s.id = ANY(p_stock_ids))
  ),
  stock_position AS (
    SELECT
      i.id AS inventory_id,
      COALESCE(sum(isl.quantity) FILTER (WHERE ast.id IS NOT NULL), 0)::numeric AS current_balance,
      COALESCE(
        max(isl.min_quantity) FILTER (WHERE ast.id IS NOT NULL),
        i.min_quantity,
        0
      )::numeric AS minimum_balance
    FROM public.inventory i
    LEFT JOIN public.inventory_stock_levels isl ON isl.inventory_id = i.id
    LEFT JOIN accessible_stocks ast ON ast.id = isl.stock_id
    WHERE i.company_id = v_company_id
      AND i.customer_id IS NULL
      AND i.archived_at IS NULL
    GROUP BY i.id, i.min_quantity
  ),
  usage_rollup AS (
    SELECT
      m.inventory_id,
      COALESCE(sum(abs(m.quantity)), 0)::numeric AS usage_quantity,
      COALESCE(sum(abs(m.quantity) * COALESCE(m.unit_cost, i.cost_price, 0)), 0)::numeric AS usage_value
    FROM public.inventory_movements m
    JOIN accessible_stocks ast ON ast.id = m.stock_id
    JOIN public.inventory i ON i.id = m.inventory_id AND i.company_id = v_company_id
    WHERE m.company_id = v_company_id
      AND m.customer_id IS NULL
      AND m.movement_type IN ('saida', 'consumo')
      -- Venda do PDV já possui visão própria abaixo. Sem excluir a baixa
      -- automática, a mesma venda pareceria simultaneamente consumo interno.
      AND NOT (
        m.movement_type = 'saida'
        AND m.service_order_id IS NULL
        AND COALESCE(m.notes, '') LIKE 'Venda no PDV, pedido nº %'
      )
      AND (p_start_date IS NULL OR m.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR m.created_at::date <= p_end_date)
    GROUP BY m.inventory_id
  ),
  pdv_rollup AS (
    SELECT
      oi.inventory_id,
      COALESCE(sum(oi.quantity), 0)::numeric AS pdv_quantity,
      -- Distribui o desconto global do pedido proporcionalmente pelas linhas.
      -- `oi.total` já desconta o item; `o.total/o.subtotal` aplica o desconto
      -- do pedido sem inflar faturamento e margem na Curva ABC.
      COALESCE(sum(
        oi.total * CASE WHEN o.subtotal > 0 THEN o.total / o.subtotal ELSE 0 END
      ), 0)::numeric AS pdv_revenue,
      COALESCE(sum(oi.quantity * oi.unit_cost), 0)::numeric AS pdv_cost
    FROM public.pdv_order_items oi
    JOIN public.pdv_orders o
      ON o.id = oi.order_id
     AND o.company_id = v_company_id
    JOIN accessible_stocks ast ON ast.id = o.stock_id
    WHERE oi.company_id = v_company_id
      AND oi.inventory_id IS NOT NULL
      AND o.status IN ('pago', 'entregue')
      -- `paid_at` preserva a competência escolhida numa venda retrodatada;
      -- cai em `created_at` para pedidos legados sem pagamento carimbado.
      AND (p_start_date IS NULL OR COALESCE(o.paid_at, o.created_at)::date >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(o.paid_at, o.created_at)::date <= p_end_date)
    GROUP BY oi.inventory_id
  )
  SELECT
    i.id,
    COALESCE(i.sku, '')::text,
    i.name::text,
    COALESCE(NULLIF(i.unit, ''), 'un')::text,
    i.image_url::text,
    i.group_id,
    g.name::text,
    g.color::text,
    COALESCE(sp.current_balance, 0)::numeric,
    COALESCE(sp.minimum_balance, 0)::numeric,
    COALESCE(i.cost_price, 0)::numeric,
    COALESCE(i.sale_price, 0)::numeric,
    (COALESCE(sp.current_balance, 0) * COALESCE(i.cost_price, 0))::numeric,
    COALESCE(ur.usage_quantity, 0)::numeric,
    COALESCE(ur.usage_value, 0)::numeric,
    COALESCE(pr.pdv_quantity, 0)::numeric,
    COALESCE(pr.pdv_revenue, 0)::numeric,
    COALESCE(pr.pdv_cost, 0)::numeric,
    (COALESCE(pr.pdv_revenue, 0) - COALESCE(pr.pdv_cost, 0))::numeric
  FROM public.inventory i
  LEFT JOIN public.material_groups g
    ON g.id = i.group_id
   AND g.company_id = v_company_id
  LEFT JOIN stock_position sp ON sp.inventory_id = i.id
  LEFT JOIN usage_rollup ur ON ur.inventory_id = i.id
  LEFT JOIN pdv_rollup pr ON pr.inventory_id = i.id
  WHERE i.company_id = v_company_id
    AND i.customer_id IS NULL
    AND i.archived_at IS NULL
    AND (
      p_stock_ids IS NULL
      OR EXISTS (
        SELECT 1
          FROM public.inventory_stock_levels scoped_level
          JOIN accessible_stocks scoped_stock ON scoped_stock.id = scoped_level.stock_id
         WHERE scoped_level.inventory_id = i.id
      )
      OR ur.inventory_id IS NOT NULL
      OR pr.inventory_id IS NOT NULL
    )
  ORDER BY i.name;
END;
$report$;

REVOKE ALL ON FUNCTION public.get_inventory_abc_report(date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_abc_report(date, date, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_inventory_abc_report(date, date, uuid[]) IS
  'Base segura da Curva ABC por material: saídas/consumo, vendas pagas do PDV e capital em estoque; respeita tenant, assinatura e ACL de locais.';

COMMIT;
