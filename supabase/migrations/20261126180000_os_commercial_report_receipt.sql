-- Resumo comercial no relatório, recibo de recebimentos e orçamento em campo.
-- Nenhuma leitura pública recebe a linha de orçamento, custos ou metodologia.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.service_orders
  ADD COLUMN show_values_to_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN commercial_revision bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.service_orders.show_values_to_customer IS
  'Consentimento por OS para mostrar itens e total no relatório/link do cliente.';

CREATE FUNCTION public.can_price_os(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT public.is_super_admin(_user_id) OR public.is_admin_or_gestor(_user_id)
 OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id
   AND is_active AND (permissions ? '*' OR permissions ? 'fn:os_edit_prices'));
$$;
REVOKE ALL ON FUNCTION public.can_price_os(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_price_os(uuid) TO authenticated, service_role;

CREATE FUNCTION public.can_work_os_commercial(p_os_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.service_orders so WHERE so.id = p_os_id
  AND so.entry_type IS DISTINCT FROM 'tarefa'
  AND (public.is_super_admin(auth.uid()) OR (
    so.company_id = public.get_user_company_id(auth.uid())
    AND public.tenant_subscription_allows_access(so.company_id)
    AND (public.is_admin_or_gestor(auth.uid()) OR public.has_full_permissions(auth.uid())
      OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id=auth.uid() AND up.is_active
        AND (up.permissions ? 'fn:edit_os' OR up.permissions ? 'fn:create_os' OR up.permissions ? 'fn:os_finish_revenue'))
      OR so.created_by=auth.uid()
      OR so.technician_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.service_order_assignees a
        WHERE a.service_order_id = so.id AND a.user_id = auth.uid()))
  ))
 );
$$;
REVOKE ALL ON FUNCTION public.can_work_os_commercial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_work_os_commercial(uuid) TO authenticated, service_role;

-- Somente RPCs validadas escrevem os itens; impede contornar a permissão por REST.
REVOKE INSERT, UPDATE, DELETE ON public.service_order_budget_items FROM authenticated, anon;
CREATE FUNCTION public._sync_os_budget_internal(
  p_service_order_id uuid,
  p_items jsonb,
  p_pricing jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_pricing jsonb := COALESCE(p_pricing, '{}'::jsonb);
  v_use_bdi boolean := COALESCE((p_pricing->>'use_bdi')::boolean, false);
  v_tax numeric := COALESCE((p_pricing->>'tax_rate')::numeric, 10);
  v_admin numeric := COALESCE((p_pricing->>'admin_indirect_rate')::numeric, 12);
  v_profit numeric := COALESCE((p_pricing->>'profit_rate')::numeric, 10);
  v_bdi numeric;
  v_services numeric(14, 2) := 0;
  v_materials numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_total_cost numeric(14, 2) := 0;
  v_adjustment numeric(14, 2) := COALESCE((p_pricing->>'commercial_adjustment')::numeric, 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) > 200 THEN
    RAISE EXCEPTION 'Revise a lista de itens do orçamento.';
  END IF;
  IF jsonb_typeof(v_pricing) <> 'object' OR v_tax < 0 OR v_admin < 0 OR v_profit < 0 THEN
    RAISE EXCEPTION 'Revise as taxas de impostos, administração e lucro.';
  END IF;
  v_bdi := GREATEST(0.01, (100 - (v_tax + v_admin + v_profit)) / 100);

  SELECT so.company_id INTO v_company_id
    FROM public.service_orders so
   WHERE so.id = p_service_order_id
     AND (public.is_super_admin(v_user_id) OR (
       so.company_id = public.get_user_company_id(v_user_id)
       AND public.tenant_subscription_allows_access(so.company_id)
     ))
   FOR UPDATE;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Ordem de serviço não encontrada ou sem permissão.'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) x(item)
     WHERE COALESCE(btrim(item->>'description'), '') = ''
        OR COALESCE((item->>'quantity')::numeric, 0) <= 0
        OR (item->>'quantity')::numeric<>round((item->>'quantity')::numeric,3)
        OR COALESCE((item->>'unit_price')::numeric, 0) < 0
        OR lower(COALESCE(item->>'unit_price','nan')) IN ('nan','infinity','-infinity')
        OR lower(COALESCE(item->>'quantity','nan')) IN ('nan','infinity','-infinity')
        OR COALESCE((item->>'unit_total_cost')::numeric, 0) < 0
        OR COALESCE(item->>'item_type', 'servico') NOT IN ('servico','mao_de_obra','material')
        OR COALESCE(item->>'pricing_mode', 'manual') NOT IN ('registered','cost_bdi','manual')
        OR (COALESCE(item->>'pricing_mode', 'manual') = 'cost_bdi' AND NOT v_use_bdi)
  ) THEN RAISE EXCEPTION 'Revise descrição, quantidade, custo, modo e valor dos itens.'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) x(item)
     WHERE NULLIF(item->>'service_type_id','') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.service_types st
         WHERE st.id = (item->>'service_type_id')::uuid AND st.company_id = v_company_id)
  ) THEN RAISE EXCEPTION 'Um dos tipos de serviço não pertence a esta empresa.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) x(item)
     WHERE NULLIF(item->>'inventory_id','') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.inventory i
         WHERE i.id = (item->>'inventory_id')::uuid AND i.company_id = v_company_id)
  ) THEN RAISE EXCEPTION 'Um dos materiais não pertence a esta empresa.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) x(item)
     WHERE NULLIF(item->>'source_quote_item_id','') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.quote_items qi JOIN public.quotes q ON q.id = qi.quote_id
         WHERE qi.id = (item->>'source_quote_item_id')::uuid AND q.company_id = v_company_id)
  ) THEN RAISE EXCEPTION 'Um dos itens de origem não pertence a esta empresa.'; END IF;

  DELETE FROM public.service_order_budget_items WHERE service_order_id = p_service_order_id;
  INSERT INTO public.service_order_budget_items (
    service_order_id, company_id, position, item_type, description, details, quantity,
    unit_price, total_price, inventory_id, service_type_id, source_quote_item_id,
    pricing_mode, unit_hourly_rate, unit_hours, unit_labor_cost, unit_materials_cost,
    unit_extras_cost, unit_total_cost, profit_rate, bdi, price_override
  )
  SELECT p_service_order_id, v_company_id, ordinality::integer - 1,
    COALESCE(item->>'item_type','servico'), btrim(item->>'description'), NULLIF(item->>'details',''),
    (item->>'quantity')::numeric, ROUND((item->>'unit_price')::numeric,2),
    ROUND(ROUND((item->>'quantity')::numeric,3) * ROUND((item->>'unit_price')::numeric,2),2),
    NULLIF(item->>'inventory_id','')::uuid, NULLIF(item->>'service_type_id','')::uuid,
    NULLIF(item->>'source_quote_item_id','')::uuid, COALESCE(item->>'pricing_mode','manual'),
    GREATEST(0,COALESCE((item->>'unit_hourly_rate')::numeric,0)),
    GREATEST(0,COALESCE((item->>'unit_hours')::numeric,0)),
    GREATEST(0,COALESCE((item->>'unit_labor_cost')::numeric,0)),
    GREATEST(0,COALESCE((item->>'unit_materials_cost')::numeric,0)),
    GREATEST(0,COALESCE((item->>'unit_extras_cost')::numeric,0)),
    GREATEST(0,COALESCE((item->>'unit_total_cost')::numeric,0)),
    GREATEST(0,COALESCE((item->>'profit_rate')::numeric,v_profit)),
    GREATEST(0.01,COALESCE((item->>'bdi')::numeric,v_bdi)),
    CASE WHEN COALESCE(item->>'pricing_mode','manual') = 'cost_bdi' THEN NULL
         ELSE ROUND(COALESCE((item->>'price_override')::numeric,(item->>'unit_price')::numeric),2) END
  FROM jsonb_array_elements(v_items) WITH ORDINALITY rows(item, ordinality);

  SELECT COALESCE(SUM(total_price) FILTER (WHERE item_type IN ('servico','mao_de_obra')),0),
         COALESCE(SUM(total_price) FILTER (WHERE item_type='material'),0), COALESCE(SUM(total_price),0),
         COALESCE(SUM(quantity * unit_total_cost),0)
    INTO v_services, v_materials, v_total, v_total_cost
    FROM public.service_order_budget_items WHERE service_order_id = p_service_order_id;

  IF v_total + v_adjustment < 0 THEN RAISE EXCEPTION 'Revise o desconto e os valores dos itens.' USING ERRCODE='OSC03'; END IF;

  UPDATE public.service_orders SET
    labor_value = v_services, parts_value = v_materials, total_value = ROUND(v_total + v_adjustment, 2),
    use_bdi = v_use_bdi, tax_rate = v_tax, admin_indirect_rate = v_admin,
    profit_rate = v_profit, bdi = v_bdi, total_cost = v_total_cost,
    km_cost = GREATEST(0,COALESCE((v_pricing->>'km_cost')::numeric,0)),
    distance_km = GREATEST(0,COALESCE((v_pricing->>'distance_km')::numeric,0)),
    displacement_cost = GREATEST(0,COALESCE((v_pricing->>'displacement_cost')::numeric,0)),
    commercial_adjustment = v_adjustment
  WHERE id = p_service_order_id;

  RETURN jsonb_build_object('labor_value',v_services,'parts_value',v_materials,'total_value',ROUND(v_total + v_adjustment, 2),
    'total_cost',v_total_cost,'use_bdi',v_use_bdi,'bdi',v_bdi);
