-- Pagamentos operacionais do PDV: saldo/voucher na venda, fiado parcelado e
-- adiantamento do fornecedor na compra. Nenhuma dessas coberturas representa
-- dinheiro novo; os livros append-only continuam sendo a fonte canônica.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_get_customer_payment_options_v3(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_customer public.customers%ROWTYPE; v_vouchers jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  SELECT * INTO v_customer FROM public.customers customer
   WHERE customer.id=p_customer_id AND customer.company_id=v_context.company_id
     AND customer.is_deleted IS FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
      USING ERRCODE='P0002',DETAIL='code=pdv_payment_customer_invalid';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',voucher.id,'public_code',voucher.public_code,'balance',balance.amount,
      'expires_on',voucher.expires_on) ORDER BY voucher.expires_on NULLS LAST,voucher.id),'[]'::jsonb)
    INTO v_vouchers
    FROM public.pdv_vouchers voucher
    CROSS JOIN LATERAL (SELECT public.pdv_voucher_balance_internal_v2(voucher.id) amount) balance
   WHERE voucher.company_id=v_context.company_id AND voucher.customer_id=p_customer_id
     AND balance.amount>0
     AND (voucher.expires_on IS NULL OR voucher.expires_on>=public.company_today(v_context.company_id))
     AND public.pdv_has_stock_access_scope_v2(
       v_context.user_id,v_context.company_id,
       p_return_id=>voucher.source_commercial_return_id
     ) IS TRUE;
  RETURN jsonb_build_object(
    'available_credit',public.pdv_party_available_credit_v2(v_context.company_id,'customer',p_customer_id),
    'vouchers',v_vouchers
  );
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_customer_payment_options_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_customer_payment_options_v3(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_supplier_payment_option_v3(p_supplier_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'supplier',p_supplier_id);
  RETURN jsonb_build_object('available_credit',
    public.pdv_party_available_credit_v2(v_context.company_id,'supplier',p_supplier_id));
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_supplier_payment_option_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_supplier_payment_option_v3(uuid) TO authenticated,service_role;

-- Atualiza o pagável também em is_paid/paid_date quando um adiantamento do
-- fornecedor o cobre. amount_received sozinho deixava a ficha e o financeiro
-- discordarem sobre a quitação.
CREATE OR REPLACE FUNCTION public.pdv_recalc_after_party_credit_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_target public.financial_transactions%ROWTYPE; v_total numeric(14,2);
BEGIN
  IF NEW.target_financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.financial_transactions transaction
     WHERE transaction.id=NEW.target_financial_transaction_id FOR UPDATE;
    IF v_target.transaction_type::text='entrada' THEN
      PERFORM public.recalc_amount_received(NEW.target_financial_transaction_id);
      PERFORM public.pdv_sync_party_receivable_payment_v2(NEW.target_financial_transaction_id);
    ELSE
      v_total:=GREATEST(LEAST(v_target.amount,
        COALESCE(v_target.amount_received,0)-NEW.amount),0);
      PERFORM set_config('app.pdv_receivable_recalc',v_target.id::text,true);
      UPDATE public.financial_transactions SET amount_received=v_total,
        is_paid=v_total>=amount,
        paid_date=CASE WHEN v_total>=amount THEN COALESCE(paid_date,NEW.occurred_on) ELSE NULL END
       WHERE id=v_target.id;
      PERFORM set_config('app.pdv_receivable_recalc','',true);
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_register_direct_purchase_supplier_credit_v3(
  p_cash_session_id uuid,p_terminal_id uuid,p_client_request_id uuid,
  p_stock_id uuid,p_supplier_id uuid,p_items jsonb,p_purchase_date date,
  p_account_id uuid,p_category_id uuid,p_description text,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_purchase jsonb; v_financial uuid; v_total numeric(14,2);
  v_claim record; v_entry uuid; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF p_cash_session_id IS NULL AND p_terminal_id IS NOT NULL
     OR p_cash_session_id IS NOT NULL AND p_terminal_id IS NULL THEN
    RAISE EXCEPTION 'O caixa informado está incompleto.'
      USING ERRCODE='22023',DETAIL='code=pdv_supplier_credit_cash_context_invalid';
  END IF;
  IF p_cash_session_id IS NULL THEN
    v_purchase:=public.registrar_compra_material_direta(
      p_client_request_id,p_stock_id,p_supplier_id,p_items,p_purchase_date,p_account_id,
      p_category_id,false,NULL,p_purchase_date,NULL,p_description,p_notes);
  ELSE
    v_purchase:=public.pdv_registrar_compra_material_direta_v2(
      p_cash_session_id,p_terminal_id,p_client_request_id,p_stock_id,p_supplier_id,p_items,
      p_purchase_date,p_account_id,p_category_id,false,NULL,p_purchase_date,NULL,p_description,p_notes);
  END IF;
  v_financial:=NULLIF(v_purchase->>'financial_transaction_id','')::uuid;
  v_total:=NULLIF(v_purchase->>'total_amount','')::numeric;
  IF v_financial IS NULL OR v_total IS NULL OR v_total<=0 THEN
    RAISE EXCEPTION 'A compra não gerou a obrigação esperada.'
      USING ERRCODE='55000',DETAIL='code=pdv_supplier_credit_financial_missing';
  END IF;
  -- A compra base valida estoque, financeiro, fornecedor e a própria chave.
  -- Depois dela, a tentativa de aplicar o adiantamento ganha um request
  -- append-only separado, ainda dentro da mesma transação.
  PERFORM 1 FROM public.suppliers supplier
   WHERE supplier.id=p_supplier_id AND supplier.company_id=v_context.company_id
   ORDER BY supplier.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado nesta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_supplier_credit_supplier_invalid';
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'purchase.supplier_credit.v3',p_client_request_id::text,
    jsonb_build_object('purchase_id',v_purchase->>'compra_id','supplier_id',p_supplier_id,
      'financial_transaction_id',v_financial,'amount',round(v_total,2),'purchase_date',p_purchase_date)
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN
      RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Esta compra ainda está sendo processada.'
      USING ERRCODE='55000',DETAIL='code=pdv_supplier_credit_in_progress';
  END IF;
  IF public.pdv_party_available_credit_v2(
       v_context.company_id,'supplier',p_supplier_id
     )<v_total THEN
    RAISE EXCEPTION 'O saldo do fornecedor não cobre o total desta compra.'
      USING ERRCODE='23514',DETAIL='code=pdv_supplier_credit_insufficient';
  END IF;
  INSERT INTO public.pdv_party_credit_entries(
    company_id,party_type,supplier_id,entry_kind,amount,occurred_on,description,
    target_financial_transaction_id,operation_request_id,created_by
  ) VALUES(
    v_context.company_id,'supplier',p_supplier_id,'application',-v_total,p_purchase_date,
    'Adiantamento aplicado na compra de materiais',v_financial,v_claim.request_id,v_context.user_id
  ) RETURNING id INTO v_entry;
  v_result:=v_purchase||jsonb_build_object(
    'supplier_credit_entry_id',v_entry,'paid_with_supplier_credit',true,'idempotent',false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id,'direct_purchase',(v_purchase->>'compra_id')::uuid,v_result
  );
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_register_direct_purchase_supplier_credit_v3(
  uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,text,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_register_direct_purchase_supplier_credit_v3(
  uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,text,text
) TO authenticated,service_role;

-- A função de venda é extensa e já concentra reservas, caixa, estoque e DRE.
-- O patch abaixo altera somente o contrato de coberturas, preservando todas as
-- travas e escritas canônicas já homologadas.
DO $patch_direct_sale$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_STORED_VALUE_V3' in v_src)=0 THEN
    v_old:='  v_receivable_id uuid;';
    v_new:=v_old||chr(10)||
      '  v_reference_id uuid; -- PDV_STORED_VALUE_V3'||chr(10)||
      '  v_value_entry_id uuid;'||chr(10)||
      '  v_value_balance numeric(14,2);'||chr(10)||
      '  v_voucher public.pdv_vouchers%ROWTYPE;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Declaração da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='''method'',''amount'',''change_amount'',''account_id'',''due_date''';
    v_new:='''method'',''amount'',''change_amount'',''account_id'',''due_date'',''reference_id''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Forma do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='''due_date'', NULLIF(payment->>''due_date'','''')::date';
    v_new:=v_old||','||chr(10)||
      '      ''reference_id'', NULLIF(payment->>''reference_id'','''')::uuid';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Normalização do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='''dinheiro'',''pix'',''transferencia'',''debito'',''credito'',''fiado''';
    v_new:='''dinheiro'',''pix'',''transferencia'',''debito'',''credito'',''fiado'',''saldo_cliente'',''voucher''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Métodos da venda direta mudaram'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='        OR (payment->>''method'' <> ''fiado'' AND payment->>''due_date'' IS NOT NULL)';
    v_new:=v_old||chr(10)||
      '        OR (payment->>''method'' = ''voucher'' AND NULLIF(payment->>''reference_id'','''')::uuid IS NULL)'||chr(10)||
      '        OR (payment->>''method'' <> ''voucher'' AND payment->>''reference_id'' IS NOT NULL)';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Validação do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:=
      '     GROUP BY payment->>''method'''||chr(10)||
      '    HAVING count(*) > 1';
    v_new:=
      '     GROUP BY payment->>''method'''||chr(10)||
      '    HAVING count(*) > 1 AND payment->>''method'' <> ''fiado''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Unicidade do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='  IF EXISTS ('||chr(10)||
      '    SELECT 1 FROM jsonb_array_elements(v_cart) line'||chr(10)||
      '     WHERE NULLIF(line->>''inventory_id'','''')::uuid IS NULL';
    v_new:='  IF jsonb_array_length(v_payments)>30 THEN'||chr(10)||
      '    RAISE EXCEPTION ''Uma venda aceita no máximo 30 parcelas e formas de pagamento.'' USING ERRCODE=''22023'',DETAIL=''code=pdv_direct_sale_payments_limit'';'||chr(10)||
      '  END IF;'||chr(10)||chr(10)||v_old;
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Limite do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    -- Saldo e voucher exigem cliente, mas não reutilizam a permissão de
    -- aprovar fiado: são valores já pertencentes ao cliente.
    v_old:='  IF EXISTS ('||chr(10)||
      '    SELECT 1 FROM jsonb_array_elements(v_payments) payment'||chr(10)||
      '     WHERE payment->>''method'' IN (''pix'',''transferencia'',''debito'',''credito'')';
    v_new:='  -- PDV_DIRECT_STORED_VALUE_CUSTOMER_LOCK_V3'||chr(10)||
      '  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_payments) payment'||chr(10)||
      '    WHERE payment->>''method'' IN (''saldo_cliente'',''voucher'')) THEN'||chr(10)||
      '    IF p_customer_id IS NULL THEN'||chr(10)||
      '      RAISE EXCEPTION ''Selecione um cliente para usar saldo ou voucher.'' USING ERRCODE=''23502'',DETAIL=''code=pdv_payment_customer_invalid'';'||chr(10)||
      '    END IF;'||chr(10)||
      '    SELECT customer.* INTO v_customer FROM public.customers customer'||chr(10)||
      '     WHERE customer.id=p_customer_id AND customer.company_id=v_company'||chr(10)||
      '       AND customer.is_deleted IS FALSE FOR UPDATE;'||chr(10)||
      '    IF NOT FOUND THEN'||chr(10)||
      '      RAISE EXCEPTION ''Cliente não encontrado nesta empresa.'' USING ERRCODE=''42501'',DETAIL=''code=pdv_direct_sale_customer_invalid'';'||chr(10)||
      '    END IF;'||chr(10)||
      '  END IF;'||chr(10)||chr(10)||v_old;
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de cliente da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='           payment->>''method'' IN (''dinheiro'',''pix'',''transferencia'')';
    v_new:='           payment->>''method'' IN (''dinheiro'',''pix'',''transferencia'',''saldo_cliente'',''voucher'')';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Liquidação da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='    v_account_id := NULLIF(v_payment->>''account_id'','''')::uuid;';
    v_new:=v_old||chr(10)||
      '    v_reference_id := NULLIF(v_payment->>''reference_id'','''')::uuid;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Leitura do pagamento da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='    ELSE'||chr(10)||
      '      v_due_date := COALESCE(';
    v_new:='    ELSIF v_method=''voucher'' THEN'||chr(10)||
      '      SELECT * INTO v_voucher FROM public.pdv_vouchers voucher'||chr(10)||
      '       WHERE voucher.id=v_reference_id AND voucher.company_id=v_company FOR UPDATE;'||chr(10)||
      '      v_value_balance:=public.pdv_voucher_balance_internal_v2(v_reference_id);'||chr(10)||
      '      IF v_voucher.id IS NULL OR v_voucher.customer_id IS DISTINCT FROM p_customer_id'||chr(10)||
      '         OR public.pdv_has_stock_access_scope_v2(v_uid,v_company,p_return_id=>v_voucher.source_commercial_return_id) IS DISTINCT FROM true'||chr(10)||
      '         OR (v_voucher.expires_on IS NOT NULL AND v_voucher.expires_on<v_today)'||chr(10)||
      '         OR v_value_balance<v_amount THEN'||chr(10)||
      '        RAISE EXCEPTION ''Voucher inválido, vencido ou sem saldo.'' USING ERRCODE=''23514'',DETAIL=''code=pdv_direct_sale_voucher_invalid'';'||chr(10)||
      '      END IF;'||chr(10)||
      '      INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,'||chr(10)||
      '        operation_request_id,description,created_by)'||chr(10)||
      '      VALUES(v_company,v_reference_id,''redeem'',-v_amount,v_order_id,v_claim.request_id,'||chr(10)||
      '        ''Uso na venda direta do PDV'',v_uid) RETURNING id INTO v_value_entry_id;'||chr(10)||
      '      INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,'||chr(10)||
      '        contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,voucher_entry_id)'||chr(10)||
      '      VALUES(v_company,v_order_id,''voucher'',v_amount,0,v_uid,2,''voucher'',''authorized'',''settled'',now(),now(),v_value_entry_id);'||chr(10)||
      '    ELSIF v_method=''saldo_cliente'' THEN'||chr(10)||
      '      IF public.pdv_party_available_credit_v2(v_company,''customer'',p_customer_id)<v_amount THEN'||chr(10)||
      '        RAISE EXCEPTION ''O saldo disponível do cliente é insuficiente.'' USING ERRCODE=''23514'',DETAIL=''code=pdv_direct_sale_customer_balance_insufficient'';'||chr(10)||
      '      END IF;'||chr(10)||
      '      INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,'||chr(10)||
      '        transaction_date,due_date,is_paid,customer_id,origin,payment_method,created_by,pdv_financial_role,pdv_settlement_group_id)'||chr(10)||
      '      VALUES(v_company,''entrada''::public.transaction_type,''Venda coberta por saldo, pedido PDV nº ''||v_order_number::text,'||chr(10)||
      '        v_amount,''Venda coberta por saldo'',v_transaction_date,v_transaction_date,false,p_customer_id,'||chr(10)||
      '        ''pdv'',''saldo_cliente'',v_uid,''pdv_receivable_principal'',v_claim.request_id) RETURNING id INTO v_receivable_id;'||chr(10)||
      '      INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,occurred_on,'||chr(10)||
      '        description,target_financial_transaction_id,operation_request_id,created_by)'||chr(10)||
      '      VALUES(v_company,''customer'',p_customer_id,''application'',-v_amount,v_transaction_date,'||chr(10)||
      '        ''Saldo usado na venda direta do PDV'',v_receivable_id,v_claim.request_id,v_uid) RETURNING id INTO v_value_entry_id;'||chr(10)||
      '      INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,financial_transaction_id,'||chr(10)||
      '        created_by,contract_version,coverage_kind,coverage_status,settlement_status,receivable_transaction_id,'||chr(10)||
      '        party_credit_entry_id,authorized_at,settled_at)'||chr(10)||
      '      VALUES(v_company,v_order_id,''saldo_cliente'',v_amount,0,NULL,v_uid,2,''customer_credit'',''authorized'',''settled'','||chr(10)||
      '        NULL,v_value_entry_id,now(),now());'||chr(10)||
      '    ELSE'||chr(10)||
      '      v_due_date := COALESCE(';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de cobertura da venda direta mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);
    EXECUTE v_src;
  END IF;
END $patch_direct_sale$;

-- customer_credit vincula a obrigação por party_credit_entry_id -> target_financial_transaction_id.
-- receivable_transaction_id fica NULL: é reservado exclusivamente ao fiado.

-- O pedido de balcão usa um helper base atrás da orquestração de retirada.
-- Alteramos esse helper, sem contornar a entrega/expedição da função pública.
DO $patch_counter_order$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_src;
  IF position('PDV_STORED_VALUE_COUNTER_V3' in v_src)=0 THEN
    v_old:='  v_receivable_id uuid; v_method text; v_amount numeric(14,2); v_due_date date;';
    v_new:='  -- PDV_STORED_VALUE_COUNTER_V3'||chr(10)||v_old||chr(10)||
      '  v_reference_id uuid; v_value_entry_id uuid; v_value_balance numeric(14,2);'||chr(10)||
      '  v_voucher public.pdv_vouchers%ROWTYPE;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Declaração da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='jsonb_array_length(p_payments)>6';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Limite da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,'jsonb_array_length(p_payments)>30');

    v_old:='''method'',''amount'',''account_id'',''due_date''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Forma da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,
      '''method'',''amount'',''account_id'',''due_date'',''reference_id''');

    v_old:='      ''due_date'',NULLIF(payment->>''due_date'','''')::date';
    v_new:=v_old||','||chr(10)||
      '      ''reference_id'',NULLIF(payment->>''reference_id'','''')::uuid';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Normalização da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='''dinheiro'',''pix'',''transferencia'',''debito'',''credito'',''fiado''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Métodos da cobertura de pedido mudaram'; END IF;
    v_src:=replace(v_src,v_old,
      '''dinheiro'',''pix'',''transferencia'',''debito'',''credito'',''fiado'',''saldo_cliente'',''voucher''');

    v_old:='        OR (payment->>''method''<>''fiado'' AND payment->>''due_date'' IS NOT NULL)';
    v_new:=v_old||chr(10)||
      '        OR (payment->>''method''=''voucher'' AND NULLIF(payment->>''reference_id'','''')::uuid IS NULL)'||chr(10)||
      '        OR (payment->>''method''<>''voucher'' AND payment->>''reference_id'' IS NOT NULL)';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Validação da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='    GROUP BY payment->>''method'' HAVING count(*)>1';
    v_new:='    GROUP BY payment->>''method'' HAVING count(*)>1 AND payment->>''method''<>''fiado''';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Unicidade da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    -- Trava o cadastro do cliente antes de consultar qualquer saldo. Isso
    -- serializa duas tentativas concorrentes e impede gasto duplo.
    v_old:='  IF v_fiado_total>0 THEN';
    v_new:='  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payments) payment'||chr(10)||
      '    WHERE payment->>''method'' IN(''saldo_cliente'',''voucher'')) THEN'||chr(10)||
      '    IF v_order.customer_id IS NULL THEN'||chr(10)||
      '      RAISE EXCEPTION ''Selecione um cliente para usar saldo ou voucher.'' USING ERRCODE=''23502'',DETAIL=''code=pdv_counter_stored_value_customer_required'';'||chr(10)||
      '    END IF;'||chr(10)||
      '    SELECT customer.* INTO v_customer FROM public.customers customer'||chr(10)||
      '     WHERE customer.id=v_order.customer_id AND customer.company_id=v_context.company_id'||chr(10)||
      '       AND customer.is_deleted IS FALSE FOR UPDATE;'||chr(10)||
      '    IF NOT FOUND THEN RAISE EXCEPTION ''Cliente não encontrado nesta empresa.'' USING ERRCODE=''42501'',DETAIL=''code=pdv_counter_customer_invalid''; END IF;'||chr(10)||
      '  END IF;'||chr(10)||chr(10)||v_old;
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do cliente do pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='    v_account_id:=NULLIF(v_payment->>''account_id'','''')::uuid;';
    v_new:=v_old||chr(10)||
      '    v_reference_id:=NULLIF(v_payment->>''reference_id'','''')::uuid;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Leitura da cobertura de pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    v_old:='    ELSE'||chr(10)||
      '      v_due_date:=COALESCE(';
    v_new:='    ELSIF v_method=''voucher'' THEN'||chr(10)||
      '      SELECT * INTO v_voucher FROM public.pdv_vouchers voucher'||chr(10)||
      '       WHERE voucher.id=v_reference_id AND voucher.company_id=v_context.company_id FOR UPDATE;'||chr(10)||
      '      v_value_balance:=public.pdv_voucher_balance_internal_v2(v_reference_id);'||chr(10)||
      '      IF v_voucher.id IS NULL OR v_voucher.customer_id IS DISTINCT FROM v_order.customer_id'||chr(10)||
      '         OR public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,p_return_id=>v_voucher.source_commercial_return_id) IS DISTINCT FROM true'||chr(10)||
      '         OR (v_voucher.expires_on IS NOT NULL AND v_voucher.expires_on<v_today)'||chr(10)||
      '         OR v_value_balance<v_amount THEN'||chr(10)||
      '        RAISE EXCEPTION ''Voucher inválido, vencido ou sem saldo.'' USING ERRCODE=''23514'',DETAIL=''code=pdv_counter_voucher_invalid'';'||chr(10)||
      '      END IF;'||chr(10)||
      '      INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,'||chr(10)||
      '        operation_request_id,description,created_by)'||chr(10)||
      '      VALUES(v_context.company_id,v_reference_id,''redeem'',-v_amount,v_order.id,v_claim.request_id,'||chr(10)||
      '        ''Uso no pedido de balcão do PDV'',v_context.user_id) RETURNING id INTO v_value_entry_id;'||chr(10)||
      '      INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,'||chr(10)||
      '        contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,voucher_entry_id)'||chr(10)||
      '      VALUES(v_context.company_id,v_order.id,''voucher'',v_amount,0,v_context.user_id,2,''voucher'','||chr(10)||
      '        ''authorized'',''settled'',now(),now(),v_value_entry_id);'||chr(10)||
      '    ELSIF v_method=''saldo_cliente'' THEN'||chr(10)||
      '      IF public.pdv_party_available_credit_v2(v_context.company_id,''customer'',v_order.customer_id)<v_amount THEN'||chr(10)||
      '        RAISE EXCEPTION ''O saldo disponível do cliente é insuficiente.'' USING ERRCODE=''23514'',DETAIL=''code=pdv_counter_customer_balance_insufficient'';'||chr(10)||
      '      END IF;'||chr(10)||
      '      INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,'||chr(10)||
      '        transaction_date,due_date,is_paid,customer_id,origin,payment_method,created_by,pdv_financial_role,pdv_settlement_group_id)'||chr(10)||
      '      VALUES(v_context.company_id,''entrada''::public.transaction_type,''Pedido PDV coberto por saldo nº ''||v_order.number::text,'||chr(10)||
      '        v_amount,''Venda coberta por saldo'',v_today,v_today,false,v_order.customer_id,''pdv'',''saldo_cliente'','||chr(10)||
      '        v_context.user_id,''pdv_receivable_principal'',v_claim.request_id) RETURNING id INTO v_receivable_id;'||chr(10)||
      '      INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,occurred_on,'||chr(10)||
      '        description,target_financial_transaction_id,operation_request_id,created_by)'||chr(10)||
      '      VALUES(v_context.company_id,''customer'',v_order.customer_id,''application'',-v_amount,v_today,'||chr(10)||
      '        ''Saldo usado no pedido de balcão do PDV'',v_receivable_id,v_claim.request_id,v_context.user_id)'||chr(10)||
      '      RETURNING id INTO v_value_entry_id;'||chr(10)||
      '      INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,'||chr(10)||
      '        contract_version,coverage_kind,coverage_status,settlement_status,receivable_transaction_id,'||chr(10)||
      '        party_credit_entry_id,authorized_at,settled_at)'||chr(10)||
      '      VALUES(v_context.company_id,v_order.id,''saldo_cliente'',v_amount,0,v_context.user_id,2,''customer_credit'','||chr(10)||
      '        ''authorized'',''settled'',NULL,v_value_entry_id,now(),now());'||chr(10)||
      '    ELSE'||chr(10)||
      '      v_due_date:=COALESCE(';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora financeira do pedido mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);

    EXECUTE v_src;
  END IF;
END $patch_counter_order$;

COMMIT;
;
