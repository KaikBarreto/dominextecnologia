-- Amplia somente o DTO residual; nenhum writer, origem ou dado comercial é alterado.
BEGIN;

-- CREATE OR REPLACE mantém owner/ACL do helper privado já publicado em 15130000.
-- Rollback lógico: restaurar definição anterior deste helper; campos novos são opcionais na UI.
CREATE OR REPLACE FUNCTION public.pdv_residual_projection_internal_v3(p_order_id uuid,p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cancellation public.pdv_order_residual_cancellations%ROWTYPE; allocated numeric;
  ctx record; v_admin boolean; v_view boolean; v_confirm boolean; v_reverse_refund boolean; v_reverse_voucher boolean;
BEGIN
  SELECT * INTO cancellation FROM public.pdv_order_residual_cancellations
    WHERE order_id=p_order_id AND company_id=p_company_id AND financial_contract_version=3;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO ctx FROM public.pdv_returns_context_v2(NULL);
  IF ctx.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Você não tem acesso a este pedido.' USING ERRCODE='42501'; END IF;
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,ctx.user_id);
  IF public.pdv_has_stock_access_scope_v2(ctx.user_id,p_company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501'; END IF;
  v_admin:=public.is_admin_or_gestor(ctx.user_id) OR public.is_super_admin(ctx.user_id);
  v_view:=public.pdv_after_sale_v2_enabled_internal(p_company_id) IS TRUE
    AND (v_admin OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:view_pdv_after_sale') IS TRUE);
  -- A leitura de recuperação do cancelamento é mais ampla que o pós-venda.
  -- Sem view, nunca serializar plano, valores ou recursos financeiros.
  IF v_view IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('cancellation_id',cancellation.id,'order_id',p_order_id,
      'source_kind','order_residual_cancellation_v3','source_event_ref','pdv_order_residual_cancellation:'||cancellation.id,
      'reason',cancellation.reason,'occurred_on',cancellation.occurred_on,
      'released_quantity',cancellation.released_quantity,'delivered_quantity',cancellation.delivered_quantity,
      'status',(SELECT orders.status FROM public.pdv_orders orders WHERE orders.id=p_order_id AND orders.company_id=p_company_id),
      'plan_hash',cancellation.financial_plan->>'plan_hash','access_masked',true,
      'residual_amount',NULL,'financial_plan',NULL,'unallocated_amount',NULL,'financial_status',NULL,
      'dispositions','[]'::jsonb,'vouchers','[]'::jsonb,'refunds','[]'::jsonb);
  END IF;
  v_confirm:=v_view AND (v_admin OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:confirm_pdv_refund') IS TRUE);
  v_reverse_refund:=v_view AND (v_admin OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:reverse_pdv_refund') IS TRUE);
  v_reverse_voucher:=v_view AND (v_admin OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:reverse_pdv_after_sale') IS TRUE);
  SELECT COALESCE(sum(amount),0) INTO allocated FROM (
    SELECT amount FROM public.pdv_return_dispositions WHERE residual_cancellation_id=cancellation.id
    UNION ALL SELECT amount FROM public.pdv_return_value_events WHERE residual_cancellation_id=cancellation.id) allocated_values;
  RETURN jsonb_build_object('cancellation_id',cancellation.id,'order_id',p_order_id,'reason',cancellation.reason,
    'source_kind','order_residual_cancellation_v3','source_event_ref','pdv_order_residual_cancellation:'||cancellation.id,
    'access_masked',false,'occurred_on',cancellation.occurred_on,'residual_amount',cancellation.residual_amount,
    'financial_plan',cancellation.financial_plan,'unallocated_amount',cancellation.residual_amount-allocated,
    'financial_status',CASE WHEN cancellation.residual_amount=allocated THEN 'allocated' ELSE 'pending_disposition' END,
    'dispositions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id)
      FROM public.pdv_return_dispositions d WHERE d.residual_cancellation_id=cancellation.id),'[]'),
    -- Fórmulas da projeção comercial canônica, preservadas para a origem residual.
    -- O saldo real não representa elegibilidade de estorno quando houve consumo parcial.
    'vouchers',COALESCE((SELECT jsonb_agg(jsonb_build_object('voucher_id',v.id,'public_code',v.public_code,
      'issued_on',v.issued_on,'issued_amount',issue.amount,'balance',balance.amount,'expires_on',v.expires_on,
      'status',CASE WHEN EXISTS(SELECT 1 FROM public.pdv_voucher_entries reversal WHERE reversal.reversal_of_id=issue.id)
        THEN 'reversed' WHEN balance.amount<=0 THEN 'exhausted'
        WHEN v.expires_on IS NOT NULL AND v.expires_on<public.company_today(p_company_id) THEN 'expired' ELSE 'active' END,
      'can_reverse',v_reverse_voucher AND balance.amount=issue.amount
        AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries reversal WHERE reversal.reversal_of_id=issue.id))
      ORDER BY v.created_at,v.id)
      FROM public.pdv_vouchers v JOIN public.pdv_voucher_entries issue ON issue.voucher_id=v.id AND issue.entry_kind='issue'
      CROSS JOIN LATERAL(SELECT public.pdv_voucher_balance_internal_v2(v.id) amount) balance
      WHERE v.company_id=p_company_id AND v.source_residual_cancellation_id=cancellation.id),'[]'),
    'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object('refund_id',r.id,'method',r.method,'amount',r.amount,
      'requested_on',r.requested_on,'status',state.status,
      'can_confirm',v_confirm AND state.status='pending' AND r.method<>'dinheiro',
      'requires_confirmation_reference',r.method IN('pix','debito','credito'),
      'can_reverse',v_reverse_refund AND state.status='settled' AND (r.method<>'dinheiro' OR EXISTS(
        SELECT 1 FROM public.pdv_refund_events settled
        JOIN public.pdv_cash_custody_entries custody ON custody.id=settled.custody_entry_id
        JOIN public.pdv_cash_sessions session ON session.id=custody.session_id
        WHERE settled.refund_id=r.id AND settled.event_kind='settled' AND session.status='aberta'
          AND public.pdv_current_actor_can_access_session_v3(session.id) IS TRUE)),
      'confirmation_reference_redacted',reference.reference_redacted)
      ORDER BY r.created_at,r.id)
      FROM public.pdv_refunds r CROSS JOIN LATERAL(SELECT CASE
        WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events e WHERE e.refund_id=r.id AND e.event_kind='reversed') THEN 'reversed'
        WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events e WHERE e.refund_id=r.id AND e.event_kind='settled') THEN 'settled' ELSE 'pending' END status) state
      LEFT JOIN public.pdv_refund_confirmation_references reference ON reference.refund_id=r.id
      WHERE r.company_id=p_company_id AND r.residual_cancellation_id=cancellation.id),'[]'));
END $fn$;

COMMIT;