END;
$function$;


REVOKE ALL ON FUNCTION public._sync_os_budget_internal(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- Origem financeira canônica: OS, orçamento de origem e todas as parcelas.
-- Helpers privados: nunca expor linhas completas pelo portal público.
CREATE FUNCTION public._os_financial_roots(p_os_id uuid)
RETURNS SETOF public.financial_transactions LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH source AS (
  SELECT so.id,so.company_id,so.quote_id,q.financial_transaction_id,anchor.installment_group_id
  FROM public.service_orders so LEFT JOIN public.quotes q ON q.id=so.quote_id AND q.company_id=so.company_id
  LEFT JOIN public.financial_transactions anchor ON anchor.id=q.financial_transaction_id AND anchor.company_id=so.company_id
  WHERE so.id=p_os_id
 ) SELECT f.* FROM public.financial_transactions f JOIN source s ON s.company_id=f.company_id
 WHERE f.transaction_type='entrada' AND f.parent_transaction_id IS NULL AND f.cancelled_at IS NULL
 AND (f.service_order_id=s.id OR f.id=s.financial_transaction_id
  OR (s.installment_group_id IS NOT NULL AND f.installment_group_id=s.installment_group_id)
  OR EXISTS(SELECT 1 FROM public.tenant_charges c WHERE c.id=f.tenant_charge_id AND c.company_id=s.company_id
   AND ((c.source_type='service_order' AND c.source_id=s.id) OR (c.source_type='quote' AND c.source_id=s.quote_id))));
$$;
REVOKE ALL ON FUNCTION public._os_financial_roots(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._os_related_charges(p_os_id uuid)
RETURNS SETOF public.tenant_charges LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.* FROM public.tenant_charges c JOIN public.service_orders so ON so.company_id=c.company_id
 WHERE so.id=p_os_id AND ((c.source_type='service_order' AND c.source_id=so.id)
  OR (c.source_type='quote' AND c.source_id=so.quote_id)
  OR EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id) f WHERE c.id=f.tenant_charge_id
   OR (c.source_type='receivable' AND c.source_id=f.id)
   OR EXISTS(SELECT 1 FROM public.financial_transactions child WHERE child.company_id=so.company_id
    AND child.parent_transaction_id=f.id AND child.tenant_charge_id=c.id)));
$$;
REVOKE ALL ON FUNCTION public._os_related_charges(uuid) FROM PUBLIC,anon,authenticated;

-- Booleano autenticado para a guarda invoker; helpers com linhas financeiras
-- continuam privados, inclusive para técnicos com acesso à OS.
CREATE FUNCTION public.os_commercial_is_billed(p_os_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id))
  OR public._os_charge_pending(p_os_id)
  OR EXISTS(SELECT 1 FROM public._os_related_charges(p_os_id)
   WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'));
END;
$$;
REVOKE ALL ON FUNCTION public.os_commercial_is_billed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.os_commercial_is_billed(uuid) TO authenticated;

-- Todas as portas de faturamento desta venda compartilham a mesma trava.
CREATE FUNCTION public._lock_os_commercial(p_os_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_origin uuid;
BEGIN
 SELECT COALESCE(quote_id,id) INTO v_origin FROM public.service_orders WHERE id=p_os_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||v_origin::text,0));
END;
$$;
REVOKE ALL ON FUNCTION public._lock_os_commercial(uuid) FROM PUBLIC,anon,authenticated;

