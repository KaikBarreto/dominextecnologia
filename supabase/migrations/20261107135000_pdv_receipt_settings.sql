-- W2-03: configuracao do comprovante NAO FISCAL do PDV.
-- Nao cria, baixa, estorna ou reimprime fatos financeiros.
BEGIN;

CREATE TABLE public.pdv_receipt_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  default_format text NOT NULL DEFAULT '80mm'
    CHECK (default_format IN ('a4','58mm','80mm')),
  auto_print boolean NOT NULL DEFAULT false,
  copies smallint NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 3),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pdv_order_receipt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,order_id)
);

ALTER TABLE public.pdv_receipt_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_receipt_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_receipt_settings FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.pdv_order_receipt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_order_receipt_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_order_receipt_snapshots FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_guard_receipt_snapshot_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP='DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id=OLD.company_id)
    OR NOT EXISTS (SELECT 1 FROM public.pdv_orders orders WHERE orders.id=OLD.order_id)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'O comprovante confirmado é imutável.'
    USING ERRCODE='55000', DETAIL='code=pdv_receipt_snapshot_immutable';
END
$fn$;

CREATE TRIGGER trg_pdv_receipt_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.pdv_order_receipt_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_receipt_snapshot_v2();

CREATE OR REPLACE FUNCTION public.pdv_capture_order_receipt_snapshot_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_snapshot jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_item_total numeric;
  v_payment_total numeric;
