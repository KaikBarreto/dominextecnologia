-- Resumo do caixa do PDV desconta venda cancelada / estorno
-- ----------------------------------------------------------------------------
-- Por quê: em pdv_cash_session_projection_v3, "Recebimentos em dinheiro"
-- (cash_receipts) somava só entry_kind='cash_receipt'; o estorno de uma venda
-- cancelada entra como entry_kind='reversal' (valor negativo, reversal_of_id
-- apontando o recebimento) e não caía em nenhum balde. A gaveta (position)
-- ficava certa, mas o resumo mostrava o dinheiro da venda cancelada.
--
-- Agora o estorno cujo original está no MESMO caixa cai no balde do original
-- (recebimento, pagamento, suprimento, sangria, devolução, abertura) e o anula.
-- position, expected_amount, counted_amount, difference e as chaves do jsonb
-- não mudam. Estorno de lançamento de outro caixa continua fora dos baldes
-- (o original foi contado no caixa dele).
-- Recriada a partir da definição viva (mesma assinatura, STABLE SECURITY
-- DEFINER, search_path e grants).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cash_session_projection_v3(p_session_id uuid, p_report boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_session public.pdv_cash_sessions%ROWTYPE; v_terminal text; v_operator text; v_closed_by text;
  v_position numeric:=0; v_opening numeric:=0; v_receipts numeric:=0; v_payments numeric:=0;
  v_supplies numeric:=0; v_withdrawals numeric:=0; v_refunds numeric:=0; v_entries jsonb:='[]'::jsonb;
BEGIN
  v_session:=public.pdv_assert_cash_session_actor_v3(p_session_id,NULL,false,p_report);
  IF p_report AND v_session.status<>'fechada' THEN
    RAISE EXCEPTION 'Caixa fechado não encontrado.' USING ERRCODE='P0002',DETAIL='PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  SELECT t.name,COALESCE(NULLIF(btrim(o.full_name),''),NULLIF(btrim(o.email),''),'Operador'),
    COALESCE(NULLIF(btrim(c.full_name),''),NULLIF(btrim(c.email),''),'Operador')
    INTO v_terminal,v_operator,v_closed_by
    FROM public.pdv_terminals t
    LEFT JOIN public.profiles o ON o.user_id=v_session.opened_by AND o.company_id=v_session.company_id
    LEFT JOIN public.profiles c ON c.user_id=v_session.closed_by AND c.company_id=v_session.company_id
    WHERE t.id=v_session.terminal_id AND t.company_id=v_session.company_id;
  -- Estorno (entry_kind='reversal') cujo lançamento original está NESTE caixa
  -- entra no mesmo balde do original e o anula: venda em dinheiro cancelada
  -- não aparece em "recebimentos em dinheiro". A posição (soma de tudo) não
  -- muda. Estorno de lançamento de outro caixa segue fora dos baldes.
  SELECT round(COALESCE(sum(e.amount),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='opening'),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='cash_receipt'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='cash_payment'),0)),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='supply'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='withdrawal'),0)),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE COALESCE(o.entry_kind,e.entry_kind)='refund'),0)),2)
    INTO v_position,v_opening,v_receipts,v_payments,v_supplies,v_withdrawals,v_refunds
    FROM public.pdv_cash_custody_entries e
    LEFT JOIN public.pdv_cash_custody_entries o
      ON e.entry_kind='reversal' AND o.id=e.reversal_of_id AND o.company_id=e.company_id
     AND o.session_id=e.session_id AND o.cash_account_id=e.cash_account_id
    WHERE e.company_id=v_session.company_id
      AND e.session_id=v_session.id AND e.cash_account_id=v_session.cash_account_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,
    'amount',round(e.amount,2),'created_at',e.created_at,'created_by',e.created_by,
    'source_type',e.source_type,'source_id',e.source_id,'reversal_of_id',e.reversal_of_id,
    -- Devolução da gaveta por cancelamento de venda não tem lançamento próprio
    -- (o recebimento original é que fica cancelado): descrição, forma, tipo e
    -- pedido vêm da própria linha da gaveta.
    'description',COALESCE(f.description,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'description' END),
    'notes',COALESCE(NULLIF(f.notes,''),NULLIF(e.metadata->>'notes','')),
    'payment_method',COALESCE(f.payment_method,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'payment_method' END),
    'transaction_type',COALESCE(f.transaction_type::text,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'transaction_type' END),
    'order_id',COALESCE(p.order_id,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.source_id END),
    'financial_transaction_id',e.financial_transaction_id)
    ORDER BY CASE WHEN p_report THEN NULL ELSE e.created_at END DESC,e.created_at,e.id),'[]'::jsonb)
    INTO v_entries FROM public.pdv_cash_custody_entries e
    LEFT JOIN public.financial_transactions f ON f.id=e.financial_transaction_id AND f.company_id=e.company_id
    LEFT JOIN LATERAL(
      SELECT payment.order_id
      FROM public.pdv_order_payments payment
      WHERE payment.company_id=e.company_id
        AND (payment.settlement_transaction_id=e.financial_transaction_id
          OR payment.financial_transaction_id=e.financial_transaction_id)
      ORDER BY CASE WHEN payment.settlement_transaction_id=e.financial_transaction_id THEN 0 ELSE 1 END,
        payment.received_at,payment.id
      LIMIT 1
    ) p ON true
    WHERE e.company_id=v_session.company_id AND e.session_id=v_session.id
      AND e.cash_account_id=v_session.cash_account_id;
  IF NOT p_report THEN
    RETURN jsonb_build_object('session_id',v_session.id,'position',v_position,'opening_amount',v_opening,
      'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
      'withdrawals',v_withdrawals,'refunds',v_refunds,'entries',v_entries);
  END IF;
  RETURN jsonb_build_object('session_id',v_session.id,'terminal_name',v_terminal,
    'operator_name',v_operator,'closed_by_name',v_closed_by,'opened_at',v_session.opened_at,
    'closed_at',v_session.closed_at,'cash_account_name',v_session.cash_account_name_snapshot,
    'opening_amount',v_opening,'expected_amount',v_session.expected_amount,
    'counted_amount',v_session.counted_amount,'difference',v_session.difference,
    'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
    'withdrawals',v_withdrawals,'refunds',v_refunds,'final_position',v_position,
    'notes',v_session.notes,'entries',v_entries);
END $function$;
