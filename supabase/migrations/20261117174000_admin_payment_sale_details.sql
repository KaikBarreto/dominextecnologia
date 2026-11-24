-- Detalhes comerciais e financeiros comprovaveis de uma primeira venda.
-- A composicao da assinatura continua vindo do snapshot imutavel; esta camada
-- apenas cruza livros historicos existentes, sob demanda, ao abrir o pagamento.

BEGIN;

CREATE INDEX IF NOT EXISTS admin_payment_sale_financial_lookup_idx
  ON public.admin_financial_transactions (reference_id, transaction_date, amount)
  WHERE reference_type = 'company_payment' AND category = 'sale';

CREATE OR REPLACE FUNCTION public.build_admin_payment_sale_detail(
  p_company_id uuid,
  p_payment_source text,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cp public.company_payments%ROWTYPE;
  v_sp public.subscription_payments%ROWTYPE;
  v_company_payment_id uuid;
  v_asaas_payment_id text;
  v_amount numeric;
  v_payment_date timestamptz;
  v_payment jsonb;
  v_commercial jsonb;
  v_commercial_quality text := 'none';
  v_all_candidates integer := 0;
  v_affiliate jsonb;
  v_financial jsonb;
  v_financial_quality text := 'none';
  v_exact_financial_candidates integer := 0;
  v_legacy_financial_candidates integer := 0;
  v_processor jsonb;
BEGIN
  IF p_payment_source = 'manual' THEN
    SELECT * INTO v_cp
      FROM public.company_payments cp
     WHERE cp.id = p_payment_id AND cp.company_id = p_company_id;

    IF NOT FOUND OR v_cp.type <> 'primeira_venda' THEN
      RETURN NULL;
    END IF;

    v_company_payment_id := v_cp.id;
    v_asaas_payment_id := v_cp.asaas_payment_id;
    v_amount := v_cp.amount;
    v_payment_date := v_cp.payment_date;
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id', v_cp.id,
      'source', 'manual',
      'type', v_cp.type,
      'amount', v_cp.amount,
      'payment_date', v_cp.payment_date,
      'created_at', v_cp.created_at,
      'payment_method', v_cp.payment_method,
      'origin', v_cp.origin,
      'notes', v_cp.notes,
      'asaas_payment_id', v_cp.asaas_payment_id,
      'registered_by', CASE WHEN creator.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', v_cp.created_by, 'name', creator.full_name) END
    ))
      INTO v_payment
      FROM (SELECT 1) seed
      LEFT JOIN public.profiles creator ON creator.user_id = v_cp.created_by;
  ELSIF p_payment_source = 'asaas' THEN
    SELECT * INTO v_sp
      FROM public.subscription_payments sp
     WHERE sp.id = p_payment_id AND sp.company_id = p_company_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    SELECT * INTO v_cp
      FROM public.company_payments cp
     WHERE cp.company_id = p_company_id
       AND cp.asaas_payment_id = v_sp.asaas_payment_id
     ORDER BY cp.payment_date DESC
     LIMIT 1;

    IF lower(COALESCE(v_sp.type, '')) NOT IN ('sale', 'venda', 'primeira_venda', 'first_sale')
       AND COALESCE(v_cp.type, '') <> 'primeira_venda' THEN
      RETURN NULL;
    END IF;

    v_company_payment_id := v_cp.id;
    v_asaas_payment_id := v_sp.asaas_payment_id;
    v_amount := v_sp.amount;
    v_payment_date := COALESCE(v_sp.paid_at, v_sp.due_date::timestamptz, v_sp.created_at);
    v_payment := jsonb_strip_nulls(jsonb_build_object(
      'id', v_sp.id,
      'source', 'asaas',
      'type', COALESCE(v_sp.type, v_cp.type),
      'amount', v_sp.amount,
      'payment_date', v_payment_date,
      'created_at', v_sp.created_at,
      'payment_method', COALESCE(v_sp.payment_method, v_sp.billing_type),
      'asaas_payment_id', v_sp.asaas_payment_id,
      'status', v_sp.status,
      'billing_cycle', v_sp.billing_cycle,
      'due_date', v_sp.due_date,
      'paid_at', v_sp.paid_at,
      'invoice_url', v_sp.invoice_url,
      'fiscal', jsonb_strip_nulls(jsonb_build_object(
        'status', v_sp.nfse_status,
        'number', v_sp.nfse_number,
        'invoice_id', v_sp.nfse_invoice_id,
        'pdf_url', v_sp.nfse_pdf_url,
        'xml_url', v_sp.nfse_xml_url,
        'error', v_sp.nfse_error,
        'requested_at', v_sp.nfse_requested_at
      ))
    ));
  ELSE
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_all_candidates
    FROM public.salesperson_sales ss
   WHERE ss.company_id = p_company_id;

  IF v_all_candidates = 1 THEN
    v_commercial_quality := 'unique_company_sale';
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', ss.id,
             'seller', jsonb_build_object('id', seller.id, 'name', seller.name),
             'sdr', CASE WHEN sdr.id IS NULL THEN NULL ELSE
               jsonb_build_object('id', sdr.id, 'name', sdr.name) END,
             'customer_name', ss.customer_name,
             'customer_company', ss.customer_company,
             'customer_origin', ss.customer_origin,
             'commission_base', ss.amount,
             'paid_amount', ss.paid_amount,
             'commission_amount', ss.commission_amount,
             'seller_commission', ss.closer_commission,
             'sdr_commission', ss.sdr_commission,
             'billing_cycle', ss.billing_cycle,
             'status', ss.status,
             'released_at', ss.released_at,
             'notes', ss.notes,
             'created_at', ss.created_at,
             'registered_by', CASE WHEN creator.id IS NULL THEN NULL ELSE
               jsonb_build_object('id', ss.created_by, 'name', creator.full_name) END
           ))
      INTO v_commercial
      FROM public.salesperson_sales ss
      JOIN public.salespeople seller ON seller.id = ss.salesperson_id
      LEFT JOIN public.salespeople sdr ON sdr.id = ss.sdr_id
      LEFT JOIN public.profiles creator ON creator.user_id = ss.created_by
     WHERE ss.company_id = p_company_id
     LIMIT 1;
  ELSIF v_all_candidates > 1 THEN
    v_commercial_quality := 'ambiguous';
  END IF;

  IF v_company_payment_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', ac.id,
             'affiliate', jsonb_build_object('id', a.id, 'name', a.name),
             'kind', ac.kind,
             'base_amount', ac.base_amount,
             'pct_applied', ac.pct_applied,
             'commission_amount', ac.commission_amount,
             'reference_month', ac.reference_month,
             'status', ac.status,
             'affiliate_payment_id', ac.affiliate_payment_id,
             'created_at', ac.created_at
           ))
      INTO v_affiliate
      FROM public.affiliate_commissions ac
      JOIN public.affiliates a ON a.id = ac.affiliate_id
     WHERE ac.company_payment_id = v_company_payment_id
     LIMIT 1;
  END IF;

  SELECT count(*) INTO v_exact_financial_candidates
    FROM public.admin_financial_transactions ft
   WHERE ft.category = 'sale'
     AND ft.type = 'income'
     AND (
       (v_asaas_payment_id IS NOT NULL AND ft.asaas_transaction_id = v_asaas_payment_id)
       OR (v_company_payment_id IS NOT NULL AND ft.reference_type = 'company_payment'
           AND ft.reference_id = v_company_payment_id)
     );

  IF v_exact_financial_candidates > 0 THEN
    v_financial_quality := 'exact_reference';
  ELSE
    SELECT count(*) INTO v_legacy_financial_candidates
      FROM public.admin_financial_transactions ft
     WHERE ft.category = 'sale'
       AND ft.type = 'income'
       AND ft.reference_type = 'company_payment'
       AND ft.reference_id = p_company_id
       AND abs(ft.amount - v_amount) <= 0.01
       AND ft.transaction_date::date = v_payment_date::date;

    IF v_legacy_financial_candidates = 1 THEN
      v_financial_quality := 'legacy_unique_date_amount';
    ELSIF v_legacy_financial_candidates > 1 THEN
      v_financial_quality := 'ambiguous';
    END IF;
  END IF;

  IF v_financial_quality IN ('exact_reference', 'legacy_unique_date_amount') THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', ft.id,
             'type', ft.type,
             'category', ft.category,
             'amount', ft.amount,
             'description', ft.description,
             'notes', ft.notes,
             'transaction_date', ft.transaction_date,
             'asaas_transaction_id', ft.asaas_transaction_id,
             'created_at', ft.created_at,
             'registered_by', CASE WHEN creator.id IS NULL THEN NULL ELSE
               jsonb_build_object('id', ft.created_by, 'name', creator.full_name) END
           ))
      INTO v_financial
      FROM public.admin_financial_transactions ft
      LEFT JOIN public.profiles creator ON creator.user_id = ft.created_by
     WHERE ft.category = 'sale'
       AND ft.type = 'income'
       AND (
         (v_financial_quality = 'exact_reference' AND (
           (v_asaas_payment_id IS NOT NULL AND ft.asaas_transaction_id = v_asaas_payment_id)
           OR (v_company_payment_id IS NOT NULL AND ft.reference_type = 'company_payment'
               AND ft.reference_id = v_company_payment_id)
         ))
         OR (v_financial_quality = 'legacy_unique_date_amount'
             AND ft.reference_type = 'company_payment'
             AND ft.reference_id = p_company_id
             AND abs(ft.amount - v_amount) <= 0.01
             AND ft.transaction_date::date = v_payment_date::date)
       )
     ORDER BY CASE WHEN ft.asaas_transaction_id = v_asaas_payment_id THEN 0 ELSE 1 END,
              ft.created_at
     LIMIT 1;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
           'id', sp.id,
           'asaas_payment_id', sp.asaas_payment_id,
           'status', sp.status,
           'amount', sp.amount,
           'billing_type', sp.billing_type,
           'billing_cycle', sp.billing_cycle,
           'payment_method', sp.payment_method,
           'due_date', sp.due_date,
           'paid_at', sp.paid_at,
           'invoice_url', sp.invoice_url,
           'created_at', sp.created_at,
           'fiscal', jsonb_strip_nulls(jsonb_build_object(
             'status', sp.nfse_status,
             'number', sp.nfse_number,
             'invoice_id', sp.nfse_invoice_id,
             'pdf_url', sp.nfse_pdf_url,
             'xml_url', sp.nfse_xml_url,
             'error', sp.nfse_error,
             'requested_at', sp.nfse_requested_at
           ))
         ))
    INTO v_processor
    FROM public.subscription_payments sp
   WHERE sp.company_id = p_company_id
     AND (
       (p_payment_source = 'asaas' AND sp.id = p_payment_id)
       OR (v_asaas_payment_id IS NOT NULL AND sp.asaas_payment_id = v_asaas_payment_id)
     )
   ORDER BY CASE WHEN sp.id = p_payment_id THEN 0 ELSE 1 END, sp.created_at DESC
   LIMIT 1;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'is_sale', true,
    'payment', v_payment,
    'commercial_match_quality', v_commercial_quality,
    'commercial_candidate_count', v_all_candidates,
    'commercial', v_commercial,
    'affiliate_commission', v_affiliate,
    'financial_match_quality', v_financial_quality,
    'financial_transaction', v_financial,
    'processor', v_processor
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.build_admin_payment_sale_detail(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_payment_detail(
  p_company_id uuid,
  p_payment_source text,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_allowed boolean;
BEGIN
  v_allowed :=
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND c.salesperson_id = public.current_salesperson_id()
    );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payment_source NOT IN ('manual', 'asaas') OR p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_detail_invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
           'payment_source', s.payment_source,
           'payment_id', s.payment_id,
           'company_id', s.company_id,
           'quality', s.quality,
           'captured_at', s.captured_at,
           'snapshot', s.snapshot,
           'sale', public.build_admin_payment_sale_detail(
             p_company_id, p_payment_source, p_payment_id
           )
         )
    INTO v_result
    FROM public.admin_payment_snapshots s
   WHERE s.company_id = p_company_id
     AND s.payment_source = p_payment_source
     AND s.payment_id = p_payment_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'payment_detail_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.build_admin_payment_sale_detail(uuid, text, uuid) IS
  'Reune livros comercial, afiliado, financeiro, Asaas e fiscal de uma primeira venda sem inferir vinculos ambiguos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
