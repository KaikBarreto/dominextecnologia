-- =============================================================================
-- Painel Auctus > /admin/estatisticas > aba "Sistema"
-- Estatísticas de USO agregado de TODA a base de clientes (cross-tenant).
--
-- Por quê: o CEO precisa enxergar quem usa e quem PAROU de usar o sistema —
-- o ranking por volume no período é o sinal de risco de cancelamento.
--
-- ⚠️ SEGURANÇA: esta função cruza todas as empresas. Roda SECURITY DEFINER
-- (bypassa RLS de propósito) e por isso o guard é INTERNO e é a única defesa:
--   * `PERFORM public._assert_super_admin()` → 42501 pra qualquer não-super_admin.
--   * Vendedor-admin (linha em admin_permissions) NÃO vê — decisão explícita do
--     CEO em 2026-09-24. Por isso NÃO usamos `is_admin_user` (que inclui
--     vendedor-admin), e sim `is_super_admin` = has_role(uid,'super_admin').
--   * REVOKE de PUBLIC/anon + GRANT só a authenticated (o guard filtra) e
--     service_role.
--
-- Reuso: a classificação de saúde (healthy/attention/at_risk/inactive) continua
-- em `get_company_health_scores` — ÚNICA fonte dessa regra. Aqui devolvemos só
-- `ultima_atividade` / `dias_sem_atividade` crus, pra não haver duas definições
-- de "empresa em risco" divergindo. "Empresas ativas" usa exatamente o mesmo
-- critério do AdminDashboardStats.tsx: subscription_status = 'active'.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Parte 1: marcar contas internas (demo/tutorial da própria Auctus)
-- -----------------------------------------------------------------------------
-- Sem isso, "Demo Dominex" e "Minha Empresa (Tutorial)" entram como empresas
-- ATIVAS e com uso, inflando toda a estatística — foi exatamente o problema que
-- o EcoSistema teve que corrigir depois (admin_stats_exclude_test_accounts).
-- Coluna (e não UUID hardcoded na função) pra o CEO poder marcar/desmarcar
-- outra conta interna no futuro sem migration nova.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_internal_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_internal_account IS
  'true = conta interna da Auctus (demo/tutorial/teste). Excluída por padrão das estatísticas do painel master. Não afeta acesso nem cobrança.';

UPDATE public.companies
SET is_internal_account = true
WHERE id IN (
  '293900d9-174a-4db9-9be1-febe5c2baa30',  -- Demo Dominex
  '903c410f-1020-4173-a251-7b1a77dba49b'   -- Minha Empresa (Tutorial)
)
AND is_internal_account = false;


-- -----------------------------------------------------------------------------
-- Parte 2: índices (company_id, created_at) para as varreduras por período
-- -----------------------------------------------------------------------------
-- Hoje a base é pequena e o planner vai de seq scan; os índices são pro
-- crescimento (service_orders é a tabela que mais cresce).
-- nfse_emissions já tem idx_nfse_emissions_company_created.
CREATE INDEX IF NOT EXISTS idx_service_orders_company_created
  ON public.service_orders USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_company_created
  ON public.customers USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_company_created
  ON public.equipment USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_company_created
  ON public.quotes USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_company_created
  ON public.contracts USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmoc_documents_company_generated
  ON public.pmoc_documents USING btree (company_id, generated_at DESC);


