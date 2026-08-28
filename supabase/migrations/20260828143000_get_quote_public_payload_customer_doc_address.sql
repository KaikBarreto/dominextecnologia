-- Proposta pública (/proposta/:token, ProposalPublic.tsx): o CEO pediu que o
-- documento de orçamento passe a exibir também o CNPJ e o ENDEREÇO COMPLETO do
-- cliente destinatário — hoje só saíam name/email/phone.
--
-- MUDANÇA (aditiva e cirúrgica): ACRESCENTA ao bloco `customer` do payload
-- SOMENTE os campos de identificação do próprio cliente:
--   document, address, address_number, complement,
--   neighborhood, city, state, zip_code
--
-- Não é vazamento cross-tenant: são os dados de identificação do PRÓPRIO cliente
-- destinatário, aparecendo no PRÓPRIO link do orçamento dele.
--
-- ALLOWLIST ESTRITA preservada: nada de custo/margem/ids internos/campos
-- financeiros. Nunca to_jsonb(c.*)/SELECT c.* — SELECT explícito.
--
-- Base: partida da DEFINIÇÃO VIVA mais recente
-- (20260823121000_get_quote_public_payload_charge_short_code.sql), copiada
-- byte-a-byte. Todo o resto — quote, items, company, charge_public_short_code,
-- allowlist, SECURITY DEFINER, search_path, STABLE e os GRANTs — permanece
-- IDÊNTICO. A ÚNICA alteração é o SELECT do cliente.

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
  v_charge_short_code text;
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

  -- Cliente do orçamento (contato + identificação do próprio destinatário),
  -- quando houver. ACRESCENTADO: document + endereço completo (allowlist).
  IF v_customer_id IS NOT NULL THEN
    SELECT to_jsonb(t)
    INTO v_customer
    FROM (
      SELECT c.name, c.email, c.phone,
             c.document, c.address, c.address_number, c.complement,
             c.neighborhood, c.city, c.state, c.zip_code
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

  -- Cobrança do orçamento (Onda D): a mais recente NÃO cancelada/estornada
  -- daquele quote. Escopada por company_id + source_type='quote' + source_id.
  -- ALLOWLIST: SÓ o public_short_code sai daqui — nada de value/custo/asaas/etc.
  SELECT tc.public_short_code
    INTO v_charge_short_code
  FROM public.tenant_charges tc
  WHERE tc.company_id = v_company_id
    AND tc.source_type = 'quote'
    AND tc.source_id = v_quote_id
    AND tc.status NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')
  ORDER BY tc.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'quote',    v_quote,
    'items',    v_items,
    'customer', v_customer,             -- jsonb objeto ou NULL
    'company',  v_company,              -- jsonb objeto ou NULL
    'charge_public_short_code', v_charge_short_code  -- text ou NULL (Onda D)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;
