-- Reserva o número definitivo sem criar orçamento, com replay atômico e isolamento por usuário/empresa.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.quote_number_reservations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_number integer NOT NULL UNIQUE CHECK (quote_number > 0),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  consumed_at timestamptz,
  request_hash text CHECK (request_hash IS NULL OR length(request_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT quote_number_reservation_consumption CHECK (
    (consumed_at IS NULL AND quote_id IS NULL AND request_hash IS NULL)
    OR (consumed_at IS NOT NULL AND request_hash IS NOT NULL)
  )
);
COMMENT ON TABLE public.quote_number_reservations IS 'Ledger privado de números, sem nomes/contatos/custos. UUID e número nunca são reciclados, mesmo após expiração/exclusão do orçamento. Exclusão do usuário/empresa remove os metadados.';
CREATE INDEX quote_number_reservations_owner_idx ON public.quote_number_reservations(company_id,user_id);
CREATE INDEX quote_number_reservations_quote_idx ON public.quote_number_reservations(quote_id) WHERE quote_id IS NOT NULL;
ALTER TABLE public.quote_number_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_number_reservations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.quote_number_reservations TO authenticated;
CREATE POLICY "Read own quote number reservations" ON public.quote_number_reservations
 FOR SELECT TO authenticated USING (
   user_id=(SELECT auth.uid()) AND company_id=(SELECT public.get_user_company_id(auth.uid()))
   AND expires_at>now() AND public.tenant_subscription_allows_access(company_id)
   AND public.company_plan_allows_product_area(company_id,'quotes')
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.company_id=quote_number_reservations.company_id AND p.is_active IS TRUE)
 );

CREATE FUNCTION public.quote_number_assert_access(p_company_id uuid,p_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
    OR p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.company_id=p_company_id AND p.is_active IS TRUE)
    OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true
    OR public.company_plan_allows_product_area(p_company_id,'quotes') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.quote_number_assert_access(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Protege o número reservado também contra inserts/updates manuais dos caminhos legados.
-- O ledger não é editável pelo cliente: só a RPC pode vincular o UUID que será inserido.
CREATE FUNCTION public.guard_reserved_quote_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_res public.quote_number_reservations;
BEGIN
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_res FROM public.quote_number_reservations WHERE quote_id=OLD.id;
   IF FOUND AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.quote_number IS DISTINCT FROM v_res.quote_number
      OR NEW.company_id IS DISTINCT FROM v_res.company_id OR NEW.created_by IS DISTINCT FROM v_res.user_id) THEN
     RAISE EXCEPTION 'A numeração e a origem do orçamento salvo não podem ser alteradas.' USING ERRCODE='42501';
   END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('quote-number-value:'||NEW.quote_number::text,0));
 SELECT * INTO v_res FROM public.quote_number_reservations WHERE quote_number=NEW.quote_number;
 IF FOUND AND (v_res.consumed_at IS NULL OR v_res.quote_id IS DISTINCT FROM NEW.id
    OR v_res.company_id IS DISTINCT FROM NEW.company_id OR v_res.user_id IS DISTINCT FROM NEW.created_by) THEN
   RAISE EXCEPTION 'Este número pertence a uma reserva de orçamento.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_reserved_quote_number() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_reserved_quote_number BEFORE INSERT OR UPDATE OF id,quote_number,company_id,created_by
 ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_quote_number();

