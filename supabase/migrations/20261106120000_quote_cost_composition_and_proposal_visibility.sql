-- Snapshot detalhado de custo por item e visibilidade explícita na proposta.
-- Custos continuam privados por padrão; a RPC pública libera somente os dois
-- agregados autorizados pelo operador naquele orçamento.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS show_labor_cost_in_proposal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_inputs_cost_in_proposal boolean NOT NULL DEFAULT false;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS cost_composition jsonb,
  ADD COLUMN IF NOT EXISTS pricing_mode text;

UPDATE public.quote_items
SET pricing_mode = CASE
  WHEN price_override IS NULL THEN 'cost_bdi'
  ELSE 'manual'
END
WHERE pricing_mode IS NULL;

ALTER TABLE public.quote_items
  ALTER COLUMN pricing_mode SET DEFAULT 'manual',
  ALTER COLUMN pricing_mode SET NOT NULL;

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_pricing_mode_check;

ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_pricing_mode_check
  CHECK (pricing_mode IN ('registered', 'cost_bdi', 'manual'));

COMMENT ON COLUMN public.quote_items.cost_composition IS
  'Snapshot privado e editável da composição do custo neste orçamento. Nunca expor inteiro no payload público.';
COMMENT ON COLUMN public.quotes.show_labor_cost_in_proposal IS
  'Autoriza exibir somente o agregado de mão de obra por serviço na proposta.';
COMMENT ON COLUMN public.quotes.show_inputs_cost_in_proposal IS
  'Autoriza exibir somente o agregado de insumos por serviço na proposta.';

-- O fluxo público oficial usa RPCs SECURITY DEFINER. RLS não protege colunas:
-- retirar acesso direto impede que quem possui o token consulte custos internos
-- por quote_items(*), contornando os toggles visuais.
DROP POLICY IF EXISTS "Public can view quote by valid token" ON public.quotes;
DROP POLICY IF EXISTS "Public can update quote by valid token" ON public.quotes;
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can update quote by token" ON public.quotes;
DROP POLICY IF EXISTS "Public view quotes by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can view quote_items by valid quote" ON public.quote_items;
DROP POLICY IF EXISTS "Public view quote_items via quote" ON public.quote_items;
DROP POLICY IF EXISTS "Public can view quote_items" ON public.quote_items;

REVOKE SELECT, UPDATE ON TABLE public.quotes FROM PUBLIC, anon;
REVOKE SELECT ON TABLE public.quote_items FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_quote_public_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quote_id uuid;
  v_company_id uuid;
  v_customer_id uuid;
  v_show_labor boolean := false;
  v_show_inputs boolean := false;
  v_quote jsonb;
  v_items jsonb;
  v_customer jsonb;
  v_company jsonb;
  v_charge_short_code text;
