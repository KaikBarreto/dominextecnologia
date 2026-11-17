BEGIN;
-- Histórico recente e limitado: classificação só é aplicada após confirmação.
CREATE OR REPLACE FUNCTION public.normalize_financial_pattern(p_text text)
RETURNS text LANGUAGE sql STABLE SET search_path=public,extensions AS $fn$
 SELECT lower(extensions.unaccent(regexp_replace(trim(coalesce(p_text,'')),'\s+',' ','g')));
$fn$;
REVOKE ALL ON FUNCTION public.normalize_financial_pattern(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.normalize_financial_pattern(text) TO authenticated,service_role;

CREATE INDEX IF NOT EXISTS financial_smart_history_idx ON public.financial_transactions(company_id,transaction_type,transaction_date DESC)
 WHERE parent_transaction_id IS NULL AND cancelled_at IS NULL AND transfer_pair_id IS NULL AND origin='geral';
CREATE INDEX IF NOT EXISTS admin_smart_history_idx ON public.admin_financial_transactions(type,transaction_date DESC)
 WHERE reference_type IS NULL AND asaas_transaction_id IS NULL;

CREATE OR REPLACE FUNCTION public.suggest_financial_patterns(p_context text,p_direction text,p_prefix text,p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,extensions AS $fn$
DECLARE company uuid:=public.get_user_company_id(auth.uid()); prefix text:=public.normalize_financial_pattern(p_prefix); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR company IS NULL THEN RAISE EXCEPTION 'Acesse sua empresa para consultar sugestões.'; END IF;
 IF p_context IS NULL OR p_direction IS NULL OR p_context NOT IN ('bill','movement') OR p_direction NOT IN ('entrada','saida')
   OR length(regexp_replace(prefix,'[^[:alnum:]]','','g'))<3 OR length(prefix)>240 THEN RETURN '[]'; END IF;
 WITH recent AS MATERIALIZED (
  SELECT t.description,t.category,t.customer_id,t.supplier_id,t.cost_center_id,t.transaction_date used_at
  FROM public.financial_transactions t
  WHERE t.company_id=company AND t.transaction_type=p_direction
   AND t.transaction_date>=current_date-interval '18 months' AND t.transaction_date<=current_date
   AND t.parent_transaction_id IS NULL AND t.cancelled_at IS NULL AND t.transfer_pair_id IS NULL AND t.origin='geral'
   AND t.payroll_kind IS NULL AND t.employee_id IS NULL AND t.bill_id IS NULL AND t.tenant_charge_id IS NULL
   AND t.asaas_payment_id IS NULL AND t.contract_id IS NULL AND t.service_order_id IS NULL
   AND t.credit_card_bill_date IS NULL
   AND (CASE WHEN p_context='bill' THEN t.due_date IS NOT NULL ELSE coalesce(t.is_paid,false) END)
  ORDER BY t.transaction_date DESC,t.id LIMIT 2000
 ), valid AS (
  SELECT r.*,public.normalize_financial_pattern(r.description) normalized,
   CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name||' > '||c.name END category_label,
   coalesce(cu.name,s.name) party_label,cc.name cost_center_label
  FROM recent r
  LEFT JOIN public.financial_categories c ON c.company_id=company AND c.name=r.category AND c.is_active AND c.type IN(p_direction,'ambos')
  LEFT JOIN public.financial_categories parent ON parent.id=c.parent_id AND parent.company_id=company AND parent.is_active
  LEFT JOIN public.customers cu ON cu.id=r.customer_id AND cu.company_id=company AND NOT coalesce(cu.is_deleted,false) AND cu.deleted_at IS NULL
  LEFT JOIN public.suppliers s ON s.id=r.supplier_id AND s.company_id=company
   AND coalesce((to_jsonb(s)->>'is_active')::boolean,true) AND NOT coalesce((to_jsonb(s)->>'is_deleted')::boolean,false) AND to_jsonb(s)->>'deleted_at' IS NULL
  LEFT JOIN public.cost_centers cc ON cc.id=r.cost_center_id AND cc.company_id=company AND cc.is_active
  WHERE (r.category IS NULL OR r.category='' OR (c.id IS NOT NULL AND (c.parent_id IS NULL OR parent.id IS NOT NULL)))
   AND (r.customer_id IS NULL OR cu.id IS NOT NULL) AND (r.supplier_id IS NULL OR s.id IS NOT NULL)
   AND (r.cost_center_id IS NULL OR cc.id IS NOT NULL)
   AND (c.id IS NOT NULL OR cu.id IS NOT NULL OR s.id IS NOT NULL OR cc.id IS NOT NULL)
 ), patterns AS (
  SELECT normalized,category,customer_id,supplier_id,cost_center_id,category_label,party_label,cost_center_label,
   (array_agg(description ORDER BY used_at DESC))[1] description,count(*) uses,max(used_at) last_used
  FROM valid WHERE left(normalized,length(prefix))=prefix
  GROUP BY normalized,category,customer_id,supplier_id,cost_center_id,category_label,party_label,cost_center_label
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
  SELECT p.description,p.category_id,p.counterparty,p.due_date::timestamptz used_at FROM public.admin_cash_flow_plans p
   WHERE p_context='bill' AND p.direction=CASE WHEN p_direction='entrada' THEN 'credit' ELSE 'debit' END
    AND p.status IN('pending','settled') AND p.due_date BETWEEN current_date-interval '18 months' AND current_date
  UNION ALL
  SELECT t.description,c.id,NULL,t.transaction_date FROM public.admin_financial_transactions t
   JOIN public.admin_financial_categories c ON c.name=t.category
   WHERE p_context='movement' AND t.type=CASE WHEN p_direction='entrada' THEN 'income' ELSE 'expense' END
    AND t.reference_type IS NULL AND t.asaas_transaction_id IS NULL AND NOT t.manual_awaiting_asaas
    AND t.transaction_date BETWEEN current_date-interval '18 months' AND now()
  ORDER BY used_at DESC LIMIT 2000
 ), valid AS (
  SELECT r.*,public.normalize_financial_pattern(r.description) normalized,c.label category_label,
   CASE WHEN p_context='bill' THEN c.id::text ELSE c.name END category
  FROM recent r JOIN public.admin_financial_categories c ON c.id=r.category_id
  WHERE c.is_active AND coalesce(c.affects_result,true)
   AND coalesce((to_jsonb(c)->>'is_manually_selectable')::boolean,true)
   AND c.type=CASE WHEN p_direction='entrada' THEN 'income' ELSE 'expense' END
   AND c.name NOT IN('sale','first_sale','renewal','upgrade')
 ), patterns AS (
  SELECT normalized,category,category_label,counterparty,
   (array_agg(description ORDER BY used_at DESC))[1] description,count(*) uses,max(used_at) last_used
  FROM valid WHERE left(normalized,length(prefix))=prefix
  GROUP BY normalized,category,category_label,counterparty
  HAVING count(*)>=2 OR (normalized=prefix AND max(used_at)>=now()-interval '60 days')
  ORDER BY count(*) DESC,max(used_at) DESC,normalized LIMIT greatest(1,least(coalesce(p_limit,3),3))
 ) SELECT coalesce(jsonb_agg(to_jsonb(p)-'normalized'),'[]') INTO result FROM patterns p;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_suggest_financial_patterns(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_suggest_financial_patterns(text,text,text,integer) TO authenticated,service_role;
COMMIT;
