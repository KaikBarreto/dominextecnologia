-- Tela geral de pedidos do PDV. A projeção independe do caixa selecionado na
-- interface, mas conserva a custódia no servidor.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_orders_workspace_context_v3()
RETURNS TABLE(user_id uuid, company_id uuid, can_operate_other_cash boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_orders_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.user_id=v_user AND p.company_id=v_company AND COALESCE(p.is_active,true)
  ) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501',DETAIL='code=pdv_orders_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true
     OR public.user_has_permission(v_user,'screen:pdv_orders') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar os pedidos.'
      USING ERRCODE='42501',DETAIL='code=pdv_orders_screen_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company,public.pdv_can_operate_other_cash_v2(v_user);
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_orders_workspace_context_v3() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pdv_order_workspace_can_access_v3(
  p_order public.pdv_orders,
  p_user_id uuid,
  p_can_operate_other_cash boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT p_order.company_id=public.get_user_company_id(p_user_id) AND (
    p_can_operate_other_cash
    OR (
      p_order.status='rascunho'
      AND p_order.cash_session_id IS NULL
      AND p_order.target_terminal_id IS NULL
      AND p_order.salesperson_id=p_user_id
    )
    OR EXISTS(
      SELECT 1 FROM public.pdv_cash_sessions s
       WHERE s.id=p_order.cash_session_id AND s.company_id=p_order.company_id
         AND s.opened_by=p_user_id
    )
    OR (
      p_order.cash_session_id IS NULL
      AND p_order.target_terminal_id IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM public.pdv_cash_sessions s
         WHERE s.company_id=p_order.company_id
           AND s.terminal_id=p_order.target_terminal_id
           AND s.opened_by=p_user_id AND s.status='aberta' AND s.contract_version=2
      )
    )
    OR (
      p_order.status='rascunho'
      AND p_order.cash_session_id IS NULL
      AND p_order.target_terminal_id IS NULL
      AND EXISTS(
      SELECT 1 FROM public.pdv_preorders pre
       WHERE pre.id=p_order.source_preorder_id AND pre.company_id=p_order.company_id
         AND (pre.created_by=p_user_id OR pre.assigned_to=p_user_id)
      )
    )
  );
$fn$;

