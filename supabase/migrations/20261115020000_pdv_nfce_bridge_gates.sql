-- Ponte do PDV: perguntar é o padrão; emissão automática continua bloqueada.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE public.company_nfce_settings
  ADD COLUMN IF NOT EXISTS after_payment_mode text NOT NULL DEFAULT 'ask'
    CHECK (after_payment_mode IN ('off', 'ask', 'automatic')),
  ADD COLUMN IF NOT EXISTS default_operation_nature text NOT NULL DEFAULT 'VENDA A CONSUMIDOR',
  ADD COLUMN IF NOT EXISTS include_identified_consumer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_danfce_after_authorization boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automatic_canary_approved boolean NOT NULL DEFAULT false;

-- Curador administrativo e aprovação de produção não são requisitos do caixa.
-- A ação explícita, o usuário ativo, o módulo e a assinatura são requisitos.
CREATE OR REPLACE FUNCTION public.fiscal_user_can_emit_goods(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = p_user_id AND p.is_active IS TRUE AND p.company_id IS NOT NULL
      AND public.tenant_subscription_allows_access(p.company_id) IS TRUE
      AND public.company_has_module(p.company_id, 'nfe') IS TRUE
      AND public.pdv_has_explicit_action_permission_v2(p_user_id, 'fn:emit_fiscal_goods') IS TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.fiscal_user_can_emit_goods(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_user_can_emit_goods(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fiscal_can_emit_goods()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND public.fiscal_user_can_emit_goods(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.fiscal_can_emit_goods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_can_emit_goods() TO authenticated, service_role;

-- A ação do caixa não concede visão fiscal global nem acesso a outra abertura.
CREATE OR REPLACE FUNCTION public.fiscal_goods_user_can_access_source(p_user_id uuid, p_company_id uuid, p_source_type text, p_source_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.fiscal_user_can_emit_goods(p_user_id)
    AND p_company_id = public.get_user_company_id(p_user_id)
    AND (public.pdv_has_explicit_action_permission_v2(p_user_id, 'screen:fiscal_notes')
      OR (p_source_type = 'pdv_sale' AND public.pdv_order_actor_can_access_v2(p_source_id, p_user_id)));
$$;
REVOKE ALL ON FUNCTION public.fiscal_goods_user_can_access_source(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_goods_user_can_access_source(uuid, uuid, text, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fiscal_goods_can_access_source(p_company_id uuid, p_source_type text, p_source_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND public.fiscal_goods_user_can_access_source(auth.uid(), p_company_id, p_source_type, p_source_id);
$$;
REVOKE ALL ON FUNCTION public.fiscal_goods_can_access_source(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_goods_can_access_source(uuid, text, uuid) TO authenticated;

-- Critério v1/v2: venda confirmada e cobertura autorizada, inclusive fiado.
CREATE OR REPLACE FUNCTION public.fiscal_goods_sale_ready(p_company uuid, p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pdv_orders o WHERE o.id = p_order AND o.company_id = p_company
      AND o.status IN ('pago', 'liberado_retirada', 'retirada_parcial', 'entregue')
      AND o.cancelled_at IS NULL
      AND abs(o.total - coalesce((SELECT sum(p.amount) FROM public.pdv_order_payments p
        WHERE p.order_id = o.id AND p.company_id = o.company_id
          AND (p.contract_version IS DISTINCT FROM 2 OR p.coverage_status = 'authorized')), 0)) < 0.01
  );
$$;
REVOKE ALL ON FUNCTION public.fiscal_goods_sale_ready(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_goods_sale_ready(uuid, uuid) TO service_role;

-- Um trigger de venda nunca faz trabalho fiscal dentro da transação financeira.
-- Fonte única de disparo nesta etapa: ação explícita pelo endpoint fiscal.
-- A ativação futura do outbox exige nova entrega revisada após canário estável.
CREATE OR REPLACE FUNCTION public.queue_nfce_after_paid_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_nfce_after_paid_order() FROM PUBLIC, anon, authenticated;

-- Mantém o contrato de importação central e fecha suas funções internas.
ALTER FUNCTION public.fiscal_list_goods_sources(text, text, integer) RENAME TO fiscal_list_goods_sources_internal_v1;
REVOKE ALL ON FUNCTION public.fiscal_list_goods_sources_internal_v1(text, text, integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.fiscal_list_goods_sources(p_direction text, p_query text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE (source_type text, source_id uuid, number bigint, party_name text,
  issued_at timestamptz, total numeric, item_count bigint, origin_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.fiscal_can_emit_goods() IS NOT TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso à emissão fiscal.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.* FROM public.fiscal_list_goods_sources_internal_v1(p_direction, p_query, p_limit) s
    WHERE public.fiscal_goods_can_access_source(public.get_user_company_id(auth.uid()), s.source_type, s.source_id)
      AND (s.source_type <> 'pdv_sale' OR public.fiscal_goods_sale_ready(public.get_user_company_id(auth.uid()), s.source_id));
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_list_goods_sources(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_list_goods_sources(text, text, integer) TO authenticated;
ALTER FUNCTION public.fiscal_get_goods_source_snapshot(text, uuid) RENAME TO fiscal_get_goods_source_snapshot_internal_v1;
REVOKE ALL ON FUNCTION public.fiscal_get_goods_source_snapshot_internal_v1(text, uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.fiscal_get_goods_source_snapshot(p_source_type text, p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_result jsonb; v_items jsonb := '[]';
  v_items_total numeric; v_discount numeric;
BEGIN
  IF public.fiscal_can_emit_goods() IS NOT TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso à emissão fiscal.' USING ERRCODE = '42501';
  END IF;
  IF public.fiscal_goods_can_access_source(public.get_user_company_id(auth.uid()), p_source_type, p_source_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta origem fiscal não está disponível para seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF p_source_type = 'pdv_sale' AND public.fiscal_goods_sale_ready(public.get_user_company_id(auth.uid()), p_source_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'A venda precisa estar confirmada nesta empresa antes da emissão.' USING ERRCODE = '42501';
  END IF;
  v_result := public.fiscal_get_goods_source_snapshot_internal_v1(p_source_type, p_source_id);
  IF p_source_type = 'pdv_sale' THEN
    -- O desconto comercial do pedido é rateado em centavos; o último item absorve o resíduo.
    SELECT coalesce(sum((item->>'total')::numeric), 0) INTO v_items_total
      FROM jsonb_array_elements(v_result->'items') item;
    v_discount := round(v_items_total - (v_result->>'total')::numeric, 2);
    IF v_discount < 0 OR v_discount > v_items_total THEN
      RAISE EXCEPTION 'Os totais da venda precisam ser revisados antes da emissão.' USING ERRCODE = '22023';
    END IF;
    -- Maior resto em centavos: mesmas bases por item na importação e na Edge.
    WITH items AS (
      SELECT item, ordinal, round((item->>'total')::numeric*100) AS net_cents
      FROM jsonb_array_elements(v_result->'items') WITH ORDINALITY AS entries(item,ordinal)
    ), shares AS (
      SELECT *, coalesce(trunc(round(v_discount*100)*net_cents/nullif(round(v_items_total*100),0)),0) AS base_cents,
        coalesce(mod(round(v_discount*100)*net_cents,nullif(round(v_items_total*100),0)),0) AS remainder
      FROM items
    ), ranked AS (
      SELECT *, row_number() OVER (ORDER BY remainder DESC,ordinal) AS priority,
        sum(base_cents) OVER () AS allocated
      FROM shares
    ), allocated AS (
      SELECT *, base_cents + CASE WHEN priority <= round(v_discount*100)-allocated THEN 1 ELSE 0 END AS discount_cents FROM ranked
    )
    SELECT coalesce(jsonb_agg(item || jsonb_build_object(
      'total',(net_cents-discount_cents)/100,
      'discount',round((item->>'quantity')::numeric*(item->>'unitPrice')::numeric-(net_cents-discount_cents)/100,2),
      'unit',(SELECT coalesce(nullif(oi.unit,''),item->>'unit') FROM public.pdv_order_items oi
        WHERE oi.id=(item->>'sourceItemId')::uuid AND oi.company_id=public.get_user_company_id(auth.uid()))
    ) ORDER BY ordinal),'[]'::jsonb) INTO v_items FROM allocated;
    v_result := jsonb_set(v_result, '{items}', v_items);
    -- Só cobertura válida; troco fica no valor bruto e não altera o líquido comercial.
    SELECT jsonb_set(v_result, '{payments}', coalesce(jsonb_agg(jsonb_build_object(
      'method', CASE lower(p.method) WHEN 'dinheiro' THEN '01' WHEN 'pix' THEN '17'
        WHEN 'credito' THEN '03' WHEN 'cartao_credito' THEN '03' WHEN 'debito' THEN '04'
        WHEN 'cartao_debito' THEN '04' WHEN 'transferencia' THEN '18' WHEN 'fiado' THEN '05'
        WHEN 'saldo_cliente' THEN '05' WHEN 'voucher' THEN '12' WHEN 'cheque' THEN '02'
        WHEN 'credito_loja' THEN '05' WHEN 'vale_alimentacao' THEN '10' WHEN 'vale_refeicao' THEN '11'
        WHEN 'vale_presente' THEN '12' WHEN 'vale_combustivel' THEN '13' WHEN 'duplicata' THEN '14'
        WHEN 'boleto' THEN '15' WHEN 'deposito' THEN '16' WHEN 'fidelidade' THEN '19' WHEN 'pontos' THEN '19' ELSE '99' END,
      'amount', p.amount + p.change_amount, 'change', p.change_amount, 'deferred', p.method = 'fiado') ORDER BY p.received_at, p.id), '[]'::jsonb))
      INTO v_result FROM public.pdv_order_payments p
      WHERE p.order_id = p_source_id AND p.company_id = public.get_user_company_id(auth.uid())
        AND (p.contract_version IS DISTINCT FROM 2 OR p.coverage_status = 'authorized');
    -- Cliente comercial sem CPF/CNPJ não transforma consumidor anônimo em cadastro fiscal inválido.
    IF length(regexp_replace(coalesce(v_result#>>'{party,document}', ''), '\D', '', 'g')) NOT IN (11, 14) THEN
      v_result := jsonb_set(v_result, '{party}', 'null'::jsonb);
    END IF;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_get_goods_source_snapshot(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_get_goods_source_snapshot(text, uuid) TO authenticated;

-- RLS protege leitura também por abertura; setor fiscal global requer tela explícita.
DO $$ DECLARE t text; p text; BEGIN
  FOREACH t IN ARRAY ARRAY['nfe_documents','nfce_documents'] LOOP
    p := 'company reads own ' || replace(t, '_', ' ');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.fiscal_goods_can_access_source(company_id, source_type, source_id))', p, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['nfe_events','nfce_events'] LOOP
    p := 'company reads own ' || replace(t, '_', ' ');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())) AND EXISTS (SELECT 1 FROM public.%I d WHERE d.id = %I.document_id AND d.company_id = %I.company_id))', p, t, replace(t, '_events', '_documents'), t, t);
  END LOOP;
END $$;
COMMIT;
