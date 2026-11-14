-- W6-01: fatos comerciais canonicos e consultas seguras de relatorios PDV v2.
-- Esta migration nao compoe o PDV parcial com o DRE/DFC global.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Identidade explicita da sessao nos fatos financeiros de caixa.
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS pdv_cash_session_id uuid
    REFERENCES public.pdv_cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_pdv_cash_session
  ON public.financial_transactions(company_id,pdv_cash_session_id,transaction_date,id)
  WHERE pdv_cash_session_id IS NOT NULL;

COMMENT ON COLUMN public.financial_transactions.pdv_cash_session_id IS
  'Sessao PDV informada pelo writer de custodia. NULL significa Caixa não identificado; nunca e inferido por horario.';

CREATE OR REPLACE FUNCTION public.pdv_guard_financial_cash_session_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NEW.pdv_cash_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.id=NEW.pdv_cash_session_id
       AND session.company_id=NEW.company_id
       AND session.contract_version=2
  ) THEN
    RAISE EXCEPTION 'A sessao de caixa nao pertence a esta empresa.'
      USING ERRCODE='23514',DETAIL='code=pdv_financial_cash_session_tenant_mismatch';
  END IF;
  IF TG_OP='UPDATE'
     AND OLD.pdv_cash_session_id IS NOT NULL
     AND NEW.pdv_cash_session_id IS DISTINCT FROM OLD.pdv_cash_session_id
     AND COALESCE(current_setting('app.pdv_purge_company',true),'')<>OLD.company_id::text
  THEN
    RAISE EXCEPTION 'A sessao de um lancamento de caixa e imutavel.'
      USING ERRCODE='55000',DETAIL='code=pdv_financial_cash_session_immutable';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tg_pdv_financial_cash_session_v2
  ON public.financial_transactions;
CREATE TRIGGER tg_pdv_financial_cash_session_v2
  BEFORE INSERT OR UPDATE OF company_id,pdv_cash_session_id
  ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_financial_cash_session_v2();

-- Todos os writers atuais de dinheiro terminam no ledger de custodia com a
-- sessao explicita. O BEFORE associa o fato financeiro antes que a linha de
-- custodia fique visivel aos guards de imutabilidade. Legado nao e retroativo.
CREATE OR REPLACE FUNCTION public.pdv_attach_cash_session_to_financial_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NEW.financial_transaction_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.id=NEW.financial_transaction_id
       AND transaction.company_id=NEW.company_id
       AND transaction.pdv_cash_session_id=NEW.session_id
  ) THEN RETURN NEW; END IF;
  UPDATE public.financial_transactions transaction
     SET pdv_cash_session_id=NEW.session_id
   WHERE transaction.id=NEW.financial_transaction_id
     AND transaction.company_id=NEW.company_id
     AND transaction.pdv_cash_session_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O lancamento financeiro nao pertence a esta sessao.'
      USING ERRCODE='23514',DETAIL='code=pdv_cash_financial_session_mismatch';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tg_pdv_attach_cash_session_to_financial_v2
  ON public.pdv_cash_custody_entries;
CREATE TRIGGER tg_pdv_attach_cash_session_to_financial_v2
  BEFORE INSERT ON public.pdv_cash_custody_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_attach_cash_session_to_financial_v2();

-- Pix/transferencia nao movimentam custodia, mas pertencem ao caixa que
-- cobriu o pedido. O vinculo vem exclusivamente das FKs pedido/pagamento.
CREATE OR REPLACE FUNCTION public.pdv_attach_order_session_to_financial_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_order public.pdv_orders%ROWTYPE; v_session_id uuid; v_company_id uuid;
  v_transaction_id uuid;
BEGIN
  IF TG_TABLE_NAME='pdv_order_payments' THEN
    IF NEW.contract_version IS DISTINCT FROM 2 OR NEW.settlement_transaction_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT orders.* INTO v_order FROM public.pdv_orders orders
     WHERE orders.id=NEW.order_id AND orders.company_id=NEW.company_id;
    IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'O pedido da liquidacao nao pertence a esta empresa.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_settlement_order_invalid';
    END IF;
    v_session_id:=v_order.cash_session_id;
    v_company_id:=NEW.company_id;
    v_transaction_id:=NEW.settlement_transaction_id;
    IF v_session_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
      WHERE transaction.id=v_transaction_id AND transaction.company_id=v_company_id
        AND transaction.origin='pdv'
        AND transaction.pdv_financial_role='pdv_receivable_settlement') THEN
      RAISE EXCEPTION 'A liquidacao nao pertence ao pedido PDV.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_settlement_invalid';
    END IF;
    UPDATE public.financial_transactions transaction
       SET pdv_cash_session_id=v_session_id
     WHERE transaction.id=v_transaction_id AND transaction.company_id=v_company_id
       AND transaction.pdv_cash_session_id IS NULL;
    IF NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
      WHERE transaction.id=v_transaction_id AND transaction.company_id=v_company_id
        AND transaction.pdv_cash_session_id=v_session_id) THEN
      RAISE EXCEPTION 'A liquidacao ja pertence a outro caixa.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_settlement_session_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cash_session_id IS NULL OR NEW.cash_session_id IS NOT DISTINCT FROM OLD.cash_session_id THEN
    RETURN NEW;
  END IF;
  FOR v_transaction_id IN
    SELECT payment.settlement_transaction_id
      FROM public.pdv_order_payments payment
     WHERE payment.company_id=NEW.company_id AND payment.order_id=NEW.id
       AND payment.contract_version=2 AND payment.settlement_transaction_id IS NOT NULL
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
      WHERE transaction.id=v_transaction_id AND transaction.company_id=NEW.company_id
        AND transaction.origin='pdv'
        AND transaction.pdv_financial_role='pdv_receivable_settlement') THEN
      RAISE EXCEPTION 'Uma liquidacao nao pertence ao pedido PDV.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_settlement_invalid';
    END IF;
    UPDATE public.financial_transactions transaction
       SET pdv_cash_session_id=NEW.cash_session_id
     WHERE transaction.id=v_transaction_id AND transaction.company_id=NEW.company_id
       AND transaction.pdv_cash_session_id IS NULL;
    IF NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
      WHERE transaction.id=v_transaction_id AND transaction.company_id=NEW.company_id
        AND transaction.pdv_cash_session_id=NEW.cash_session_id) THEN
      RAISE EXCEPTION 'Uma liquidacao ja pertence a outro caixa.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_settlement_session_mismatch';
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tg_pdv_payment_attach_session_v2 ON public.pdv_order_payments;
CREATE TRIGGER tg_pdv_payment_attach_session_v2
  BEFORE INSERT ON public.pdv_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.pdv_attach_order_session_to_financial_v2();
