-- =====================================================================
-- Onda F — RPC agregada do painel /admin (super_admin Dominex):
--   public.get_admin_cobrancas_overview()
--
-- Devolve a visão cross-tenant do módulo Cobranças (Asaas BYO):
--   totais da plataforma + linha por tenant que ativou uma conta de
--   cobrança (tenant_payment_accounts existente), ordenado por MRR desc.
--
-- Por quê SECURITY DEFINER: precisa varrer tenant_payment_accounts,
--   tenant_subscriptions e tenant_charges de TODOS os tenants, o que a
--   RLS por company_id normalmente proíbe. A barreira real é o guard
--   inline por super_admin no corpo (igual admin_delete_company /
--   register_manual_company_payment usam has_role super_admin).
--
-- Guard: public.is_super_admin(auth.uid())  (== has_role super_admin).
--   Escolhido em vez de is_admin_user pois o contrato pede "SÓ pra
--   super_admin da Dominex" — o predicado mais estrito. Não-super-admin
--   recebe RAISE EXCEPTION 'acesso_negado', nunca dados de outros tenants.
--
-- MRR normalizado por assinatura ATIVA:
--   WEEKLY x4.33, BIWEEKLY x2, MONTHLY x1, QUARTERLY /3,
--   SEMIANNUALLY /6, YEARLY /12.
--
-- "últimos 30 dias" = created_at >= now() - interval '30 days'.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT re-executáveis.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_admin_cobrancas_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- 1) SEGURANÇA: só super_admin da plataforma (Dominex).
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  -- Fator de normalização de MRR por ciclo do Asaas.
  WITH cycle_factor(cycle, factor) AS (
    VALUES
      ('WEEKLY',       4.33::numeric),
      ('BIWEEKLY',     2::numeric),
      ('MONTHLY',      1::numeric),
      ('QUARTERLY',    (1::numeric / 3::numeric)),
      ('SEMIANNUALLY', (1::numeric / 6::numeric)),
      ('YEARLY',       (1::numeric / 12::numeric))
  ),

  -- MRR por tenant + contagem de assinaturas ativas (só status='active').
  subs_agg AS (
    SELECT
      s.company_id,
      COUNT(*)                                        AS active_subscriptions,
      COALESCE(SUM(s.value * cf.factor), 0)::numeric   AS mrr
    FROM public.tenant_subscriptions s
    JOIN cycle_factor cf ON cf.cycle = s.cycle
    WHERE s.status = 'active'
    GROUP BY s.company_id
  ),

  -- Cobranças criadas nos últimos 30 dias, por tenant.
  charges_agg AS (
    SELECT
      c.company_id,
      COUNT(*) FILTER (WHERE c.created_at >= now() - interval '30 days')                                   AS charges_30d_count,
      COALESCE(SUM(c.value) FILTER (WHERE c.created_at >= now() - interval '30 days'), 0)::numeric          AS charges_30d_volume,
      COUNT(*) FILTER (WHERE c.created_at >= now() - interval '30 days'
                         AND c.status IN ('RECEIVED','CONFIRMED'))                                          AS paid_30d_count,
      COALESCE(SUM(c.value) FILTER (WHERE c.created_at >= now() - interval '30 days'
                         AND c.status IN ('RECEIVED','CONFIRMED')), 0)::numeric                             AS paid_30d_volume
    FROM public.tenant_charges c
    GROUP BY c.company_id
  ),

  -- Linha por tenant que TEM conta de cobrança (independe de ter assinatura).
  tenant_rows AS (
    SELECT
      pa.company_id,
      co.name                                    AS company_name,
      pa.status                                  AS account_status,
      COALESCE(sa.mrr, 0)::numeric               AS mrr,
      COALESCE(sa.active_subscriptions, 0)::int  AS active_subscriptions,
      COALESCE(ca.charges_30d_count, 0)::int     AS charges_30d_count,
      COALESCE(ca.charges_30d_volume, 0)::numeric AS charges_30d_volume,
      COALESCE(ca.paid_30d_count, 0)::int        AS paid_30d_count,
      COALESCE(ca.paid_30d_volume, 0)::numeric   AS paid_30d_volume
    FROM public.tenant_payment_accounts pa
    JOIN public.companies co ON co.id = pa.company_id
    LEFT JOIN subs_agg    sa ON sa.company_id = pa.company_id
    LEFT JOIN charges_agg ca ON ca.company_id = pa.company_id
  )

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      -- nº de tenants com conta de cobrança ATIVA.
      'tenants_with_cobrancas',
        (SELECT COUNT(*) FROM public.tenant_payment_accounts WHERE status = 'active')::int,
      -- nº de assinaturas ativas em TODA a plataforma.
      'active_subscriptions',
        (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE status = 'active')::int,
      -- MRR total normalizado (todas as assinaturas ativas).
      'mrr_total',
        COALESCE((
          SELECT SUM(s.value * cf.factor)
          FROM public.tenant_subscriptions s
          JOIN cycle_factor cf ON cf.cycle = s.cycle
          WHERE s.status = 'active'
        ), 0)::numeric,
      -- volume de cobranças criadas nos últimos 30 dias.
      'volume_30d',
        COALESCE((
          SELECT SUM(c.value)
          FROM public.tenant_charges c
          WHERE c.created_at >= now() - interval '30 days'
        ), 0)::numeric,
      -- volume pago (RECEIVED/CONFIRMED) criado nos últimos 30 dias.
      'paid_30d',
        COALESCE((
          SELECT SUM(c.value)
          FROM public.tenant_charges c
          WHERE c.created_at >= now() - interval '30 days'
            AND c.status IN ('RECEIVED','CONFIRMED')
        ), 0)::numeric
    ),
    'tenants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'company_id',           tr.company_id,
          'company_name',         tr.company_name,
          'account_status',       tr.account_status,
          'mrr',                  tr.mrr,
          'active_subscriptions', tr.active_subscriptions,
          'charges_30d_count',    tr.charges_30d_count,
          'charges_30d_volume',   tr.charges_30d_volume,
          'paid_30d_count',       tr.paid_30d_count,
          'paid_30d_volume',      tr.paid_30d_volume
        )
        ORDER BY tr.mrr DESC, tr.charges_30d_volume DESC
      )
      FROM tenant_rows tr
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_admin_cobrancas_overview() IS
  'super_admin: visão cross-tenant do módulo Cobranças (Asaas BYO). Totais da plataforma (tenants com conta ativa, assinaturas ativas, MRR normalizado, volume/pago 30d) + linha por tenant com conta de cobrança, ordenada por MRR desc. Guard inline is_super_admin(auth.uid()); não-super-admin recebe acesso_negado.';

-- Privilégios: anon NUNCA executa; authenticated pode chamar mas o guard
-- no corpo barra qualquer não-super-admin com acesso_negado.
REVOKE ALL ON FUNCTION public.get_admin_cobrancas_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_cobrancas_overview() TO authenticated, service_role;