REVOKE ALL ON FUNCTION public.pdv_order_workspace_can_access_v3(public.pdv_orders,uuid,boolean)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pdv_list_orders_workspace_v3(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_pickup_status text DEFAULT NULL,
  p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_query text; v_page integer; v_size integer; v_total bigint;
  v_rows jsonb; v_cash_options jsonb:='[]'::jsonb; v_operator_options jsonb:='[]'::jsonb;
  v_can_filter_cash boolean; v_timezone text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_orders_workspace_context_v3();
  v_query:=NULLIF(lower(btrim(COALESCE(p_query,''))),'');
  v_page:=GREATEST(COALESCE(p_page,0),0);
  v_size:=LEAST(GREATEST(COALESCE(p_page_size,25),1),100);
  v_can_filter_cash:=v_context.can_operate_other_cash;
  SELECT COALESCE(settings.timezone,'America/Sao_Paulo') INTO v_timezone
    FROM public.company_settings settings WHERE settings.company_id=v_context.company_id;
  v_timezone:=COALESCE(v_timezone,'America/Sao_Paulo');
  IF (p_terminal_id IS NOT NULL OR p_operator_id IS NOT NULL) AND NOT v_can_filter_cash THEN
    RAISE EXCEPTION 'Seu perfil não permite filtrar outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_orders_cash_filter_denied';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN
    RAISE EXCEPTION 'Revise o período informado.'
      USING ERRCODE='22023',DETAIL='code=pdv_orders_period_invalid';
  END IF;

  WITH projected AS (
    SELECT o.id,o.number,o.customer_id,c.name customer_name,o.created_at,o.updated_at,
      o.status commercial_status,
      o.total,o.terminal_id,o.target_terminal_id,o.cash_session_id,
      COALESCE(s.opened_by,o.salesperson_id) operator_id,
      COALESCE(pr.full_name,'Operador') operator_name,
      COALESCE(t.name,target.name) cash_name,
      COALESCE(pay.covered,0) covered,
      COALESCE(pay.fiado,0) fiado,
      COALESCE(refunds.refunded,0) refunded,
      COALESCE(items.ordered,0) ordered,
      COALESCE(items.delivered,0) delivered,
      COALESCE(items.item_count,0) item_count,
      CASE
        WHEN COALESCE(refunds.refunded,0)>=o.total AND o.total>0 THEN 'reembolsado'
        WHEN COALESCE(refunds.refunded,0)>0 THEN 'reembolso_parcial'
        WHEN o.status IN('cancelado','cancelado_parcial') THEN 'cancelado'
        WHEN COALESCE(pay.covered,0)<=0 THEN 'aguardando'
        WHEN COALESCE(pay.covered,0)<o.total THEN 'parcial'
        WHEN COALESCE(pay.fiado,0)>0 THEN 'fiado_aprovado'
        ELSE 'pago'
      END payment_status,
      CASE
        WHEN o.status IN('cancelado','cancelado_parcial') THEN 'cancelada'
        WHEN COALESCE(items.delivered,0)>=COALESCE(items.ordered,0) AND COALESCE(items.ordered,0)>0 THEN 'entregue'
        WHEN COALESCE(items.delivered,0)>0 THEN 'parcial'
        WHEN o.status IN('liberado_retirada','retirada_parcial','entregue') THEN 'liberado'
        ELSE 'aguardando_liberacao'
      END pickup_status
    FROM public.pdv_orders o
    LEFT JOIN public.customers c ON c.id=o.customer_id AND c.company_id=o.company_id
    LEFT JOIN public.pdv_cash_sessions s ON s.id=o.cash_session_id AND s.company_id=o.company_id
    LEFT JOIN public.profiles pr ON pr.user_id=COALESCE(s.opened_by,o.salesperson_id) AND pr.company_id=o.company_id
    LEFT JOIN public.pdv_terminals t ON t.id=o.terminal_id AND t.company_id=o.company_id
    LEFT JOIN public.pdv_terminals target ON target.id=o.target_terminal_id AND target.company_id=o.company_id
    LEFT JOIN LATERAL(
      SELECT COALESCE(sum(p.amount),0) covered,
             COALESCE(sum(p.amount) FILTER(WHERE p.method='fiado'),0) fiado
        FROM public.pdv_order_payments p
       WHERE p.order_id=o.id AND p.company_id=o.company_id
         AND (p.contract_version IS DISTINCT FROM 2 OR p.coverage_status='authorized')
    ) pay ON true
    LEFT JOIN LATERAL(
      SELECT COALESCE(sum(r.amount),0) refunded
        FROM public.pdv_refunds r
        JOIN public.pdv_commercial_returns cr ON cr.id=r.commercial_return_id
          AND cr.company_id=r.company_id AND cr.order_id=o.id
       WHERE r.company_id=o.company_id
         AND EXISTS(SELECT 1 FROM public.pdv_refund_events settled
           WHERE settled.refund_id=r.id AND settled.company_id=r.company_id
             AND settled.event_kind='settled'
             AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events reversed
               WHERE reversed.reversal_of_id=settled.id AND reversed.company_id=settled.company_id
                 AND reversed.event_kind='reversed'))
    ) refunds ON true
    LEFT JOIN LATERAL(
      SELECT COALESCE(sum(i.quantity) FILTER(WHERE COALESCE(i.item_type,
               CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0) ordered,
             COALESCE(sum(d.delivered) FILTER(WHERE COALESCE(i.item_type,
               CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0) delivered,
             count(*) item_count,
             string_agg(i.description,' ') descriptions
        FROM public.pdv_order_items i
        LEFT JOIN LATERAL(
          SELECT COALESCE(sum(di.quantity),0) delivered
            FROM public.pdv_delivery_items di
           WHERE di.order_item_id=i.id AND di.company_id=i.company_id
        ) d ON true
       WHERE i.order_id=o.id AND i.company_id=o.company_id
    ) items ON true
    WHERE o.company_id=v_context.company_id
      AND public.pdv_order_workspace_can_access_v3(o,v_context.user_id,v_context.can_operate_other_cash)
      AND (p_terminal_id IS NULL OR COALESCE(o.terminal_id,o.target_terminal_id)=p_terminal_id)
      AND (p_operator_id IS NULL OR COALESCE(s.opened_by,o.salesperson_id)=p_operator_id)
      AND (p_from IS NULL OR (o.created_at AT TIME ZONE v_timezone)::date>=p_from)
      AND (p_to IS NULL OR (o.created_at AT TIME ZONE v_timezone)::date<=p_to)
      AND (v_query IS NULL OR o.number::text ILIKE '%'||v_query||'%' OR c.name ILIKE '%'||v_query||'%'
        OR COALESCE(o.client_request_id,'') ILIKE '%'||v_query||'%' OR COALESCE(items.descriptions,'') ILIKE '%'||v_query||'%')
  ), filtered AS (
    SELECT * FROM projected
     WHERE (p_status IS NULL OR commercial_status=p_status)
       AND (p_payment_status IS NULL OR payment_status=p_payment_status)
       AND (p_pickup_status IS NULL OR pickup_status=p_pickup_status)
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH projected AS (
    SELECT o.id,o.number,c.name customer_name,o.created_at,o.updated_at,
      o.status commercial_status,o.total,
      COALESCE(pr.full_name,'Operador') operator_name,COALESCE(t.name,target.name) cash_name,
      COALESCE(items.item_count,0) item_count,
      CASE WHEN COALESCE(refunds.refunded,0)>=o.total AND o.total>0 THEN 'reembolsado' WHEN COALESCE(refunds.refunded,0)>0 THEN 'reembolso_parcial' WHEN o.status IN('cancelado','cancelado_parcial') THEN 'cancelado' WHEN COALESCE(pay.covered,0)<=0 THEN 'aguardando' WHEN COALESCE(pay.covered,0)<o.total THEN 'parcial' WHEN COALESCE(pay.fiado,0)>0 THEN 'fiado_aprovado' ELSE 'pago' END payment_status,
      CASE WHEN o.status IN('cancelado','cancelado_parcial') THEN 'cancelada' WHEN COALESCE(items.delivered,0)>=COALESCE(items.ordered,0) AND COALESCE(items.ordered,0)>0 THEN 'entregue' WHEN COALESCE(items.delivered,0)>0 THEN 'parcial' WHEN o.status IN('liberado_retirada','retirada_parcial','entregue') THEN 'liberado' ELSE 'aguardando_liberacao' END pickup_status,
      items.descriptions,
      (o.status NOT IN('rascunho','cancelado','cancelado_parcial') AND EXISTS(
        SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
         WHERE snapshot.company_id=o.company_id AND snapshot.order_id=o.id
      )) can_generate_receipt
    FROM public.pdv_orders o
    LEFT JOIN public.customers c ON c.id=o.customer_id AND c.company_id=o.company_id
    LEFT JOIN public.pdv_cash_sessions s ON s.id=o.cash_session_id AND s.company_id=o.company_id
    LEFT JOIN public.profiles pr ON pr.user_id=COALESCE(s.opened_by,o.salesperson_id) AND pr.company_id=o.company_id
    LEFT JOIN public.pdv_terminals t ON t.id=o.terminal_id AND t.company_id=o.company_id
    LEFT JOIN public.pdv_terminals target ON target.id=o.target_terminal_id AND target.company_id=o.company_id
    LEFT JOIN LATERAL(SELECT COALESCE(sum(p.amount),0) covered,COALESCE(sum(p.amount) FILTER(WHERE p.method='fiado'),0) fiado FROM public.pdv_order_payments p WHERE p.order_id=o.id AND p.company_id=o.company_id AND (p.contract_version IS DISTINCT FROM 2 OR p.coverage_status='authorized')) pay ON true
    LEFT JOIN LATERAL(SELECT COALESCE(sum(r.amount),0) refunded FROM public.pdv_refunds r JOIN public.pdv_commercial_returns cr ON cr.id=r.commercial_return_id AND cr.company_id=r.company_id AND cr.order_id=o.id WHERE r.company_id=o.company_id AND EXISTS(SELECT 1 FROM public.pdv_refund_events settled WHERE settled.refund_id=r.id AND settled.company_id=r.company_id AND settled.event_kind='settled' AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events reversed WHERE reversed.reversal_of_id=settled.id AND reversed.company_id=settled.company_id AND reversed.event_kind='reversed'))) refunds ON true
    LEFT JOIN LATERAL(SELECT COALESCE(sum(i.quantity) FILTER(WHERE COALESCE(i.item_type,CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0) ordered,COALESCE(sum(d.delivered) FILTER(WHERE COALESCE(i.item_type,CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0) delivered,count(*) item_count,string_agg(i.description,' ') descriptions FROM public.pdv_order_items i LEFT JOIN LATERAL(SELECT COALESCE(sum(di.quantity),0) delivered FROM public.pdv_delivery_items di WHERE di.order_item_id=i.id AND di.company_id=i.company_id) d ON true WHERE i.order_id=o.id AND i.company_id=o.company_id) items ON true
    WHERE o.company_id=v_context.company_id
      AND public.pdv_order_workspace_can_access_v3(o,v_context.user_id,v_context.can_operate_other_cash)
      AND (p_terminal_id IS NULL OR COALESCE(o.terminal_id,o.target_terminal_id)=p_terminal_id)
      AND (p_operator_id IS NULL OR COALESCE(s.opened_by,o.salesperson_id)=p_operator_id)
      AND (p_from IS NULL OR (o.created_at AT TIME ZONE v_timezone)::date>=p_from) AND (p_to IS NULL OR (o.created_at AT TIME ZONE v_timezone)::date<=p_to)
      AND (v_query IS NULL OR o.number::text ILIKE '%'||v_query||'%' OR c.name ILIKE '%'||v_query||'%' OR COALESCE(o.client_request_id,'') ILIKE '%'||v_query||'%' OR COALESCE(items.descriptions,'') ILIKE '%'||v_query||'%')
  ), filtered AS (SELECT * FROM projected WHERE (p_status IS NULL OR commercial_status=p_status) AND (p_payment_status IS NULL OR payment_status=p_payment_status) AND (p_pickup_status IS NULL OR pickup_status=p_pickup_status))
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'number',x.number,'customer_name',x.customer_name,'created_at',x.created_at,'updated_at',x.updated_at,'commercial_status',x.commercial_status,'payment_status',x.payment_status,'pickup_status',x.pickup_status,'total',x.total,'item_count',x.item_count,'cash_name',x.cash_name,'operator_name',x.operator_name,'can_generate_receipt',x.can_generate_receipt) ORDER BY CASE WHEN p_sort='oldest' THEN x.created_at END ASC,CASE WHEN p_sort<>'oldest' THEN x.created_at END DESC,x.id),'[]'::jsonb)
    INTO v_rows FROM (SELECT * FROM filtered ORDER BY CASE WHEN p_sort='oldest' THEN created_at END ASC,CASE WHEN p_sort<>'oldest' THEN created_at END DESC,id LIMIT v_size OFFSET v_page*v_size) x;

  IF v_can_filter_cash THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',terminal.id,'name',terminal.name)
      ORDER BY terminal.sort_order,terminal.name,terminal.id),'[]'::jsonb)
      INTO v_cash_options FROM public.pdv_terminals terminal
     WHERE terminal.company_id=v_context.company_id AND terminal.is_active IS TRUE;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',actor.user_id,'name',actor.full_name)
      ORDER BY actor.full_name,actor.user_id),'[]'::jsonb)
      INTO v_operator_options FROM (
        SELECT DISTINCT profile.user_id,profile.full_name
          FROM public.pdv_cash_sessions session
          JOIN public.profiles profile ON profile.user_id=session.opened_by
            AND profile.company_id=session.company_id
         WHERE session.company_id=v_context.company_id AND COALESCE(profile.is_active,true)
      ) actor;
  END IF;

  RETURN jsonb_build_object('rows',v_rows,'total',v_total,'page',v_page,'page_size',v_size,
    'can_filter_cash',v_can_filter_cash,'cash_options',v_cash_options,'operator_options',v_operator_options);
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_list_orders_workspace_v3(text,text,text,text,uuid,uuid,date,date,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_orders_workspace_v3(text,text,text,text,uuid,uuid,date,date,text,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_order_workspace_v3(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE; v_customer text; v_items jsonb; v_events jsonb;
  v_covered numeric; v_fiado numeric; v_refunded numeric; v_ordered numeric; v_delivered numeric;
  v_payment_at timestamptz; v_can_generate_receipt boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_orders_workspace_context_v3();
  SELECT * INTO v_order FROM public.pdv_orders o WHERE o.id=p_order_id AND o.company_id=v_context.company_id;
  IF NOT FOUND OR public.pdv_order_workspace_can_access_v3(v_order,v_context.user_id,v_context.can_operate_other_cash) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pedido não encontrado ou fora do seu caixa.' USING ERRCODE='42501',DETAIL='code=pdv_orders_order_denied';
  END IF;
  SELECT c.name INTO v_customer FROM public.customers c WHERE c.id=v_order.customer_id AND c.company_id=v_order.company_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'quantity',i.quantity,
      'unit_price',i.unit_price,'total',i.total,'delivered_quantity',CASE WHEN COALESCE(i.item_type,
        CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'
        THEN COALESCE(d.delivered,0) ELSE 0 END) ORDER BY i.sort_order,i.id),'[]'::jsonb),
      COALESCE(sum(i.quantity) FILTER(WHERE COALESCE(i.item_type,
        CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0),
      COALESCE(sum(d.delivered) FILTER(WHERE COALESCE(i.item_type,
        CASE WHEN i.inventory_id IS NOT NULL THEN 'material' ELSE 'service' END)='material'),0)
    INTO v_items,v_ordered,v_delivered
    FROM public.pdv_order_items i
    LEFT JOIN LATERAL(SELECT COALESCE(sum(di.quantity),0) delivered
      FROM public.pdv_delivery_items di WHERE di.order_item_id=i.id AND di.company_id=i.company_id) d ON true
   WHERE i.order_id=v_order.id AND i.company_id=v_order.company_id;
  SELECT COALESCE(sum(p.amount),0),COALESCE(sum(p.amount) FILTER(WHERE p.method='fiado'),0),
         min(COALESCE(p.authorized_at,p.received_at))
    INTO v_covered,v_fiado,v_payment_at
    FROM public.pdv_order_payments p
   WHERE p.order_id=v_order.id AND p.company_id=v_order.company_id
     AND (p.contract_version IS DISTINCT FROM 2 OR p.coverage_status='authorized');
  SELECT COALESCE(sum(r.amount),0) INTO v_refunded
    FROM public.pdv_refunds r
    JOIN public.pdv_commercial_returns cr ON cr.id=r.commercial_return_id
      AND cr.company_id=r.company_id AND cr.order_id=v_order.id
   WHERE r.company_id=v_order.company_id
     AND EXISTS(SELECT 1 FROM public.pdv_refund_events settled
       WHERE settled.refund_id=r.id AND settled.company_id=r.company_id
         AND settled.event_kind='settled'
         AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events reversed
           WHERE reversed.reversal_of_id=settled.id AND reversed.company_id=settled.company_id
             AND reversed.event_kind='reversed'));
  v_can_generate_receipt:=v_order.status NOT IN('rascunho','cancelado','cancelado_parcial')
    AND EXISTS(SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
      WHERE snapshot.company_id=v_order.company_id AND snapshot.order_id=v_order.id);
  SELECT COALESCE(jsonb_agg(event ORDER BY event->>'at'),'[]'::jsonb) INTO v_events FROM (
    SELECT jsonb_build_object('kind','pedido','label','Pedido criado','at',v_order.created_at) event
    UNION ALL SELECT jsonb_build_object('kind','pagamento','label',
      CASE WHEN v_fiado>0 THEN 'Fiado aprovado' ELSE 'Pagamento registrado' END,'at',v_payment_at)
      WHERE v_covered>0 AND v_payment_at IS NOT NULL
    UNION ALL SELECT jsonb_build_object('kind','retirada','label','Retirada registrada','at',d.created_at)
      FROM public.pdv_deliveries d WHERE d.order_id=v_order.id AND d.company_id=v_order.company_id
    UNION ALL SELECT jsonb_build_object('kind','cancelamento','label','Pedido cancelado','at',v_order.cancelled_at)
      WHERE v_order.cancelled_at IS NOT NULL
    UNION ALL SELECT jsonb_build_object('kind',CASE WHEN cr.event_kind='reversal' THEN 'reversao_devolucao' ELSE 'devolucao' END,
      'label',CASE WHEN cr.event_kind='reversal' THEN 'Devolução desfeita' ELSE 'Devolução registrada' END,'at',cr.created_at)
      FROM public.pdv_commercial_returns cr WHERE cr.order_id=v_order.id AND cr.company_id=v_order.company_id
    UNION ALL SELECT jsonb_build_object('kind',CASE WHEN event.event_kind='reversed' THEN 'reversao_reembolso' ELSE 'reembolso' END,
      'label',CASE WHEN event.event_kind='reversed' THEN 'Reembolso desfeito' ELSE 'Reembolso realizado' END,'at',event.created_at)
      FROM public.pdv_refund_events event
      JOIN public.pdv_refunds refund ON refund.id=event.refund_id AND refund.company_id=event.company_id
      JOIN public.pdv_commercial_returns cr ON cr.id=refund.commercial_return_id
        AND cr.company_id=refund.company_id AND cr.order_id=v_order.id
     WHERE event.company_id=v_order.company_id AND event.event_kind IN('settled','reversed')
  ) timeline;
  RETURN jsonb_build_object('order',jsonb_build_object('id',v_order.id,'number',v_order.number,
    'customer_name',v_customer,'created_at',v_order.created_at,
    'commercial_status',v_order.status,
    'total',v_order.total,'notes',v_order.notes,'can_generate_receipt',v_can_generate_receipt,
    'payment_status',CASE WHEN v_refunded>=v_order.total AND v_order.total>0 THEN 'reembolsado'
      WHEN v_refunded>0 THEN 'reembolso_parcial' WHEN v_order.status IN('cancelado','cancelado_parcial') THEN 'cancelado'
      WHEN v_covered<=0 THEN 'aguardando' WHEN v_covered<v_order.total THEN 'parcial'
      WHEN v_fiado>0 THEN 'fiado_aprovado' ELSE 'pago' END,
    'pickup_status',CASE WHEN v_order.status IN('cancelado','cancelado_parcial') THEN 'cancelada'
      WHEN v_delivered>=v_ordered AND v_ordered>0 THEN 'entregue' WHEN v_delivered>0 THEN 'parcial'
      WHEN v_order.status IN('liberado_retirada','retirada_parcial','entregue') THEN 'liberado'
      ELSE 'aguardando_liberacao' END),'items',v_items,'timeline',v_events);
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_get_order_workspace_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_order_workspace_v3(uuid) TO authenticated,service_role;

COMMIT;