CREATE FUNCTION public.reserve_quote_number(p_company_id uuid,p_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_row public.quote_number_reservations; v_number integer; v_expiry timestamptz;
BEGIN
 PERFORM public.quote_number_assert_access(p_company_id,p_user_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Solicitação de numeração inválida.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('quote-number:'||p_request_id::text,0));
 SELECT * INTO v_row FROM public.quote_number_reservations WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_row.company_id IS DISTINCT FROM p_company_id OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501';
   END IF;
   IF v_row.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'Este número já pertence a um orçamento salvo.' USING ERRCODE='QNR03'; END IF;
   IF v_row.expires_at<=clock_timestamp() THEN
     SELECT expires_at INTO v_expiry FROM public.quote_form_drafts
       WHERE company_id=p_company_id AND user_id=auth.uid() AND expires_at>clock_timestamp()
       AND lower(payload->>'numberRequestId')=p_request_id::text;
     IF v_expiry IS NULL THEN RAISE EXCEPTION 'A reserva de número expirou. Inicie outro orçamento.' USING ERRCODE='QNR02'; END IF;
     UPDATE public.quote_number_reservations SET expires_at=v_expiry WHERE id=p_request_id RETURNING * INTO v_row;
   END IF;
 ELSE
   -- nextval é a mesma fonte usada pelos outros caminhos de criação; nunca MAX+1.
   LOOP
     v_number:=nextval('public.quotes_quote_number_seq'::regclass);
     PERFORM pg_advisory_xact_lock(hashtextextended('quote-number-value:'||v_number::text,0));
     EXIT WHEN NOT EXISTS(SELECT 1 FROM public.quotes WHERE quote_number=v_number)
       AND NOT EXISTS(SELECT 1 FROM public.quote_number_reservations WHERE quote_number=v_number);
   END LOOP;
   INSERT INTO public.quote_number_reservations(id,company_id,user_id,quote_number)
   VALUES(p_request_id,p_company_id,auth.uid(),v_number) RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('reservation_id',v_row.id,'quote_number',v_row.quote_number,'expires_at',v_row.expires_at);
END $fn$;
REVOKE ALL ON FUNCTION public.reserve_quote_number(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_quote_number(uuid,uuid,uuid) TO authenticated;

-- O preenchimento pessoal vivo conserva seu número, inclusive em outro dispositivo.
CREATE FUNCTION public.renew_quote_number_from_form_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
 UPDATE public.quote_number_reservations SET expires_at=GREATEST(expires_at,NEW.expires_at)
 WHERE company_id=NEW.company_id AND user_id=NEW.user_id AND consumed_at IS NULL
   AND id::text=lower(NEW.payload->>'numberRequestId');
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.renew_quote_number_from_form_draft() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER renew_quote_number_on_form_draft AFTER INSERT OR UPDATE OF payload,expires_at
 ON public.quote_form_drafts FOR EACH ROW EXECUTE FUNCTION public.renew_quote_number_from_form_draft();

CREATE FUNCTION public.create_reserved_quote(
 p_reservation_id uuid,p_quote jsonb,p_items jsonb,p_company_id uuid,p_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE
 v_res public.quote_number_reservations;
 v_quote public.quotes; v_item public.quote_items; v_saved public.quotes;
 v_qjson jsonb; v_ijson jsonb; v_raw jsonb; v_canonical_items jsonb:='[]'::jsonb;
 v_request_hash text; v_index integer:=0; v_expiry timestamptz;
 v_quote_keys text[]:=ARRAY['customer_id','prospect_name','prospect_phone','prospect_email','status','valid_until','receivable_installments','receivable_first_due_date','discount_type','discount_value','subtotal','discount_amount','total_value','notes','terms','assigned_to','proposal_template_id','tax_rate','admin_indirect_rate','profit_rate','km_cost','distance_km','displacement_cost','bdi','use_bdi','total_cost','total_price','include_gifts','card_discount_rate','card_installments','show_labor_cost_in_proposal','show_inputs_cost_in_proposal'];
 v_item_keys text[]:=ARRAY['position','item_type','description','details','quantity','unit_price','total_price','inventory_id','service_type_id','unit_hourly_rate','unit_hours','unit_labor_cost','unit_materials_cost','unit_extras_cost','unit_total_cost','profit_rate','bdi','price_override','pricing_mode','cost_composition'];
BEGIN
 PERFORM public.quote_number_assert_access(p_company_id,p_user_id);
 IF p_reservation_id IS NULL OR jsonb_typeof(p_quote) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR octet_length(p_quote::text)+octet_length(p_items::text)>1048576
    OR jsonb_array_length(p_items)>1000
 THEN RAISE EXCEPTION 'Os dados do orçamento são inválidos.' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_res FROM public.quote_number_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A reserva de número não está disponível.' USING ERRCODE='QNR02'; END IF;
 IF v_res.company_id IS DISTINCT FROM p_company_id OR v_res.user_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501';
 END IF;
 -- Apenas campos do formulário entram no registro. Identidade, número, token e vínculos financeiros são definidos pelo servidor.
 v_qjson:='{"status":"rascunho","discount_type":"valor","discount_value":0,"subtotal":0,"discount_amount":0,"total_value":0,"receivable_installments":1,"tax_rate":0,"admin_indirect_rate":0,"profit_rate":0,"km_cost":0,"distance_km":0,"displacement_cost":0,"bdi":0,"use_bdi":true,"total_cost":0,"total_price":0,"include_gifts":true,"card_discount_rate":6,"card_installments":10,"show_labor_cost_in_proposal":false,"show_inputs_cost_in_proposal":false}'::jsonb || COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(p_quote) WHERE key=ANY(v_quote_keys)),'{}'::jsonb);
 FOR v_raw IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(v_qjson)
   WHERE key IN('customer_id','assigned_to','proposal_template_id','valid_until','receivable_first_due_date') AND value='""'::jsonb LOOP
   v_qjson:=jsonb_set(v_qjson,ARRAY[v_raw->>'key'],'null'::jsonb);
 END LOOP;
 v_quote:=jsonb_populate_record(NULL::public.quotes,v_qjson);
 IF v_quote.status IS DISTINCT FROM 'rascunho' OR v_quote.receivable_installments NOT BETWEEN 1 AND 60 THEN
   RAISE EXCEPTION 'Confira a situação e as condições do orçamento.' USING ERRCODE='22023';
 END IF;
 -- Replays usam o conteúdo efetivo, incluindo padrões, sem preservar dados pessoais duplicados no ledger.
 v_qjson:=jsonb_strip_nulls((SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(v_quote)) WHERE key=ANY(v_quote_keys)));
 IF EXISTS(SELECT 1 FROM jsonb_each(v_qjson) WHERE key IN('discount_value','subtotal','discount_amount','total_value','tax_rate','admin_indirect_rate','profit_rate','km_cost','distance_km','displacement_cost','bdi','total_cost','total_price','card_discount_rate','card_installments','receivable_installments') AND jsonb_typeof(value) NOT IN('number','null')) THEN
   RAISE EXCEPTION 'Confira os valores do orçamento.' USING ERRCODE='22023';
 END IF;
 FOR v_raw IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   IF jsonb_typeof(v_raw) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Confira os itens do orçamento.' USING ERRCODE='22023'; END IF;
   v_ijson:='{"position":0,"item_type":"servico","description":"","quantity":1,"unit_price":0,"total_price":0,"unit_hourly_rate":0,"unit_hours":0,"unit_labor_cost":0,"unit_materials_cost":0,"unit_extras_cost":0,"unit_total_cost":0,"profit_rate":0,"bdi":0,"pricing_mode":"manual"}'::jsonb || COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(v_raw) WHERE key=ANY(v_item_keys)),'{}'::jsonb);
   IF v_ijson->>'inventory_id'='' THEN v_ijson:=jsonb_set(v_ijson,'{inventory_id}','null'::jsonb); END IF;
   IF v_ijson->>'service_type_id'='' THEN v_ijson:=jsonb_set(v_ijson,'{service_type_id}','null'::jsonb); END IF;
   v_item:=jsonb_populate_record(NULL::public.quote_items,v_ijson);
   IF EXISTS(SELECT 1 FROM jsonb_each(to_jsonb(v_item)) WHERE key IN('quantity','unit_price','total_price','unit_hourly_rate','unit_hours','unit_labor_cost','unit_materials_cost','unit_extras_cost','unit_total_cost','profit_rate','bdi','price_override') AND jsonb_typeof(value) NOT IN('number','null')) THEN
     RAISE EXCEPTION 'Confira os valores dos itens.' USING ERRCODE='22023';
   END IF;
   IF v_item.description IS NULL OR btrim(v_item.description)='' OR v_item.quantity IS NULL OR v_item.quantity<=0
      OR v_item.unit_price IS NULL OR v_item.unit_price<0 OR v_item.pricing_mode NOT IN('registered','manual','cost_bdi')
      OR v_item.item_type NOT IN('servico','material','mao_de_obra')
   THEN RAISE EXCEPTION 'Confira a descrição, a quantidade e o preço dos itens.' USING ERRCODE='22023'; END IF;
   v_item.position:=v_index; v_index:=v_index+1;
   v_item.total_price:=v_item.quantity*v_item.unit_price;
   v_canonical_items:=v_canonical_items||jsonb_build_array(jsonb_strip_nulls((SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(v_item)) WHERE key=ANY(v_item_keys))));
 END LOOP;
 v_request_hash:=encode(extensions.digest(convert_to(jsonb_build_object('quote',v_qjson,'items',v_canonical_items)::text,'UTF8'),'sha256'),'hex');
 IF v_res.consumed_at IS NOT NULL THEN
   IF v_res.request_hash IS DISTINCT FROM v_request_hash OR v_res.quote_id IS NULL THEN
     RAISE EXCEPTION 'Esta reserva já foi usada. Confira o orçamento salvo antes de continuar.' USING ERRCODE='QNR03';
   END IF;
   SELECT * INTO v_saved FROM public.quotes WHERE id=v_res.quote_id AND company_id=p_company_id AND created_by=auth.uid();
   IF NOT FOUND THEN RAISE EXCEPTION 'O orçamento desta reserva não está mais disponível.' USING ERRCODE='QNR03'; END IF;
   RETURN to_jsonb(v_saved);
 END IF;
 IF v_res.expires_at<=clock_timestamp() THEN
   SELECT expires_at INTO v_expiry FROM public.quote_form_drafts WHERE company_id=p_company_id AND user_id=auth.uid()
     AND expires_at>clock_timestamp() AND lower(payload->>'numberRequestId')=p_reservation_id::text;
   IF v_expiry IS NULL THEN RAISE EXCEPTION 'A reserva de número expirou. Inicie outro orçamento.' USING ERRCODE='QNR02'; END IF;
   UPDATE public.quote_number_reservations SET expires_at=v_expiry WHERE id=p_reservation_id;
 END IF;
 -- Todas as referências de entidades privadas devem pertencer ao tenant confirmado.
 IF (v_quote.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=v_quote.customer_id AND company_id=p_company_id))
    OR (v_quote.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE (user_id=v_quote.assigned_to OR id=v_quote.assigned_to) AND company_id=p_company_id))
    OR (v_quote.proposal_template_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proposal_templates WHERE id=v_quote.proposal_template_id))
 THEN RAISE EXCEPTION 'Um cadastro selecionado não está disponível nesta empresa.' USING ERRCODE='42501'; END IF;
 -- proposal_templates é catálogo global sem company_id; a existência acima é a validação correta.
 FOR v_raw IN SELECT value FROM jsonb_array_elements(v_canonical_items) LOOP
   v_item:=jsonb_populate_record(NULL::public.quote_items,v_raw);
   IF (v_item.inventory_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory WHERE id=v_item.inventory_id AND company_id=p_company_id))
      OR (v_item.service_type_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.service_types WHERE id=v_item.service_type_id AND company_id=p_company_id))
   THEN RAISE EXCEPTION 'Um item selecionado não está disponível nesta empresa.' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.quotes WHERE quote_number=v_res.quote_number) THEN
   RAISE EXCEPTION 'Este número não está mais disponível. Inicie outro orçamento.' USING ERRCODE='QNR03';
 END IF;
 -- Claim e INSERT são a mesma transação; o FK adiado mantém integridade sem janela de apropriação do número.
 v_saved.id:=gen_random_uuid();
 UPDATE public.quote_number_reservations SET quote_id=v_saved.id,consumed_at=clock_timestamp(),request_hash=v_request_hash WHERE id=p_reservation_id;
 INSERT INTO public.quotes(id,quote_number,company_id,created_by,customer_id,prospect_name,prospect_phone,prospect_email,status,valid_until,receivable_installments,receivable_first_due_date,discount_type,discount_value,subtotal,discount_amount,total_value,notes,terms,assigned_to,proposal_template_id,tax_rate,admin_indirect_rate,profit_rate,km_cost,distance_km,displacement_cost,bdi,use_bdi,total_cost,total_price,include_gifts,card_discount_rate,card_installments,show_labor_cost_in_proposal,show_inputs_cost_in_proposal)
 VALUES(v_saved.id,v_res.quote_number,p_company_id,auth.uid(),v_quote.customer_id,v_quote.prospect_name,v_quote.prospect_phone,v_quote.prospect_email,v_quote.status,v_quote.valid_until,v_quote.receivable_installments,v_quote.receivable_first_due_date,v_quote.discount_type,v_quote.discount_value,v_quote.subtotal,v_quote.discount_amount,v_quote.total_value,v_quote.notes,v_quote.terms,v_quote.assigned_to,v_quote.proposal_template_id,v_quote.tax_rate,v_quote.admin_indirect_rate,v_quote.profit_rate,v_quote.km_cost,v_quote.distance_km,v_quote.displacement_cost,v_quote.bdi,v_quote.use_bdi,v_quote.total_cost,v_quote.total_price,v_quote.include_gifts,v_quote.card_discount_rate,v_quote.card_installments,v_quote.show_labor_cost_in_proposal,v_quote.show_inputs_cost_in_proposal) RETURNING * INTO v_saved;
 FOR v_raw IN SELECT value FROM jsonb_array_elements(v_canonical_items) LOOP
   v_item:=jsonb_populate_record(NULL::public.quote_items,v_raw);
   INSERT INTO public.quote_items(quote_id,position,item_type,description,details,quantity,unit_price,total_price,inventory_id,service_type_id,unit_hourly_rate,unit_hours,unit_labor_cost,unit_materials_cost,unit_extras_cost,unit_total_cost,profit_rate,bdi,price_override,pricing_mode,cost_composition)
   VALUES(v_saved.id,v_item.position,v_item.item_type,v_item.description,v_item.details,v_item.quantity,v_item.unit_price,v_item.total_price,v_item.inventory_id,v_item.service_type_id,v_item.unit_hourly_rate,v_item.unit_hours,v_item.unit_labor_cost,v_item.unit_materials_cost,v_item.unit_extras_cost,v_item.unit_total_cost,v_item.profit_rate,v_item.bdi,v_item.price_override,v_item.pricing_mode,v_item.cost_composition);
 END LOOP;
 RETURN to_jsonb(v_saved);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR foreign_key_violation THEN
 RAISE EXCEPTION 'Confira os dados e os itens do orçamento antes de salvar.' USING ERRCODE='22023';
END $fn$;
REVOKE ALL ON FUNCTION public.create_reserved_quote(uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_reserved_quote(uuid,jsonb,jsonb,uuid,uuid) TO authenticated;
COMMIT;
