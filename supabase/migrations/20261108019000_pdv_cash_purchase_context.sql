BEGIN;

SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

-- A compra direta continua sendo um fato único de Estoque + Financeiro. O
-- contexto abaixo apenas prende esse fato a uma abertura quando ele nasceu no
-- Caixa; compras iniciadas pelo Estoque permanecem sem contexto de caixa.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.pdv_cash_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pdv_terminals(id) ON DELETE RESTRICT;

ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS compras_cash_context_v2_check;
ALTER TABLE public.compras ADD CONSTRAINT compras_cash_context_v2_check CHECK (
  (cash_session_id IS NULL AND terminal_id IS NULL)
  OR (cash_session_id IS NOT NULL AND terminal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_compras_cash_context_v2
  ON public.compras(company_id,cash_session_id,terminal_id,created_at DESC)
  WHERE cash_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pdv_guard_purchase_cash_context_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NEW.cash_session_id IS NULL AND NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.cash_session_id IS NULL OR NEW.terminal_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.pdv_cash_sessions s
    JOIN public.pdv_terminals t ON t.id=s.terminal_id AND t.company_id=s.company_id
    WHERE s.id=NEW.cash_session_id AND s.company_id=NEW.company_id
      AND s.terminal_id=NEW.terminal_id AND s.contract_version=2
  ) THEN
    RAISE EXCEPTION 'Contexto do caixa inválido para esta compra.'
      USING ERRCODE='23514',DETAIL='PDV_CASH_PURCHASE_CONTEXT_INVALID';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS tg_pdv_purchase_cash_context_v2 ON public.compras;
CREATE TRIGGER tg_pdv_purchase_cash_context_v2
  BEFORE INSERT OR UPDATE OF company_id,cash_session_id,terminal_id ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_purchase_cash_context_v2();
REVOKE ALL ON FUNCTION public.pdv_guard_purchase_cash_context_v2() FROM PUBLIC,anon,authenticated,service_role;

-- Rascunhos de compra do Estoque continuam com contexto nulo. Quando a compra
-- vem do Caixa, os três vínculos são obrigatórios e exatos; nunca existe
-- fallback para a primeira abertura do local.
CREATE OR REPLACE FUNCTION public.pdv_assert_draft_cash_context_v2(
  p_draft_type text,p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid; v_session public.pdv_cash_sessions%ROWTYPE;
BEGIN
  v_company:=public.pdv_assert_draft_access();
  IF p_stock_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stocks s
    WHERE s.id=p_stock_id AND s.company_id=v_company AND s.customer_id IS NULL)
     OR public.can_access_stock(v_uid,p_stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Local de estoque indisponível.' USING ERRCODE='42501',DETAIL='code=pdv_draft_stock_denied';
  END IF;

  IF p_draft_type='purchase' AND p_cash_session_id IS NULL AND p_terminal_id IS NULL THEN
    RETURN v_company;
  END IF;
  IF p_draft_type NOT IN('sale','purchase') OR p_cash_session_id IS NULL OR p_terminal_id IS NULL THEN
    RAISE EXCEPTION 'Informe caixa, abertura e local do rascunho.'
      USING ERRCODE='22023',DETAIL='code=pdv_draft_cash_context_required';
  END IF;

  v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,NULL,true);
  IF v_session.company_id IS DISTINCT FROM v_company
     OR v_session.terminal_id IS DISTINCT FROM p_terminal_id
     OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals t
       WHERE t.id=p_terminal_id AND t.company_id=v_company AND t.stock_id=p_stock_id
         AND t.is_active IS TRUE AND public.can_access_stock(v_uid,t.stock_id)) THEN
    RAISE EXCEPTION 'Este rascunho pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_draft_cash_denied';
  END IF;
  RETURN v_company;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_draft_cash_context_v2(text,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_purchase_cash_context_v2(
  p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_session public.pdv_cash_sessions%ROWTYPE; v_terminal public.pdv_terminals%ROWTYPE;
BEGIN
  IF p_cash_session_id IS NULL OR p_terminal_id IS NULL OR p_stock_id IS NULL THEN
    RAISE EXCEPTION 'Informe o caixa completo para continuar.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_CONTEXT_REQUIRED';
  END IF;
  v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,NULL,true);
  SELECT t.* INTO v_terminal FROM public.pdv_terminals t
   WHERE t.id=p_terminal_id AND t.company_id=v_session.company_id
     AND t.id=v_session.terminal_id AND t.stock_id=p_stock_id AND t.is_active IS TRUE
     AND public.can_access_stock(auth.uid(),t.stock_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O caixa não corresponde ao local desta compra.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_PURCHASE_CONTEXT_MISMATCH';
  END IF;
  RETURN jsonb_build_object(
    'session_id',v_session.id,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,
    'stock_id',v_terminal.stock_id,'cash_account_id',v_session.cash_account_id,
    'cash_account_name',v_session.cash_account_name_snapshot,'opened_at',v_session.opened_at
  );
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_purchase_cash_context_v2(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_purchase_cash_context_v2(uuid,uuid,uuid) TO authenticated,service_role;

-- O corpo antigo vira core privado. O wrapper de mesmo nome mantém o diálogo
-- de compra direta do Estoque 100% compatível e sem custódia de Caixa.
ALTER FUNCTION public.registrar_compra_material_direta(
  uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) RENAME TO registrar_compra_material_direta_core_019;
REVOKE ALL ON FUNCTION public.registrar_compra_material_direta_core_019(
  uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.registrar_compra_material_direta(
  p_client_request_id uuid,p_stock_id uuid,p_supplier_id uuid,p_items jsonb,
  p_purchase_date date,p_account_id uuid,p_category_id uuid,p_is_paid boolean,
  p_paid_date date,p_due_date date,p_payment_method text,p_description text,p_notes text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.registrar_compra_material_direta_core_019(
    p_client_request_id,p_stock_id,p_supplier_id,p_items,p_purchase_date,p_account_id,
    p_category_id,p_is_paid,p_paid_date,p_due_date,p_payment_method,p_description,p_notes
  );
$fn$;
REVOKE ALL ON FUNCTION public.registrar_compra_material_direta(
  uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_material_direta(
  uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) TO authenticated,service_role;

CREATE FUNCTION public.pdv_registrar_compra_material_direta_v2(
  p_cash_session_id uuid,p_terminal_id uuid,p_client_request_id uuid,
  p_stock_id uuid,p_supplier_id uuid,p_items jsonb,p_purchase_date date,
  p_account_id uuid,p_category_id uuid,p_is_paid boolean,p_paid_date date,
  p_due_date date,p_payment_method text,p_description text,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_uid uuid:=auth.uid(); v_company uuid; v_session public.pdv_cash_sessions%ROWTYPE;
  v_claim record; v_items jsonb; v_item_count integer; v_total numeric(14,2);
  v_position numeric(14,2):=0; v_purchase jsonb; v_result jsonb;
  v_financial_id uuid; v_compra_id uuid; v_ordem_id uuid; v_entry_id uuid;
  v_cash_payment boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE='42501',DETAIL='PDV_CASH_PURCHASE_UNAUTHENTICATED';
  END IF;
  v_company:=public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada.' USING ERRCODE='42501',DETAIL='PDV_CASH_PURCHASE_COMPANY_REQUIRED';
  END IF;
  IF p_cash_session_id IS NULL OR p_terminal_id IS NULL OR p_stock_id IS NULL
     OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Informe o caixa completo para registrar a compra.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_CONTEXT_REQUIRED';
  END IF;

  v_cash_payment:=p_is_paid IS TRUE AND p_payment_method='dinheiro';
  v_session:=public.pdv_assert_cash_session_actor_v3(
    p_cash_session_id,CASE WHEN v_cash_payment THEN p_account_id ELSE NULL END,true
  );
  PERFORM public.pdv_lock_treasury_account(v_company,v_session.cash_account_id);
  SELECT s.* INTO v_session FROM public.pdv_cash_sessions s
   WHERE s.id=p_cash_session_id AND s.company_id=v_company AND s.status='aberta'
     AND s.contract_version=2 AND s.terminal_id=p_terminal_id
     AND (s.opened_by=v_uid OR public.pdv_can_operate_other_cash_v2(v_uid))
   FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals t
    WHERE t.id=p_terminal_id AND t.company_id=v_company AND t.stock_id=p_stock_id
      AND t.is_active IS TRUE AND public.can_access_stock(v_uid,t.stock_id)) THEN
    RAISE EXCEPTION 'O caixa não corresponde ao local desta compra.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_PURCHASE_CONTEXT_MISMATCH';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Informe ao menos um material comprado.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_ITEMS_REQUIRED';
  END IF;
  IF jsonb_array_length(p_items)>100 THEN
    RAISE EXCEPTION 'Uma compra aceita no máximo 100 materiais.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_ITEMS_LIMIT';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('inventory_id',x.inventory_id,
           'quantity',round(x.quantity,4),'unit_price',round(x.unit_price,2))
           ORDER BY x.inventory_id::text),count(*),
           round(sum(round(x.quantity,4)*round(x.unit_price,2)),2)
    INTO v_items,v_item_count,v_total
    FROM jsonb_to_recordset(p_items) AS x(inventory_id uuid,quantity numeric,unit_price numeric);
  IF v_item_count IS NULL OR v_item_count=0 OR v_total IS NULL OR v_total<=0 THEN
    RAISE EXCEPTION 'Informe materiais e valores válidos.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_ITEMS_INVALID';
  END IF;

  IF v_cash_payment AND p_account_id IS DISTINCT FROM v_session.cash_account_id THEN
    RAISE EXCEPTION 'Pagamento em dinheiro deve usar a conta deste caixa.'
      USING ERRCODE='23514',DETAIL='PDV_CASH_PURCHASE_ACCOUNT_MISMATCH';
  END IF;
  IF NOT v_cash_payment AND p_account_id IS NOT DISTINCT FROM v_session.cash_account_id THEN
    RAISE EXCEPTION 'A conta do caixa só pode ser usada em uma compra paga em dinheiro.'
      USING ERRCODE='23514',DETAIL='PDV_CASH_PURCHASE_PAYMENT_MISMATCH';
  END IF;
  IF v_cash_payment AND (p_purchase_date IS DISTINCT FROM public.company_today(v_company)
      OR p_paid_date IS DISTINCT FROM public.company_today(v_company)) THEN
    RAISE EXCEPTION 'Compra paga com o dinheiro do caixa deve usar a data de hoje.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_DATE_INVALID';
  END IF;

  SELECT COALESCE(position.custody_amount,0) INTO v_position
    FROM public.pdv_cash_custody_position(v_company,p_cash_session_id) position;
  v_position:=round(COALESCE(v_position,0),2);
  IF v_cash_payment AND v_total>v_position THEN
    RAISE EXCEPTION 'O caixa não possui dinheiro suficiente para esta compra.'
      USING ERRCODE='23514',DETAIL='PDV_CASH_CUSTODY_INSUFFICIENT';
  END IF;

  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_company,'cash.event.v2',p_client_request_id::text,
    jsonb_build_object('operation','direct_purchase','session_id',p_cash_session_id,
      'terminal_id',p_terminal_id,'stock_id',p_stock_id,'supplier_id',p_supplier_id,
      'items',v_items,'purchase_date',p_purchase_date,'account_id',p_account_id,
      'category_id',p_category_id,'is_paid',p_is_paid,'paid_date',p_paid_date,
      'due_date',p_due_date,'payment_method',p_payment_method,
      'description',NULLIF(btrim(COALESCE(p_description,'')),''),
      'notes',NULLIF(btrim(COALESCE(p_notes,'')),''))
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Esta compra ainda está sendo processada.'
      USING ERRCODE='55000',DETAIL='PDV_CASH_PURCHASE_IN_PROGRESS';
  END IF;

  IF v_cash_payment THEN
    PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object(
      'company_id',v_company,'account_id',v_session.cash_account_id,
      'request_id',v_claim.request_id,'delta',-v_total)::text,true);
  END IF;
  v_purchase:=public.registrar_compra_material_direta_core_019(
    p_client_request_id,p_stock_id,p_supplier_id,v_items,p_purchase_date,p_account_id,
    p_category_id,p_is_paid,p_paid_date,p_due_date,p_payment_method,p_description,p_notes);
  PERFORM set_config('app.pdv_treasury_custody_delta','',true);

  IF COALESCE((v_purchase->>'already_applied')::boolean,false) THEN
    RAISE EXCEPTION 'Esta compra já foi registrada fora deste caixa.'
      USING ERRCODE='22023',DETAIL='PDV_CASH_PURCHASE_CONTEXT_REUSED';
  END IF;
  v_financial_id:=(v_purchase->>'financial_transaction_id')::uuid;
  v_compra_id:=(v_purchase->>'compra_id')::uuid;
  v_ordem_id:=(v_purchase->>'ordem_id')::uuid;

  UPDATE public.compras SET cash_session_id=p_cash_session_id,terminal_id=p_terminal_id
   WHERE id=v_compra_id AND company_id=v_company AND client_request_id=p_client_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada depois do registro.'
      USING ERRCODE='P0002',DETAIL='PDV_CASH_PURCHASE_NOT_FOUND';
  END IF;

  IF v_cash_payment THEN
    IF v_financial_id IS NULL OR v_ordem_id IS NULL THEN
      RAISE EXCEPTION 'A compra não gerou o lançamento financeiro esperado.'
        USING ERRCODE='55000',DETAIL='PDV_CASH_PURCHASE_FINANCIAL_MISSING';
    END IF;
    INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,
      operation_request_id,entry_kind,amount,source_type,source_id,
      financial_transaction_id,metadata,created_by)
    VALUES(v_company,p_cash_session_id,v_session.cash_account_id,v_claim.request_id,
      'cash_payment',-v_total,'compra_ordem',v_ordem_id,v_financial_id,
      jsonb_build_object('compra_id',v_compra_id,'ordem_id',v_ordem_id),v_uid)
    RETURNING id INTO v_entry_id;
  END IF;

  v_result:=v_purchase||jsonb_build_object('cash_session_id',p_cash_session_id,
    'terminal_id',p_terminal_id,'cash_custody_entry_id',v_entry_id,
    'cash_payment',v_cash_payment,'already_applied',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'direct_purchase',v_compra_id,v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_registrar_compra_material_direta_v2(
  uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_registrar_compra_material_direta_v2(
  uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_registrar_compra_material_direta_v2(
  uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text
) IS 'Registra compra iniciada em uma abertura explícita. Dinheiro usa o mesmo lançamento financeiro da compra e uma única saída append-only da custódia.';

COMMIT;
