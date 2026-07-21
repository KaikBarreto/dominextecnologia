-- ONDA 2 — Overhaul de Estoque: INVENTÁRIO (contagem física) + POSIÇÃO DE ESTOQUE
-- ============================================================================
-- Constrói sobre a Onda 1 (v1.17.11 / 20260721160000_multi_estoque_e_grupos_material):
--   * stocks                    — locais de estoque (1 is_default por empresa)
--   * inventory                 — catálogo (inventory.quantity é ESPELHO via trigger)
--   * inventory_stock_levels    — FONTE DE VERDADE do saldo por (inventory_id, stock_id)
--   * inventory_movements       — ledger (stock_id NOT NULL, register_inventory_movement)
--
-- PARTE A — Inventário: cabeçalho (inventory_counts) + escopo de locais
--   (inventory_count_stocks) + linhas contadas (inventory_count_items). Numeração
--   sequencial por empresa (padrão dos counters, igual compras_number_counters).
--   finalize_inventory_count aplica os ajustes atômicos e fecha o inventário.
--
-- PARTE B — Posição de Estoque: get_stock_balance_at_date reconstrói o saldo de
--   cada (material, local) numa data, somando inventory_movements até p_at.
--
-- Invariantes:
--   * RLS espelha inventory: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
--   * NÃO escrever inventory.quantity direto — só inventory_stock_levels (trigger reflete).
--   * finalize usa saldo ATUAL como base do delta (não expected_qty snapshot), pra não
--     sobrescrever movimentações ocorridas durante a contagem. Resultado final = counted_qty.
--   * Idempotente (IF NOT EXISTS / DROP ... IF EXISTS). Reaplicar não quebra.
-- ============================================================================

------------------------------------------------------------
-- PARTE A.1 — Numeração sequencial por empresa (counters)
--   Espelha EXATAMENTE compras_number_counters + next_compra_numero.
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_count_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value int NOT NULL DEFAULT 1
);

ALTER TABLE public.inventory_count_number_counters ENABLE ROW LEVEL SECURITY;
-- Sem acesso do client. Só via função SECURITY DEFINER (contorna RLS).
REVOKE ALL ON public.inventory_count_number_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_inventory_count_numero(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_consumed int;
BEGIN
  -- Upsert atômico (mesmo padrão de next_compra_numero): primeira inserção
  -- consome 1, conflitos somam 1 e RETURNING (next_value-1) = valor consumido.
  INSERT INTO public.inventory_count_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN v_consumed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_inventory_count_numero(uuid) TO authenticated, service_role;

------------------------------------------------------------
-- PARTE A.2 — inventory_counts (cabeçalho do inventário)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  numero        integer,                 -- preenchido pelo trigger (sequencial por empresa)
  status        text NOT NULL DEFAULT 'aberto'
                CHECK (status IN ('aberto','finalizado','cancelado')),
  notes         text,                    -- "Observações", preenchido antes de finalizar
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  finalized_at  timestamptz
);
COMMENT ON TABLE public.inventory_counts IS 'Cabeçalho de um inventário (contagem física). numero é sequencial por empresa. status aberto->finalizado|cancelado.';

CREATE INDEX IF NOT EXISTS idx_inventory_counts_company_id ON public.inventory_counts(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON public.inventory_counts(status);

DROP TRIGGER IF EXISTS set_inventory_counts_updated_at ON public.inventory_counts;
CREATE TRIGGER set_inventory_counts_updated_at
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger BEFORE INSERT: numera quando vier NULL (igual set_compra_numero)
CREATE OR REPLACE FUNCTION public.set_inventory_count_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.numero IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.numero := public.next_inventory_count_numero(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_inventory_count_numero ON public.inventory_counts;
CREATE TRIGGER trg_set_inventory_count_numero
  BEFORE INSERT ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_count_numero();

-- UNIQUE (company_id, numero) — só após termos o trigger; sem backfill (tabela nova)
ALTER TABLE public.inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_company_numero_unique;
ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_company_numero_unique UNIQUE (company_id, numero);

------------------------------------------------------------
-- PARTE A.3 — inventory_count_stocks (escopo: quais LOCAIS entram)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_count_stocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  count_id   uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  stock_id   uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, stock_id)
);
COMMENT ON TABLE public.inventory_count_stocks IS 'Locais (stocks) cobertos por um inventário. Um inventário pode cobrir 1+ locais.';