-- -----------------------------------------------------------------------------
-- Parte 3: a RPC
-- -----------------------------------------------------------------------------
-- Uma única função (e não três) de propósito: um só ponto de guard cross-tenant
-- pra revisar, e uma só ida ao banco pra montar a aba inteira.
CREATE OR REPLACE FUNCTION public.get_admin_usage_statistics(
  p_from             date    DEFAULT NULL,
  p_to               date    DEFAULT NULL,
  p_bucket           text    DEFAULT 'day',
  p_include_internal boolean DEFAULT false,
  p_timezone         text    DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_tz         text;
  v_bucket     text;
  v_to         date;
  v_from       date;
  v_dias       integer;
  v_prev_from  date;
  v_prev_to    date;
  v_start      timestamptz;
  v_end        timestamptz;
  v_prev_start timestamptz;
  v_result     jsonb;
BEGIN
  -- GUARD cross-tenant. Nada roda antes disto.
  PERFORM public._assert_super_admin();

  v_tz := COALESCE(NULLIF(btrim(p_timezone), ''), 'America/Sao_Paulo');

  v_bucket := lower(COALESCE(NULLIF(btrim(p_bucket), ''), 'day'));
  IF v_bucket NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'Bucket inválido: %. Use day, week ou month.', p_bucket
      USING ERRCODE = '22023';
  END IF;

  -- Período padrão = MÊS CALENDÁRIO corrente (nunca "últimos 30 dias").
  v_to   := COALESCE(p_to, (now() AT TIME ZONE v_tz)::date);
  v_from := COALESCE(p_from, date_trunc('month', v_to::timestamp)::date);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'Período inválido: data inicial (%) maior que a final (%).', v_from, v_to
      USING ERRCODE = '22023';
  END IF;

  -- Janela anterior = mesmo NÚMERO DE DIAS imediatamente antes, pra comparação.
  v_dias      := (v_to - v_from) + 1;
  v_prev_to   := v_from - 1;
  v_prev_from := v_from - v_dias;

  -- Half-open [start, end): p_to entra inteiro. Eixo único de fuso — é um
  -- agregado cross-tenant, buckets por fuso de cada empresa seriam incomparáveis.
  v_start      := (v_from::timestamp)      AT TIME ZONE v_tz;
  v_end        := ((v_to + 1)::timestamp)  AT TIME ZONE v_tz;
  v_prev_start := (v_prev_from::timestamp) AT TIME ZONE v_tz;

  WITH emp AS (
    SELECT c.id, c.name, c.subscription_status, c.subscription_plan,
           c.created_at, c.is_internal_account
    FROM public.companies c
    WHERE p_include_internal OR c.is_internal_account = false
  ),
  -- Lista canônica de métricas: garante chave presente (com 0) mesmo sem linha.
  lista(nome) AS (
    VALUES ('ordens_servico'), ('tarefas'), ('clientes'), ('equipamentos'),
           ('orcamentos'), ('contratos'), ('contratos_pmoc'), ('pmoc_documentos'),
           ('nfse_emitidas'), ('nfse_rejeitadas'), ('eventos_uso')
  ),
  -- Fato único (company_id, quando, métrica) varrido uma vez só, cobrindo a
  -- janela atual E a anterior.
  fatos AS (
    SELECT so.company_id, so.created_at AS at, 'ordens_servico'::text AS metrica
    FROM public.service_orders so
    WHERE COALESCE(so.entry_type, 'os') = 'os'
      AND so.created_at >= v_prev_start AND so.created_at < v_end
      AND so.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT so.company_id, so.created_at, 'tarefas'
    FROM public.service_orders so
    WHERE so.entry_type = 'tarefa'
      AND so.created_at >= v_prev_start AND so.created_at < v_end
      AND so.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT cu.company_id, cu.created_at, 'clientes'
    FROM public.customers cu
    WHERE cu.is_deleted IS NOT TRUE
      AND cu.created_at >= v_prev_start AND cu.created_at < v_end
      AND cu.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT eq.company_id, eq.created_at, 'equipamentos'
    FROM public.equipment eq
    WHERE eq.created_at >= v_prev_start AND eq.created_at < v_end
      AND eq.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT q.company_id, q.created_at, 'orcamentos'
    FROM public.quotes q
    WHERE q.created_at >= v_prev_start AND q.created_at < v_end
      AND q.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT ct.company_id, ct.created_at, 'contratos'
    FROM public.contracts ct
    WHERE ct.created_at >= v_prev_start AND ct.created_at < v_end
      AND ct.company_id IN (SELECT id FROM emp)
    UNION ALL
    -- subconjunto de 'contratos' (não somar os dois)
    SELECT ct.company_id, ct.created_at, 'contratos_pmoc'
    FROM public.contracts ct
    WHERE ct.is_pmoc IS TRUE
      AND ct.created_at >= v_prev_start AND ct.created_at < v_end
      AND ct.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT pd.company_id, pd.generated_at, 'pmoc_documentos'
    FROM public.pmoc_documents pd
    WHERE pd.generated_at >= v_prev_start AND pd.generated_at < v_end
      AND pd.company_id IN (SELECT id FROM emp)
    UNION ALL
    -- "emitida" = chegou a ser autorizada pela prefeitura; cancelada depois
    -- continua contando como uso do módulo fiscal.
    SELECT ne.company_id, ne.created_at, 'nfse_emitidas'
    FROM public.nfse_emissions ne
    WHERE ne.status IN ('autorizada', 'cancelada')
      AND ne.created_at >= v_prev_start AND ne.created_at < v_end
      AND ne.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT ne.company_id, ne.created_at, 'nfse_rejeitadas'
    FROM public.nfse_emissions ne
    WHERE ne.status = 'rejeitada'
      AND ne.created_at >= v_prev_start AND ne.created_at < v_end
      AND ne.company_id IN (SELECT id FROM emp)
    UNION ALL
    SELECT ue.company_id, ue.created_at, 'eventos_uso'
    FROM public.usage_events ue
    WHERE ue.created_at >= v_prev_start AND ue.created_at < v_end
      AND ue.company_id IN (SELECT id FROM emp)
  ),
  janela     AS (SELECT * FROM fatos WHERE at >= v_start      AND at <  v_end),
  janela_ant AS (SELECT * FROM fatos WHERE at >= v_prev_start AND at <  v_start),

  tot AS (
    SELECT jsonb_object_agg(l.nome, COALESCE(j.n, 0)) AS obj
    FROM lista l
    LEFT JOIN (SELECT metrica, count(*) n FROM janela GROUP BY 1) j ON j.metrica = l.nome
  ),
  tot_ant AS (
    SELECT jsonb_object_agg(l.nome, COALESCE(j.n, 0)) AS obj
    FROM lista l
    LEFT JOIN (SELECT metrica, count(*) n FROM janela_ant GROUP BY 1) j ON j.metrica = l.nome
  ),

  buckets AS (
    SELECT gs::date AS b
    FROM generate_series(
      date_trunc(v_bucket, v_from::timestamp),
      date_trunc(v_bucket, v_to::timestamp),
      ('1 ' || v_bucket)::interval
    ) gs
  ),
  serie_counts AS (
    SELECT date_trunc(v_bucket, (at AT TIME ZONE v_tz))::date AS b, metrica, count(*) n
    FROM janela GROUP BY 1, 2
  ),
  serie AS (
    SELECT jsonb_agg(x.obj ORDER BY x.b) AS arr
    FROM (
      SELECT b.b,
             jsonb_build_object('bucket', b.b)
               || jsonb_object_agg(l.nome, COALESCE(sc.n, 0)) AS obj
      FROM buckets b
      CROSS JOIN lista l
      LEFT JOIN serie_counts sc ON sc.b = b.b AND sc.metrica = l.nome
      GROUP BY b.b
    ) x
  ),

  rank_counts AS (
    SELECT company_id, metrica, count(*) n FROM janela GROUP BY 1, 2
  ),
  ult AS (
    SELECT ue.company_id, max(ue.created_at) AS la
    FROM public.usage_events ue
    WHERE ue.company_id IN (SELECT id FROM emp)
    GROUP BY 1
  ),
  ranking_rows AS (
    SELECT e.id, e.name, e.subscription_status, e.subscription_plan,
           e.is_internal_account,
           jsonb_object_agg(l.nome, COALESCE(rc.n, 0)) AS metricas,
           -- total_uso = volume de CRIAÇÃO no período. Fora da soma:
           -- eventos_uso (outra escala), contratos_pmoc (já em contratos)
           -- e nfse_rejeitadas (não é entrega).
           COALESCE(sum(rc.n) FILTER (
             WHERE l.nome NOT IN ('eventos_uso', 'contratos_pmoc', 'nfse_rejeitadas')
           ), 0) AS total_uso
    FROM emp e
    CROSS JOIN lista l
    LEFT JOIN rank_counts rc ON rc.company_id = e.id AND rc.metrica = l.nome
    GROUP BY e.id, e.name, e.subscription_status, e.subscription_plan, e.is_internal_account
  ),
  ranking AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'company_id',          r.id,
               'company_name',        r.name,
               'subscription_status', r.subscription_status,
               'subscription_plan',   r.subscription_plan,
               'is_internal',         r.is_internal_account,
               'total_uso',           r.total_uso,
               'ultima_atividade',    u.la,
               'dias_sem_atividade',  CASE
                                        WHEN u.la IS NULL THEN NULL
                                        ELSE ((now() AT TIME ZONE v_tz)::date
                                              - (u.la AT TIME ZONE v_tz)::date)
                                      END
             ) || r.metricas
             ORDER BY r.total_uso DESC, r.name
           ) AS arr
    FROM ranking_rows r
    LEFT JOIN ult u ON u.company_id = r.id
  ),

  emp_stats AS (
    SELECT
      count(*)                                                        AS total,
      count(*) FILTER (WHERE subscription_status = 'active')           AS ativas,
      count(*) FILTER (WHERE subscription_status = 'testing')          AS testando,
      count(*) FILTER (WHERE subscription_status IS DISTINCT FROM 'active'
                         AND subscription_status IS DISTINCT FROM 'testing') AS inativas,
      count(*) FILTER (WHERE created_at >= v_start AND created_at < v_end)   AS novas_no_periodo
    FROM emp
  ),
  com_uso AS (SELECT count(DISTINCT company_id) AS n FROM janela),
  usuarios AS (
    SELECT count(DISTINCT ue.user_id) AS n
    FROM public.usage_events ue
    WHERE ue.user_id IS NOT NULL
      AND ue.created_at >= v_start AND ue.created_at < v_end
      AND ue.company_id IN (SELECT id FROM emp)
  ),
  internas AS (
    SELECT count(*) AS n FROM public.companies WHERE is_internal_account
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'de', v_from, 'ate', v_to, 'dias', v_dias,
      'bucket', v_bucket, 'timezone', v_tz,
      'anterior_de', v_prev_from, 'anterior_ate', v_prev_to,
      'inclui_internas', p_include_internal,
      'contas_internas_existentes', (SELECT n FROM internas)
    ),
    'empresas', jsonb_build_object(
      'total',              (SELECT total FROM emp_stats),
      'ativas',             (SELECT ativas FROM emp_stats),
      'testando',           (SELECT testando FROM emp_stats),
      'inativas',           (SELECT inativas FROM emp_stats),
      'novas_no_periodo',   (SELECT novas_no_periodo FROM emp_stats),
      'com_uso_no_periodo', (SELECT n FROM com_uso)
    ),
    'totais',   (SELECT obj FROM tot)
                  || jsonb_build_object('usuarios_ativos', (SELECT n FROM usuarios)),
    'anterior', (SELECT obj FROM tot_ant),
    'serie',    COALESCE((SELECT arr FROM serie), '[]'::jsonb),
    'ranking',  COALESCE((SELECT arr FROM ranking), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_admin_usage_statistics(date, date, text, boolean, text) IS
  'Painel Auctus /admin/estatisticas (aba Sistema): uso agregado de TODA a base por período. Cross-tenant, SECURITY DEFINER, restrita a super_admin via _assert_super_admin (vendedor-admin NÃO vê). Período padrão = mês calendário corrente. Contas internas (companies.is_internal_account) excluídas salvo p_include_internal=true. A classificação de saúde continua em get_company_health_scores — aqui só ultima_atividade/dias_sem_atividade crus.';

-- Fecha o default do Postgres (EXECUTE pra PUBLIC) antes de abrir a quem precisa.
REVOKE ALL ON FUNCTION public.get_admin_usage_statistics(date, date, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_usage_statistics(date, date, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_usage_statistics(date, date, text, boolean, text)
  TO authenticated, service_role;
