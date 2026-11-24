-- Compra tem um único valor comercial e uma única obrigação. Adiantamento
-- quita crédito existente; somente o complemento é pagamento monetário/DFC.
BEGIN;
CREATE OR REPLACE FUNCTION public.pdv_recalc_supplier_purchase_v4(p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_target public.financial_transactions%ROWTYPE; v_credit numeric; v_money numeric; v_date date;
BEGIN
  SELECT * INTO v_target FROM public.financial_transactions
   WHERE id=p_transaction_id AND pdv_financial_role='pdv_supplier_obligation' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT -COALESCE(sum(amount),0),max(occurred_on) INTO v_credit,v_date
    FROM public.pdv_party_credit_entries WHERE target_financial_transaction_id=p_transaction_id
      AND company_id=v_target.company_id AND party_type='supplier' AND supplier_id=v_target.supplier_id;
  SELECT COALESCE(sum(amount),0),GREATEST(v_date,max(paid_date)) INTO v_money,v_date
    FROM public.financial_transactions WHERE parent_transaction_id=p_transaction_id
      AND company_id=v_target.company_id AND pdv_financial_role='pdv_supplier_payment'
      AND transaction_type='saida' AND is_paid IS TRUE AND cancelled_at IS NULL;
  IF v_credit<0 OR v_money<0 OR v_credit+v_money>v_target.amount THEN
    RAISE EXCEPTION 'Os pagamentos ultrapassam o total da compra.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_total_invalid';
  END IF;
  PERFORM set_config('app.pdv_receivable_recalc',p_transaction_id::text,true);
  UPDATE public.financial_transactions SET amount_received=v_credit+v_money,
    is_paid=v_credit+v_money=amount,
    paid_date=CASE WHEN v_credit+v_money=amount THEN v_date ELSE NULL END
   WHERE id=p_transaction_id;
  PERFORM set_config('app.pdv_receivable_recalc','',true);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_recalc_supplier_purchase_v4(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- O mesmo sincronizador é usado por aplicações e compensações explícitas do
-- livro do fornecedor; desfazer crédito reabre somente a parcela pertinente.
DO $credit_sync$
DECLARE v_src text; v_old text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_recalc_after_party_credit_v2()'::regprocedure) INTO v_src;
 v_old:='    IF v_target.transaction_type::text=''entrada'' THEN';
 IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Sincronizador de saldo mudou'; END IF;
 v_src:=replace(v_src,v_old,$patch$    IF v_target.pdv_financial_role='pdv_supplier_obligation' THEN
      PERFORM public.pdv_recalc_supplier_purchase_v4(v_target.id);
      RETURN NEW;
    END IF;
$patch$||v_old);
 EXECUTE v_src;
END $credit_sync$;

CREATE OR REPLACE FUNCTION public.pdv_guard_supplier_purchase_payment_v4()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_parent public.financial_transactions%ROWTYPE; v_request public.pdv_operation_requests%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NEW.pdv_financial_role='pdv_supplier_payment'
   AND OLD.pdv_financial_role IS DISTINCT FROM 'pdv_supplier_payment' THEN
   RAISE EXCEPTION 'O pagamento deve ser criado junto da compra.' USING ERRCODE='55000',DETAIL='code=pdv_supplier_payment_immutable';
 END IF;
 IF TG_OP IN('UPDATE','DELETE') THEN
   IF OLD.pdv_financial_role IS DISTINCT FROM 'pdv_supplier_payment' THEN
     RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
   END IF;
   IF COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text
     OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=OLD.company_id) THEN
     RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
   END IF;
   RAISE EXCEPTION 'O pagamento da compra é imutável. Registre uma compensação.' USING ERRCODE='55000',DETAIL='code=pdv_supplier_payment_immutable';
 END IF;
 IF NEW.pdv_financial_role IS DISTINCT FROM 'pdv_supplier_payment' THEN RETURN NEW; END IF;
 SELECT * INTO v_request FROM public.pdv_operation_requests WHERE id=NEW.pdv_settlement_group_id AND company_id=NEW.company_id;
 IF NOT FOUND OR v_request.operation_type<>'purchase.supplier_credit.v4' OR v_request.status<>'pending' THEN
   RAISE EXCEPTION 'O pagamento não possui uma compra de origem válida.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_invalid';
 END IF;
 SELECT * INTO v_parent FROM public.financial_transactions WHERE id=NEW.parent_transaction_id FOR UPDATE;
 IF NOT FOUND OR v_parent.company_id IS DISTINCT FROM NEW.company_id
   OR v_parent.supplier_id IS DISTINCT FROM NEW.supplier_id
   OR v_parent.pdv_financial_role IS DISTINCT FROM 'pdv_supplier_obligation'
   OR v_parent.pdv_settlement_group_id IS DISTINCT FROM NEW.pdv_settlement_group_id
   OR NEW.transaction_type<>'saida' OR NEW.is_paid IS DISTINCT FROM true OR NEW.paid_date IS NULL
   OR NEW.amount<=0 OR lower(NEW.amount::text) IN('nan','infinity','-infinity')
   OR NEW.account_id IS NULL OR NEW.cancelled_at IS NOT NULL
   OR v_parent.amount_received IS NULL OR NEW.amount IS DISTINCT FROM v_parent.amount-v_parent.amount_received
   OR NEW.pdv_cash_session_id IS DISTINCT FROM v_parent.pdv_cash_session_id
   OR NOT EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=NEW.account_id
     AND a.company_id=NEW.company_id AND a.is_active IS TRUE AND a.type<>'cartao') THEN
   RAISE EXCEPTION 'O pagamento não corresponde à compra.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_invalid';
 END IF;
 RETURN NEW;
