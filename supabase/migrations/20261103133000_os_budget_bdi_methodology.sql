-- Precificação completa dentro da OS.
--
-- A OS passa a guardar a metodologia comercial, não apenas o preço final.
-- Isso impede que uma OS convertida ou reaberta seja recalculada com custos e
-- configurações atuais da empresa sem uma ação explícita do usuário.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS use_bdi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(7, 4) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS admin_indirect_rate numeric(7, 4) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS profit_rate numeric(7, 4) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS bdi numeric(10, 6) NOT NULL DEFAULT 0.68,
  ADD COLUMN IF NOT EXISTS total_cost numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_cost numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km numeric(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS displacement_cost numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS commercial_adjustment numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_budget_rates_check,
  ADD CONSTRAINT service_orders_budget_rates_check CHECK (
    tax_rate >= 0 AND admin_indirect_rate >= 0 AND profit_rate >= 0
    AND bdi >= 0.01
    AND total_cost >= 0 AND km_cost >= 0 AND distance_km >= 0 AND displacement_cost >= 0
  );

ALTER TABLE public.service_order_budget_items
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS unit_hourly_rate numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_hours numeric(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_labor_cost numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_materials_cost numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_extras_cost numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_total_cost numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate numeric(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bdi numeric(10, 6) NOT NULL DEFAULT 0.68,
  ADD COLUMN IF NOT EXISTS price_override numeric(14, 2);

ALTER TABLE public.service_order_budget_items
  DROP CONSTRAINT IF EXISTS service_order_budget_items_pricing_mode_check,
  ADD CONSTRAINT service_order_budget_items_pricing_mode_check
    CHECK (pricing_mode IN ('registered', 'cost_bdi', 'manual')),
  DROP CONSTRAINT IF EXISTS service_order_budget_items_costs_check,
  ADD CONSTRAINT service_order_budget_items_costs_check CHECK (
    unit_hourly_rate >= 0 AND unit_hours >= 0 AND unit_labor_cost >= 0
    AND unit_materials_cost >= 0 AND unit_extras_cost >= 0 AND unit_total_cost >= 0
    AND profit_rate >= 0 AND bdi >= 0.01 AND (price_override IS NULL OR price_override >= 0)
  );

COMMENT ON COLUMN public.service_orders.use_bdi IS
  'Se a OS usa custo + BDI. Desligado mantém preços cadastrados/manuais como gerador de orçamento padrão.';
COMMENT ON COLUMN public.service_order_budget_items.pricing_mode IS
  'registered mantém preço de venda cadastrado; cost_bdi calcula pelo custo; manual preserva valor negociado.';

-- Ao gerar OS por orçamento, herda o cabeçalho comercial antes do INSERT.
CREATE OR REPLACE FUNCTION public.inherit_service_order_quote_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_items_total numeric(14, 2) := 0;
BEGIN
  IF NEW.quote_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE id = NEW.quote_id;
  IF v_quote.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(qi.total_price), 0) INTO v_items_total
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id;

  NEW.use_bdi := COALESCE(v_quote.use_bdi, false);
  NEW.tax_rate := COALESCE(v_quote.tax_rate, 10);
  NEW.admin_indirect_rate := COALESCE(v_quote.admin_indirect_rate, 12);
  NEW.profit_rate := COALESCE(v_quote.profit_rate, 10);
  NEW.bdi := GREATEST(0.01, COALESCE(v_quote.bdi, 0.68));
  NEW.total_cost := GREATEST(0, COALESCE(v_quote.total_cost, 0));
  NEW.km_cost := GREATEST(0, COALESCE(v_quote.km_cost, 0));
  NEW.distance_km := GREATEST(0, COALESCE(v_quote.distance_km, 0));
  NEW.displacement_cost := GREATEST(0, COALESCE(v_quote.displacement_cost, 0));
  NEW.commercial_adjustment := ROUND(COALESCE(v_quote.total_price, v_quote.total_value, v_items_total) - v_items_total, 2);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_order_inherit_quote_pricing ON public.service_orders;
CREATE TRIGGER trg_service_order_inherit_quote_pricing
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.inherit_service_order_quote_pricing();

-- A RPC de conversão vigente não precisa ser duplicada: ela já informa o item
-- de origem. Somente inserts sem metadados (sentinela abaixo) herdam o snapshot.
CREATE OR REPLACE FUNCTION public.inherit_service_order_budget_quote_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_item public.quote_items%ROWTYPE;
  v_use_bdi boolean;
  v_registered_price numeric;
BEGIN
  IF NEW.source_quote_item_id IS NULL
     OR NEW.unit_total_cost <> 0
     OR NEW.price_override IS NOT NULL
     OR NEW.pricing_mode <> 'manual' THEN
    RETURN NEW;
  END IF;

  SELECT qi.* INTO v_item
    FROM public.quote_items qi
   WHERE qi.id = NEW.source_quote_item_id;
  IF v_item.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(q.use_bdi, false) INTO v_use_bdi
    FROM public.quotes q WHERE q.id = v_item.quote_id;

  IF v_item.item_type = 'material' THEN
    SELECT COALESCE(i.sale_price, i.cost_price, 0)
      INTO v_registered_price FROM public.inventory i WHERE i.id = v_item.inventory_id;
  ELSE
    SELECT st.default_price
      INTO v_registered_price FROM public.service_types st WHERE st.id = v_item.service_type_id;
  END IF;

  NEW.unit_hourly_rate := GREATEST(0, COALESCE(v_item.unit_hourly_rate, 0));
  NEW.unit_hours := GREATEST(0, COALESCE(v_item.unit_hours, 0));
  NEW.unit_labor_cost := GREATEST(0, COALESCE(v_item.unit_labor_cost, 0));
  NEW.unit_materials_cost := GREATEST(0, COALESCE(v_item.unit_materials_cost, 0));
  NEW.unit_extras_cost := GREATEST(0, COALESCE(v_item.unit_extras_cost, 0));
  NEW.unit_total_cost := GREATEST(0, COALESCE(v_item.unit_total_cost, 0));
  NEW.profit_rate := GREATEST(0, COALESCE(v_item.profit_rate, 0));
  NEW.bdi := GREATEST(0.01, COALESCE(v_item.bdi, 0.68));

  IF v_use_bdi AND v_item.price_override IS NULL AND COALESCE(v_item.unit_total_cost, 0) > 0 THEN
    NEW.pricing_mode := 'cost_bdi';
    NEW.price_override := NULL;
  ELSIF v_registered_price IS NOT NULL AND abs(v_item.unit_price - v_registered_price) < 0.01 THEN
    NEW.pricing_mode := 'registered';
    NEW.price_override := v_item.unit_price;
  ELSE
    NEW.pricing_mode := 'manual';
    NEW.price_override := v_item.unit_price;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_order_budget_inherit_quote_item_pricing ON public.service_order_budget_items;
CREATE TRIGGER trg_service_order_budget_inherit_quote_item_pricing
  BEFORE INSERT ON public.service_order_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.inherit_service_order_budget_quote_item_pricing();

-- Snapshot/backfill de OS já convertidas, sem alterar nenhum preço final.
UPDATE public.service_orders so
   SET use_bdi = COALESCE(q.use_bdi, false),
       tax_rate = COALESCE(q.tax_rate, 10),
       admin_indirect_rate = COALESCE(q.admin_indirect_rate, 12),
       profit_rate = COALESCE(q.profit_rate, 10),
       bdi = GREATEST(0.01, COALESCE(q.bdi, 0.68)),
       total_cost = GREATEST(0, COALESCE(q.total_cost, 0)),
       km_cost = GREATEST(0, COALESCE(q.km_cost, 0)),
       distance_km = GREATEST(0, COALESCE(q.distance_km, 0)),
       displacement_cost = GREATEST(0, COALESCE(q.displacement_cost, 0)),
       commercial_adjustment = ROUND(
         COALESCE(q.total_price, q.total_value, (
           SELECT COALESCE(SUM(qi.total_price), 0) FROM public.quote_items qi WHERE qi.quote_id = q.id
         )) - (
           SELECT COALESCE(SUM(qi.total_price), 0) FROM public.quote_items qi WHERE qi.quote_id = q.id
         ), 2
       )
  FROM public.quotes q
 WHERE so.quote_id = q.id;

UPDATE public.service_order_budget_items sobi
   SET unit_hourly_rate = GREATEST(0, COALESCE(qi.unit_hourly_rate, 0)),
       unit_hours = GREATEST(0, COALESCE(qi.unit_hours, 0)),
       unit_labor_cost = GREATEST(0, COALESCE(qi.unit_labor_cost, 0)),
       unit_materials_cost = GREATEST(0, COALESCE(qi.unit_materials_cost, 0)),
       unit_extras_cost = GREATEST(0, COALESCE(qi.unit_extras_cost, 0)),
       unit_total_cost = GREATEST(0, COALESCE(qi.unit_total_cost, 0)),
       profit_rate = GREATEST(0, COALESCE(qi.profit_rate, 0)),
       bdi = GREATEST(0.01, COALESCE(qi.bdi, 0.68)),
       pricing_mode = CASE
         WHEN COALESCE(q.use_bdi, false) AND qi.price_override IS NULL AND COALESCE(qi.unit_total_cost, 0) > 0
           THEN 'cost_bdi'
         WHEN qi.item_type = 'material' AND abs(qi.unit_price - COALESCE(i.sale_price, i.cost_price, 0)) < 0.01
           THEN 'registered'
         WHEN qi.item_type <> 'material' AND st.default_price IS NOT NULL AND abs(qi.unit_price - st.default_price) < 0.01
           THEN 'registered'
         ELSE 'manual'
       END,
       price_override = CASE
         WHEN COALESCE(q.use_bdi, false) AND qi.price_override IS NULL AND COALESCE(qi.unit_total_cost, 0) > 0
           THEN NULL
         ELSE qi.unit_price
       END
  FROM public.quote_items qi
  JOIN public.quotes q ON q.id = qi.quote_id
  LEFT JOIN public.inventory i ON i.id = qi.inventory_id
  LEFT JOIN public.service_types st ON st.id = qi.service_type_id
 WHERE sobi.source_quote_item_id = qi.id;

-- OS legadas/diretas continuam exatamente com o preço já salvo.
UPDATE public.service_order_budget_items
   SET pricing_mode = 'manual', price_override = unit_price
 WHERE source_quote_item_id IS NULL;

DROP FUNCTION IF EXISTS public.sync_service_order_budget(uuid, jsonb);

CREATE FUNCTION public.sync_service_order_budget(
  p_service_order_id uuid,
  p_items jsonb,
  p_pricing jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
  IF NOT (
    public.is_super_admin(v_user_id) OR public.can_edit_os(v_user_id)
    OR public.is_admin_or_gestor(v_user_id) OR public.has_full_permissions(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:edit_os')
    OR public.user_has_permission(v_user_id, 'fn:create_os')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta ordem de serviço.' USING ERRCODE = '42501';
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
        OR COALESCE((item->>'unit_price')::numeric, 0) < 0
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
    ROUND((item->>'quantity')::numeric * (item->>'unit_price')::numeric,2),
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

REVOKE ALL ON FUNCTION public.sync_service_order_budget(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_budget(uuid, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_service_order_budget(uuid, jsonb, jsonb) IS
  'Sincroniza itens e metodologia da OS, preserva preços negociados e recalcula totais/custo no servidor.';

REVOKE ALL ON FUNCTION public.inherit_service_order_quote_pricing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_service_order_budget_quote_item_pricing() FROM PUBLIC, anon, authenticated;
