-- Contrato de segurança dos pagamentos por saldo/voucher/adiantamento.
-- Os cenários monetários puros (centavos e vencimentos) ficam no Vitest;
-- aqui garantimos que as RPCs aplicadas preservam as travas no servidor.
BEGIN;

DO $test$
DECLARE v_direct text; v_counter text; v_purchase text;
BEGIN
  SELECT pg_get_functiondef(
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
  ) INTO v_direct;
  SELECT pg_get_functiondef(
    'public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_counter;
  SELECT pg_get_functiondef(
    'public.pdv_register_direct_purchase_supplier_credit_v3(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,text,text)'::regprocedure
  ) INTO v_purchase;

  IF position('voucher.company_id=v_company' in v_direct)=0
     OR position('v_voucher.customer_id IS DISTINCT FROM p_customer_id' in v_direct)=0
     OR position('pdv_direct_sale_voucher_invalid' in v_direct)=0 THEN
    RAISE EXCEPTION 'Venda direta não bloqueia voucher de outro cliente/tenant.';
  END IF;
  IF position('voucher.company_id=v_context.company_id' in v_counter)=0
     OR position('v_voucher.customer_id IS DISTINCT FROM v_order.customer_id' in v_counter)=0
     OR position('pdv_counter_voucher_invalid' in v_counter)=0 THEN
    RAISE EXCEPTION 'Pedido de balcão não bloqueia voucher de outro cliente/tenant.';
  END IF;
  IF position('pdv_direct_sale_customer_balance_insufficient' in v_direct)=0
     OR position('pdv_counter_customer_balance_insufficient' in v_counter)=0
     OR position('pdv_supplier_credit_insufficient' in v_purchase)=0 THEN
    RAISE EXCEPTION 'Uma das coberturas não recalcula saldo insuficiente no servidor.';
  END IF;
  IF position('PDV_DIRECT_STORED_VALUE_CUSTOMER_LOCK_V3' in v_direct)=0
     OR position('customer.id=p_customer_id AND customer.company_id=v_company' in v_direct)=0
     OR position('customer.is_deleted IS FALSE FOR UPDATE' in v_direct)=0
     OR position('customer.is_deleted IS FALSE FOR UPDATE' in v_direct)>
        position('pdv_party_available_credit_v2(v_company,''customer'',p_customer_id)<v_amount' in v_direct) THEN
    RAISE EXCEPTION 'Venda direta consulta saldo antes de travar o cliente/tenant.';
  END IF;
  IF position('count(*) > 1 AND payment->>''method'' <> ''fiado''' in v_direct)=0
     OR position('count(*)>1 AND payment->>''method''<>''fiado''' in v_counter)=0 THEN
    RAISE EXCEPTION 'Fiado parcelado não permite vários vencimentos.';
  END IF;
  IF position('pdv_claim_operation_request' in v_direct)=0
     OR position('pdv_claim_operation_request' in v_counter)=0
     OR position('pdv_claim_operation_request' in v_purchase)=0
     OR position('is_replay' in v_direct)=0
     OR position('is_replay' in v_counter)=0
     OR position('is_replay' in v_purchase)=0 THEN
    RAISE EXCEPTION 'Retry idempotente ausente em uma das coberturas.';
  END IF;
END $test$;

ROLLBACK;
