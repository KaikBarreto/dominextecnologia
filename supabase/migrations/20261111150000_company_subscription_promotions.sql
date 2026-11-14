-- Promoções itemizadas da assinatura: módulos e usuários adicionais com valor
-- reduzido (inclusive zero) por N cobranças mensais confirmadas.
-- companies.subscription_value permanece a mensalidade NORMAL integral.

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pricing_adjustment_source text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_pricing_adjustment_source_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_pricing_adjustment_source_check
  CHECK (pricing_adjustment_source IS NULL OR pricing_adjustment_source = 'item_promotions');

CREATE TABLE public.company_subscription_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('module', 'extra_users')),
  module_code text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  standard_unit_price numeric(12,2) NOT NULL CHECK (standard_unit_price > 0),
  promotional_unit_price numeric(12,2) NOT NULL CHECK (
    promotional_unit_price >= 0 AND promotional_unit_price <= standard_unit_price
  ),
  billing_cycles integer NOT NULL CHECK (billing_cycles BETWEEN 1 AND 60),
  consumed_cycles integer NOT NULL DEFAULT 0 CHECK (
    consumed_cycles >= 0 AND consumed_cycles <= billing_cycles
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT company_subscription_promotions_scope_check CHECK (
    (scope_type = 'module' AND module_code IS NOT NULL AND btrim(module_code) <> '' AND quantity = 1)
    OR (scope_type = 'extra_users' AND module_code IS NULL)
  )
);

CREATE UNIQUE INDEX company_subscription_promotions_one_active_scope
  ON public.company_subscription_promotions (company_id, scope_type, COALESCE(module_code, ''))
  WHERE status = 'active';
CREATE INDEX company_subscription_promotions_company_status
  ON public.company_subscription_promotions (company_id, status, created_at);

CREATE TABLE public.company_subscription_promotion_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.company_subscription_promotions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_key text NOT NULL CHECK (btrim(payment_key) <> ''),
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, payment_key),
  UNIQUE (promotion_id, cycle_number)
);

CREATE TABLE public.company_subscription_price_sync (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  target_monthly_value numeric(12,2) NOT NULL CHECK (target_monthly_value > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'not_applicable')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_subscription_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscription_promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscription_promotion_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscription_promotion_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscription_price_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscription_price_sync FORCE ROW LEVEL SECURITY;

CREATE POLICY "Admin and own company read subscription promotions"
  ON public.company_subscription_promotions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );
CREATE POLICY "Admin and own company read promotion consumptions"
  ON public.company_subscription_promotion_consumptions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );
CREATE POLICY "Admin reads subscription price sync"
  ON public.company_subscription_price_sync FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );

REVOKE INSERT, UPDATE, DELETE ON public.company_subscription_promotions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.company_subscription_promotion_consumptions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.company_subscription_price_sync FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_company_effective_subscription_value(p_company_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT CASE
      WHEN c.pricing_adjustment_source = 'item_promotions' THEN COALESCE(c.subscription_value, 0)
      WHEN COALESCE(c.custom_price, 0) > 0
       AND (COALESCE(c.custom_price_permanent, false)
         OR (COALESCE(c.custom_price_months, 0) > 0
          AND COALESCE(c.custom_price_payments_made, 0) < c.custom_price_months))
      THEN c.custom_price
      ELSE COALESCE(c.subscription_value, 0)
    END AS monthly_value
    FROM public.companies c WHERE c.id = p_company_id
  ), discounts AS (
    SELECT COALESCE(sum((p.standard_unit_price - p.promotional_unit_price) * p.quantity), 0) amount
    FROM public.company_subscription_promotions p
    WHERE p.company_id = p_company_id AND p.status = 'active'
      AND p.consumed_cycles < p.billing_cycles
  )
  SELECT round(base.monthly_value - discounts.amount, 2)
  FROM base CROSS JOIN discounts;