CREATE INDEX IF NOT EXISTS idx_inventory_count_stocks_company_id ON public.inventory_count_stocks(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_stocks_count_id ON public.inventory_count_stocks(count_id);

------------------------------------------------------------
-- PARTE A.4 — inventory_count_items (linhas contadas)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  count_id     uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id),
  stock_id     uuid NOT NULL REFERENCES public.stocks(id),
  expected_qty numeric NOT NULL,              -- saldo do sistema no momento da geração (snapshot)
  counted_qty  numeric,                       -- quantidade contada; NULL = ainda não contado
  unit_cost    numeric,                       -- snapshot de inventory.cost_price p/ valorizar diff
  -- Coluna gerada: divergência = contado - esperado. counted_qty NULL vira 0
  -- na comparação (item não contado = 0 divergência exibida).
  diff         numeric GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - expected_qty) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, inventory_id, stock_id)
);
COMMENT ON TABLE public.inventory_count_items IS 'Linhas de um inventário: material x local, esperado (snapshot), contado, custo unitário e divergência gerada.';

CREATE INDEX IF NOT EXISTS idx_inventory_count_items_company_id ON public.inventory_count_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count_id ON public.inventory_count_items(count_id);

DROP TRIGGER IF EXISTS set_inventory_count_items_updated_at ON public.inventory_count_items;
CREATE TRIGGER set_inventory_count_items_updated_at
  BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- PARTE A.5 — RLS espelhada de inventory nas 3 tabelas novas
--   Predicado: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
------------------------------------------------------------

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'inventory_counts',
    'inventory_count_stocks',
    'inventory_count_items'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_select_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_insert_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_update_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_delete_own_company', t);
  END LOOP;
END $$;

------------------------------------------------------------
-- PARTE A.6 — RPC finalize_inventory_count
--   Aplica os ajustes atômicos e fecha o inventário. Idempotente por status.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_inventory_count(
  p_count_id uuid,
  p_notes    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id    uuid;
  v_status        text;
  v_user_company  uuid;
  v_numero        integer;
  r_item          RECORD;
  v_current       numeric;
  v_delta         numeric;
  v_adjusted      int := 0;
  v_diff_value    numeric := 0;
BEGIN
  -- carrega e trava o cabeçalho
  SELECT company_id, status, numero
    INTO v_company_id, v_status, v_numero
    FROM public.inventory_counts
   WHERE id = p_count_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventário não encontrado: %', p_count_id USING ERRCODE = 'no_data_found';
  END IF;

  -- guard de tenant
  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: inventário de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- IDEMPOTENTE: já finalizado => não reaplica, retorna resumo neutro.
  IF v_status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'count_id', p_count_id,
      'already_finalized', true,
      'items_adjusted', 0,
      'diff_value', 0
    );
  END IF;

  IF v_status <> 'aberto' THEN
    RAISE EXCEPTION 'Inventário não está aberto (status=%)', v_status USING ERRCODE = 'check_violation';
  END IF;

  -- grava observações se vier
  IF p_notes IS NOT NULL THEN
    UPDATE public.inventory_counts SET notes = p_notes WHERE id = p_count_id;
  END IF;

  -- Para cada item contado com divergência: aplica AJUSTE atômico.
  -- Base do delta = saldo ATUAL do level (não expected_qty snapshot), pra não
  -- sobrescrever movimentos ocorridos durante a contagem. Resultado = counted_qty.
  FOR r_item IN
    SELECT id, inventory_id, stock_id, counted_qty, unit_cost
      FROM public.inventory_count_items
     WHERE count_id = p_count_id
       AND counted_qty IS NOT NULL
     ORDER BY inventory_id, stock_id
  LOOP
    -- garante o level e trava, lendo saldo atual
    INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
    VALUES (v_company_id, r_item.inventory_id, r_item.stock_id, 0)
    ON CONFLICT (inventory_id, stock_id) DO NOTHING;

    SELECT quantity INTO v_current
      FROM public.inventory_stock_levels
     WHERE inventory_id = r_item.inventory_id AND stock_id = r_item.stock_id
     FOR UPDATE;

    v_delta := r_item.counted_qty - COALESCE(v_current, 0);

    IF v_delta <> 0 THEN
      -- caminho atômico único: move o saldo (delta assinado) e grava o movimento 'ajuste'.
      PERFORM public.register_inventory_movement(
        p_inventory_id     => r_item.inventory_id,
        p_movement_type    => 'ajuste',
        p_quantity         => v_delta,
        p_supplier_id      => NULL,
        p_unit_cost        => r_item.unit_cost,
        p_notes            => 'Inventário #' || COALESCE(v_numero::text, '?'),
        p_service_order_id => NULL,
        p_related_movement_id => NULL,
        p_stock_id         => r_item.stock_id
      );

      v_adjusted   := v_adjusted + 1;
      v_diff_value := v_diff_value + (v_delta * COALESCE(r_item.unit_cost, 0));
    END IF;
  END LOOP;

  UPDATE public.inventory_counts
     SET status = 'finalizado', finalized_at = now()
   WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'count_id', p_count_id,
    'already_finalized', false,
    'items_adjusted', v_adjusted,
    'diff_value', v_diff_value
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_inventory_count(uuid, text)
  IS 'Finaliza um inventário: para cada item contado com divergência vs. saldo ATUAL, grava ajuste atômico via register_inventory_movement (delta assinado) e o level fica = counted_qty. Idempotente por status. Retorna jsonb {count_id, already_finalized, items_adjusted, diff_value}.';

