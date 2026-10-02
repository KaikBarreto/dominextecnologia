-- ============================================================================
-- Diario Comercial do Vendedor (painel master Auctus)
--
-- Por que: hoje so existe o RESULTADO final do comercial (venda registrada em
-- salesperson_sales). O topo do funil (contato -> reuniao agendada -> reuniao
-- realizada) e invisivel, entao nao da pra saber se o gargalo e prospeccao,
-- no-show ou fechamento. Esta migration cria o registro diario por periodo
-- (manha/tarde) com 4 contadores + metas diarias por vendedor.
--
-- Conteudo:
--   1) Helper public.brt_today()  -> data de hoje no fuso America/Sao_Paulo.
--   2) Metas diarias em public.salespeople (+ view salespeople_basic recriada).
--   3) Tabela public.salesperson_daily_activity.
--   4) RLS: vendedor le/escreve SO as proprias linhas e SO no dia de hoje (BRT);
--      admin master (e quem tem admin_vendedores_ver_todos) le tudo; backfill
--      retroativo e privilegio de super_admin.
--
-- Decisao de arquitetura: SEM RPC de relatorio. A RLS abaixo ja isola
-- corretamente e o frontend agrega no client a partir do SELECT. Menos
-- superficie SECURITY DEFINER pra auditar.
--
-- Idempotente: IF NOT EXISTS / DROP ... IF EXISTS em todo lugar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper: data de hoje em BRT (America/Sao_Paulo).
--
-- Por que SECURITY INVOKER: a funcao nao le tabela nenhuma, so o relogio do
-- servidor. Nao precisa de privilegio elevado.
-- Por que STABLE (e nao IMMUTABLE): depende de now(). Consequencia pratica —
-- NAO pode ser usada em CHECK constraint de tabela; a trava de "sem
-- retroativo" vive na POLICY (ver parte 4).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brt_today()
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

COMMENT ON FUNCTION public.brt_today() IS
  'Data de hoje no fuso America/Sao_Paulo. Usada nas policies de '
  'salesperson_daily_activity pra travar registro retroativo. STABLE, nunca '
  'IMMUTABLE — nao serve pra CHECK constraint.';

-- O default ACL de FUNCTION no schema public concede EXECUTE a anon.
-- Revogamos explicitamente: brt_today nao tem chamador anonimo.
REVOKE ALL ON FUNCTION public.brt_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brt_today() FROM anon;
GRANT EXECUTE ON FUNCTION public.brt_today() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Metas diarias por vendedor.
--
-- Numeros travados pelo CEO em 2026-10-02: 200 contatos/dia e 5 reunioes
-- agendadas/dia. Ficam como coluna (e nao constante no codigo) pra calibrar
-- depois sem migration nova e pra vendedor junior/senior ter regua diferente.
-- Reunioes REALIZADAS e VENDAS nao tem meta definida — de proposito.
-- ----------------------------------------------------------------------------
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS daily_goal_contacts integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS daily_goal_meetings_scheduled integer NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salespeople_daily_goal_contacts_non_negative'
      AND conrelid = 'public.salespeople'::regclass
  ) THEN
    ALTER TABLE public.salespeople
      ADD CONSTRAINT salespeople_daily_goal_contacts_non_negative
      CHECK (daily_goal_contacts >= 0);
    RAISE NOTICE 'Constraint salespeople_daily_goal_contacts_non_negative criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salespeople_daily_goal_meetings_non_negative'
      AND conrelid = 'public.salespeople'::regclass
  ) THEN
    ALTER TABLE public.salespeople
      ADD CONSTRAINT salespeople_daily_goal_meetings_non_negative
      CHECK (daily_goal_meetings_scheduled >= 0);
    RAISE NOTICE 'Constraint salespeople_daily_goal_meetings_non_negative criada.';
  END IF;
END $$;

COMMENT ON COLUMN public.salespeople.daily_goal_contacts IS
  'Meta de contatos/prospeccoes POR DIA (manha + tarde somadas, nao por '
  'periodo). Travada pelo CEO em 200; editavel por vendedor no painel master.';

COMMENT ON COLUMN public.salespeople.daily_goal_meetings_scheduled IS
  'Meta de reunioes agendadas POR DIA (manha + tarde somadas, nao por '
  'periodo). Travada pelo CEO em 5; editavel por vendedor no painel master.';

-- Recria a view salespeople_basic acrescentando as duas metas. Meta diaria NAO
-- e dado sensivel (nao e comissao, nem documento, nem chave Pix), entao pode
-- viver na view publica-pra-authenticated que a UI do admin consome.
-- Colunas existentes confirmadas na definicao viva (pg_get_viewdef) antes de
-- recriar: id, name, email, referral_code, is_active, user_id, photo_url, role.
-- ATENCAO: DROP VIEW leva os GRANTs embora — re-GRANT logo abaixo.
DROP VIEW IF EXISTS public.salespeople_basic;
CREATE VIEW public.salespeople_basic
  WITH (security_invoker = true) AS
  SELECT
    id,
    name,
    email,
    referral_code,
    is_active,
    user_id,
    photo_url,
    role,
    daily_goal_contacts,
    daily_goal_meetings_scheduled
  FROM public.salespeople;

