-- Restaura no payload público da proposta os campos regionais do tenant.
-- Uma redefinição posterior da RPC preservou identidade/branding, mas deixou de
-- selecionar language/currency/timezone. O link então caía silenciosamente em
-- pt-br/BRL/São Paulo. country_code entra na mesma allowlist, sem expor nenhum
-- dado interno adicional.

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
  v_quote jsonb;
  v_items jsonb;
  v_customer jsonb;
  v_company jsonb;
  v_charge_short_code text;
BEGIN
  SELECT q.id, q.company_id, q.customer_id
    INTO v_quote_id, v_company_id, v_customer_id
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
      q.created_at,
      q.token
    FROM public.quotes q
    WHERE q.id = v_quote_id
    LIMIT 1
  ) t;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'position', qi.position,
        'item_type', qi.item_type,
        'description', qi.description,
        'details', qi.details,
        'quantity', qi.quantity,
        'unit_price', qi.unit_price,
        'total_price', qi.total_price
      )
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
      LIMIT 1
    ) t;
  END IF;

  -- Allowlist pública: identidade, branding e configuração regional somente.
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

GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;