GRANT EXECUTE ON FUNCTION public.finalize_inventory_count(uuid, text) TO authenticated, service_role;

------------------------------------------------------------
-- PARTE A.7 — View de divergências (leitura pro relatório / export)
--   Junta item + material + local. O frontend filtra por count_id.
--   RLS: a view herda o predicado das tabelas base (é SELECT com RLS ativo).
------------------------------------------------------------

DROP VIEW IF EXISTS public.inventory_count_divergences;
CREATE VIEW public.inventory_count_divergences
WITH (security_invoker = true) AS
SELECT
  ci.id             AS item_id,
  ci.company_id,
  ci.count_id,
  ic.numero         AS count_numero,
  ic.status         AS count_status,
  ci.inventory_id,
  i.name            AS material_name,
  i.sku             AS material_sku,
  i.unit            AS material_unit,
  ci.stock_id,
  s.name            AS stock_name,
  ci.expected_qty,
  ci.counted_qty,
  ci.diff,
  COALESCE(ci.unit_cost, i.cost_price, 0)         AS unit_cost,
  (ci.diff * COALESCE(ci.unit_cost, i.cost_price, 0)) AS diff_value
FROM public.inventory_count_items ci
JOIN public.inventory_counts ic ON ic.id = ci.count_id
JOIN public.inventory i         ON i.id = ci.inventory_id
JOIN public.stocks s            ON s.id = ci.stock_id;

COMMENT ON VIEW public.inventory_count_divergences
  IS 'Divergências de inventário para relatório/export: material+local+esperado+contado+diff+valorização. security_invoker: respeita RLS das tabelas base. Frontend filtra por count_id.';

GRANT SELECT ON public.inventory_count_divergences TO authenticated, service_role;

------------------------------------------------------------
-- PARTE B — POSIÇÃO DE ESTOQUE
--   get_stock_balance_at_date(p_at, p_stock_ids) reconstrói o saldo por
--   (material, local) na data, somando inventory_movements até p_at.
--
-- Escolha de valorização (documentada): usamos inventory.cost_price ATUAL
--   (não custo médio point-in-time). No Dominex a origem de custo é register_
--   inventory_movement.unit_cost e o cadastro inventory.cost_price; construir
--   custo médio point-in-time a partir dos movimentos adicionaria risco sem
--   ganho pedido nesta onda. valor = saldo × cost_price; projeção = saldo × sale_price.
------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_stock_balance_at_date(timestamptz, uuid[]);

CREATE FUNCTION public.get_stock_balance_at_date(
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
  IS 'Posição de estoque: saldo de cada (material, local) na data p_at somando inventory_movements até p_at (empresa do caller). p_stock_ids NULL = todos os locais. Valorização por inventory.cost_price atual. Só materiais com saldo <> 0.';

GRANT EXECUTE ON FUNCTION public.get_stock_balance_at_date(timestamptz, uuid[]) TO authenticated, service_role;