-- O default ACL de TABLE/VIEW no schema public concede quase tudo a anon;
-- revogamos explicitamente. Nenhum fluxo anonimo le salespeople_basic (so o
-- painel admin, autenticado) e a view e security_invoker — mas defesa em
-- profundidade: sem GRANT, nem a RLS precisa ser a unica barreira.
REVOKE ALL ON public.salespeople_basic FROM anon;
REVOKE ALL ON public.salespeople_basic FROM PUBLIC;
-- authenticated tambem herda arwdxtm do default ACL. A view e auto-updatable,
-- entao sem este REVOKE um authenticated teria INSERT/UPDATE/DELETE em
-- salespeople ATRAVES da view (barrado hoje so pela RLS). SELECT e o unico uso.
REVOKE ALL ON public.salespeople_basic FROM authenticated;
GRANT SELECT ON public.salespeople_basic TO authenticated;
GRANT ALL ON public.salespeople_basic TO service_role;

COMMENT ON VIEW public.salespeople_basic IS
  'Projecao de public.salespeople SEM colunas sensiveis (comissao, documentos, '
  'dados bancarios). security_invoker=true: a RLS de salespeople continua '
  'valendo. Inclui as metas diarias (daily_goal_*), que nao sao sensiveis.';

-- ----------------------------------------------------------------------------
-- 3) Tabela do diario comercial.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesperson_daily_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL
    REFERENCES public.salespeople(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  period text NOT NULL
    CONSTRAINT salesperson_daily_activity_period_valid
    CHECK (period IN ('morning', 'afternoon')),
  contacts integer NOT NULL DEFAULT 0
    CONSTRAINT salesperson_daily_activity_contacts_non_negative
    CHECK (contacts >= 0),
  meetings_scheduled integer NOT NULL DEFAULT 0
    CONSTRAINT salesperson_daily_activity_meetings_scheduled_non_negative
    CHECK (meetings_scheduled >= 0),
  meetings_held integer NOT NULL DEFAULT 0
    CONSTRAINT salesperson_daily_activity_meetings_held_non_negative
    CHECK (meetings_held >= 0),
  sales_count integer NOT NULL DEFAULT 0
    CONSTRAINT salesperson_daily_activity_sales_count_non_negative
    CHECK (sales_count >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT salesperson_daily_activity_unique_period
    UNIQUE (salesperson_id, activity_date, period)
);

COMMENT ON TABLE public.salesperson_daily_activity IS
  'Diario comercial: o que o vendedor fez em cada periodo (manha/tarde) de cada '
  'dia — contatos, reunioes agendadas, reunioes realizadas e vendas. '
  'REGISTRO RETROATIVO E BLOQUEADO POR RLS (nao por botao): a policy do '
  'vendedor exige activity_date = public.brt_today(). Admin master pode '
  'preencher/corrigir qualquer dia — e a valvula de escape.';

COMMENT ON COLUMN public.salesperson_daily_activity.activity_date IS
  'Dia do registro no fuso America/Sao_Paulo (BRT), nao UTC.';
COMMENT ON COLUMN public.salesperson_daily_activity.period IS
  'Periodo do dia: morning | afternoon. Upsert por (salesperson_id, activity_date, period).';
COMMENT ON COLUMN public.salesperson_daily_activity.contacts IS
  'Contatos/prospeccoes feitas no periodo.';
COMMENT ON COLUMN public.salesperson_daily_activity.meetings_scheduled IS
  'Reunioes agendadas no periodo.';
COMMENT ON COLUMN public.salesperson_daily_activity.meetings_held IS
  'Reunioes efetivamente realizadas no periodo.';
COMMENT ON COLUMN public.salesperson_daily_activity.sales_count IS
  'Vendas fechadas no periodo.';

-- Indice do acesso dominante: historico de um vendedor, do mais recente pro
-- mais antigo.
CREATE INDEX IF NOT EXISTS idx_salesperson_daily_activity_person_date
  ON public.salesperson_daily_activity (salesperson_id, activity_date DESC);

-- updated_at: reusa o trigger function que ja existe no projeto
-- (public.update_updated_at_column), nao cria uma nova.
DROP TRIGGER IF EXISTS set_salesperson_daily_activity_updated_at
  ON public.salesperson_daily_activity;
CREATE TRIGGER set_salesperson_daily_activity_updated_at
  BEFORE UPDATE ON public.salesperson_daily_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4) RLS.
