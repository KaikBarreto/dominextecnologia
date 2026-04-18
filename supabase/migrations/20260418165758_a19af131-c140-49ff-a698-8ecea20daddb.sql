
-- Função pública para portal do cliente
CREATE OR REPLACE FUNCTION public.get_portal_by_token(_token text)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, customer_id, is_active, created_at
  FROM public.customer_portals
  WHERE token = _token AND is_active = true
  LIMIT 1
$$;

-- Função pública para orçamento/proposta
CREATE OR REPLACE FUNCTION public.get_quote_by_token(_token text)
RETURNS SETOF public.quotes
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.quotes WHERE token = _token LIMIT 1
$$;

-- Função pública para avaliação NPS
CREATE OR REPLACE FUNCTION public.get_rating_by_token(_token text)
RETURNS SETOF public.service_ratings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.service_ratings WHERE token = _token LIMIT 1
$$;

-- Garantir que anon possa executar
GRANT EXECUTE ON FUNCTION public.get_portal_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rating_by_token(text) TO anon, authenticated;