BEGIN
  IF NEW.contract_version IS DISTINCT FROM 2
     OR NEW.status NOT IN('pago','liberado_retirada','retirada_parcial','entregue')
     OR (TG_OP='UPDATE' AND OLD.status IN('pago','liberado_retirada','retirada_parcial','entregue'))
  THEN RETURN NEW; END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'description',item.description,
      'unit',item.unit,
      'quantity',item.quantity,
      'unit_price',item.unit_price,
      'discount',item.discount_amount,
      'total',item.total
    ) ORDER BY item.sort_order,item.id),'[]'::jsonb),
    round(COALESCE(sum(item.gross_total_v2),0),2),
    round(COALESCE(sum(item.line_discount_amount_v2 + item.order_discount_allocated_v2),0),2),
    round(COALESCE(sum(item.total),0),2)
    INTO v_items,v_subtotal,v_discount,v_item_total
    FROM public.pdv_order_items item
   WHERE item.order_id=NEW.id AND item.company_id=NEW.company_id
     AND item.contract_version=2;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',payment.method,
      'amount',payment.amount,
      'due_date',receivable.due_date
    ) ORDER BY payment.received_at,payment.id),'[]'::jsonb),
    round(COALESCE(sum(payment.amount),0),2)
    INTO v_payments,v_payment_total
    FROM public.pdv_order_payments payment
    LEFT JOIN public.financial_transactions receivable
      ON receivable.id=payment.receivable_transaction_id
     AND receivable.company_id=payment.company_id
   WHERE payment.order_id=NEW.id AND payment.company_id=NEW.company_id
     AND payment.contract_version=2
     AND payment.coverage_status='authorized';

  IF jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'O pedido não possui itens para o comprovante.'
      USING ERRCODE='23514', DETAIL='code=pdv_receipt_items_missing';
  END IF;
  IF NEW.total>0 AND jsonb_array_length(v_payments)=0 THEN
    RAISE EXCEPTION 'O pedido não possui cobertura para o comprovante.'
      USING ERRCODE='23514', DETAIL='code=pdv_receipt_payments_missing';
  END IF;
  IF round(v_subtotal-v_discount,2) IS DISTINCT FROM round(NEW.total,2)
     OR v_item_total IS DISTINCT FROM round(NEW.total,2) THEN
    RAISE EXCEPTION 'Os itens não fecham com o total do pedido.'
      USING ERRCODE='23514', DETAIL='code=pdv_receipt_item_totals_mismatch';
  END IF;
  IF v_payment_total IS DISTINCT FROM round(NEW.total,2) THEN
    RAISE EXCEPTION 'As coberturas não fecham com o total do pedido.'
      USING ERRCODE='23514', DETAIL='code=pdv_receipt_payment_totals_mismatch';
  END IF;

  SELECT jsonb_build_object(
    'company',jsonb_build_object(
      'name',COALESCE(NULLIF(settings.name,''),company.name),
      'logo_url',CASE WHEN settings.white_label_enabled IS TRUE
                      THEN COALESCE(NULLIF(settings.white_label_logo_url,''),NULLIF(settings.logo_url,''))
                      ELSE NULLIF(settings.logo_url,'') END,
      'time_zone',COALESCE(NULLIF(settings.timezone,''),'America/Sao_Paulo')
    ),
    'order',jsonb_build_object(
      'number',NEW.number,
      'issued_at',COALESCE(
        (NEW.transaction_date_v2 + time '12:00') AT TIME ZONE
          COALESCE(NULLIF(settings.timezone,''),'America/Sao_Paulo'),
        NEW.delivered_at,NEW.paid_at,NEW.created_at
      ),
      'operator_name',COALESCE(NULLIF(profile.full_name,''),'Operador'),
      'terminal_name',terminal.name,
      'customer_name',customer.name
    ),
    'items',v_items,
    'totals',jsonb_build_object(
      'subtotal',v_subtotal,
      'discount',v_discount,
      'total',NEW.total
    ),
    'payments',v_payments,
    'fulfillment',jsonb_build_object(
      'mode','retirada',
      'status',CASE NEW.status
        WHEN 'entregue' THEN 'Retirada concluída'
        WHEN 'retirada_parcial' THEN 'Retirada parcial'
        WHEN 'liberado_retirada' THEN 'Liberada para retirada'
        ELSE 'Pagamento confirmado'
      END
    ),
    'note',NEW.notes
  ) INTO v_snapshot
  FROM public.companies company
  LEFT JOIN public.company_settings settings ON settings.company_id=company.id
  LEFT JOIN public.profiles profile ON profile.user_id=NEW.salesperson_id
  LEFT JOIN public.pdv_terminals terminal
    ON terminal.id=NEW.terminal_id AND terminal.company_id=NEW.company_id
  LEFT JOIN public.customers customer
    ON customer.id=NEW.customer_id AND customer.company_id=NEW.company_id
  WHERE company.id=NEW.company_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Não foi possível congelar o comprovante do pedido.'
      USING ERRCODE='23514', DETAIL='code=pdv_receipt_snapshot_failed';
  END IF;
  INSERT INTO public.pdv_order_receipt_snapshots(
    company_id,order_id,snapshot,snapshot_hash
  ) VALUES(
    NEW.company_id,NEW.id,v_snapshot,
    encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex')
  ) ON CONFLICT(company_id,order_id) DO NOTHING;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_pdv_capture_order_receipt_snapshot_v2
  AFTER UPDATE OF status ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_capture_order_receipt_snapshot_v2();

