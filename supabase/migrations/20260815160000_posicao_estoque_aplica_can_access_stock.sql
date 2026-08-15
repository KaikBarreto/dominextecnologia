-- POSIÇÃO DE ESTOQUE: aplicar ACL por local (can_access_stock) na RPC de saldo.
--
-- Contexto do bug:
--   A aba "Posição de Estoque" NÃO lê a tabela `stocks` direto (onde a RLS já
--   aplica can_access_stock desde 20260814225028). Ela chama a RPC
--   get_stock_balance_at_date, que é SECURITY DEFINER e por isso IGNORA a RLS.
--   O filtro atual é só por company_id, então a RPC devolvia o saldo de TODOS os
--   locais da empresa — vazando dados de locais restritos que o usuário não pode ver.
--
-- Fix:
--   CREATE OR REPLACE preservando assinatura e corpo IDÊNTICOS à definição VIVA
--   (pg_get_functiondef), adicionando apenas o guard no WHERE:
--       AND public.can_access_stock(auth.uid(), s.id)
--   Assim a RPC só retorna linhas de locais que o usuário pode acessar — inclusive
--   quando p_stock_ids é NULL (sem filtro). admin/gestor/super_admin passam
--   (can_access_stock retorna true pra eles); local aberto (sem stock_access) passa.
--
--   Assinatura (nome, parâmetros, RETURNS TABLE) permanece IDÊNTICA → sem drift de types.
-- Idempotente por CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_stock_balance_at_date(
  p_at        timestamptz,
  p_stock_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  stock_id     uuid,
  stock_name   text,
  inventory_id uuid,
  sku          text,
  name         text,
  unit         text,
  saldo        numeric,
  cost_price   numeric,
  sale_price   numeric,
  valor        numeric,
  projecao     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'p_at é obrigatório';
  END IF;

  -- empresa do caller (service_role/uid NULL não resolve — retorna vazio).
  v_company_id := get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id                            AS stock_id,
    s.name                          AS stock_name,
    i.id                            AS inventory_id,
    i.sku                           AS sku,
    i.name                          AS name,
    i.unit                          AS unit,
    SUM(m.quantity)::numeric        AS saldo,
    COALESCE(i.cost_price, 0)::numeric AS cost_price,
    COALESCE(i.sale_price, 0)::numeric AS sale_price,
    (SUM(m.quantity) * COALESCE(i.cost_price, 0))::numeric AS valor,
    (SUM(m.quantity) * COALESCE(i.sale_price, 0))::numeric AS projecao
  FROM public.inventory_movements m
  JOIN public.inventory i ON i.id = m.inventory_id
  JOIN public.stocks s    ON s.id = m.stock_id
  WHERE m.company_id = v_company_id
    AND m.created_at <= p_at
    AND (p_stock_ids IS NULL OR m.stock_id = ANY(p_stock_ids))
    -- ACL por local: só devolve saldo de locais que o usuário pode acessar.
    -- (SECURITY DEFINER fura a RLS de stocks; este guard reconstrói a barreira.)
    AND public.can_access_stock(auth.uid(), s.id)
  GROUP BY s.id, s.name, i.id, i.sku, i.name, i.unit, i.cost_price, i.sale_price
  HAVING SUM(m.quantity) <> 0
  ORDER BY
    s.name,
    (CASE WHEN i.sku ~ '^[0-9]+$' THEN i.sku::bigint END) NULLS LAST,
    i.sku,
    i.name;
END;
$$;

COMMENT ON FUNCTION public.get_stock_balance_at_date(timestamptz, uuid[])
  IS 'Posição de estoque: saldo de cada (material, local) na data p_at somando inventory_movements até p_at (empresa do caller). p_stock_ids NULL = todos os locais QUE O USUÁRIO PODE ACESSAR (can_access_stock). Valorização por inventory.cost_price atual. Só materiais com saldo <> 0.';

GRANT EXECUTE ON FUNCTION public.get_stock_balance_at_date(timestamptz, uuid[]) TO authenticated, service_role;