-- Escritores anteriores (criação, edição, conversão) continuam passando pela
-- mesma validação de preço. Sem a chave nova, só preço salvo ou de catálogo.
CREATE OR REPLACE FUNCTION public.sync_service_order_budget(
 p_service_order_id uuid, p_items jsonb, p_pricing jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_item jsonb; v_price numeric; v_result jsonb;
BEGIN
 IF NOT public.can_work_os_commercial(p_service_order_id) THEN
  RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501';
 END IF;
 PERFORM public._lock_os_commercial(p_service_order_id);
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_service_order_id FOR UPDATE;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Revise os itens.' USING ERRCODE='OSC03';
 END IF;
 -- Após faturar, preservar o compromisso financeiro; correção é feita no Financeiro.
 IF EXISTS (SELECT 1 FROM public._os_financial_roots(v_so.id))
 OR EXISTS (SELECT 1 FROM public._os_related_charges(v_so.id) c
   WHERE upper(btrim(c.status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')) THEN
  RAISE EXCEPTION 'Esta OS já foi faturada. Ajuste o financeiro antes de alterar os itens.' USING ERRCODE='OSC02';
 END IF;
 IF NOT public.can_price_os(auth.uid()) THEN
  IF COALESCE((p_pricing->>'commercial_adjustment')::numeric,0) <> COALESCE(v_so.commercial_adjustment,0)
    OR COALESCE((p_pricing->>'use_bdi')::boolean,false) <> COALESCE(v_so.use_bdi,false) THEN
   RAISE EXCEPTION 'Você não tem permissão para alterar preços.' USING ERRCODE='42501';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_price := NULL;
   -- Mantém o preço negociado de uma linha existente (incluindo BDI).
   SELECT b.unit_price INTO v_price FROM public.service_order_budget_items b
    WHERE b.service_order_id=v_so.id AND b.description=btrim(v_item->>'description')
    AND b.item_type=COALESCE(v_item->>'item_type','servico')
    AND b.inventory_id IS NOT DISTINCT FROM NULLIF(v_item->>'inventory_id','')::uuid
    AND b.service_type_id IS NOT DISTINCT FROM NULLIF(v_item->>'service_type_id','')::uuid
    AND b.unit_price=ROUND((v_item->>'unit_price')::numeric,2) LIMIT 1;
   IF v_price IS NULL AND v_item->>'item_type'='material' THEN
    SELECT sale_price INTO v_price FROM public.inventory WHERE id=NULLIF(v_item->>'inventory_id','')::uuid
     AND company_id=v_so.company_id AND customer_id IS NULL AND name=btrim(v_item->>'description');
   ELSIF v_price IS NULL THEN
    SELECT COALESCE(default_price,0) INTO v_price FROM public.service_types WHERE id=NULLIF(v_item->>'service_type_id','')::uuid
     AND company_id=v_so.company_id AND is_active AND name=btrim(v_item->>'description');
   END IF;
   IF v_price IS NULL OR ROUND((v_item->>'unit_price')::numeric,2) IS DISTINCT FROM ROUND(v_price,2) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar preços.' USING ERRCODE='42501';
   END IF;
  END LOOP;
 END IF;
 v_result := public._sync_os_budget_internal(p_service_order_id,p_items,p_pricing);
 UPDATE public.service_orders SET commercial_revision=commercial_revision+1 WHERE id=p_service_order_id;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_service_order_budget(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_budget(uuid,jsonb,jsonb) TO authenticated, service_role;

-- Protege valores consolidados contra escrita direta de técnicos pela API.
CREATE FUNCTION public.guard_os_commercial_direct_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF current_user IN ('authenticated','anon') AND NOT public.can_price_os(auth.uid()) AND
   (COALESCE(NEW.total_value,0)<>0 OR COALESCE(NEW.labor_value,0)<>0 OR COALESCE(NEW.parts_value,0)<>0 OR COALESCE(NEW.commercial_adjustment,0)<>0) THEN
   RAISE EXCEPTION 'Adicione os itens pelo orçamento da OS.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF current_user IN ('authenticated','anon') AND
  (NEW.total_value IS DISTINCT FROM OLD.total_value OR NEW.labor_value IS DISTINCT FROM OLD.labor_value
   OR NEW.parts_value IS DISTINCT FROM OLD.parts_value OR NEW.commercial_adjustment IS DISTINCT FROM OLD.commercial_adjustment)
  AND public.os_commercial_is_billed(OLD.id) THEN
  RAISE EXCEPTION 'Esta OS já foi faturada. Ajuste o financeiro antes de alterar os itens.' USING ERRCODE='OSC02';
 END IF;
 IF current_user IN ('authenticated','anon') AND NOT public.can_price_os(auth.uid()) AND
  (NEW.total_value IS DISTINCT FROM OLD.total_value OR NEW.labor_value IS DISTINCT FROM OLD.labor_value
   OR NEW.parts_value IS DISTINCT FROM OLD.parts_value OR NEW.commercial_adjustment IS DISTINCT FROM OLD.commercial_adjustment
   OR NEW.use_bdi IS DISTINCT FROM OLD.use_bdi OR NEW.commercial_revision IS DISTINCT FROM OLD.commercial_revision) THEN
  RAISE EXCEPTION 'Você não tem permissão para alterar preços.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_os_commercial_direct_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_os_commercial_direct_write BEFORE INSERT OR UPDATE ON public.service_orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_os_commercial_direct_write();

-- Alterações de visibilidade fora do editor também invalidam snapshots em campo.
CREATE FUNCTION public.stamp_os_commercial_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.show_values_to_customer IS DISTINCT FROM OLD.show_values_to_customer
  OR NEW.total_value IS DISTINCT FROM OLD.total_value OR NEW.commercial_adjustment IS DISTINCT FROM OLD.commercial_adjustment)
  AND NEW.commercial_revision=OLD.commercial_revision THEN
  NEW.commercial_revision:=OLD.commercial_revision+1;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_os_commercial_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER stamp_os_commercial_revision BEFORE UPDATE ON public.service_orders
 FOR EACH ROW EXECUTE FUNCTION public.stamp_os_commercial_revision();

-- Leitura autenticada do editor: contrato sem custos/margens para o campo.
CREATE FUNCTION public.get_os_field_budget(p_os_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE;
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) THEN
  RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id;
 RETURN jsonb_build_object('revision',v_so.commercial_revision,
  'is_billed',EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id)) OR public._os_charge_pending(p_os_id)
   OR EXISTS(SELECT 1 FROM public._os_related_charges(p_os_id) WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')),
  'show_values',v_so.show_values_to_customer,'total',v_so.total_value,
  'adjustment',COALESCE(v_so.commercial_adjustment,0),'can_price',public.can_price_os(auth.uid()),
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'description',b.description,
   'quantity',b.quantity,'unit_price',b.unit_price,'total_price',b.total_price,'item_type',b.item_type,
   'inventory_id',b.inventory_id,'service_type_id',b.service_type_id) ORDER BY b.position)
   FROM public.service_order_budget_items b WHERE b.service_order_id=v_so.id AND b.company_id=v_so.company_id),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_os_field_budget(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_os_field_budget(uuid) TO authenticated;

CREATE TABLE public.os_commercial_requests (
 request_id uuid PRIMARY KEY, service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.os_commercial_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_commercial_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.os_commercial_requests TO service_role;

CREATE FUNCTION public.save_os_field_budget(p_os_id uuid,p_revision bigint,p_request_id uuid,p_items jsonb,p_show_values boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_previous public.os_commercial_requests%ROWTYPE;
 v_payload jsonb; v_items jsonb; v_pricing jsonb; v_result jsonb;
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) THEN
  RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501';
 END IF;
 PERFORM public._lock_os_commercial(p_os_id);
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id FOR UPDATE;
 v_payload:=jsonb_build_object('revision',p_revision,'items',p_items,'show_values',p_show_values);
 SELECT * INTO v_previous FROM public.os_commercial_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.user_id<>auth.uid() OR v_previous.service_order_id<>p_os_id OR v_previous.payload<>v_payload THEN
   RAISE EXCEPTION 'Não foi possível reenviar esta alteração.' USING ERRCODE='OSC03';
  END IF;
  RETURN v_previous.result;
 END IF;
 IF v_so.status NOT IN ('agendada','pendente','a_caminho','em_andamento','pausada')
  AND NOT (v_so.status='concluida' AND public.can_manage_finance_transactions_current_user()) THEN
  RAISE EXCEPTION 'Esta OS já foi encerrada. Reabra antes de alterar os itens.' USING ERRCODE='OSC02';
 END IF;
 IF v_so.commercial_revision<>p_revision THEN
  RAISE EXCEPTION 'O orçamento mudou em outro dispositivo. Confira a versão atual.' USING ERRCODE='OSC01';
 END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>200 THEN
  RAISE EXCEPTION 'Revise os itens.' USING ERRCODE='OSC03';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x(item) WHERE NULLIF(item->>'id','') IS NOT NULL
  GROUP BY item->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Confira os itens repetidos.' USING ERRCODE='OSC03'; END IF;
 -- Reaproveita metodologia e custos existentes apenas no servidor.
 SELECT COALESCE(jsonb_agg(COALESCE(to_jsonb(b),'{}'::jsonb) || jsonb_build_object(
  'description',x.item->>'description','quantity',x.item->'quantity','unit_price',x.item->'unit_price',
  'item_type',x.item->>'item_type','service_type_id',x.item->>'service_type_id','inventory_id',x.item->>'inventory_id') ||
  jsonb_build_object('pricing_mode',CASE WHEN b.id IS NOT NULL AND b.unit_price=(x.item->>'unit_price')::numeric
   THEN b.pricing_mode ELSE 'manual' END,
   'source_quote_item_id',b.source_quote_item_id,
   'price_override',CASE WHEN b.id IS NOT NULL AND b.unit_price=(x.item->>'unit_price')::numeric
    THEN b.price_override ELSE (x.item->>'unit_price')::numeric END) ORDER BY x.n),'[]'::jsonb)
 INTO v_items FROM jsonb_array_elements(p_items) WITH ORDINALITY x(item,n)
 LEFT JOIN public.service_order_budget_items b ON b.id=NULLIF(x.item->>'id','')::uuid AND b.service_order_id=p_os_id;
 v_pricing:=jsonb_build_object('use_bdi',v_so.use_bdi,'tax_rate',v_so.tax_rate,
  'admin_indirect_rate',v_so.admin_indirect_rate,'profit_rate',v_so.profit_rate,
  'km_cost',v_so.km_cost,'distance_km',v_so.distance_km,'displacement_cost',v_so.displacement_cost,
  'commercial_adjustment',v_so.commercial_adjustment);
 -- Preferência de exibição pode mudar depois do faturamento, sem regravar itens.
 IF jsonb_array_length(p_items)<>(SELECT count(*) FROM public.service_order_budget_items WHERE service_order_id=p_os_id)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x(item)
   LEFT JOIN public.service_order_budget_items b ON b.id=NULLIF(x.item->>'id','')::uuid AND b.service_order_id=p_os_id
   WHERE b.id IS NULL OR b.description IS DISTINCT FROM x.item->>'description'
    OR b.item_type IS DISTINCT FROM x.item->>'item_type' OR b.quantity IS DISTINCT FROM (x.item->>'quantity')::numeric
    OR b.unit_price IS DISTINCT FROM (x.item->>'unit_price')::numeric
    OR b.service_type_id IS DISTINCT FROM NULLIF(x.item->>'service_type_id','')::uuid
    OR b.inventory_id IS DISTINCT FROM NULLIF(x.item->>'inventory_id','')::uuid)
 THEN PERFORM public.sync_service_order_budget(p_os_id,v_items,v_pricing); END IF;
 UPDATE public.service_orders SET show_values_to_customer=COALESCE(p_show_values,false) WHERE id=p_os_id;
 v_result:=public.get_os_field_budget(p_os_id);
 INSERT INTO public.os_commercial_requests VALUES(p_request_id,p_os_id,auth.uid(),v_payload,v_result,now());
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_os_field_budget(uuid,bigint,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_os_field_budget(uuid,bigint,uuid,jsonb,boolean) TO authenticated;

-- Documento do cliente: allowlist explícita. Valores só com a opção ligada.
-- Recebimentos de cobrança usam a cobrança canônica, nunca sua projeção financeira.
-- Receita parcelada/parcial usa a mãe e as filhas, sem somar a mãe duas vezes.
CREATE FUNCTION public.get_os_commercial_document(p_os_id uuid,p_public boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_summary jsonb; v_payments jsonb; v_received numeric; v_company jsonb; v_currency text; v_timezone text;
BEGIN
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id;
 IF NOT FOUND OR v_so.entry_type='tarefa' OR v_so.customer_id IS NULL
  OR NOT public.tenant_subscription_allows_access(v_so.company_id) THEN RETURN NULL; END IF;
 IF NOT p_public AND NOT public.can_work_os_commercial(p_os_id) THEN
  RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501';
 END IF;
 IF v_so.status<>'concluida' THEN RETURN NULL; END IF;
 SELECT currency,timezone INTO v_currency,v_timezone FROM public.company_settings WHERE company_id=v_so.company_id;
 v_timezone:=COALESCE(v_timezone,'America/Sao_Paulo');
 IF v_so.show_values_to_customer THEN
  SELECT jsonb_build_object('currency',COALESCE(v_currency,'BRL'),'items',COALESCE(jsonb_agg(jsonb_build_object(
   'description',b.description,'quantity',b.quantity,'unit_price',b.unit_price,'total_price',b.total_price,
   'item_type',b.item_type) ORDER BY b.position),'[]'::jsonb),
   'total',COALESCE(v_so.total_value,0),'adjustment',COALESCE(v_so.total_value,0)-COALESCE(sum(b.total_price),0))
  INTO v_summary FROM public.service_order_budget_items b WHERE b.service_order_id=p_os_id AND b.company_id=v_so.company_id;
 END IF;
 WITH roots AS (
  SELECT * FROM public._os_financial_roots(p_os_id)
 ), charges AS (
  SELECT * FROM public._os_related_charges(p_os_id)
 ), payments AS (
  SELECT c.id::text AS reference,c.value AS amount,(c.payment_date AT TIME ZONE v_timezone)::date AS paid_date,c.billing_type AS method
  FROM charges c WHERE upper(btrim(c.status)) IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') AND c.payment_date IS NOT NULL
  UNION ALL
  SELECT f.id::text,GREATEST(0,f.amount-COALESCE(f.amount_received,0)),f.paid_date,f.payment_method
   FROM roots f WHERE f.is_paid AND f.paid_date IS NOT NULL AND f.tenant_charge_id IS NULL AND f.asaas_payment_id IS NULL
  UNION ALL
  SELECT child.id::text,child.amount,child.paid_date,child.payment_method
   FROM public.financial_transactions child JOIN roots parent ON parent.id=child.parent_transaction_id
   WHERE child.company_id=v_so.company_id AND child.transaction_type='entrada'
    AND child.category='Recebimento parcial' AND child.tenant_charge_id IS NULL AND child.asaas_payment_id IS NULL
    AND child.cancelled_at IS NULL AND child.is_paid AND child.paid_date IS NOT NULL
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('reference',reference,'amount',amount,'paid_date',paid_date,'method',method)
  ORDER BY paid_date,reference) FILTER(WHERE amount>0),'[]'::jsonb),COALESCE(sum(amount) FILTER(WHERE amount>0),0)
 INTO v_payments,v_received FROM payments;
 SELECT jsonb_build_object('name',COALESCE(NULLIF(cs.name,''),c.name),'document',CASE WHEN cs.show_cnpj_in_documents THEN cs.document END,
  'phone',CASE WHEN cs.show_phone_in_documents THEN cs.phone END,
  'email',CASE WHEN cs.show_email_in_documents THEN cs.email END,
  'address',CASE WHEN cs.show_address_in_documents THEN concat_ws(', ',cs.address,cs.city,cs.state) END,
  'logo_url',CASE WHEN public.company_has_module(c.id,'white_label') AND cs.white_label_enabled THEN COALESCE(NULLIF(cs.white_label_logo_url,''),cs.logo_url) END)
 INTO v_company FROM public.companies c LEFT JOIN public.company_settings cs ON cs.company_id=c.id WHERE c.id=v_so.company_id;
 RETURN jsonb_build_object('summary',v_summary,'receipt',CASE WHEN v_received>0 THEN jsonb_build_object(
  'order_number',v_so.order_number,'currency',COALESCE(v_currency,'BRL'),'received',v_received,'payments',v_payments,'company',v_company,
  'customer',(SELECT jsonb_build_object('name',name,'document',document) FROM public.customers
   WHERE id=v_so.customer_id AND company_id=v_so.company_id)) ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_os_commercial_document(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_os_commercial_document(uuid,boolean) TO anon,authenticated;

-- A conversão legada também usa o preço comercial negociado, com a mesma trava.
CREATE OR REPLACE FUNCTION public.generate_service_order_from_quote(
  p_quote_id uuid,
  p_equipment_services jsonb DEFAULT '[]'::jsonb
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_quote public.quotes%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_service_type_id uuid;
  v_services numeric(14,2) := 0;
  v_materials numeric(14,2) := 0;
  v_items_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(v_user_id) OR public.is_admin_or_gestor(v_user_id)
          OR public.user_has_permission(v_user_id, 'fn:create_os')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar uma ordem de serviço.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||p_quote_id::text,0));
  SELECT * INTO v_quote FROM public.quotes q
   WHERE q.id = p_quote_id
     AND (public.is_super_admin(v_user_id)
          OR (q.company_id = public.get_user_company_id(v_user_id)
              AND public.tenant_subscription_allows_access(q.company_id)))
   FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Orçamento não encontrado ou sem permissão.'; END IF;
  IF v_quote.converted_to_os_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.service_orders WHERE id = v_quote.converted_to_os_id;
    IF v_order.id IS NOT NULL THEN RETURN v_order; END IF;
  END IF;
  IF v_quote.status <> 'aprovado' THEN RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar uma OS.'; END IF;
  IF jsonb_typeof(COALESCE(p_equipment_services, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A distribuição de serviços precisa ser uma lista.';
  END IF;
  IF v_quote.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = v_quote.customer_id AND c.company_id = v_quote.company_id
  ) THEN RAISE EXCEPTION 'O cliente do orçamento não pertence a esta empresa.'; END IF;

  DROP TABLE IF EXISTS pg_temp._quote_distribution;
  CREATE TEMP TABLE _quote_distribution (equipment_id uuid, service_type_id uuid) ON COMMIT DROP;
  INSERT INTO _quote_distribution (equipment_id, service_type_id)
  SELECT NULLIF(item->>'equipment_id', '')::uuid, NULLIF(service_id, '')::uuid
    FROM jsonb_array_elements(COALESCE(p_equipment_services, '[]'::jsonb)) item
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item->'service_type_ids') = 'array'
           THEN item->'service_type_ids' ELSE '[]'::jsonb END
    ) service_id;
  DELETE FROM _quote_distribution a USING _quote_distribution b
   WHERE a.ctid > b.ctid AND a.equipment_id = b.equipment_id AND a.service_type_id = b.service_type_id;

  IF EXISTS (
    SELECT 1 FROM _quote_distribution d LEFT JOIN public.equipment e ON e.id = d.equipment_id
     WHERE e.id IS NULL OR e.company_id IS DISTINCT FROM v_quote.company_id
        OR e.customer_id IS DISTINCT FROM v_quote.customer_id
  ) THEN RAISE EXCEPTION 'Um equipamento não pertence ao cliente deste orçamento.'; END IF;
  IF EXISTS (
    SELECT 1 FROM _quote_distribution d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.quote_items qi
        WHERE qi.quote_id = v_quote.id AND qi.service_type_id = d.service_type_id
     )
  ) THEN RAISE EXCEPTION 'Um serviço distribuído não pertence a este orçamento.'; END IF;
  IF EXISTS (SELECT 1 FROM _quote_distribution) AND EXISTS (
    SELECT 1 FROM public.quote_items qi
     WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM _quote_distribution d WHERE d.service_type_id = qi.service_type_id)
  ) THEN RAISE EXCEPTION 'Distribua todos os serviços do orçamento antes de gerar a OS.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM _quote_distribution)
     AND EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL)
     AND EXISTS (
       SELECT 1 FROM public.equipment e
        WHERE e.company_id = v_quote.company_id AND e.customer_id = v_quote.customer_id
     ) THEN
    RAISE EXCEPTION 'Distribua os serviços entre os equipamentos antes de gerar a OS.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.service_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.service_types st WHERE st.id = qi.service_type_id AND st.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos serviços do orçamento não pertence a esta empresa.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.inventory_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.id = qi.inventory_id AND i.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos materiais do orçamento não pertence a esta empresa.'; END IF;

  SELECT qi.service_type_id INTO v_service_type_id FROM public.quote_items qi
   WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   ORDER BY qi.position, qi.created_at LIMIT 1;
  SELECT COALESCE(SUM(total_price) FILTER (WHERE item_type IN ('servico','mao_de_obra')),0),
         COALESCE(SUM(total_price) FILTER (WHERE item_type='material'),0), COALESCE(SUM(total_price),0)
    INTO v_services, v_materials, v_items_total FROM public.quote_items WHERE quote_id = v_quote.id;
  v_final_total := COALESCE(v_quote.total_value, v_quote.total_price, v_items_total, 0);

  INSERT INTO public.service_orders
    (company_id, customer_id, equipment_id, service_type_id, status, labor_value, parts_value,
     total_value, description, notes, quote_id, created_by)
  VALUES
    (v_quote.company_id, v_quote.customer_id,
     (SELECT equipment_id FROM _quote_distribution ORDER BY equipment_id LIMIT 1),
     v_service_type_id, 'agendada', v_services, v_materials, v_final_total,
     format('Gerada do Orçamento #%s', v_quote.quote_number), v_quote.notes, v_quote.id, v_user_id)
  RETURNING * INTO v_order;

  INSERT INTO public.service_order_budget_items
    (service_order_id, company_id, position, item_type, description, details, quantity,
     unit_price, total_price, inventory_id, service_type_id, source_quote_item_id)
  SELECT v_order.id, v_quote.company_id, qi.position,
         CASE WHEN qi.item_type IN ('servico','mao_de_obra','material') THEN qi.item_type ELSE 'servico' END,
         qi.description, qi.details, qi.quantity, qi.unit_price, ROUND(qi.quantity * qi.unit_price,2),
         qi.inventory_id, qi.service_type_id, qi.id
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id ORDER BY qi.position, qi.created_at;

  INSERT INTO public.service_order_service_types (service_order_id, service_type_id, company_id, position)
  SELECT v_order.id, qi.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (ORDER BY MIN(qi.position), qi.service_type_id)::integer - 1
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   GROUP BY qi.service_type_id;

  INSERT INTO public.service_order_equipment_service_types
    (service_order_id, equipment_id, service_type_id, company_id, position)
  SELECT v_order.id, d.equipment_id, d.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (PARTITION BY d.equipment_id ORDER BY sost.position, d.service_type_id)::integer - 1
    FROM _quote_distribution d
    JOIN public.service_order_service_types sost
      ON sost.service_order_id = v_order.id AND sost.service_type_id = d.service_type_id;

  -- Um checklist ativo ligado a qualquer serviço daquele equipamento é aplicado
  -- uma única vez. Sem checklist vinculado, mantém o equipamento no escopo.
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, ftst.template_id
    FROM _quote_distribution d
    JOIN public.form_template_service_types ftst ON ftst.service_type_id = d.service_type_id
    JOIN public.form_templates ft ON ft.id = ftst.template_id
   WHERE ft.company_id = v_quote.company_id AND ft.is_active = true;
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, NULL::uuid
    FROM _quote_distribution d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.service_order_equipment soe
      WHERE soe.service_order_id = v_order.id AND soe.equipment_id = d.equipment_id
   );

  UPDATE public.quotes SET converted_to_os_id = v_order.id, status = 'convertido' WHERE id = v_quote.id;
  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) IS
  'Gera OS idempotente do orçamento, distribui serviços por equipamento e aplica checklists ativos vinculados.';