--
-- Decisao do Tech Lead: aqui a privacidade entre vendedores fecha NO BANCO.
-- Nas tabelas antigas (salesperson_advances etc.) o SELECT de admin usa
-- public.is_admin_user(), que da TRUE pra qualquer um com UMA linha em
-- admin_permissions — ou seja, um vendedor-only veria a atividade dos outros e
-- a privacidade ficaria so no filtro de UI. NAO usamos is_admin_user() aqui:
-- leitura ampla exige super_admin OU a permissao admin_vendedores_ver_todos,
-- que e exatamente o gate que a UI do painel ja usa.
--
-- Policies permissivas = OR entre si. auth.uid() envolvido em (SELECT ...) pra
-- o planner tratar como InitPlan e nao reavaliar por linha.
-- ----------------------------------------------------------------------------
ALTER TABLE public.salesperson_daily_activity ENABLE ROW LEVEL SECURITY;

-- 4.1 Leitura ampla: admin master + quem tem permissao de ver todos.
DROP POLICY IF EXISTS "Admin master and goal-wide admins read all activity"
  ON public.salesperson_daily_activity;
CREATE POLICY "Admin master and goal-wide admins read all activity"
  ON public.salesperson_daily_activity
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_vendedores_ver_todos')
  );

-- 4.2 Leitura do vendedor: SO as proprias linhas (current_salesperson_id()
--     retorna NULL pra nao-vendedor, e "coluna = NULL" nunca e TRUE).
DROP POLICY IF EXISTS "Salesperson reads own activity"
  ON public.salesperson_daily_activity;
CREATE POLICY "Salesperson reads own activity"
  ON public.salesperson_daily_activity
  FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

-- 4.3 Insert do vendedor: propria linha E somente o dia de hoje em BRT.
--     Esta e a trava de retroativo. O client manda salesperson_id e
--     activity_date; o banco e quem valida.
DROP POLICY IF EXISTS "Salesperson inserts own activity today only"
  ON public.salesperson_daily_activity;
CREATE POLICY "Salesperson inserts own activity today only"
  ON public.salesperson_daily_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    salesperson_id = public.current_salesperson_id()
    AND activity_date = public.brt_today()
  );

-- 4.4 Update do vendedor: corrige o proprio registro ate a meia-noite BRT.
--     Depois congela (USING deixa de casar).
DROP POLICY IF EXISTS "Salesperson updates own activity today only"
  ON public.salesperson_daily_activity;
CREATE POLICY "Salesperson updates own activity today only"
  ON public.salesperson_daily_activity
  FOR UPDATE TO authenticated
  USING (
    salesperson_id = public.current_salesperson_id()
    AND activity_date = public.brt_today()
  )
  WITH CHECK (
    salesperson_id = public.current_salesperson_id()
    AND activity_date = public.brt_today()
  );

-- 4.5 Escrita do admin master: backfill retroativo + correcao + exclusao.
--     Tres policies separadas (uma por comando) em vez de FOR ALL, pra um
--     FOR ALL permissivo nao sombrear um DELETE restritivo que venha depois.
DROP POLICY IF EXISTS "Super admins insert activity"
  ON public.salesperson_daily_activity;
CREATE POLICY "Super admins insert activity"
  ON public.salesperson_daily_activity
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins update activity"
  ON public.salesperson_daily_activity;
CREATE POLICY "Super admins update activity"
  ON public.salesperson_daily_activity
  FOR UPDATE TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins delete activity"
  ON public.salesperson_daily_activity;
CREATE POLICY "Super admins delete activity"
  ON public.salesperson_daily_activity
  FOR DELETE TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())));

-- Vendedor NAO tem policy de DELETE: historico de atividade nao se apaga.
--
-- NOTA sobre a policy de DELETE do super_admin: por decisao de menor privilegio
-- (parte 5) o papel `authenticated` NAO recebe DELETE no nivel de tabela.
-- Logo, a policy acima so e efetiva pra quem tem o GRANT — hoje service_role
-- (edge function). A policy existe pra que, se um dia o painel precisar de
-- "excluir registro", baste um GRANT DELETE ... TO authenticated, sem reabrir
-- discussao de RLS. A UI prevista usa UPSERT, nunca DELETE.

-- ----------------------------------------------------------------------------
-- 5) ACL.
--
-- O default ACL de TABLE no schema public (owner postgres) concede arwdxtm a
-- anon em TODA tabela nova — ja virou achado de auditoria antes. REVOKE
-- explicito, sempre.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.salesperson_daily_activity FROM anon;
REVOKE ALL ON public.salesperson_daily_activity FROM PUBLIC;
-- authenticated tambem herda DELETE/TRUNCATE do default ACL. Zeramos e
-- concedemos SO os tres verbos que o painel usa: vendedor nao apaga historico,
-- e quem precisa apagar e super_admin (via service_role / policy dedicada).
REVOKE ALL ON public.salesperson_daily_activity FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.salesperson_daily_activity TO authenticated;
GRANT ALL ON public.salesperson_daily_activity TO service_role;
