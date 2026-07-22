-- P0 #2 — O payload público vazava custo/margem/BDI internos.
--
-- get_quote_public_payload(_token) montava `quote` e `items` com
-- to_jsonb(v_quote) / to_jsonb(qi.*), devolvendo pro ANÔNIMO todas as colunas —
-- inclusive segredos comerciais: em `quotes` (total_cost, bdi, profit_rate,
-- admin_indirect_rate, km_cost, financial_transaction_id, assigned_to,
-- created_by...) e em `quote_items` (unit_labor_cost, unit_materials_cost,
-- unit_extras_cost, unit_total_cost, unit_hourly_rate, profit_rate, bdi,
-- price_override).
--
-- Correção: projeção EXPLÍCITA (allowlist) só com campos client-facing. A
-- allowlist foi cruzada com o que os templates realmente leem
-- (src/components/quotes/templates/shared.ts + Clean/Vanguarda + a página
-- ProposalPublic.tsx). O resto da função (customer, company, escopo por
-- company_id, SECURITY DEFINER, search_path) permanece idêntico.

CREATE OR REPLACE FUNCTION public.get_quote_public_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quote_id   uuid;
  v_company_id uuid;
  v_customer_id uuid;
  v_quote   jsonb;
  v_items   jsonb;
  v_customer jsonb;
  v_company jsonb;
BEGIN
  -- Resolve o orçamento SÓ pelo token. Tudo abaixo é escopado por este quote.
  SELECT q.id, q.company_id, q.customer_id
    INTO v_quote_id, v_company_id, v_customer_id
  FROM public.quotes q
  WHERE q.token = _token
  LIMIT 1;

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Quote: allowlist client-facing. NÃO expõe custo/margem/BDI nem quem criou.
  -- Campos confirmados em uso: quote_number, status, prospect_* / customer_id,
  -- notes, terms (CleanTemplate/VanguardaTemplate), valid_until (formatValidUntil),
  -- subtotal/total_value/discount_*/displacement_cost/distance_km (blocos de
  -- Investimento), card_discount_rate/card_installments (formas de pagamento),
  -- include_gifts (hasGifts → seção Brindes), created_at (data da proposta),
  -- proposal_template_id + status + token (ProposalPublic.tsx).
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
      q.created_at,
      q.token
    FROM public.quotes q
    WHERE q.id = v_quote_id
    LIMIT 1
  ) t;

  -- Itens: allowlist client-facing. Remove os *_cost internos, profit_rate,
  -- bdi e price_override. Campos usados pelos templates: description, details,
  -- quantity, unit_price, total_price; item_type/position ordenam e agrupam.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          qi.id,
        'position',    qi.position,
        'item_type',   qi.item_type,
        'description', qi.description,
        'details',     qi.details,
        'quantity',    qi.quantity,
        'unit_price',  qi.unit_price,
        'total_price', qi.total_price
      )
      ORDER BY qi.created_at, qi.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote_id;

  -- Cliente do orçamento (só contato visível), quando houver.
  IF v_customer_id IS NOT NULL THEN
    SELECT to_jsonb(t)
    INTO v_customer
    FROM (
      SELECT c.name, c.email, c.phone
      FROM public.customers c
      WHERE c.id = v_customer_id
      LIMIT 1
    ) t;
  END IF;

  -- Empresa do orçamento: ESCOPADA por quote.company_id. Só identidade visual,
  -- contato e personalização da proposta — sem chaves/tokens/segredos internos.
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
      cs.white_label_primary_color
    FROM public.company_settings cs
    WHERE cs.company_id = v_company_id
    LIMIT 1
  ) t;

  RETURN jsonb_build_object(
    'quote',    v_quote,
    'items',    v_items,
    'customer', v_customer,   -- jsonb objeto ou NULL
    'company',  v_company     -- jsonb objeto ou NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;