$$;
REVOKE ALL ON FUNCTION public.get_company_effective_subscription_value(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_effective_subscription_value(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_company_subscription_promotion_price(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_value numeric;
  v_active boolean;
  v_source text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.company_subscription_promotions
    WHERE company_id = p_company_id AND status = 'active' AND consumed_cycles < billing_cycles
  ) INTO v_active;
  SELECT pricing_adjustment_source INTO v_source FROM public.companies WHERE id = p_company_id;
  v_value := public.get_company_effective_subscription_value(p_company_id);
  IF v_value IS NULL THEN RAISE EXCEPTION 'empresa_nao_encontrada'; END IF;
  IF v_active AND v_value <= 0 THEN RAISE EXCEPTION 'valor_efetivo_invalido'; END IF;

  UPDATE public.companies
     SET custom_price = CASE
           WHEN v_active THEN v_value
           WHEN v_source = 'item_promotions' THEN NULL
           ELSE custom_price END,
         custom_price_permanent = CASE
           WHEN v_active THEN true
           WHEN v_source = 'item_promotions' THEN false
           ELSE custom_price_permanent END,
         custom_price_months = CASE
           WHEN v_active OR v_source = 'item_promotions' THEN NULL
           ELSE custom_price_months END,
         custom_price_payments_made = CASE
           WHEN v_active OR v_source = 'item_promotions' THEN 0
           ELSE custom_price_payments_made END,
         pricing_adjustment_source = CASE WHEN v_active THEN 'item_promotions' ELSE NULL END,
         updated_at = now()
   WHERE id = p_company_id;
  RETURN v_value;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_company_subscription_promotion_price(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_company_subscription_promotion_price(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_company_subscription_price_sync(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_value numeric;
BEGIN
  v_value := public.refresh_company_subscription_promotion_price(p_company_id);
  -- Trial gratuito/empresa sem mensalidade não tem recorrência paga para
  -- sincronizar. Ainda executamos o refresh acima para limpar eventual
  -- espelho antigo, mas não criamos uma linha que violaria o CHECK do outbox.
  IF v_value IS NULL OR v_value <= 0 THEN
    DELETE FROM public.company_subscription_price_sync WHERE company_id = p_company_id;
    RETURN v_value;
  END IF;
  INSERT INTO public.company_subscription_price_sync (
    company_id, target_monthly_value, status, attempts, last_error, requested_at, synced_at, updated_at
  ) VALUES (p_company_id, v_value, 'pending', 0, NULL, clock_timestamp(), NULL, now())
  ON CONFLICT (company_id) DO UPDATE SET
    target_monthly_value = EXCLUDED.target_monthly_value, status = 'pending',
    last_error = NULL, requested_at = clock_timestamp(), synced_at = NULL, updated_at = now();
  RETURN v_value;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_company_subscription_price_sync(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_company_subscription_price_sync(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_company_subscription_promotions(p_company_id uuid, p_payment_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_promotion record;
  v_inserted integer;
  v_consumed integer := 0;
  v_value numeric;
  v_has_active boolean;
BEGIN
  IF p_payment_key IS NULL OR btrim(p_payment_key) = '' THEN RAISE EXCEPTION 'payment_key_invalida'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  SELECT EXISTS (
    SELECT 1 FROM public.company_subscription_promotions
    WHERE company_id = p_company_id AND status = 'active' AND consumed_cycles < billing_cycles
  ) INTO v_has_active;
  IF NOT v_has_active THEN
    RETURN jsonb_build_object(
      'consumed', 0,
      'effective_value', public.get_company_effective_subscription_value(p_company_id),
      'sync_required', false
    );
  END IF;
  IF COALESCE((SELECT billing_cycle FROM public.companies WHERE id = p_company_id), 'monthly') <> 'monthly' THEN
    RETURN jsonb_build_object(
      'consumed', 0,
      'effective_value', public.get_company_effective_subscription_value(p_company_id),
      'sync_required', false
    );
  END IF;

  FOR v_promotion IN
    SELECT p.* FROM public.company_subscription_promotions p
    WHERE p.company_id = p_company_id AND p.status = 'active' AND p.consumed_cycles < p.billing_cycles
    ORDER BY p.created_at, p.id FOR UPDATE
  LOOP
    INSERT INTO public.company_subscription_promotion_consumptions (
      promotion_id, company_id, payment_key, cycle_number
    ) VALUES (v_promotion.id, p_company_id, p_payment_key, v_promotion.consumed_cycles + 1)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 1 THEN
      UPDATE public.company_subscription_promotions SET
        consumed_cycles = consumed_cycles + 1,
        status = CASE WHEN consumed_cycles + 1 >= billing_cycles THEN 'completed' ELSE status END,
        completed_at = CASE WHEN consumed_cycles + 1 >= billing_cycles THEN now() ELSE completed_at END,
        updated_at = now()
      WHERE id = v_promotion.id;
      v_consumed := v_consumed + 1;
    END IF;
  END LOOP;

  IF v_consumed > 0 THEN
    v_value := public.enqueue_company_subscription_price_sync(p_company_id);
  ELSE
    v_value := public.get_company_effective_subscription_value(p_company_id);
  END IF;
  RETURN jsonb_build_object('consumed', v_consumed, 'effective_value', v_value, 'sync_required', v_consumed > 0);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_company_subscription_promotions(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_company_subscription_promotions(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_promotions_from_company_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Upgrade proporcional, ajuste avulso e outras receitas não representam uma
  -- cobrança mensal confirmada e não podem queimar um ciclo da promoção.
  IF lower(COALESCE(NEW.type, '')) NOT IN ('primeira_venda', 'renovacao', 'renewal') THEN
    RETURN NEW;
  END IF;
  PERFORM public.consume_company_subscription_promotions(
    NEW.company_id,
    CASE WHEN NEW.asaas_payment_id IS NOT NULL AND btrim(NEW.asaas_payment_id) <> ''
      THEN 'asaas:' || NEW.asaas_payment_id ELSE 'company-payment:' || NEW.id::text END
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_promotions_from_company_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_consume_subscription_promotions ON public.company_payments;
CREATE TRIGGER trg_consume_subscription_promotions AFTER INSERT ON public.company_payments
FOR EACH ROW EXECUTE FUNCTION public.consume_promotions_from_company_payment();

-- A exclusão de um lançamento manual incorreto devolve o ciclo consumido. Só
-- permitimos a compensação quando ele ainda é o último ciclo de cada promoção;
-- isso evita criar buracos/duplicar cycle_number em exclusões não cronológicas.
CREATE OR REPLACE FUNCTION public.restore_promotions_from_deleted_company_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payment_key text;
  v_restored integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  v_payment_key := CASE
    WHEN OLD.asaas_payment_id IS NOT NULL AND btrim(OLD.asaas_payment_id) <> ''
      THEN 'asaas:' || OLD.asaas_payment_id
    ELSE 'company-payment:' || OLD.id::text
  END;

  IF EXISTS (
    SELECT 1
      FROM public.company_subscription_promotion_consumptions c
      JOIN public.company_subscription_promotions p ON p.id = c.promotion_id
     WHERE c.company_id = OLD.company_id
       AND c.payment_key = v_payment_key
       AND c.cycle_number <> p.consumed_cycles
  ) THEN
    RAISE EXCEPTION 'pagamento_promocional_nao_e_ultimo';
  END IF;

  WITH removed AS (
    DELETE FROM public.company_subscription_promotion_consumptions
     WHERE company_id = OLD.company_id AND payment_key = v_payment_key
     RETURNING promotion_id
  ), restored AS (
    SELECT promotion_id, count(*)::integer AS cycles FROM removed GROUP BY promotion_id
  )
  UPDATE public.company_subscription_promotions p
     SET consumed_cycles = GREATEST(0, p.consumed_cycles - restored.cycles),
         status = CASE WHEN p.status = 'completed' THEN 'active' ELSE p.status END,
         completed_at = CASE WHEN p.status = 'completed' THEN NULL ELSE p.completed_at END,
         updated_at = now()
    FROM restored
   WHERE p.id = restored.promotion_id;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  IF v_restored > 0 THEN
    PERFORM public.enqueue_company_subscription_price_sync(OLD.company_id);
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_promotions_from_deleted_company_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_restore_subscription_promotions ON public.company_payments;
CREATE TRIGGER trg_restore_subscription_promotions AFTER DELETE ON public.company_payments
FOR EACH ROW EXECUTE FUNCTION public.restore_promotions_from_deleted_company_payment();

-- Segunda barreira para upgrades pendentes criados antes da promoção. As
-- edges bloqueiam novas solicitações; este trigger impede que uma cotação já
-- aberta altere a base/tier/quantidade enquanto o desconto itemizado vigora.
CREATE OR REPLACE FUNCTION public.prevent_subscription_change_with_active_promotions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_subscription_promotions
     WHERE company_id = OLD.id AND status = 'active' AND consumed_cycles < billing_cycles
  ) AND (
    NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
    OR NEW.subscription_value IS DISTINCT FROM OLD.subscription_value
    OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
    OR NEW.max_users IS DISTINCT FROM OLD.max_users
    OR NEW.extra_users IS DISTINCT FROM OLD.extra_users
    OR NEW.nfse_tier IS DISTINCT FROM OLD.nfse_tier
    OR NEW.whatsapp_tier IS DISTINCT FROM OLD.whatsapp_tier
  ) THEN
    RAISE EXCEPTION 'alteracao_assinatura_bloqueada_por_promocao';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_subscription_change_with_active_promotions() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prevent_subscription_change_with_active_promotions ON public.companies;
CREATE TRIGGER trg_prevent_subscription_change_with_active_promotions
BEFORE UPDATE OF subscription_plan, subscription_value, billing_cycle, max_users, extra_users, nfse_tier, whatsapp_tier
ON public.companies FOR EACH ROW
EXECUTE FUNCTION public.prevent_subscription_change_with_active_promotions();

-- Escrita atômica da ficha: preserva a versão viva com `segments` e, quando a
-- chave promotions está presente, sincroniza a fotografia dos itens ativos sem
-- reiniciar consumed_cycles de IDs existentes.
CREATE OR REPLACE FUNCTION public.admin_apply_company_update(
  p_company_id uuid,
  p_patch jsonb,
  p_modules text[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_segments text[];
  v_promotions jsonb;
  v_item jsonb;
  v_id uuid;
  v_keep_ids uuid[] := ARRAY[]::uuid[];
  v_previous_active_ids uuid[] := ARRAY[]::uuid[];
  v_scope text;
  v_module text;
  v_quantity integer;
  v_standard numeric;
  v_promotional numeric;
  v_cycles integer;
  v_consumed integer;
BEGIN
  v_segments := public.normalize_company_segments(
    CASE WHEN jsonb_typeof(p_patch->'segments') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'segments'))
      ELSE ARRAY[]::text[] END,
    p_patch->>'segment'
  );

  -- Suspende a fotografia anterior dentro da mesma transação antes de alterar
  -- a base comercial. Assim a barreira contra upgrades externos não impede o
  -- admin de editar/cancelar a própria promoção após reajuste de catálogo.
  IF p_patch ? 'promotions' THEN
    v_promotions := p_patch->'promotions';
    IF jsonb_typeof(v_promotions) <> 'array' THEN RAISE EXCEPTION 'promocoes_invalidas'; END IF;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO v_previous_active_ids
      FROM public.company_subscription_promotions
     WHERE company_id = p_company_id AND status = 'active';
    UPDATE public.company_subscription_promotions SET
      status = 'cancelled', completed_at = now(), updated_at = now()
    WHERE company_id = p_company_id AND status = 'active';
  END IF;

  UPDATE public.companies c SET
    name = p_patch->>'name', cnpj = NULLIF(p_patch->>'cnpj', ''),
    email = NULLIF(p_patch->>'email', ''), phone = NULLIF(p_patch->>'phone', ''),
    address = NULLIF(p_patch->>'address', ''), contact_name = NULLIF(p_patch->>'contact_name', ''),
    subscription_status = p_patch->>'subscription_status', subscription_plan = p_patch->>'subscription_plan',
    subscription_value = (p_patch->>'subscription_value')::numeric,
    subscription_expires_at = NULLIF(p_patch->>'subscription_expires_at', '')::timestamptz,
    billing_cycle = p_patch->>'billing_cycle', max_users = (p_patch->>'max_users')::integer,
    notes = NULLIF(p_patch->>'notes', ''), origin = NULLIF(p_patch->>'origin', ''),
    salesperson_id = NULLIF(p_patch->>'salesperson_id', '')::uuid, sdr_id = NULL,
    affiliate_id = NULLIF(p_patch->>'affiliate_id', '')::uuid,
    segments = v_segments, segment = v_segments[1],
    custom_price = CASE
      WHEN c.pricing_adjustment_source = 'item_promotions' AND NOT (p_patch ? 'promotions') THEN c.custom_price
      ELSE NULLIF(p_patch->>'custom_price', '')::numeric END,
    custom_price_permanent = CASE
      WHEN c.pricing_adjustment_source = 'item_promotions' AND NOT (p_patch ? 'promotions') THEN c.custom_price_permanent
      ELSE COALESCE((p_patch->>'custom_price_permanent')::boolean, true) END,
    custom_price_months = CASE
      WHEN c.pricing_adjustment_source = 'item_promotions' AND NOT (p_patch ? 'promotions') THEN c.custom_price_months
      ELSE NULLIF(p_patch->>'custom_price_months', '')::integer END,
    nfse_tier = (p_patch->>'nfse_tier')::integer,
    whatsapp_tier = (p_patch->>'whatsapp_tier')::integer,
    plan_locked = (p_patch->>'plan_locked')::boolean, updated_at = now()
  WHERE c.id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;

  DELETE FROM public.company_modules WHERE company_id = p_company_id;
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT p_company_id, module_code FROM unnest(COALESCE(p_modules, ARRAY[]::text[])) AS module_code;

  -- Clients antigos não enviam a chave: nesse caso promoções existentes ficam
  -- intactas. Array presente é a fotografia completa dos itens ativos.
  IF p_patch ? 'promotions' THEN
    IF p_patch->>'billing_cycle' <> 'monthly' AND jsonb_array_length(v_promotions) > 0 THEN
      RAISE EXCEPTION 'promocao_somente_mensal';
    END IF;
    IF jsonb_array_length(v_promotions) > 0 AND COALESCE(NULLIF(p_patch->>'custom_price', '')::numeric, 0) > 0 THEN
      RAISE EXCEPTION 'preco_personalizado_incompativel';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_promotions)
    LOOP
      v_scope := v_item->>'scope_type';
      v_module := NULLIF(v_item->>'module_code', '');
      v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
      v_standard := (v_item->>'standard_unit_price')::numeric;
      v_promotional := (v_item->>'promotional_unit_price')::numeric;
      v_cycles := (v_item->>'billing_cycles')::integer;
      v_id := NULLIF(v_item->>'id', '')::uuid;

      IF v_scope NOT IN ('module', 'extra_users') OR v_quantity <= 0 OR v_standard <= 0
         OR v_promotional < 0 OR v_promotional > v_standard OR v_cycles NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'promocao_invalida';
      END IF;
      IF v_scope = 'module' AND (
        v_module IS NULL OR v_quantity <> 1 OR NOT (v_module = ANY(COALESCE(p_modules, ARRAY[]::text[])))
      ) THEN RAISE EXCEPTION 'modulo_promocional_invalido'; END IF;
      IF v_scope = 'extra_users' AND v_module IS NOT NULL THEN
        RAISE EXCEPTION 'usuarios_promocionais_invalidos';
      END IF;

      IF v_id IS NOT NULL THEN
        SELECT consumed_cycles INTO v_consumed
        FROM public.company_subscription_promotions
        WHERE id = v_id AND company_id = p_company_id
          AND id = ANY(v_previous_active_ids) FOR UPDATE;
        IF NOT FOUND OR v_cycles < v_consumed THEN RAISE EXCEPTION 'promocao_existente_invalida'; END IF;
        UPDATE public.company_subscription_promotions SET
          quantity = v_quantity, standard_unit_price = v_standard,
          promotional_unit_price = v_promotional, billing_cycles = v_cycles,
          status = 'active', completed_at = NULL,
          reason = NULLIF(v_item->>'reason', ''), updated_at = now()
        WHERE id = v_id;
      ELSE
        UPDATE public.company_subscription_promotions SET
          status = 'cancelled', completed_at = now(), updated_at = now()
        WHERE company_id = p_company_id AND status = 'active' AND scope_type = v_scope
          AND COALESCE(module_code, '') = COALESCE(v_module, '');
        INSERT INTO public.company_subscription_promotions (
          company_id, scope_type, module_code, quantity, standard_unit_price,
          promotional_unit_price, billing_cycles, reason, created_by
        ) VALUES (
          p_company_id, v_scope, v_module, v_quantity, v_standard,
          v_promotional, v_cycles, NULLIF(v_item->>'reason', ''),
          NULLIF(v_item->>'created_by', '')::uuid
        ) RETURNING id INTO v_id;
      END IF;
      v_keep_ids := array_append(v_keep_ids, v_id);
    END LOOP;

    UPDATE public.company_subscription_promotions SET
      status = 'cancelled', completed_at = now(), updated_at = now()
    WHERE company_id = p_company_id AND status = 'active' AND NOT (id = ANY(v_keep_ids));

    IF jsonb_array_length(v_promotions) = 0
       AND COALESCE(NULLIF(p_patch->>'custom_price', '')::numeric, 0) > 0 THEN
      UPDATE public.companies SET pricing_adjustment_source = NULL WHERE id = p_company_id;
    END IF;
    PERFORM public.enqueue_company_subscription_price_sync(p_company_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) TO service_role;

COMMIT;
