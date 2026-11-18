BEGIN;

CREATE OR REPLACE FUNCTION public.update_financial_installment_group(
  p_id uuid,
  p_scope text,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $fn$
DECLARE
  anchor public.financial_transactions%ROWTYPE;
  base_description text;
  due_delta integer := 0;
  updated_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance_transactions_current_user() THEN
    RAISE EXCEPTION 'Seu perfil não permite editar contas.';
  END IF;
  SELECT * INTO anchor FROM public.financial_transactions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR anchor.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;
  IF anchor.installment_group_id IS NULL THEN RAISE EXCEPTION 'Esta conta não pertence a uma série.'; END IF;
  IF p_scope NOT IN ('single','future','all_pending') THEN RAISE EXCEPTION 'Escopo de edição inválido.'; END IF;
  IF coalesce((p_values->>'amount')::numeric,anchor.amount)<=0 THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
  IF p_values ? 'transaction_type' AND p_values->>'transaction_type' NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'Tipo de conta inválido.';
  END IF;
  IF p_values ? 'payment_method' AND nullif(p_values->>'payment_method','') IS NOT NULL
    AND p_values->>'payment_method' NOT IN ('pix','transferencia','boleto','cheque','dinheiro','cartao_debito','cartao_credito') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  base_description:=regexp_replace(
    trim(coalesce(nullif(p_values->>'description',''),anchor.description)),
    '\s*\((?:parcela\s+)?\d+/\d+\)\s*$','','i'
  );
  IF p_values ? 'due_date' AND anchor.due_date IS NOT NULL THEN
    due_delta:=(p_values->>'due_date')::date-anchor.due_date;
  END IF;

  UPDATE public.financial_transactions t SET
    transaction_type=coalesce((p_values->>'transaction_type')::public.transaction_type,t.transaction_type),
    description=base_description||' ('||t.installment_number||'/'||t.installment_total||')',
    amount=coalesce((p_values->>'amount')::numeric,t.amount),
    recurrence_base_amount=CASE WHEN p_scope='single' THEN t.recurrence_base_amount ELSE coalesce((p_values->>'amount')::numeric,t.recurrence_base_amount,t.amount) END,
    category=CASE WHEN p_values ? 'category' THEN nullif(p_values->>'category','') ELSE t.category END,
    notes=CASE WHEN p_values ? 'notes' THEN nullif(trim(p_values->>'notes'),'') ELSE t.notes END,
    customer_id=CASE WHEN p_values ? 'customer_id' THEN nullif(p_values->>'customer_id','')::uuid ELSE t.customer_id END,
    supplier_id=CASE WHEN p_values ? 'supplier_id' THEN nullif(p_values->>'supplier_id','')::uuid ELSE t.supplier_id END,
    contract_id=CASE WHEN p_values ? 'contract_id' THEN nullif(p_values->>'contract_id','')::uuid ELSE t.contract_id END,
    account_id=CASE WHEN p_values ? 'account_id' THEN nullif(p_values->>'account_id','')::uuid ELSE t.account_id END,
    payment_method=CASE WHEN p_values ? 'payment_method' THEN nullif(p_values->>'payment_method','') ELSE t.payment_method END,
    cost_center_id=CASE WHEN p_values ? 'cost_center_id' THEN nullif(p_values->>'cost_center_id','')::uuid ELSE t.cost_center_id END,
    due_date=CASE WHEN p_values ? 'due_date'
      THEN CASE WHEN t.due_date IS NULL THEN (p_values->>'due_date')::date ELSE t.due_date+due_delta END
      ELSE t.due_date END,
    transaction_date=CASE WHEN p_values ? 'due_date' THEN t.transaction_date+due_delta ELSE t.transaction_date END,
    updated_at=now()
  WHERE t.company_id=anchor.company_id
    AND t.installment_group_id=anchor.installment_group_id
    AND coalesce(t.is_paid,false)=false AND coalesce(t.amount_received,0)=0
    AND t.cancelled_at IS NULL AND t.parent_transaction_id IS NULL AND t.payment_group_id IS NULL
    AND (
      (p_scope='single' AND t.id=anchor.id)
      OR (p_scope='future' AND t.installment_number>=anchor.installment_number)
      OR p_scope='all_pending'
    );
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  RETURN jsonb_build_object('updated',updated_count,'group_id',anchor.installment_group_id);
END;$fn$;

REVOKE ALL ON FUNCTION public.update_financial_installment_group(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_financial_installment_group(uuid,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delete_financial_installment_group(p_id uuid,p_scope text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $fn$
DECLARE anchor public.financial_transactions%ROWTYPE; deleted_count integer:=0; skipped_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_delete_finance(auth.uid()) THEN RAISE EXCEPTION 'Seu perfil não permite excluir contas.'; END IF;
  SELECT * INTO anchor FROM public.financial_transactions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR anchor.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF anchor.installment_group_id IS NULL THEN RAISE EXCEPTION 'Esta conta não pertence a uma série.'; END IF;
  IF p_scope NOT IN ('single','future','all_pending') THEN RAISE EXCEPTION 'Escopo de exclusão inválido.'; END IF;

  WITH candidates AS MATERIALIZED (
    SELECT t.* FROM public.financial_transactions t
    WHERE t.company_id=anchor.company_id AND t.installment_group_id=anchor.installment_group_id
      AND ((p_scope='single' AND t.id=anchor.id) OR (p_scope='future' AND t.installment_number>=anchor.installment_number) OR p_scope='all_pending')
  ) SELECT count(*) INTO skipped_count FROM candidates t
  WHERE coalesce(t.is_paid,false) OR coalesce(t.amount_received,0)>0 OR t.cancelled_at IS NOT NULL
    OR t.parent_transaction_id IS NOT NULL OR t.payment_group_id IS NOT NULL OR t.origin<>'geral'
    OR t.bill_id IS NOT NULL OR t.tenant_charge_id IS NOT NULL OR t.contract_id IS NOT NULL
    OR t.service_order_id IS NOT NULL OR t.employee_id IS NOT NULL OR t.payroll_kind IS NOT NULL
    OR t.transfer_pair_id IS NOT NULL OR t.credit_card_bill_date IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.financial_transaction_attachments a WHERE a.transaction_id=t.id)
    OR EXISTS(SELECT 1 FROM public.financial_transactions child WHERE child.parent_transaction_id=t.id);

  DELETE FROM public.financial_transactions t
  WHERE t.company_id=anchor.company_id AND t.installment_group_id=anchor.installment_group_id
    AND ((p_scope='single' AND t.id=anchor.id) OR (p_scope='future' AND t.installment_number>=anchor.installment_number) OR p_scope='all_pending')
    AND coalesce(t.is_paid,false)=false AND coalesce(t.amount_received,0)=0 AND t.cancelled_at IS NULL
    AND t.parent_transaction_id IS NULL AND t.payment_group_id IS NULL AND t.origin='geral'
    AND t.bill_id IS NULL AND t.tenant_charge_id IS NULL AND t.contract_id IS NULL
    AND t.service_order_id IS NULL AND t.employee_id IS NULL AND t.payroll_kind IS NULL
    AND t.transfer_pair_id IS NULL AND t.credit_card_bill_date IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.financial_transaction_attachments a WHERE a.transaction_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM public.financial_transactions child WHERE child.parent_transaction_id=t.id);
  GET DIAGNOSTICS deleted_count=ROW_COUNT;
  RETURN jsonb_build_object('deleted',deleted_count,'skipped',skipped_count,'group_id',anchor.installment_group_id);
END;$fn$;

REVOKE ALL ON FUNCTION public.delete_financial_installment_group(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_financial_installment_group(uuid,text) TO authenticated,service_role;

-- Conta e movimentação passam a compartilhar o mesmo histórico manual. Assim
-- "Enel" lançado como despesa também ensina o formulário de Nova conta.
CREATE OR REPLACE FUNCTION public.suggest_financial_patterns(p_context text,p_direction text,p_prefix text,p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,extensions AS $fn$
DECLARE company uuid:=public.get_user_company_id(auth.uid()); prefix text:=public.normalize_financial_pattern(p_prefix); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR company IS NULL THEN RAISE EXCEPTION 'Acesse sua empresa para consultar sugestões.'; END IF;
 IF p_context IS NULL OR p_direction IS NULL OR p_context NOT IN ('bill','movement') OR p_direction NOT IN ('entrada','saida')
   OR length(regexp_replace(prefix,'[^[:alnum:]]','','g'))<3 OR length(prefix)>240 THEN RETURN '[]'; END IF;
 WITH recent AS MATERIALIZED (
  SELECT t.description,t.category,t.customer_id,t.supplier_id,t.cost_center_id,t.account_id,t.payment_method,t.transaction_date used_at
  FROM public.financial_transactions t
  WHERE t.company_id=company AND t.transaction_type::text=p_direction
   AND t.transaction_date>=current_date-interval '18 months' AND t.transaction_date<=current_date
   AND t.parent_transaction_id IS NULL AND t.cancelled_at IS NULL AND t.transfer_pair_id IS NULL AND t.origin='geral'
   AND t.payroll_kind IS NULL AND t.employee_id IS NULL AND t.bill_id IS NULL AND t.tenant_charge_id IS NULL
   AND t.asaas_payment_id IS NULL AND t.contract_id IS NULL AND t.service_order_id IS NULL
   AND t.credit_card_bill_date IS NULL AND (t.due_date IS NOT NULL OR coalesce(t.is_paid,false))
  ORDER BY t.transaction_date DESC,t.id LIMIT 2000
 ), valid AS (
  SELECT r.description,r.category,r.customer_id,r.supplier_id,r.cost_center_id,r.used_at,
   CASE WHEN a.id IS NOT NULL THEN a.id END account_id,
   CASE WHEN a.id IS NULL THEN NULL WHEN lower(coalesce(r.payment_method,''))='pix' THEN 'pix'
    WHEN lower(coalesce(r.payment_method,'')) IN ('transfer','transferencia','transferência') THEN 'transferencia'
    WHEN lower(coalesce(r.payment_method,''))='boleto' THEN 'boleto' WHEN lower(coalesce(r.payment_method,'')) IN ('check','cheque') THEN 'cheque'
    WHEN lower(coalesce(r.payment_method,'')) IN ('cash','dinheiro') THEN 'dinheiro'
    WHEN lower(coalesce(r.payment_method,'')) IN ('card','cartao_credito','cartão_credito') THEN 'cartao_credito'
    WHEN lower(coalesce(r.payment_method,'')) IN ('debit','cartao_debito','cartão_debito') THEN 'cartao_debito' END payment_method,
   public.normalize_financial_pattern(r.description) normalized,
   CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name||' > '||c.name END category_label,
   coalesce(cu.name,s.name) party_label,cc.name cost_center_label,a.name account_label
  FROM recent r
  LEFT JOIN public.financial_categories c ON c.company_id=company AND c.name=r.category AND c.is_active AND c.type IN(p_direction,'ambos')
  LEFT JOIN public.financial_categories parent ON parent.id=c.parent_id AND parent.company_id=company AND parent.is_active
  LEFT JOIN public.customers cu ON cu.id=r.customer_id AND cu.company_id=company AND NOT coalesce(cu.is_deleted,false) AND cu.deleted_at IS NULL
  LEFT JOIN public.suppliers s ON s.id=r.supplier_id AND s.company_id=company
   AND coalesce((to_jsonb(s)->>'is_active')::boolean,true) AND NOT coalesce((to_jsonb(s)->>'is_deleted')::boolean,false) AND to_jsonb(s)->>'deleted_at' IS NULL
  LEFT JOIN public.cost_centers cc ON cc.id=r.cost_center_id AND cc.company_id=company AND cc.is_active
  LEFT JOIN public.financial_accounts a ON a.id=r.account_id AND a.company_id=company AND a.is_active
  WHERE (r.category IS NULL OR r.category='' OR (c.id IS NOT NULL AND (c.parent_id IS NULL OR parent.id IS NOT NULL)))
   AND (r.customer_id IS NULL OR cu.id IS NOT NULL) AND (r.supplier_id IS NULL OR s.id IS NOT NULL)
   AND (r.cost_center_id IS NULL OR cc.id IS NOT NULL)
   AND (c.id IS NOT NULL OR cu.id IS NOT NULL OR s.id IS NOT NULL OR cc.id IS NOT NULL OR a.id IS NOT NULL)
 ), patterns AS (
  SELECT normalized,category,customer_id,supplier_id,cost_center_id,account_id,payment_method,
   category_label,party_label,cost_center_label,account_label,
   (array_agg(description ORDER BY used_at DESC))[1] description,count(*) uses,max(used_at) last_used
  FROM valid WHERE left(normalized,length(prefix))=prefix
  GROUP BY normalized,category,customer_id,supplier_id,cost_center_id,account_id,payment_method,
   category_label,party_label,cost_center_label,account_label
  HAVING count(*)>=2 OR (normalized=prefix AND max(used_at)>=current_date-interval '60 days')
  ORDER BY count(*) DESC,max(used_at) DESC,normalized LIMIT greatest(1,least(coalesce(p_limit,3),3))
 ) SELECT coalesce(jsonb_agg(to_jsonb(p)-'normalized'),'[]') INTO result FROM patterns p;
 RETURN result;
END;$fn$;

REVOKE ALL ON FUNCTION public.suggest_financial_patterns(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suggest_financial_patterns(text,text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_suggest_financial_patterns(p_context text,p_direction text,p_prefix text,p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $fn$
DECLARE prefix text:=public.normalize_financial_pattern(p_prefix); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'Seu perfil não permite consultar sugestões administrativas.'; END IF;
 IF p_context IS NULL OR p_direction IS NULL OR p_context NOT IN ('bill','movement') OR p_direction NOT IN ('entrada','saida')
   OR length(regexp_replace(prefix,'[^[:alnum:]]','','g'))<3 OR length(prefix)>240 THEN RETURN '[]'; END IF;
 WITH recent AS MATERIALIZED (
  SELECT p.description,p.category_id,p.counterparty,p.bank_account_id,p.due_date::timestamptz used_at
  FROM public.admin_cash_flow_plans p
  WHERE p.direction=CASE WHEN p_direction='entrada' THEN 'credit' ELSE 'debit' END
    AND p.status IN('pending','settled') AND p.due_date BETWEEN current_date-interval '18 months' AND current_date
  UNION ALL
  SELECT t.description,c.id,NULL,NULL::uuid,t.transaction_date
  FROM public.admin_financial_transactions t
  JOIN public.admin_financial_categories c ON c.name=t.category
    AND c.type=CASE WHEN p_direction='entrada' THEN 'income' ELSE 'expense' END
  WHERE t.type=CASE WHEN p_direction='entrada' THEN 'income' ELSE 'expense' END
    AND t.reference_type IS NULL AND t.asaas_transaction_id IS NULL AND NOT t.manual_awaiting_asaas
    AND t.transaction_date BETWEEN current_date-interval '18 months' AND now()
  ORDER BY used_at DESC LIMIT 2000
 ), valid AS (
  SELECT r.description,r.category_id,r.counterparty,r.used_at,public.normalize_financial_pattern(r.description) normalized,
    c.label category_label,CASE WHEN p_context='bill' THEN c.id::text ELSE c.name END category,
    CASE WHEN a.id IS NOT NULL THEN a.id::text END account_id,a.name account_label
  FROM recent r JOIN public.admin_financial_categories c ON c.id=r.category_id
  LEFT JOIN public.admin_bank_accounts a ON a.id=r.bank_account_id AND a.is_active
  WHERE c.is_active AND coalesce(c.affects_result,true)
    AND coalesce((to_jsonb(c)->>'is_manually_selectable')::boolean,true)
    AND c.type=CASE WHEN p_direction='entrada' THEN 'income' ELSE 'expense' END
    AND c.name NOT IN('sale','first_sale','renewal','upgrade')
 ), patterns AS (
  SELECT normalized,category,category_label,counterparty,account_id,account_label,
    (array_agg(description ORDER BY used_at DESC))[1] description,count(*) uses,max(used_at) last_used
  FROM valid WHERE left(normalized,length(prefix))=prefix
  GROUP BY normalized,category,category_label,counterparty,account_id,account_label
  HAVING count(*)>=2 OR (normalized=prefix AND max(used_at)>=now()-interval '60 days')
  ORDER BY count(*) DESC,max(used_at) DESC,normalized LIMIT greatest(1,least(coalesce(p_limit,3),3))
 ) SELECT coalesce(jsonb_agg(to_jsonb(p)-'normalized'),'[]') INTO result FROM patterns p;
 RETURN result;
END;$fn$;

REVOKE ALL ON FUNCTION public.admin_suggest_financial_patterns(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_suggest_financial_patterns(text,text,text,integer) TO authenticated,service_role;

COMMIT;