END $fn$;
CREATE UNIQUE INDEX pdv_supplier_purchase_payment_request_v4 ON public.financial_transactions(company_id,pdv_settlement_group_id)
WHERE pdv_financial_role='pdv_supplier_payment';
CREATE TRIGGER pdv_supplier_purchase_payment_guard_v4 BEFORE INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_supplier_purchase_payment_v4();
REVOKE ALL ON FUNCTION public.pdv_guard_supplier_purchase_payment_v4() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_register_direct_purchase_mixed_v4(
 p_cash_session_id uuid,p_terminal_id uuid,p_client_request_id uuid,p_stock_id uuid,
 p_supplier_id uuid,p_items jsonb,p_purchase_date date,p_account_id uuid,p_category_id uuid,
 p_supplier_credit_amount numeric,p_payment_method text,p_paid_date date,p_description text,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_session public.pdv_cash_sessions%ROWTYPE;
 v_items jsonb; v_total numeric(14,2); v_credit numeric(14,2); v_money numeric(14,2);
 v_purchase jsonb; v_financial uuid; v_compra uuid; v_entry uuid; v_payment uuid; v_custody uuid;
 v_cash boolean; v_result jsonb;
BEGIN
 SELECT * INTO v_context FROM public.pdv_cash_v2_context();
 -- As mesmas permissões da compra canônica são revalidadas antes do replay.
 IF (public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id)
   OR public.has_full_permissions(v_context.user_id) OR EXISTS(
     SELECT 1 FROM public.user_permissions up WHERE up.user_id=v_context.user_id AND up.is_active IS TRUE
       AND (up.permissions?'*' OR (up.permissions?'fn:manage_inventory' AND up.permissions?'fn:manage_finance')))) IS DISTINCT FROM TRUE
   OR public.company_plan_allows_product_area(v_context.company_id,'finance') IS DISTINCT FROM TRUE
   OR NOT EXISTS(SELECT 1 FROM public.stocks st WHERE st.id=p_stock_id AND st.company_id=v_context.company_id
     AND st.customer_id IS NULL AND public.can_access_stock(v_context.user_id,st.id) IS TRUE)
   OR NOT EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=p_account_id AND a.company_id=v_context.company_id AND a.is_active IS TRUE AND a.type<>'cartao')
   OR NOT EXISTS(SELECT 1 FROM public.financial_categories c WHERE c.id=p_category_id AND c.company_id=v_context.company_id AND c.is_active IS TRUE AND c.type='saida') THEN
   RAISE EXCEPTION 'Seu perfil ou o contexto financeiro não permite registrar esta compra.' USING ERRCODE='42501',DETAIL='code=pdv_supplier_purchase_access_denied';
 END IF;
 PERFORM public.pdv_assert_party_v2(v_context.company_id,'supplier',p_supplier_id);
 IF p_client_request_id IS NULL OR p_supplier_credit_amount IS NULL OR p_supplier_credit_amount<=0
   OR lower(p_supplier_credit_amount::text) IN('nan','infinity','-infinity')
   OR p_supplier_credit_amount<>round(p_supplier_credit_amount,2)
   OR p_account_id IS NULL OR (p_cash_session_id IS NULL)<>(p_terminal_id IS NULL)
   OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Revise o saldo e os dados da compra.' USING ERRCODE='22023',DETAIL='code=pdv_supplier_credit_amount_invalid';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('inventory_id',x.inventory_id,'quantity',round(x.quantity,4),
   'unit_price',round(x.unit_price,2)) ORDER BY x.inventory_id::text),
   round(sum(round(x.quantity,4)*round(x.unit_price,2)),2)
   INTO v_items,v_total FROM jsonb_to_recordset(p_items) x(inventory_id uuid,quantity numeric,unit_price numeric);
 IF v_total IS NULL OR v_total<=0 OR lower(v_total::text) IN('nan','infinity','-infinity')
   OR p_supplier_credit_amount>v_total THEN
   RAISE EXCEPTION 'O saldo aplicado ultrapassa o total da compra.' USING ERRCODE='22023',DETAIL='code=pdv_supplier_credit_amount_invalid';
 END IF;
 v_credit:=p_supplier_credit_amount; v_money:=v_total-v_credit;
 v_cash:=v_money>0 AND p_payment_method='dinheiro';
 IF v_money>0 AND (p_payment_method IS NULL OR p_payment_method NOT IN('dinheiro','pix','cartao_debito','transferencia','boleto','cheque')
   OR p_paid_date IS NULL OR p_paid_date>public.company_today(v_context.company_id)) THEN
   RAISE EXCEPTION 'Informe a forma e a data de pagamento do complemento.' USING ERRCODE='22023',DETAIL='code=pdv_supplier_payment_invalid';
 END IF;
 IF p_cash_session_id IS NOT NULL THEN
   v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,NULL,false);
   IF v_session.terminal_id IS DISTINCT FROM p_terminal_id OR NOT EXISTS(
     SELECT 1 FROM public.pdv_terminals WHERE id=p_terminal_id AND company_id=v_context.company_id
       AND stock_id=p_stock_id AND is_active IS TRUE AND public.can_access_stock(v_context.user_id,stock_id)) THEN
     RAISE EXCEPTION 'Este caixa não corresponde ao local da compra.' USING ERRCODE='42501',DETAIL='PDV_CASH_PURCHASE_CONTEXT_MISMATCH';
   END IF;
   IF v_money>0 AND ((v_cash AND p_account_id IS DISTINCT FROM v_session.cash_account_id)
      OR (NOT v_cash AND p_account_id IS NOT DISTINCT FROM v_session.cash_account_id)) THEN
     RAISE EXCEPTION 'Escolha a conta correspondente ao pagamento do complemento.' USING ERRCODE='23514',DETAIL='PDV_CASH_PURCHASE_ACCOUNT_MISMATCH';
   END IF;
 END IF;
 -- Ordem global: contas de tesouraria, fornecedor e fatos da compra.
 PERFORM public.pdv_lock_treasury_accounts(v_context.company_id,CASE WHEN v_session.cash_account_id IS NULL
   THEN ARRAY[p_account_id] ELSE ARRAY[p_account_id,v_session.cash_account_id] END);
 PERFORM 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=v_context.company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fornecedor não encontrado nesta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_supplier_credit_supplier_invalid'; END IF;
 SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,
   'purchase.supplier_credit.v4',p_client_request_id::text,jsonb_build_object(
     'session_id',p_cash_session_id,'terminal_id',p_terminal_id,'stock_id',p_stock_id,
     'supplier_id',p_supplier_id,'items',v_items,'purchase_date',p_purchase_date,
     'account_id',p_account_id,'category_id',p_category_id,'credit_amount',v_credit,
     'payment_method',p_payment_method,'paid_date',p_paid_date,'description',NULLIF(btrim(p_description),''),'notes',NULLIF(btrim(p_notes),'')));
 IF v_claim.is_replay THEN
   IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
   RAISE EXCEPTION 'Esta compra ainda está sendo processada.' USING ERRCODE='55000',DETAIL='code=pdv_supplier_credit_in_progress';
 END IF;
 IF p_cash_session_id IS NOT NULL THEN
   v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,NULL,true);
 END IF;
 IF v_cash AND p_cash_session_id IS NOT NULL AND (p_purchase_date IS DISTINCT FROM public.company_today(v_context.company_id)
   OR p_paid_date IS DISTINCT FROM public.company_today(v_context.company_id)) THEN
   RAISE EXCEPTION 'Pagamento em dinheiro do caixa deve usar a data de hoje.' USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_DATE_INVALID';
 END IF;
 IF v_credit>public.pdv_party_available_credit_v2(v_context.company_id,'supplier',p_supplier_id) THEN
   RAISE EXCEPTION 'O saldo do fornecedor é insuficiente para o valor aplicado.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_credit_insufficient';
 END IF;
 IF v_cash AND p_cash_session_id IS NOT NULL AND v_money>COALESCE((SELECT custody_amount
   FROM public.pdv_cash_custody_position(v_context.company_id,p_cash_session_id)),0) THEN
   RAISE EXCEPTION 'O caixa não possui dinheiro suficiente para o complemento.' USING ERRCODE='23514',DETAIL='PDV_CASH_CUSTODY_INSUFFICIENT';
 END IF;
 -- Core preserva total comercial, custo, Kardex, permissões e hash da compra.
 v_purchase:=public.registrar_compra_material_direta_core_019(p_client_request_id,p_stock_id,p_supplier_id,
   v_items,p_purchase_date,p_account_id,p_category_id,false,NULL,p_purchase_date,NULL,p_description,p_notes);
 IF COALESCE((v_purchase->>'already_applied')::boolean,false) THEN
   RAISE EXCEPTION 'Esta chave já foi usada para outra compra.' USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_CONTEXT_REUSED';
 END IF;
 v_financial:=(v_purchase->>'financial_transaction_id')::uuid; v_compra:=(v_purchase->>'compra_id')::uuid;
 IF v_financial IS NULL OR (v_purchase->>'total_amount')::numeric IS DISTINCT FROM v_total THEN
   RAISE EXCEPTION 'Não foi possível confirmar o financeiro da compra.' USING ERRCODE='55000',DETAIL='code=pdv_supplier_credit_financial_missing';
 END IF;
 UPDATE public.compras SET cash_session_id=p_cash_session_id,terminal_id=p_terminal_id WHERE id=v_compra;
 -- Obrigação não representa dinheiro guardado em conta. Pagamento é a filha abaixo.
 UPDATE public.financial_transactions SET account_id=NULL,pdv_financial_role='pdv_supplier_obligation',
   pdv_settlement_group_id=v_claim.request_id,pdv_cash_session_id=p_cash_session_id WHERE id=v_financial;
 INSERT INTO public.pdv_party_credit_entries(company_id,party_type,supplier_id,entry_kind,amount,occurred_on,
   description,target_financial_transaction_id,operation_request_id,created_by)
 VALUES(v_context.company_id,'supplier',p_supplier_id,'application',-v_credit,p_purchase_date,
   'Saldo aplicado na compra de materiais',v_financial,v_claim.request_id,v_context.user_id) RETURNING id INTO v_entry;
 IF v_money>0 THEN
   IF v_cash AND p_cash_session_id IS NOT NULL THEN
     PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object('company_id',v_context.company_id,
       'account_id',p_account_id,'request_id',v_claim.request_id,'delta',-v_money)::text,true);
   END IF;
   INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,transaction_date,
     paid_date,is_paid,supplier_id,account_id,payment_method,notes,created_by,parent_transaction_id,
     origin,pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
   SELECT company_id,'saida'::public.transaction_type,'Complemento da compra — '||description,v_money,category,p_paid_date,
     p_paid_date,true,supplier_id,p_account_id,p_payment_method,p_notes,v_context.user_id,id,
     CASE WHEN p_cash_session_id IS NOT NULL THEN 'pdv' ELSE 'geral' END,'pdv_supplier_payment',v_claim.request_id,p_cash_session_id
    FROM public.financial_transactions WHERE id=v_financial RETURNING id INTO v_payment;
   PERFORM set_config('app.pdv_treasury_custody_delta','',true);
   IF v_cash AND p_cash_session_id IS NOT NULL THEN
     INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
       entry_kind,amount,source_type,source_id,financial_transaction_id,metadata,created_by)
     VALUES(v_context.company_id,p_cash_session_id,p_account_id,v_claim.request_id,'cash_payment',-v_money,
       'compra_ordem',(v_purchase->>'ordem_id')::uuid,v_payment,jsonb_build_object('compra_id',v_compra),v_context.user_id)
     RETURNING id INTO v_custody;
   END IF;
 END IF;
 PERFORM public.pdv_recalc_supplier_purchase_v4(v_financial);
 IF public.pdv_party_obligation_open_v2(v_financial)<>0 THEN
   RAISE EXCEPTION 'Os pagamentos não quitaram a compra.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_total_invalid';
 END IF;
 v_result:=v_purchase||jsonb_build_object('supplier_credit_entry_id',v_entry,'supplier_credit_amount',v_credit,
   'monetary_amount',v_money,'monetary_transaction_id',v_payment,'cash_custody_entry_id',v_custody,
   'paid_with_supplier_credit',true,'idempotent',false,'cash_session_id',p_cash_session_id,'terminal_id',p_terminal_id);
 PERFORM public.pdv_complete_operation_request(v_claim.request_id,'direct_purchase',v_compra,v_result);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_register_direct_purchase_mixed_v4(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,numeric,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_register_direct_purchase_mixed_v4(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,numeric,text,date,text,text) TO authenticated,service_role;
-- Clientes antigos continuam chamando v3 para saldo integral. Apenas operações
-- novas passam a representar o principal sem uma conta monetária; um replay
-- concluído retorna antes deste trecho e não reclassifica o histórico.
DO $legacy_full_credit$
DECLARE v_src text; v_old text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_register_direct_purchase_supplier_credit_v3(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,text,text)'::regprocedure) INTO v_src;
 v_old:='  INSERT INTO public.pdv_party_credit_entries(';
 IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Compra com saldo integral mudou'; END IF;
 v_src:=replace(v_src,v_old,$patch$  -- PDV_FULL_SUPPLIER_CREDIT_NON_MONETARY_V4
  UPDATE public.financial_transactions SET account_id=NULL,pdv_financial_role='pdv_supplier_obligation',
    pdv_settlement_group_id=v_claim.request_id,pdv_cash_session_id=p_cash_session_id
   WHERE id=v_financial;
$patch$||v_old);
 EXECUTE v_src;
END $legacy_full_credit$;

-- A saída monetária e sua custódia são o mesmo fato. O delta vem de uma
-- obrigação/compra/request persistidos, não de uma configuração da sessão SQL.
DO $supplier_treasury$
DECLARE v_src text; v_old text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_guard_financial_treasury_v2()'::regprocedure) INTO v_src;
 v_old:='    v_balance := round(v_balance - v_old_effect + v_new_effect, 2);';
 IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Guard de tesouraria mudou'; END IF;
 v_src:=replace(v_src,v_old,$patch$    -- PDV_SUPPLIER_PURCHASE_CUSTODY_SOURCE_V4
    IF TG_OP='INSERT' AND NEW.pdv_financial_role='pdv_supplier_payment'
      AND NEW.payment_method='dinheiro' AND NEW.pdv_cash_session_id IS NOT NULL THEN
      IF NEW.transaction_type<>'saida' OR NEW.is_paid IS DISTINCT FROM TRUE
        OR NEW.cancelled_at IS NOT NULL OR NEW.account_id IS DISTINCT FROM v_account_id
        OR NOT EXISTS(
          SELECT 1 FROM public.financial_transactions parent
          JOIN public.compra_ordens oc ON oc.financial_transaction_id=parent.id AND oc.company_id=parent.company_id
          JOIN public.compras purchase ON purchase.id=oc.compra_id AND purchase.company_id=oc.company_id
          JOIN public.pdv_operation_requests request ON request.id=NEW.pdv_settlement_group_id AND request.company_id=parent.company_id
          JOIN public.pdv_cash_sessions session ON session.id=purchase.cash_session_id AND session.company_id=purchase.company_id
          WHERE parent.id=NEW.parent_transaction_id AND parent.company_id=NEW.company_id
            AND parent.pdv_financial_role='pdv_supplier_obligation' AND parent.pdv_settlement_group_id=request.id
            AND NEW.amount=parent.amount-parent.amount_received AND NEW.supplier_id IS NOT DISTINCT FROM parent.supplier_id
            AND purchase.flow_type='compra_direta' AND purchase.client_request_id::text=request.idempotency_key
            AND purchase.cash_session_id=NEW.pdv_cash_session_id AND purchase.terminal_id=session.terminal_id
            AND session.cash_account_id=NEW.account_id AND session.status='aberta' AND session.contract_version=2
            AND public.pdv_current_actor_can_access_session_v3(session.id) IS TRUE
            AND request.operation_type='purchase.supplier_credit.v4' AND request.status='pending'
            AND request.created_by=auth.uid() AND NEW.created_by=request.created_by
        ) THEN
        RAISE EXCEPTION 'O pagamento não corresponde à origem da compra.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_invalid';
      END IF;
      v_planned_custody_delta:=-NEW.amount;
    END IF;
$patch$||v_old);
 EXECUTE v_src;
END $supplier_treasury$;

CREATE OR REPLACE FUNCTION public.pdv_assert_supplier_purchase_cash_pair_v4()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_count integer;
BEGIN
 IF NEW.pdv_financial_role IS DISTINCT FROM 'pdv_supplier_payment'
   OR NEW.payment_method IS DISTINCT FROM 'dinheiro' OR NEW.pdv_cash_session_id IS NULL THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_count FROM public.pdv_cash_custody_entries e
   JOIN public.compra_ordens oc ON oc.id=e.source_id AND oc.company_id=e.company_id
   JOIN public.compras purchase ON purchase.id=oc.compra_id AND purchase.company_id=oc.company_id
   JOIN public.pdv_operation_requests request ON request.id=e.operation_request_id AND request.company_id=e.company_id
   WHERE e.financial_transaction_id=NEW.id AND e.company_id=NEW.company_id
     AND e.entry_kind='cash_payment' AND e.amount=-NEW.amount AND e.cash_account_id=NEW.account_id
     AND e.session_id=NEW.pdv_cash_session_id AND e.operation_request_id=NEW.pdv_settlement_group_id
     AND e.source_type='compra_ordem' AND oc.financial_transaction_id=NEW.parent_transaction_id
     AND purchase.cash_session_id=e.session_id AND purchase.client_request_id::text=request.idempotency_key
     AND request.operation_type='purchase.supplier_credit.v4' AND request.status='completed'
     AND request.resource_id=purchase.id AND request.resource_type='direct_purchase';
 IF v_count<>1 THEN
   RAISE EXCEPTION 'O pagamento não possui a saída correspondente no caixa.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_invalid';
 END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_supplier_purchase_cash_pair_v4() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER pdv_supplier_purchase_cash_pair_v4 AFTER INSERT ON public.financial_transactions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_supplier_purchase_cash_pair_v4();
COMMIT;