BEGIN
  SELECT
    q.id,
    q.company_id,
    q.customer_id,
    COALESCE(q.show_labor_cost_in_proposal, false),
    COALESCE(q.show_inputs_cost_in_proposal, false)
  INTO v_quote_id, v_company_id, v_customer_id, v_show_labor, v_show_inputs
  FROM public.quotes q
  WHERE q.token = _token
  LIMIT 1;

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(t) INTO v_quote
  FROM (
    SELECT
      q.id,
      q.quote_number,
      q.status,
      q.prospect_name,
      q.prospect_email,
      q.prospect_phone,
      q.customer_id,
      q.notes,
      q.terms,
      q.valid_until,
      q.subtotal,
      q.total_value,
      q.discount_type,
      q.discount_value,
      q.discount_amount,
      q.tax_rate,
      q.card_discount_rate,
      q.card_installments,
      q.displacement_cost,
      q.distance_km,
      q.include_gifts,
      q.proposal_template_id,
      q.show_labor_cost_in_proposal,
      q.show_inputs_cost_in_proposal,
      q.created_at,
      q.token
    FROM public.quotes q
    WHERE q.id = v_quote_id
    LIMIT 1
  ) t;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', qi.id,
        'position', qi.position,
        'item_type', qi.item_type,
        'description', qi.description,
        'details', qi.details,
        'quantity', qi.quantity,
        'unit_price', qi.unit_price,
        'total_price', qi.total_price,
        'unit_labor_cost', CASE WHEN v_show_labor THEN qi.unit_labor_cost ELSE NULL END,
        'unit_materials_cost', CASE WHEN v_show_inputs THEN qi.unit_materials_cost ELSE NULL END
      ))
      ORDER BY qi.created_at, qi.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote_id;

  IF v_customer_id IS NOT NULL THEN
    SELECT to_jsonb(t)
    INTO v_customer
    FROM (
      SELECT
        c.name,
        c.email,
        c.phone,
        c.document,
        c.address,
        c.address_number,
        c.complement,
        c.neighborhood,
        c.city,
        c.state,
        c.zip_code
      FROM public.customers c
      WHERE c.id = v_customer_id
        AND c.company_id = v_company_id
      LIMIT 1
    ) t;
  END IF;

  SELECT to_jsonb(t)
  INTO v_company
  FROM (
    SELECT
      cs.name,
      cs.document,
      cs.logo_url,
      cs.phone,
      cs.email,
      cs.address,
      cs.address_number,
      cs.complement,
      cs.neighborhood,
      cs.city,
      cs.state,
      cs.zip_code,
      cs.proposal_customization,
      cs.white_label_enabled,
      cs.white_label_logo_url,
      cs.white_label_icon_url,
      cs.white_label_primary_color,
      cs.country_code,
      cs.language,
      cs.currency,
      cs.timezone
    FROM public.company_settings cs
    WHERE cs.company_id = v_company_id
    LIMIT 1
  ) t;

  SELECT tc.public_short_code
  INTO v_charge_short_code
  FROM public.tenant_charges tc
  WHERE tc.company_id = v_company_id
    AND tc.source_type = 'quote'
    AND tc.source_id = v_quote_id
    AND tc.status NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK')
  ORDER BY tc.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'quote', v_quote,
    'items', v_items,
    'customer', v_customer,
    'company', v_company,
    'charge_public_short_code', v_charge_short_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_quote_public_payload(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;

-- Opt-in explícito do formulário: promove o snapshot daquele orçamento para o
-- padrão do tipo de serviço. A operação é atômica por serviço e deriva a empresa
-- do cadastro, nunca do payload do cliente.
CREATE OR REPLACE FUNCTION public.save_service_cost_composition_from_quote(
  _service_id uuid,
  _hourly_rate numeric,
  _hours numeric,
  _resources jsonb,
  _supplies jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_company_id uuid;
  v_cost_id uuid;
  v_extra_costs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT st.company_id
  INTO v_company_id
  FROM public.service_types st
  WHERE st.id = _service_id
  FOR UPDATE;

  -- Replica a permissão de escrita do catálogo. Super admin não ganha escrita
  -- entre empresas neste fluxo; ausência de empresa/permissão falha fechado.
  IF v_company_id IS NULL
    OR v_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
    OR public.can_manage_system(auth.uid()) IS NOT TRUE
    OR public.tenant_subscription_allows_access(v_company_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Serviço não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(_resources, '[]'::jsonb)) IS DISTINCT FROM 'array'
    OR jsonb_typeof(COALESCE(_supplies, '[]'::jsonb)) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Composição de custos inválida.' USING ERRCODE = '22023';
  END IF;

  -- SECURITY DEFINER ignora RLS: validar todos os vínculos ANTES de substituir
  -- o catálogo impede pendurar recursos/estoque de outra empresa no serviço.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_supplies, '[]'::jsonb)) AS rows(line)
    WHERE NULLIF(line->>'stockItemId', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory inventory
        WHERE inventory.id = (line->>'stockItemId')::uuid
          AND inventory.company_id = v_company_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_resources, '[]'::jsonb)) AS rows(line)
    WHERE (
      line->>'source' = 'resource'
      AND NULLIF(line->>'resourceId', '') IS NULL
    ) OR (
      line->>'source' IN ('resource', 'gift')
      AND NULLIF(line->>'resourceId', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cost_resources resource
        WHERE resource.id = (line->>'resourceId')::uuid
          AND resource.company_id = v_company_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Recurso ou insumo não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'label', COALESCE(NULLIF(trim(line->>'label'), ''), 'Custo extra'),
      'amount', GREATEST(COALESCE((line->>'quantity')::numeric, 0), 0)
        * GREATEST(COALESCE((line->>'unitCost')::numeric, 0), 0)
    )),
    '[]'::jsonb
  )
  INTO v_extra_costs
  FROM jsonb_array_elements(COALESCE(_resources, '[]'::jsonb)) AS rows(line)
  WHERE COALESCE(line->>'source', 'extra') = 'extra';

  SELECT sc.id
  INTO v_cost_id
  FROM public.service_costs sc
  WHERE sc.company_id = v_company_id
    AND sc.service_id = _service_id
  ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_cost_id IS NULL THEN
    INSERT INTO public.service_costs (company_id, service_id, hourly_rate, hours, extra_costs)
    VALUES (
      v_company_id,
      _service_id,
      GREATEST(COALESCE(_hourly_rate, 0), 0),
      GREATEST(COALESCE(_hours, 0), 0),
      v_extra_costs
    );
  ELSE
    UPDATE public.service_costs
    SET hourly_rate = GREATEST(COALESCE(_hourly_rate, 0), 0),
        hours = GREATEST(COALESCE(_hours, 0), 0),
        extra_costs = v_extra_costs,
        updated_at = now()
    WHERE id = v_cost_id;
  END IF;

  DELETE FROM public.service_materials
  WHERE company_id = v_company_id
    AND service_id = _service_id;

  INSERT INTO public.service_materials (
    company_id,
    service_id,
    item_name,
    unit,
    quantity,
    purchase_price,
    subtotal,
    sort_order,
    stock_item_id
  )
  SELECT
    v_company_id,
    _service_id,
    COALESCE(NULLIF(trim(line->>'label'), ''), 'Insumo'),
    COALESCE(NULLIF(trim(line->>'unit'), ''), 'un'),
    GREATEST(COALESCE((line->>'quantity')::numeric, 0), 0),
    GREATEST(COALESCE((line->>'unitCost')::numeric, 0), 0),
    GREATEST(COALESCE((line->>'quantity')::numeric, 0), 0)
      * GREATEST(COALESCE((line->>'unitCost')::numeric, 0), 0),
    ordinality - 1,
    NULLIF(line->>'stockItemId', '')::uuid
  FROM jsonb_array_elements(COALESCE(_supplies, '[]'::jsonb)) WITH ORDINALITY AS rows(line, ordinality);

  DELETE FROM public.service_cost_resources
  WHERE service_id = _service_id;

  INSERT INTO public.service_cost_resources (service_id, resource_id, override_value)
  SELECT
    _service_id,
    (line->>'resourceId')::uuid,
    GREATEST(COALESCE((line->>'quantity')::numeric, 0), 0)
      * GREATEST(COALESCE((line->>'unitCost')::numeric, 0), 0)
  FROM jsonb_array_elements(COALESCE(_resources, '[]'::jsonb)) AS rows(line)
  WHERE line->>'source' = 'resource'
    AND NULLIF(line->>'resourceId', '') IS NOT NULL;

  DELETE FROM public.service_gifts
  WHERE service_id = _service_id;

  INSERT INTO public.service_gifts (service_id, resource_id, name, quantity, unit_cost)
  SELECT
    _service_id,
    NULLIF(line->>'resourceId', '')::uuid,
    COALESCE(NULLIF(trim(line->>'label'), ''), 'Brinde'),
    GREATEST(COALESCE((line->>'quantity')::numeric, 0), 0),
    GREATEST(COALESCE((line->>'unitCost')::numeric, 0), 0)
  FROM jsonb_array_elements(COALESCE(_resources, '[]'::jsonb)) AS rows(line)
  WHERE line->>'source' = 'gift';
END;
$function$;

REVOKE ALL ON FUNCTION public.save_service_cost_composition_from_quote(uuid, numeric, numeric, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_service_cost_composition_from_quote(uuid, numeric, numeric, jsonb, jsonb)
  TO authenticated, service_role;
