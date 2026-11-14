BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_list_delivered_orders_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context
  FROM public.pdv_counter_context_v2('screen:pdv_dispatch',NULL,true);

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(history_row) ORDER BY history_row.delivered_at DESC,history_row.id DESC)
    FROM (
      SELECT order_row.id,
        order_row.number,
        customer.name AS recipient_name,
        order_row.stock_id,
        stock.name AS stock_name,
        order_row.status,
        order_row.updated_at AS released_at,
        order_row.updated_at AS delivered_at,
        0::bigint AS remaining_items
      FROM public.pdv_orders order_row
      LEFT JOIN public.customers customer
        ON customer.id=order_row.customer_id
       AND customer.company_id=order_row.company_id
      JOIN public.stocks stock
        ON stock.id=order_row.stock_id
       AND stock.company_id=order_row.company_id
      WHERE order_row.company_id=v_context.company_id
        AND order_row.contract_version=2
        AND order_row.operation_mode_snapshot='counter'
        AND order_row.status='entregue'
        AND public.can_access_stock(v_context.user_id,order_row.stock_id)
      ORDER BY order_row.updated_at DESC,order_row.id DESC
      LIMIT 200
    ) history_row
  ),'[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_list_delivered_orders_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_delivered_orders_v2() TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_list_delivered_orders_v2() IS
  'Lista pedidos de balcao entregues para consulta e pos-venda. Valida tenant, assinatura, modulo, tela e ACL do estoque no servidor.';

COMMIT;
