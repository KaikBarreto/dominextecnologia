-- PDV: o relatório de fechamento de caixa passa a listar TODAS as vendas do caixa.
--
-- Por quê: o relatório (pdv_cash_session_report_v2 -> pdv_cash_session_projection_v3
-- com p_report=true) só mostrava os movimentos da gaveta (pdv_cash_custody_entries),
-- ou seja, só dinheiro. Vendas no Pix, cartão, fiado, vale e saldo do cliente nunca
-- apareciam, e uma cliente achou que tinha vendido 3 de 11 vendas no dia.
--
-- O que muda: o ramo de relatório ganha a chave "sales" na raiz do jsonb:
--   { count, total, by_method:[{method,count,amount}], orders:[{number,created_at,status,total,methods}] }
-- - vendas = pdv_orders da mesma empresa e deste caixa, em estado de venda efetivada
--   (pago, liberado_retirada, retirada_parcial, entregue, cancelado_parcial);
--   cancelado, rascunho e aguardando_pagamento ficam fora;
-- - amount por forma = soma de pdv_order_payments.amount (já líquido de troco),
--   ignorando cobertura failed/revoked;
-- - cancelado_parcial (contrato v3) entra pelo LÍQUIDO: total - residual_amount, e de
--   cada pagamento sai o que o financial_plan destinou (abatimento de fiado e
--   vale/crédito/reembolso). Forma que zerou some da venda;
-- - sem UUID dentro de "sales": a venda é identificada só pelo número.
-- Nada mais muda: a trava pdv_assert_cash_session_actor_v3, os baldes da gaveta, as
-- entries e o ramo operacional (p_report=false) seguem byte a byte iguais à definição
-- viva em produção. O ramo operacional não ganha custo (o cálculo está só no RETURN
-- do relatório).
--
-- Retorno continua jsonb: types.ts não precisa ser regenerado.

BEGIN;
SET LOCAL lock_timeout='10s';

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
    'notes',v_session.notes,'entries',v_entries,
    -- Vendas do caixa em TODAS as formas (a gaveta acima só enxerga dinheiro).
    -- Só o ramo de relatório calcula isto; o snapshot operacional não muda.
    -- Sem UUID: a venda é identificada só pelo número.
    'sales',(
      WITH sold AS (
        -- Cancelamento parcial (contrato financeiro v3) não altera total,
        -- itens nem pagamentos: grava o restante não entregue em
        -- residual_amount e, no financial_plan, quanto saiu de cada
        -- pagamento (abatimento de fiado por payment_id e vale, crédito ou
        -- reembolso por original_payment_id). Líquido = bruto - restante.
        SELECT o.id,o.number,o.created_at,o.status,
          round(o.total-CASE WHEN o.status='cancelado_parcial' AND rc.financial_contract_version=3
            THEN COALESCE(rc.residual_amount,0) ELSE 0 END,2) AS total,
          CASE WHEN o.status='cancelado_parcial' AND rc.financial_contract_version=3
            THEN rc.financial_plan END AS plan
        FROM public.pdv_orders o
        LEFT JOIN public.pdv_order_residual_cancellations rc
          ON rc.order_id=o.id AND rc.company_id=o.company_id
        WHERE o.company_id=v_session.company_id AND o.cash_session_id=v_session.id
          AND o.status IN('pago','liberado_retirada','retirada_parcial','entregue','cancelado_parcial')
      ),paid AS (
        -- amount já é líquido de troco (change_amount fica à parte).
        SELECT s.id AS order_id,p.method,round(sum(p.amount-COALESCE(d.amount,0)),2) AS amount
        FROM sold s
        JOIN public.pdv_order_payments p ON p.order_id=s.id AND p.company_id=v_session.company_id
        LEFT JOIN LATERAL(
          SELECT sum((x.value->>'amount')::numeric) AS amount
          FROM jsonb_array_elements(COALESCE(s.plan->'receivable_reductions','[]'::jsonb)
            ||COALESCE(s.plan->'dispositions','[]'::jsonb)) x
          WHERE COALESCE(x.value->>'payment_id',x.value->>'original_payment_id')=p.id::text
        ) d ON true
        WHERE COALESCE(p.coverage_status,'authorized') NOT IN('failed','revoked')
        GROUP BY s.id,p.method
        HAVING round(sum(p.amount-COALESCE(d.amount,0)),2)>0
      )
      SELECT jsonb_build_object(
        'count',(SELECT count(*) FROM sold),
        'total',(SELECT round(COALESCE(sum(sold.total),0),2) FROM sold),
        'by_method',COALESCE((SELECT jsonb_agg(jsonb_build_object('method',m.method,'count',m.n,'amount',m.amount)
            ORDER BY m.amount DESC,m.method)
          FROM(SELECT paid.method,count(DISTINCT paid.order_id) AS n,round(sum(paid.amount),2) AS amount
            FROM paid GROUP BY paid.method) m),'[]'::jsonb),
        'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',s.number,'created_at',s.created_at,
            'status',s.status,'total',s.total,
            'methods',COALESCE((SELECT jsonb_agg(pm.method ORDER BY pm.method) FROM paid pm WHERE pm.order_id=s.id),'[]'::jsonb))
            ORDER BY s.created_at,s.number)
          FROM sold s),'[]'::jsonb))
    ));
END $function$;

-- CREATE OR REPLACE mantém a ACL; reafirmamos que a projeção interna segue fechada
-- (hoje só o dono executa; o acesso do app é via pdv_cash_session_report_v2).
REVOKE ALL ON FUNCTION public.pdv_cash_session_projection_v3(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