-- Conversão preserva atomicidade: a opção nasce junto da OS, com o vínculo
-- dos recebíveis já gerados no orçamento para não faturar a mesma venda outra vez.
CREATE FUNCTION public.generate_service_order_from_quote_with_values(
 p_quote_id uuid,p_equipment_services jsonb DEFAULT '[]'::jsonb,p_show_values boolean DEFAULT false
) RETURNS public.service_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.service_orders%ROWTYPE; v_quote public.quotes%ROWTYPE; v_group uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||p_quote_id::text,0));
 SELECT * INTO v_quote FROM public.quotes WHERE id=p_quote_id
  AND (public.is_super_admin(auth.uid()) OR (company_id=public.get_user_company_id(auth.uid())
   AND public.tenant_subscription_allows_access(company_id))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE='42501'; END IF;
 v_order:=public.generate_service_order_from_quote(p_quote_id,p_equipment_services);
 IF v_quote.converted_to_os_id IS NULL THEN
  UPDATE public.service_orders SET show_values_to_customer=COALESCE(p_show_values,false),
   total_value=COALESCE(v_quote.total_value,v_quote.total_price,v_order.total_value),
   commercial_adjustment=COALESCE(v_quote.total_value,v_quote.total_price,v_order.total_value)-
    COALESCE((SELECT sum(total_price) FROM public.service_order_budget_items WHERE service_order_id=v_order.id),0),
   use_bdi=COALESCE(v_quote.use_bdi,false),tax_rate=GREATEST(0,COALESCE(v_quote.tax_rate,10)),
   admin_indirect_rate=GREATEST(0,COALESCE(v_quote.admin_indirect_rate,12)),
   profit_rate=GREATEST(0,COALESCE(v_quote.profit_rate,10)),bdi=GREATEST(0.01,COALESCE(v_quote.bdi,0.68)),
   total_cost=GREATEST(0,COALESCE(v_quote.total_cost,0)),km_cost=GREATEST(0,COALESCE(v_quote.km_cost,0)),
   distance_km=GREATEST(0,COALESCE(v_quote.distance_km,0)),displacement_cost=GREATEST(0,COALESCE(v_quote.displacement_cost,0))
   WHERE id=v_order.id RETURNING * INTO v_order;
  UPDATE public.service_order_budget_items b SET pricing_mode=qi.pricing_mode,
   unit_hourly_rate=qi.unit_hourly_rate,unit_hours=qi.unit_hours,unit_labor_cost=qi.unit_labor_cost,
   unit_materials_cost=qi.unit_materials_cost,unit_extras_cost=qi.unit_extras_cost,unit_total_cost=qi.unit_total_cost,
   profit_rate=qi.profit_rate,bdi=GREATEST(0.01,COALESCE(qi.bdi,0.68)),price_override=qi.price_override
   FROM public.quote_items qi WHERE b.service_order_id=v_order.id AND b.source_quote_item_id=qi.id AND qi.quote_id=p_quote_id;
 END IF;
 IF v_quote.financial_transaction_id IS NOT NULL THEN
  SELECT installment_group_id INTO v_group FROM public.financial_transactions
   WHERE id=v_quote.financial_transaction_id AND company_id=v_order.company_id;
  UPDATE public.financial_transactions SET service_order_id=v_order.id
   WHERE company_id=v_order.company_id AND (service_order_id IS NULL OR service_order_id=v_order.id)
   AND (id=v_quote.financial_transaction_id OR (v_group IS NOT NULL AND installment_group_id=v_group));
 END IF;
 RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_service_order_from_quote_with_values(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote_with_values(uuid,jsonb,boolean) TO authenticated;

-- Faturamento e recebimento parcial num único commit, com replay do mesmo pedido.
CREATE FUNCTION public.bill_os_receive_payment(
 p_os_id uuid,p_request_id uuid,p_transaction_id uuid DEFAULT NULL,p_total numeric DEFAULT NULL,
 p_received numeric DEFAULT 0,p_expected_received numeric DEFAULT NULL,p_account_id uuid DEFAULT NULL,
 p_method text DEFAULT NULL,p_paid_date date DEFAULT NULL,p_due_date date DEFAULT NULL,
 p_category text DEFAULT NULL,p_fee numeric DEFAULT 0,p_fee_category text DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_parent public.financial_transactions%ROWTYPE;
 v_previous public.os_commercial_requests%ROWTYPE; v_payload jsonb; v_result jsonb;
 v_payment_id uuid; v_remaining numeric; v_today date;
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) OR NOT public.can_manage_finance_transactions_current_user()
  OR NOT (public.is_super_admin(auth.uid()) OR public.is_admin_or_gestor(auth.uid()) OR EXISTS (
   SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND is_active
    AND (permissions ? '*' OR permissions ? 'fn:os_finish_revenue'))) THEN
  RAISE EXCEPTION 'Sem permissão para faturar a OS.' USING ERRCODE='42501';
 END IF;
 PERFORM public._lock_os_commercial(p_os_id);
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id FOR UPDATE;
 v_payload:=jsonb_build_object('operation','receive','parent',p_transaction_id,'total',p_total,'received',p_received,
  'expected_received',p_expected_received,'account',p_account_id,'method',p_method,'date',p_paid_date,
  'due',p_due_date,'category',p_category,'fee',p_fee,'fee_category',p_fee_category,'notes',p_notes);
 SELECT * INTO v_previous FROM public.os_commercial_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.user_id<>auth.uid() OR v_previous.service_order_id<>p_os_id OR v_previous.payload<>v_payload THEN
   RAISE EXCEPTION 'Não foi possível reenviar este recebimento.' USING ERRCODE='OSC03';
  END IF;
  RETURN v_previous.result;
 END IF;
 IF v_so.status='cancelada' OR p_received IS NULL OR p_received<0 OR p_fee IS NULL OR p_fee<0
  OR p_received::text IN ('NaN','Infinity','-Infinity') OR p_fee::text IN ('NaN','Infinity','-Infinity')
  OR p_received<>round(p_received,2) OR p_fee<>round(p_fee,2) THEN
  RAISE EXCEPTION 'Confira o valor recebido.' USING ERRCODE='OSC03';
 END IF;
 IF public._os_charge_pending(p_os_id) OR EXISTS(SELECT 1 FROM public._os_related_charges(p_os_id) c
  WHERE upper(btrim(c.status)) NOT IN ('REFUNDED','CANCELLED','CANCELED','CHARGEBACK')
   AND (p_transaction_id IS NULL OR c.source_type IN ('service_order','quote')
    OR (c.source_type='receivable' AND c.source_id=p_transaction_id)
    OR c.id=(SELECT tenant_charge_id FROM public.financial_transactions WHERE id=p_transaction_id AND company_id=v_so.company_id))) THEN
  RAISE EXCEPTION 'Esta OS já tem cobrança. Confira o recebimento no Financeiro.' USING ERRCODE='OSC02';
 END IF;
 SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.company_settings WHERE company_id=v_so.company_id),'America/Sao_Paulo'))::date INTO v_today;
 IF p_received>0 AND (p_paid_date IS NULL OR p_paid_date>v_today OR p_method IS NULL OR p_method NOT IN ('dinheiro','pix','cartao_debito','cartao_credito','transferencia','boleto','cheque') OR p_account_id IS NULL
  OR NOT public.can_use_bank_accounts(auth.uid()) OR NOT EXISTS (SELECT 1 FROM public.financial_accounts
   WHERE id=p_account_id AND company_id=v_so.company_id AND is_active AND type IN ('banco','caixa'))) THEN
  RAISE EXCEPTION 'Confira a conta, a forma e a data do recebimento.' USING ERRCODE='OSC03';
 END IF;
 IF p_fee>p_received OR (p_fee>0 AND NOT EXISTS (SELECT 1 FROM public.financial_categories
   WHERE company_id=v_so.company_id AND name=p_fee_category AND type='saida' AND is_active)) THEN
  RAISE EXCEPTION 'Confira a tarifa do recebimento.' USING ERRCODE='OSC03';
 END IF;
 IF p_transaction_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id)) THEN
   RAISE EXCEPTION 'A OS já foi faturada. Atualize para receber o saldo.' USING ERRCODE='OSC01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_categories WHERE company_id=v_so.company_id AND name=p_category AND type='entrada' AND is_active) THEN
   RAISE EXCEPTION 'Escolha uma categoria de receita ativa no Financeiro.' USING ERRCODE='OSC03';
  END IF;
  IF COALESCE(v_so.total_value,0)<=0 AND NOT EXISTS(SELECT 1 FROM public.service_order_budget_items WHERE service_order_id=p_os_id) THEN
   IF NOT public.can_price_os(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para informar preços na OS.' USING ERRCODE='42501'; END IF;
   IF p_total IS NULL OR p_total<=0 OR p_total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Informe o valor total da OS.' USING ERRCODE='OSC03';
   END IF;
   -- OS sem orçamento: o valor lançado passa a ser seu item comercial canônico.
   PERFORM public._sync_os_budget_internal(p_os_id,jsonb_build_array(jsonb_build_object('item_type','servico',
    'description',format('Serviços da OS #%s',v_so.order_number),'quantity',1,'unit_price',round(p_total,2),'pricing_mode','manual')),'{}');
   SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id;
  END IF;
  IF p_total IS DISTINCT FROM v_so.total_value THEN
   RAISE EXCEPTION 'O valor da OS mudou. Confira antes de faturar.' USING ERRCODE='OSC01';
  END IF;
  INSERT INTO public.financial_transactions(company_id,service_order_id,customer_id,transaction_type,
   amount,description,category,transaction_date,due_date,is_paid,created_by,origin,notes)
  VALUES(v_so.company_id,p_os_id,v_so.customer_id,'entrada',v_so.total_value,format('OS #%s',v_so.order_number),
   p_category,COALESCE(p_due_date,v_today),COALESCE(p_due_date,v_today),false,auth.uid(),'geral',p_notes) RETURNING * INTO v_parent;
 ELSE
  SELECT * INTO v_parent FROM public.financial_transactions WHERE id=p_transaction_id AND company_id=v_so.company_id
   AND id IN (SELECT id FROM public._os_financial_roots(p_os_id)) AND transaction_type='entrada' AND parent_transaction_id IS NULL
   AND cancelled_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_parent.is_paid OR p_expected_received IS DISTINCT FROM v_parent.amount_received OR p_received<=0 THEN
   RAISE EXCEPTION 'O saldo mudou. Confira antes de receber.' USING ERRCODE='OSC01';
  END IF;
 END IF;
 IF v_parent.service_order_id IS NULL THEN
  UPDATE public.financial_transactions SET service_order_id=p_os_id WHERE id=v_parent.id;
  v_parent.service_order_id:=p_os_id;
 END IF;
 v_remaining:=v_parent.amount-COALESCE(v_parent.amount_received,0);
 IF p_received>v_remaining THEN RAISE EXCEPTION 'O recebimento excede o saldo da OS.' USING ERRCODE='OSC03'; END IF;
 IF p_received>0 THEN
  IF p_received=v_remaining AND COALESCE(v_parent.amount_received,0)=0 THEN
   UPDATE public.financial_transactions SET is_paid=true,paid_date=p_paid_date,account_id=p_account_id,payment_method=p_method,notes=COALESCE(p_notes,notes)
    WHERE id=v_parent.id;
   v_payment_id:=v_parent.id;
  ELSE
   INSERT INTO public.financial_transactions(company_id,parent_transaction_id,customer_id,transaction_type,amount,
    description,category,transaction_date,due_date,paid_date,is_paid,account_id,payment_method,created_by,origin,notes)
   VALUES(v_so.company_id,v_parent.id,v_so.customer_id,'entrada',p_received,format('Recebimento parcial — OS #%s',v_so.order_number),
    'Recebimento parcial',p_paid_date,p_paid_date,p_paid_date,true,p_account_id,p_method,auth.uid(),'geral',p_notes) RETURNING id INTO v_payment_id;
   -- O trigger existente recalcula amount_received da mãe a partir das filhas.
   IF p_due_date IS NOT NULL THEN UPDATE public.financial_transactions SET due_date=p_due_date WHERE id=v_parent.id; END IF;
  END IF;
 END IF;
 IF p_fee>0 THEN
  INSERT INTO public.financial_transactions(company_id,parent_transaction_id,customer_id,transaction_type,amount,
   description,category,transaction_date,due_date,paid_date,is_paid,account_id,payment_method,created_by,origin,notes)
  VALUES(v_so.company_id,v_payment_id,v_so.customer_id,'saida',p_fee,format('Tarifa do recebimento — OS #%s',v_so.order_number),
   p_fee_category,p_paid_date,p_paid_date,p_paid_date,true,p_account_id,p_method,auth.uid(),'geral',p_notes);
 END IF;
 -- O orçamento convertido também passa a apontar para esta dívida da OS.
 UPDATE public.quotes q SET financial_transaction_id=v_parent.id,financial_generated_at=now()
  WHERE q.id=v_so.quote_id AND q.company_id=v_so.company_id AND q.converted_to_os_id=p_os_id
   AND NOT EXISTS(SELECT 1 FROM public.financial_transactions existing
    WHERE existing.id=q.financial_transaction_id AND existing.company_id=v_so.company_id AND existing.cancelled_at IS NULL);
 v_result:=jsonb_build_object('transaction_id',v_parent.id,'received_now',p_received,'remaining',v_remaining-p_received);
 INSERT INTO public.os_commercial_requests VALUES(p_request_id,p_os_id,auth.uid(),v_payload,v_result,now());
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.bill_os_receive_payment(uuid,uuid,uuid,numeric,numeric,numeric,uuid,text,date,date,text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bill_os_receive_payment(uuid,uuid,uuid,numeric,numeric,numeric,uuid,text,date,date,text,numeric,text,text) TO authenticated;

-- O estado de faturamento também reconhece cobranças do orçamento de origem.
CREATE OR REPLACE FUNCTION public.os_billing_state(_service_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_count integer; v_total numeric; v_charge public.tenant_charges%ROWTYPE;
BEGIN
 IF NOT public.can_work_os_commercial(_service_order_id) THEN
  RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_so FROM public.service_orders WHERE id=_service_order_id;
 SELECT count(*)::integer,COALESCE(sum(amount),0) INTO v_count,v_total
  FROM public._os_financial_roots(v_so.id);
 SELECT * INTO v_charge FROM public._os_related_charges(v_so.id)
  WHERE upper(btrim(status)) NOT IN ('REFUNDED','CANCELLED','CANCELED','CHARGEBACK')
  ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('service_order_id',v_so.id,'has_revenue',v_count>0,'revenue_total',v_total,'revenue_count',v_count,
  'has_charge',v_charge.id IS NOT NULL,'charge_id',v_charge.id,'charge_status',v_charge.status,
  'charge_value',v_charge.value,'charge_due_date',v_charge.due_date);
END;
$$;
REVOKE ALL ON FUNCTION public.os_billing_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.os_billing_state(uuid) TO authenticated;

CREATE FUNCTION public.get_os_manual_receivables(p_os_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) OR NOT public.can_manage_finance_transactions_current_user() THEN
  RAISE EXCEPTION 'Sem acesso ao financeiro da OS.' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount,
  'amount_received',COALESCE(f.amount_received,0),'is_paid',f.is_paid,'due_date',f.due_date,
  'installment_total',f.installment_total,'has_live_charge',EXISTS(
   SELECT 1 FROM public._os_related_charges(p_os_id) c WHERE upper(btrim(c.status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')
    AND (c.source_type IN ('service_order','quote') OR c.id=f.tenant_charge_id OR (c.source_type='receivable' AND c.source_id=f.id)))) ORDER BY f.due_date,f.created_at)
  FROM public._os_financial_roots(p_os_id) f),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_os_manual_receivables(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_os_manual_receivables(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