DROP TRIGGER IF EXISTS tg_pdv_order_attach_session_v2 ON public.pdv_orders;
CREATE TRIGGER tg_pdv_order_attach_session_v2
  AFTER UPDATE OF cash_session_id ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_attach_order_session_to_financial_v2();

-- ---------------------------------------------------------------------------
-- 2. Livro canonico unico: entrega e compensacoes por fatia entregue.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_commercial_facts_v2(p_company_id uuid)
RETURNS TABLE(
  event_id uuid,event_kind text,event_date date,delivery_item_id uuid,
  order_id uuid,inventory_id uuid,stock_id uuid,customer_id uuid,
  delivered_quantity numeric,returned_quantity numeric,net_quantity numeric,
  delivered_revenue numeric,returned_revenue numeric,net_revenue numeric,
  net_cmv numeric,cost_known boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT item.id,'delivery'::text,item.recognition_date,item.id,
         delivery.order_id,order_item.inventory_id,
         COALESCE(reservation.stock_id,orders.stock_id),orders.customer_id,
         item.quantity,0::numeric,item.quantity,
         item.commercial_amount_snapshot,0::numeric,
         item.commercial_amount_snapshot,item.cmv_amount_snapshot,
         item.cmv_amount_snapshot IS NOT NULL
    FROM public.pdv_delivery_items item
    JOIN public.pdv_deliveries delivery
      ON delivery.id=item.delivery_id AND delivery.company_id=item.company_id
    JOIN public.pdv_order_items order_item
      ON order_item.id=item.order_item_id AND order_item.company_id=item.company_id
    JOIN public.pdv_orders orders
      ON orders.id=delivery.order_id AND orders.company_id=item.company_id
    LEFT JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=item.reservation_id AND reservation.company_id=item.company_id
   WHERE item.company_id=p_company_id
     AND item.recognition_contract_version=2

  UNION ALL

  SELECT return_item.id,header.event_kind,header.occurred_on,delivery_item.id,
         delivery.order_id,order_item.inventory_id,
         COALESCE(reservation.stock_id,orders.stock_id),orders.customer_id,
         0::numeric,
         CASE header.event_kind WHEN 'return' THEN return_item.quantity
                                ELSE -return_item.quantity END,
         CASE header.event_kind WHEN 'return' THEN -return_item.quantity
                                ELSE return_item.quantity END,
         0::numeric,
         CASE header.event_kind WHEN 'return' THEN -return_item.commercial_amount
                                ELSE -return_item.commercial_amount END,
         return_item.commercial_amount,return_item.cmv_amount,
         return_item.cmv_amount IS NOT NULL
    FROM public.pdv_commercial_return_items return_item
    JOIN public.pdv_commercial_returns header
      ON header.id=return_item.commercial_return_id
     AND header.company_id=return_item.company_id
    JOIN public.pdv_delivery_items delivery_item
      ON delivery_item.id=return_item.delivery_item_id
     AND delivery_item.company_id=return_item.company_id
    JOIN public.pdv_deliveries delivery
      ON delivery.id=delivery_item.delivery_id
     AND delivery.company_id=return_item.company_id
    JOIN public.pdv_order_items order_item
      ON order_item.id=delivery_item.order_item_id
     AND order_item.company_id=return_item.company_id
    JOIN public.pdv_orders orders
      ON orders.id=delivery.order_id AND orders.company_id=return_item.company_id
    LEFT JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=delivery_item.reservation_id
     AND reservation.company_id=return_item.company_id
   WHERE return_item.company_id=p_company_id;
$fn$;

COMMENT ON FUNCTION public.pdv_commercial_facts_v2(uuid) IS
  'Fonte interna unica por evento/fatia entregue. Nao consulta status do pedido; devolucao e compensacao usam seus valores assinados.';

-- ---------------------------------------------------------------------------
-- 3. Contexto fail-closed e relatorio de materiais v2.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_reports_context_v2(
  p_permission text,p_require_pdv boolean DEFAULT true
)
RETURNS TABLE(user_id uuid,company_id uuid,pdv_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid; v_pdv boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessao expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_report_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id=v_user AND profile.company_id=v_company
       AND COALESCE(profile.is_active,true)
  ) OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso desta empresa esta indisponivel.'
      USING ERRCODE='42501',DETAIL='code=pdv_report_company_denied';
  END IF;
  IF p_permission IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.user_has_permission(v_user,p_permission) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao tem permissao para consultar este relatorio.'
      USING ERRCODE='42501',DETAIL='code=pdv_report_permission_denied';
  END IF;
  v_pdv:=public.company_has_module(v_company,'pdv') IS TRUE;
  IF p_require_pdv AND NOT v_pdv THEN
    RAISE EXCEPTION 'O modulo PDV e Loja nao esta ativo nesta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_report_module_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company,v_pdv;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_material_purchase_rows_v2(
  p_company_id uuid,p_user_id uuid,p_start_date date,p_end_date date,
  p_stock_ids uuid[],p_supplier_ids uuid[],p_group_ids uuid[],p_created_by_ids uuid[]
)
RETURNS TABLE(
  inventory_id uuid,sku text,material_name text,unit text,group_id uuid,
  group_name text,group_color text,current_balance numeric,registered_sale_price numeric,
  purchased_quantity numeric,priced_quantity numeric,unpriced_quantity numeric,
  purchased_total numeric,average_paid numeric,purchase_count bigint,last_purchase_date date,history jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
  WITH base AS MATERIALIZED(
    -- O helper legado continua responsavel por cadastro, ACL e filtros. Datas
    -- ficam nulas aqui porque o rollup abaixo aplica o dia civil corretamente.
    SELECT * FROM public.get_material_purchase_report(
      NULL,NULL,p_stock_ids,p_supplier_ids,p_group_ids,p_created_by_ids
    )
  ), received AS(
    SELECT item.inventory_id,item.quantity_received::numeric quantity,
      item.unit_price::numeric unit_price,
      CASE WHEN item.unit_price IS NULL THEN NULL
           ELSE (item.quantity_received*item.unit_price)::numeric END total,
      orders.id order_id,orders.numero order_number,orders.supplier_id,
      supplier.name supplier_name,purchase.stock_id,stock.name stock_name,
      COALESCE(purchase.purchase_date,
        (orders.received_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
        (orders.updated_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date) business_date,
      orders.created_by,COALESCE(NULLIF(profile.full_name,''),NULLIF(profile.email,''),'Sistema') created_by_name,
      financial.id financial_transaction_id,financial.payment_method,financial.is_paid,
      CASE WHEN financial.id IS NULL THEN 'nao_vinculado' WHEN financial.is_paid=false THEN 'pendente'
           WHEN financial.payment_method IS NULL THEN 'nao_informado' ELSE 'pago' END payment_status,
      purchase.flow_type,COALESCE(NULLIF(item.unit,''),inventory.unit,'un') item_unit
    FROM public.compra_ordem_itens item
    JOIN public.compra_ordens orders ON orders.id=item.ordem_id AND orders.company_id=p_company_id
    JOIN public.compras purchase ON purchase.id=orders.compra_id AND purchase.company_id=p_company_id
    JOIN public.suppliers supplier ON supplier.id=orders.supplier_id AND supplier.company_id=p_company_id
    LEFT JOIN public.inventory inventory ON inventory.id=item.inventory_id AND inventory.company_id=p_company_id
    LEFT JOIN public.stocks stock ON stock.id=purchase.stock_id AND stock.company_id=p_company_id
    LEFT JOIN public.company_settings settings ON settings.company_id=p_company_id
    LEFT JOIN public.profiles profile ON profile.user_id=orders.created_by AND profile.company_id=p_company_id
    LEFT JOIN public.financial_transactions financial ON financial.id=orders.financial_transaction_id
      AND financial.company_id=p_company_id AND financial.transaction_type='saida'
    WHERE item.company_id=p_company_id AND item.inventory_id IS NOT NULL AND item.quantity_received>0
      AND orders.status IN('recebida','recebida_parcial') AND purchase.status<>'cancelada'
      AND purchase.stock_id IS NOT NULL AND public.can_access_stock(p_user_id,purchase.stock_id) IS TRUE
      AND (p_stock_ids IS NULL OR purchase.stock_id=ANY(p_stock_ids))
      AND (p_supplier_ids IS NULL OR orders.supplier_id=ANY(p_supplier_ids))
      AND (p_created_by_ids IS NULL OR orders.created_by=ANY(p_created_by_ids))
      AND COALESCE(purchase.purchase_date,
        (orders.received_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
        (orders.updated_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date)
        BETWEEN COALESCE(p_start_date,'0001-01-01'::date) AND COALESCE(p_end_date,'9999-12-31'::date)
  ), rolled AS(
    SELECT received.inventory_id,sum(received.quantity)::numeric purchased_quantity,
      COALESCE(sum(received.quantity) FILTER(WHERE received.unit_price IS NOT NULL),0)::numeric priced_quantity,
      COALESCE(sum(received.quantity) FILTER(WHERE received.unit_price IS NULL),0)::numeric unpriced_quantity,
      COALESCE(sum(received.total),0)::numeric purchased_total,
      CASE WHEN sum(received.quantity) FILTER(WHERE received.unit_price IS NOT NULL)>0
        THEN sum(received.total)/(sum(received.quantity) FILTER(WHERE received.unit_price IS NOT NULL)) END average_paid,
      count(DISTINCT received.order_id)::bigint purchase_count,max(received.business_date)::date last_purchase_date,
      jsonb_agg(jsonb_build_object('date',received.business_date,'order_id',received.order_id,
        'order_number',received.order_number,'supplier_id',received.supplier_id,'supplier_name',received.supplier_name,
        'stock_id',received.stock_id,'stock_name',received.stock_name,'created_by',received.created_by,
        'created_by_name',received.created_by_name,'financial_transaction_id',received.financial_transaction_id,
        'payment_method',received.payment_method,'is_paid',received.is_paid,'payment_status',received.payment_status,
        'flow_type',received.flow_type,'unit',received.item_unit,'quantity',received.quantity,
        'unit_price',received.unit_price,'total',received.total,'kind','compra')
        ORDER BY received.business_date DESC,received.order_number DESC,received.order_id) history
    FROM received GROUP BY received.inventory_id
  )
  SELECT base.inventory_id,base.sku,base.material_name,base.unit,base.group_id,base.group_name,
    base.group_color,base.current_balance,base.registered_sale_price,
    COALESCE(rolled.purchased_quantity,0),COALESCE(rolled.priced_quantity,0),COALESCE(rolled.unpriced_quantity,0),
    COALESCE(rolled.purchased_total,0),rolled.average_paid,COALESCE(rolled.purchase_count,0),
    rolled.last_purchase_date,COALESCE(rolled.history,'[]'::jsonb)
  FROM base LEFT JOIN rolled USING(inventory_id)
  ORDER BY base.material_name,base.inventory_id;
$fn$;

CREATE OR REPLACE FUNCTION public.get_material_purchase_report_v2(
  p_start_date date DEFAULT NULL,p_end_date date DEFAULT NULL,
  p_stock_ids uuid[] DEFAULT NULL,p_supplier_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,p_customer_ids uuid[] DEFAULT NULL,
  p_created_by_ids uuid[] DEFAULT NULL,p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE v_context record; v_total bigint; v_rows jsonb; v_from date; v_to date;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:inventory',false);
  v_from:=COALESCE(p_start_date,'0001-01-01'::date);
  v_to:=COALESCE(p_end_date,'9999-12-31'::date);
  IF v_from>v_to OR p_limit NOT BETWEEN 1 AND 500 OR p_offset<0 THEN
    RAISE EXCEPTION 'Periodo ou paginacao invalido.'
      USING ERRCODE='22023',DETAIL='code=pdv_material_report_input_invalid';
  END IF;
  IF p_customer_ids IS NOT NULL AND EXISTS(
    SELECT 1 FROM unnest(p_customer_ids) requested(id)
     WHERE NOT EXISTS(SELECT 1 FROM public.customers customer
       WHERE customer.id=requested.id AND customer.company_id=v_context.company_id
         AND customer.is_deleted IS FALSE)
  ) THEN
    RAISE EXCEPTION 'Um cliente informado nao pertence a esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_material_report_customer_denied';
  END IF;

  WITH purchase AS MATERIALIZED(
    SELECT * FROM public.pdv_material_purchase_rows_v2(
      v_context.company_id,v_context.user_id,p_start_date,p_end_date,
      p_stock_ids,p_supplier_ids,p_group_ids,p_created_by_ids
    )
  ), commercial AS MATERIALIZED(
    SELECT fact.inventory_id,
      sum(fact.delivered_quantity)::numeric delivered_quantity,
      sum(fact.returned_quantity)::numeric returned_quantity,
      sum(fact.net_quantity)::numeric net_sold_quantity,
      round(sum(fact.returned_revenue),2)::numeric returned_amount,
      round(sum(fact.net_revenue),2)::numeric net_revenue,
      CASE WHEN bool_or(NOT fact.cost_known) THEN NULL
           ELSE round(sum(fact.net_cmv),2)::numeric END net_cmv,
      sum(abs(fact.net_quantity)) FILTER(WHERE fact.cost_known)::numeric known_quantity,
      sum(abs(fact.net_quantity))::numeric total_quantity
    FROM public.pdv_commercial_facts_v2(v_context.company_id) fact
    WHERE v_context.pdv_enabled
      AND fact.inventory_id IS NOT NULL
      AND fact.event_date BETWEEN v_from AND v_to
      AND (p_stock_ids IS NULL OR fact.stock_id=ANY(p_stock_ids))
      AND (p_customer_ids IS NULL OR fact.customer_id=ANY(p_customer_ids))
      AND fact.stock_id IS NOT NULL
      AND public.can_access_stock(v_context.user_id,fact.stock_id) IS TRUE
    GROUP BY fact.inventory_id
  ), rows AS MATERIALIZED(
    SELECT purchase.*,
      CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.delivered_quantity,0) END delivered_quantity,
      CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.returned_quantity,0) END returned_quantity,
      CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.net_sold_quantity,0) END net_sold_quantity,
      CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.returned_amount,0) END returned_amount,
      CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.net_revenue,0) END net_revenue,
      CASE WHEN v_context.pdv_enabled THEN
        CASE WHEN commercial.total_quantity IS NULL THEN 0 ELSE commercial.net_cmv END END net_cmv,
      CASE WHEN NOT v_context.pdv_enabled THEN NULL
           WHEN commercial.total_quantity IS NULL THEN 'not_applicable'
           WHEN commercial.known_quantity<commercial.total_quantity THEN 'partial'
           ELSE 'complete' END cost_coverage,
      CASE WHEN NOT v_context.pdv_enabled OR commercial.total_quantity IS NULL THEN NULL
           ELSE round(COALESCE(commercial.known_quantity,0)*100/commercial.total_quantity,2) END cost_coverage_percent,
      CASE WHEN v_context.pdv_enabled AND commercial.total_quantity IS NOT NULL
             AND commercial.net_cmv IS NOT NULL
           THEN round(commercial.net_revenue-commercial.net_cmv,2) END margin
    FROM purchase LEFT JOIN commercial USING(inventory_id)
  )
  SELECT count(*) INTO v_total FROM rows;

  WITH purchase AS MATERIALIZED(
    SELECT * FROM public.pdv_material_purchase_rows_v2(
      v_context.company_id,v_context.user_id,p_start_date,p_end_date,
      p_stock_ids,p_supplier_ids,p_group_ids,p_created_by_ids
    )
  ), commercial AS MATERIALIZED(
    SELECT fact.inventory_id,sum(fact.delivered_quantity)::numeric delivered_quantity,
      sum(fact.returned_quantity)::numeric returned_quantity,
      sum(fact.net_quantity)::numeric net_sold_quantity,
      round(sum(fact.returned_revenue),2)::numeric returned_amount,
      round(sum(fact.net_revenue),2)::numeric net_revenue,
      CASE WHEN bool_or(NOT fact.cost_known) THEN NULL ELSE round(sum(fact.net_cmv),2)::numeric END net_cmv,
      sum(abs(fact.net_quantity)) FILTER(WHERE fact.cost_known)::numeric known_quantity,
      sum(abs(fact.net_quantity))::numeric total_quantity
    FROM public.pdv_commercial_facts_v2(v_context.company_id) fact
    WHERE v_context.pdv_enabled AND fact.inventory_id IS NOT NULL
      AND fact.event_date BETWEEN v_from AND v_to
      AND (p_stock_ids IS NULL OR fact.stock_id=ANY(p_stock_ids))
      AND (p_customer_ids IS NULL OR fact.customer_id=ANY(p_customer_ids))
      AND fact.stock_id IS NOT NULL
      AND public.can_access_stock(v_context.user_id,fact.stock_id) IS TRUE
    GROUP BY fact.inventory_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.material_name,page.inventory_id),'[]'::jsonb)
    INTO v_rows FROM(
      SELECT purchase.*,
        CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.delivered_quantity,0) END delivered_quantity,
        CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.returned_quantity,0) END returned_quantity,
        CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.net_sold_quantity,0) END net_sold_quantity,
        CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.returned_amount,0) END returned_amount,
        CASE WHEN v_context.pdv_enabled THEN COALESCE(commercial.net_revenue,0) END net_revenue,
        CASE WHEN v_context.pdv_enabled THEN CASE WHEN commercial.total_quantity IS NULL THEN 0 ELSE commercial.net_cmv END END net_cmv,
        CASE WHEN NOT v_context.pdv_enabled THEN NULL WHEN commercial.total_quantity IS NULL THEN 'not_applicable'
             WHEN commercial.known_quantity<commercial.total_quantity THEN 'partial' ELSE 'complete' END cost_coverage,
        CASE WHEN NOT v_context.pdv_enabled OR commercial.total_quantity IS NULL THEN NULL
             ELSE round(COALESCE(commercial.known_quantity,0)*100/commercial.total_quantity,2) END cost_coverage_percent,
        CASE WHEN v_context.pdv_enabled AND commercial.total_quantity IS NOT NULL AND commercial.net_cmv IS NOT NULL
             THEN round(commercial.net_revenue-commercial.net_cmv,2) END margin
      FROM purchase LEFT JOIN commercial USING(inventory_id)
      ORDER BY purchase.material_name,purchase.inventory_id LIMIT p_limit OFFSET p_offset
    ) page;

  RETURN jsonb_build_object(
    'scope','inventory_material_period','from',p_start_date,'to',p_end_date,
    'capabilities',jsonb_build_object('purchases',true,'pdv_commercial',v_context.pdv_enabled),
    'total_count',v_total,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset+jsonb_array_length(v_rows)<v_total,'rows',v_rows
  );
