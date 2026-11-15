BEGIN;
ALTER TABLE public.admin_financial_transactions ADD COLUMN IF NOT EXISTS manual_request_id uuid;
ALTER TABLE public.admin_financial_transactions ADD COLUMN IF NOT EXISTS manual_awaiting_asaas boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS admin_financial_manual_request_unique ON public.admin_financial_transactions(manual_request_id) WHERE manual_request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.admin_create_financial_movement(p_request_id uuid,p_type text,p_category text,p_amount numeric,p_date timestamptz,p_description text DEFAULT NULL,p_awaiting_asaas boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_id uuid; v_previous public.admin_financial_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_lancamentos')))) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_request_id IS NULL OR p_type NOT IN ('income','expense') OR p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <> round(p_amount,2) OR p_date IS NULL THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  IF p_category IN ('sale','first_sale','renewal','upgrade') THEN RAISE EXCEPTION 'company_payment_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.admin_financial_categories WHERE name=p_category AND type=p_type AND is_active) THEN RAISE EXCEPTION 'invalid_category'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO v_previous FROM public.admin_financial_transactions WHERE manual_request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.manual_awaiting_asaas IS DISTINCT FROM p_awaiting_asaas OR v_previous.created_by IS DISTINCT FROM auth.uid() OR v_previous.type IS DISTINCT FROM p_type OR v_previous.category IS DISTINCT FROM p_category OR v_previous.amount IS DISTINCT FROM p_amount OR v_previous.transaction_date IS DISTINCT FROM p_date OR v_previous.description IS DISTINCT FROM p_description THEN RAISE EXCEPTION 'request_conflict'; END IF;
    RETURN v_previous.id;
  END IF;
  INSERT INTO public.admin_financial_transactions(type,category,amount,transaction_date,description,created_by,manual_request_id,manual_awaiting_asaas)
  VALUES(p_type,p_category,p_amount,p_date,p_description,auth.uid(),p_request_id,p_awaiting_asaas) RETURNING id INTO v_id;

  RETURN v_id;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_create_financial_movement(uuid,text,text,numeric,timestamptz,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_financial_movement(uuid,text,text,numeric,timestamptz,text,boolean) TO authenticated;
COMMIT;
