-- A direção do lançamento é enum; a RPC recebe texto. O cast explícito evita
-- erro de operador em runtime sem alterar o contrato público da função.
BEGIN;

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
   AND t.credit_card_bill_date IS NULL
   AND (CASE WHEN p_context='bill' THEN t.due_date IS NOT NULL ELSE coalesce(t.is_paid,false) END)
  ORDER BY t.transaction_date DESC,t.id LIMIT 2000
 ), valid AS (
  SELECT r.description,r.category,r.customer_id,r.supplier_id,r.cost_center_id,r.used_at,
   CASE WHEN a.id IS NOT NULL THEN a.id END account_id,
   CASE WHEN a.id IS NULL THEN NULL
     WHEN lower(coalesce(r.payment_method,'')) IN ('pix') THEN 'pix'
     WHEN lower(coalesce(r.payment_method,'')) IN ('transfer','transferencia','transferência') THEN 'transferencia'
     WHEN lower(coalesce(r.payment_method,''))='boleto' THEN 'boleto'
     WHEN lower(coalesce(r.payment_method,'')) IN ('check','cheque') THEN 'cheque'
     WHEN lower(coalesce(r.payment_method,'')) IN ('cash','dinheiro') THEN 'dinheiro'
     WHEN lower(coalesce(r.payment_method,'')) IN ('card','cartao_credito','cartão_credito') THEN 'cartao_credito'
     WHEN lower(coalesce(r.payment_method,'')) IN ('debit','cartao_debito','cartão_debito') THEN 'cartao_debito'
   END payment_method,
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

COMMIT;
