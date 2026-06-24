-- Proposta pública (/proposta/:token) é ANÔNIMA. Hoje o frontend lê
-- company_settings direto via `.from('company_settings').limit(1).single()`:
--   1) sem escopo da empresa do orçamento (pega linha aleatória), e
--   2) bloqueado pelo RLS anônimo (a policy anon de company_settings só vale
--      via customer_portal ativo — a proposta não tem esse contexto).
-- Resultado: a proposta abre com empresa GENÉRICA (sem nome/logo/cores).
--
-- Igual ao padrão do get_public_os: o dado da empresa (e itens/cliente) tem que
-- vir pelo PAYLOAD de uma RPC SECURITY DEFINER, escopado por quote.company_id,
-- nunca por leitura client-side. Esta função devolve UM jsonb com tudo que a
-- proposta pública precisa, sem vazar outras empresas e sem expor segredos.

CREATE OR REPLACE FUNCTION public.get_quote_public_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quote   public.quotes%ROWTYPE;
  v_items   jsonb;
  v_customer jsonb;
  v_company jsonb;
BEGIN
  -- Resolve o orçamento SÓ pelo token. Tudo abaixo é escopado por este quote.
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE token = _token
  LIMIT 1;

  IF v_quote.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Itens do orçamento (apenas deste quote).
  SELECT COALESCE(jsonb_agg(to_jsonb(qi.*) ORDER BY qi.created_at, qi.id), '[]'::jsonb)
  INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote.id;

  -- Cliente do orçamento (só contato visível), quando houver.
  IF v_quote.customer_id IS NOT NULL THEN
    SELECT to_jsonb(t)
    INTO v_customer
    FROM (
      SELECT c.name, c.email, c.phone
      FROM public.customers c
      WHERE c.id = v_quote.customer_id
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
    WHERE cs.company_id = v_quote.company_id
    LIMIT 1
  ) t;

  RETURN jsonb_build_object(
    'quote',    to_jsonb(v_quote),
    'items',    v_items,
    'customer', v_customer,   -- jsonb objeto ou NULL
    'company',  v_company     -- jsonb objeto ou NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;