CREATE OR REPLACE FUNCTION public.pdv_receipt_settings_context_v2()
RETURNS TABLE(user_id uuid, company_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501', DETAIL='code=pdv_receipt_auth_required';
  END IF;
  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id=v_user AND profile.company_id=v_company
       AND COALESCE(profile.is_active,true)
  ) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501', DETAIL='code=pdv_receipt_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.'
      USING ERRCODE='42501', DETAIL='code=pdv_receipt_module_denied';
  END IF;
  IF NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(
       v_user,'screen:pdv_settings'
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar as configurações do PDV.'
      USING ERRCODE='42501', DETAIL='code=pdv_receipt_screen_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_receipt_settings_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_context record; v_settings public.pdv_receipt_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_receipt_settings_context_v2();
  SELECT * INTO v_settings FROM public.pdv_receipt_settings settings
   WHERE settings.company_id=v_context.company_id;
  RETURN jsonb_build_object(
    'default_format',COALESCE(v_settings.default_format,'80mm'),
    'auto_print',COALESCE(v_settings.auto_print,false),
    'copies',COALESCE(v_settings.copies,1)
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_order_receipt_snapshot_v2(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid; v_row public.pdv_order_receipt_snapshots%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id=v_user AND profile.company_id=v_company
       AND COALESCE(profile.is_active,true)
  ) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_module_denied';
  END IF;
  IF NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv') IS DISTINCT FROM true
     AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv_orders') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar comprovantes do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_order_denied';
  END IF;
  IF public.pdv_has_stock_access_scope_v2(
       v_user, v_company, p_order_id => p_order_id
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_stock_denied';
  END IF;
  SELECT snapshot.* INTO v_row
    FROM public.pdv_order_receipt_snapshots snapshot
   WHERE snapshot.company_id=v_company AND snapshot.order_id=p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O comprovante deste pedido ainda não está disponível.'
      USING ERRCODE='P0002',DETAIL='code=pdv_receipt_not_found';
  END IF;
  IF v_row.snapshot_hash<>encode(extensions.digest(convert_to(v_row.snapshot::text,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'O comprovante salvo requer revisão.'
      USING ERRCODE='55000',DETAIL='code=pdv_receipt_integrity_failed';
  END IF;
  RETURN v_row.snapshot;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_receipt_settings_v2(
  p_default_format text,
  p_auto_print boolean,
  p_copies integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_context record; v_settings public.pdv_receipt_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_receipt_settings_context_v2();
  IF NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT public.is_super_admin(v_context.user_id)
     AND public.pdv_has_explicit_action_permission_v2(
       v_context.user_id,'fn:manage_pdv_settings'
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar as configurações do PDV.'
      USING ERRCODE='42501', DETAIL='code=pdv_receipt_manage_denied';
  END IF;
  IF p_default_format IS NULL OR p_default_format NOT IN ('a4','58mm','80mm')
     OR p_auto_print IS NULL OR p_copies IS NULL OR p_copies NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Revise o formato e a quantidade de vias.'
      USING ERRCODE='22023', DETAIL='code=pdv_receipt_settings_invalid';
  END IF;
  INSERT INTO public.pdv_receipt_settings(
    company_id,default_format,auto_print,copies,updated_by
  ) VALUES(
    v_context.company_id,p_default_format,p_auto_print,p_copies,v_context.user_id
  )
  ON CONFLICT(company_id) DO UPDATE SET
    default_format=excluded.default_format,
    auto_print=excluded.auto_print,
    copies=excluded.copies,
    updated_by=excluded.updated_by,
    updated_at=now()
  RETURNING * INTO v_settings;
  RETURN jsonb_build_object(
    'default_format',v_settings.default_format,
    'auto_print',v_settings.auto_print,
    'copies',v_settings.copies
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_receipt_settings_context_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_receipt_snapshot_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_capture_order_receipt_snapshot_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_receipt_settings_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_order_receipt_snapshot_v2(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_save_receipt_settings_v2(text,boolean,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_receipt_settings_v2() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_order_receipt_snapshot_v2(uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_save_receipt_settings_v2(text,boolean,integer)
  TO authenticated,service_role;

COMMENT ON TABLE public.pdv_receipt_settings IS
  'Preferencias por empresa do comprovante nao fiscal. Reimpressao nao produz fatos financeiros.';
COMMENT ON FUNCTION public.pdv_get_receipt_settings_v2() IS
  'Retorna somente formato, impressao automatica e vias da empresa autenticada.';
COMMENT ON TABLE public.pdv_order_receipt_snapshots IS
  'Snapshot imutavel e owner-controlled do comprovante nao fiscal, congelado quando pedido v2 chega a entregue.';

COMMIT;