END $fn$;

-- ---------------------------------------------------------------------------
-- 4. Curva ABC: mesma fonte comercial, nunca status do pedido.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_inventory_abc_report(
  p_start_date date DEFAULT NULL,p_end_date date DEFAULT NULL,p_stock_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  inventory_id uuid,sku text,material_name text,unit text,image_url text,
  group_id uuid,group_name text,group_color text,current_balance numeric,
  minimum_balance numeric,unit_cost numeric,sale_price numeric,stock_value numeric,
  usage_quantity numeric,usage_value numeric,pdv_quantity numeric,pdv_revenue numeric,
  pdv_cost numeric,pdv_margin numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE v_context record; v_from date; v_to date;
  v_timezone text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:inventory',false);
  SELECT COALESCE(settings.timezone,'America/Sao_Paulo') INTO v_timezone
    FROM public.company_settings settings WHERE settings.company_id=v_context.company_id;
  v_timezone:=COALESCE(v_timezone,'America/Sao_Paulo');
  v_from:=COALESCE(p_start_date,'0001-01-01'::date);
  v_to:=COALESCE(p_end_date,'9999-12-31'::date);
  IF v_from>v_to THEN RAISE EXCEPTION 'Periodo invalido.' USING ERRCODE='22023'; END IF;
  IF p_stock_ids IS NOT NULL AND EXISTS(
    SELECT 1 FROM unnest(p_stock_ids) requested(id) WHERE NOT EXISTS(
      SELECT 1 FROM public.stocks stock WHERE stock.id=requested.id
        AND stock.company_id=v_context.company_id AND stock.customer_id IS NULL
        AND public.can_access_stock(v_context.user_id,stock.id) IS TRUE
    )
  ) THEN RAISE EXCEPTION 'Local de estoque indisponivel.' USING ERRCODE='42501'; END IF;
  RETURN QUERY WITH accessible AS MATERIALIZED(
    SELECT stock.id FROM public.stocks stock WHERE stock.company_id=v_context.company_id
      AND stock.customer_id IS NULL AND public.can_access_stock(v_context.user_id,stock.id) IS TRUE
      AND (p_stock_ids IS NULL OR stock.id=ANY(p_stock_ids))
  ), position AS(
    SELECT inventory.id inventory_id,
      COALESCE(sum(level.quantity) FILTER(WHERE accessible.id IS NOT NULL),0)::numeric balance,
      COALESCE(max(level.min_quantity) FILTER(WHERE accessible.id IS NOT NULL),inventory.min_quantity,0)::numeric minimum
    FROM public.inventory inventory LEFT JOIN public.inventory_stock_levels level ON level.inventory_id=inventory.id
    LEFT JOIN accessible ON accessible.id=level.stock_id
    WHERE inventory.company_id=v_context.company_id AND inventory.customer_id IS NULL AND inventory.archived_at IS NULL
    GROUP BY inventory.id,inventory.min_quantity
  ), usage AS(
    SELECT movement.inventory_id,sum(abs(movement.quantity))::numeric quantity,
      sum(abs(movement.quantity)*COALESCE(movement.unit_cost,inventory.cost_price,0))::numeric value
    FROM public.inventory_movements movement JOIN accessible ON accessible.id=movement.stock_id
    JOIN public.inventory inventory ON inventory.id=movement.inventory_id AND inventory.company_id=v_context.company_id
    WHERE movement.company_id=v_context.company_id AND movement.customer_id IS NULL
      AND movement.movement_type IN('saida','consumo')
      AND NOT EXISTS(SELECT 1 FROM public.pdv_delivery_items delivery_item
        WHERE delivery_item.company_id=v_context.company_id
          AND delivery_item.inventory_movement_id=movement.id)
      AND NOT EXISTS(SELECT 1 FROM public.pdv_commercial_return_items return_item
        WHERE return_item.company_id=v_context.company_id
          AND return_item.inventory_movement_id=movement.id)
      AND NOT(movement.movement_type='saida' AND movement.service_order_id IS NULL
        AND COALESCE(movement.notes,'') LIKE 'Venda no PDV, pedido n%')
      AND (movement.created_at AT TIME ZONE v_timezone)::date BETWEEN v_from AND v_to
    GROUP BY movement.inventory_id
  ), commercial AS(
    SELECT fact.inventory_id,sum(fact.net_quantity)::numeric quantity,
      round(sum(fact.net_revenue),2)::numeric revenue,
      CASE WHEN bool_or(NOT fact.cost_known) THEN NULL ELSE round(sum(fact.net_cmv),2)::numeric END cost
    FROM public.pdv_commercial_facts_v2(v_context.company_id) fact JOIN accessible ON accessible.id=fact.stock_id
    WHERE v_context.pdv_enabled AND fact.inventory_id IS NOT NULL AND fact.event_date BETWEEN v_from AND v_to
    GROUP BY fact.inventory_id
  ) SELECT inventory.id,COALESCE(inventory.sku,'')::text,inventory.name::text,
      COALESCE(NULLIF(inventory.unit,''),'un')::text,inventory.image_url::text,inventory.group_id,
      material_group.name::text,material_group.color::text,COALESCE(position.balance,0),COALESCE(position.minimum,0),
      COALESCE(inventory.cost_price,0),COALESCE(inventory.sale_price,0),
      COALESCE(position.balance,0)*COALESCE(inventory.cost_price,0),
      COALESCE(usage.quantity,0),COALESCE(usage.value,0),COALESCE(commercial.quantity,0),
      COALESCE(commercial.revenue,0),CASE WHEN commercial.inventory_id IS NULL THEN 0 ELSE commercial.cost END,
      CASE WHEN commercial.inventory_id IS NULL THEN 0 WHEN commercial.cost IS NULL THEN NULL
           ELSE round(commercial.revenue-commercial.cost,2) END
    FROM public.inventory inventory
    LEFT JOIN public.material_groups material_group ON material_group.id=inventory.group_id AND material_group.company_id=v_context.company_id
    LEFT JOIN position ON position.inventory_id=inventory.id LEFT JOIN usage ON usage.inventory_id=inventory.id
    LEFT JOIN commercial ON commercial.inventory_id=inventory.id
    WHERE inventory.company_id=v_context.company_id AND inventory.customer_id IS NULL AND inventory.archived_at IS NULL
      AND (p_stock_ids IS NULL OR EXISTS(SELECT 1 FROM public.inventory_stock_levels level JOIN accessible ON accessible.id=level.stock_id WHERE level.inventory_id=inventory.id)
        OR usage.inventory_id IS NOT NULL OR commercial.inventory_id IS NOT NULL)
    ORDER BY inventory.name,inventory.id;
END $fn$;

-- ---------------------------------------------------------------------------
-- 5. PDV parcial, historico global e indice de documentos imutaveis.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_partial_projection_report_v2(
  p_projection text,p_from date,p_to date,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  v_result:=public.pdv_financial_projection_page_v2(v_context.company_id,p_projection,p_from,p_to,p_limit,p_offset);
  IF v_result->>'scope'<>'pdv_partial' OR v_result->'initial_balance'<>'null'::jsonb
     OR v_result->'opening_availability'<>'null'::jsonb OR v_result->'closing_availability'<>'null'::jsonb THEN
    RAISE EXCEPTION 'A projecao parcial retornou um contrato invalido.' USING ERRCODE='55000';
  END IF;
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_global_event_history_v2(
  p_from date,p_to date,p_cash_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_total bigint; v_entries jsonb; v_can_finance boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_limit NOT BETWEEN 1 AND 500 OR p_offset<0 THEN
    RAISE EXCEPTION 'Periodo ou paginacao invalido.' USING ERRCODE='22023'; END IF;
  IF p_cash_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions session
      WHERE session.id=p_cash_session_id AND session.company_id=v_context.company_id) THEN
    RAISE EXCEPTION 'Caixa nao encontrado.' USING ERRCODE='P0002'; END IF;
  v_can_finance:=public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id)
    OR public.user_has_permission(v_context.user_id,'fn:view_finance_totals') IS TRUE;
  WITH events AS MATERIALIZED(
    SELECT transaction.id event_id,'financial_transaction'::text event_type,
      COALESCE(transaction.paid_date,transaction.transaction_date) event_date,
      transaction.pdv_cash_session_id cash_session_id,
      CASE WHEN transaction.pdv_cash_session_id IS NULL THEN 'Caixa não identificado'
           ELSE COALESCE(terminal.name,'Caixa '||left(transaction.pdv_cash_session_id::text,8)) END cash_session_label,
      transaction.description label,CASE WHEN v_can_finance THEN transaction.amount END amount,
      transaction.transaction_type::text direction,
      '/financeiro/movimentacoes?transaction='||transaction.id::text deep_link
    FROM public.financial_transactions transaction
    LEFT JOIN public.pdv_cash_sessions session ON session.id=transaction.pdv_cash_session_id AND session.company_id=transaction.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE transaction.company_id=v_context.company_id AND transaction.origin='pdv'
      AND transaction.cancelled_at IS NULL AND COALESCE(transaction.paid_date,transaction.transaction_date) BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR transaction.pdv_cash_session_id=p_cash_session_id)
    UNION ALL
    SELECT session.id,'cash_session_open',
      (session.opened_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
      session.id,COALESCE(terminal.name,'Caixa '||left(session.id::text,8)),
      'Abertura de caixa',CASE WHEN v_can_finance THEN session.opening_amount END,NULL,
      '/pdv/caixa?session='||session.id::text
    FROM public.pdv_cash_sessions session
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    LEFT JOIN public.company_settings settings ON settings.company_id=session.company_id
    WHERE session.company_id=v_context.company_id
      AND (session.opened_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR session.id=p_cash_session_id)
    UNION ALL
    SELECT session.id,'cash_session_close',
      (session.closed_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
      session.id,COALESCE(terminal.name,'Caixa '||left(session.id::text,8)),
      'Fechamento de caixa',CASE WHEN v_can_finance THEN session.counted_amount END,NULL,
      '/pdv/caixa?session='||session.id::text
    FROM public.pdv_cash_sessions session
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    LEFT JOIN public.company_settings settings ON settings.company_id=session.company_id
    WHERE session.company_id=v_context.company_id AND session.closed_at IS NOT NULL
      AND (session.closed_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR session.id=p_cash_session_id)
    UNION ALL
    SELECT delivery.id,'delivery',item.recognition_date,orders.cash_session_id,
      CASE WHEN orders.cash_session_id IS NULL THEN 'Caixa não identificado' ELSE COALESCE(terminal.name,'Caixa '||left(orders.cash_session_id::text,8)) END,
      'Retirada do pedido '||orders.number::text,NULL,NULL,'/pdv/expedicao?order='||orders.id::text
    FROM public.pdv_deliveries delivery JOIN public.pdv_delivery_items item ON item.delivery_id=delivery.id AND item.company_id=delivery.company_id
    JOIN public.pdv_orders orders ON orders.id=delivery.order_id AND orders.company_id=delivery.company_id
    LEFT JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id AND session.company_id=orders.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE delivery.company_id=v_context.company_id AND item.recognition_contract_version=2 AND item.recognition_date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
    UNION ALL
    SELECT header.id,header.event_kind,header.occurred_on,orders.cash_session_id,
      CASE WHEN orders.cash_session_id IS NULL THEN 'Caixa não identificado' ELSE COALESCE(terminal.name,'Caixa '||left(orders.cash_session_id::text,8)) END,
      CASE header.event_kind WHEN 'return' THEN 'Devolucao' ELSE 'Compensacao de devolucao' END||' do pedido '||orders.number::text,
      CASE WHEN v_can_finance THEN abs(header.commercial_total) END,NULL,'/pdv/pedidos?order='||orders.id::text
    FROM public.pdv_commercial_returns header JOIN public.pdv_orders orders ON orders.id=header.order_id AND orders.company_id=header.company_id
    LEFT JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id AND session.company_id=orders.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE header.company_id=v_context.company_id AND header.occurred_on BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
  ), deduplicated AS(
    SELECT DISTINCT ON(event_type,event_id) * FROM events ORDER BY event_type,event_id,event_date
  ) SELECT count(*) INTO v_total FROM deduplicated;
  WITH events AS MATERIALIZED(
    SELECT transaction.id event_id,'financial_transaction'::text event_type,COALESCE(transaction.paid_date,transaction.transaction_date) event_date,
      transaction.pdv_cash_session_id cash_session_id,CASE WHEN transaction.pdv_cash_session_id IS NULL THEN 'Caixa não identificado' ELSE COALESCE(terminal.name,'Caixa '||left(transaction.pdv_cash_session_id::text,8)) END cash_session_label,
      transaction.description label,CASE WHEN v_can_finance THEN transaction.amount END amount,transaction.transaction_type::text direction,
      '/financeiro/movimentacoes?transaction='||transaction.id::text deep_link
    FROM public.financial_transactions transaction LEFT JOIN public.pdv_cash_sessions session ON session.id=transaction.pdv_cash_session_id AND session.company_id=transaction.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE transaction.company_id=v_context.company_id AND transaction.origin='pdv' AND transaction.cancelled_at IS NULL
      AND COALESCE(transaction.paid_date,transaction.transaction_date) BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR transaction.pdv_cash_session_id=p_cash_session_id)
    UNION ALL SELECT session.id,'cash_session_open',
      (session.opened_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
      session.id,COALESCE(terminal.name,'Caixa '||left(session.id::text,8)),'Abertura de caixa',
      CASE WHEN v_can_finance THEN session.opening_amount END,NULL,'/pdv/caixa?session='||session.id::text
    FROM public.pdv_cash_sessions session LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    LEFT JOIN public.company_settings settings ON settings.company_id=session.company_id
    WHERE session.company_id=v_context.company_id
      AND (session.opened_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR session.id=p_cash_session_id)
    UNION ALL SELECT session.id,'cash_session_close',
      (session.closed_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date,
      session.id,COALESCE(terminal.name,'Caixa '||left(session.id::text,8)),'Fechamento de caixa',
      CASE WHEN v_can_finance THEN session.counted_amount END,NULL,'/pdv/caixa?session='||session.id::text
    FROM public.pdv_cash_sessions session LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    LEFT JOIN public.company_settings settings ON settings.company_id=session.company_id
    WHERE session.company_id=v_context.company_id AND session.closed_at IS NOT NULL
      AND (session.closed_at AT TIME ZONE COALESCE(settings.timezone,'America/Sao_Paulo'))::date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR session.id=p_cash_session_id)
    UNION ALL SELECT delivery.id,'delivery',item.recognition_date,orders.cash_session_id,
      CASE WHEN orders.cash_session_id IS NULL THEN 'Caixa não identificado' ELSE COALESCE(terminal.name,'Caixa '||left(orders.cash_session_id::text,8)) END,
      'Retirada do pedido '||orders.number::text,NULL,NULL,'/pdv/expedicao?order='||orders.id::text
    FROM public.pdv_deliveries delivery JOIN public.pdv_delivery_items item ON item.delivery_id=delivery.id AND item.company_id=delivery.company_id
    JOIN public.pdv_orders orders ON orders.id=delivery.order_id AND orders.company_id=delivery.company_id
    LEFT JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id AND session.company_id=orders.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE delivery.company_id=v_context.company_id AND item.recognition_contract_version=2 AND item.recognition_date BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
    UNION ALL SELECT header.id,header.event_kind,header.occurred_on,orders.cash_session_id,
      CASE WHEN orders.cash_session_id IS NULL THEN 'Caixa não identificado' ELSE COALESCE(terminal.name,'Caixa '||left(orders.cash_session_id::text,8)) END,
      CASE header.event_kind WHEN 'return' THEN 'Devolucao' ELSE 'Compensacao de devolucao' END||' do pedido '||orders.number::text,
      CASE WHEN v_can_finance THEN abs(header.commercial_total) END,NULL,'/pdv/pedidos?order='||orders.id::text
    FROM public.pdv_commercial_returns header JOIN public.pdv_orders orders ON orders.id=header.order_id AND orders.company_id=header.company_id
    LEFT JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id AND session.company_id=orders.company_id
    LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE header.company_id=v_context.company_id AND header.occurred_on BETWEEN p_from AND p_to
      AND (p_cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
  ), deduplicated AS(SELECT DISTINCT ON(event_type,event_id) * FROM events ORDER BY event_type,event_id,event_date)
  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.event_date DESC,page.event_type,page.event_id),'[]'::jsonb) INTO v_entries
    FROM(SELECT * FROM deduplicated ORDER BY event_date DESC,event_type,event_id LIMIT p_limit OFFSET p_offset) page;
  RETURN jsonb_build_object('scope','pdv_global_history','from',p_from,'to',p_to,'cash_session_id',p_cash_session_id,
    'total_count',v_total,'limit',p_limit,'offset',p_offset,'has_more',p_offset+jsonb_array_length(v_entries)<v_total,'entries',v_entries);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_document_index_v2(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_total bigint; v_documents jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  IF p_limit NOT BETWEEN 1 AND 500 OR p_offset<0 THEN RAISE EXCEPTION 'Paginacao invalida.' USING ERRCODE='22023'; END IF;
  WITH documents AS(
    SELECT snapshot.id,'order_receipt'::text document_type,snapshot.order_id,NULL::uuid delivery_id,
      snapshot.created_at,'/pdv/pedidos?order='||snapshot.order_id::text||'&document=order_receipt' deep_link
    FROM public.pdv_order_receipt_snapshots snapshot WHERE snapshot.company_id=v_context.company_id
    UNION ALL
    SELECT snapshot.id,'delivery_receipt',snapshot.order_id,snapshot.delivery_id,snapshot.created_at,
      '/pdv/expedicao?order='||snapshot.order_id::text||'&delivery='||snapshot.delivery_id::text
    FROM public.pdv_delivery_receipt_snapshots snapshot WHERE snapshot.company_id=v_context.company_id
  ) SELECT count(*) INTO v_total FROM documents;
  WITH documents AS(
    SELECT snapshot.id,'order_receipt'::text document_type,snapshot.order_id,NULL::uuid delivery_id,snapshot.created_at,
      '/pdv/pedidos?order='||snapshot.order_id::text||'&document=order_receipt' deep_link
    FROM public.pdv_order_receipt_snapshots snapshot WHERE snapshot.company_id=v_context.company_id
    UNION ALL SELECT snapshot.id,'delivery_receipt',snapshot.order_id,snapshot.delivery_id,snapshot.created_at,
      '/pdv/expedicao?order='||snapshot.order_id::text||'&delivery='||snapshot.delivery_id::text
    FROM public.pdv_delivery_receipt_snapshots snapshot WHERE snapshot.company_id=v_context.company_id
  ) SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.id),'[]'::jsonb) INTO v_documents
    FROM(SELECT * FROM documents ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) page;
  RETURN jsonb_build_object('scope','pdv_document_index','total_count',v_total,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset+jsonb_array_length(v_documents)<v_total,'documents',v_documents);
END $fn$;

-- ACL: helpers internos, somente RPCs autenticadas.
REVOKE ALL ON FUNCTION public.pdv_guard_financial_cash_session_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_attach_cash_session_to_financial_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_attach_order_session_to_financial_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_commercial_facts_v2(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_reports_context_v2(text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_material_purchase_rows_v2(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_commercial_facts_v2(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_reports_context_v2(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_material_purchase_rows_v2(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_material_purchase_report_v2(date,date,uuid[],uuid[],uuid[],uuid[],uuid[],integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_inventory_abc_report(date,date,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_partial_projection_report_v2(text,date,date,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_global_event_history_v2(date,date,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_document_index_v2(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_material_purchase_report_v2(date,date,uuid[],uuid[],uuid[],uuid[],uuid[],integer,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_abc_report(date,date,uuid[]) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_partial_projection_report_v2(text,date,date,integer,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_global_event_history_v2(date,date,uuid,integer,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_document_index_v2(integer,integer) TO authenticated,service_role;

COMMIT;
