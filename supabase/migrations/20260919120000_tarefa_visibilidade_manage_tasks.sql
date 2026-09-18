-- ============================================================================
-- Onda E3 do overhaul do CRM (plano docs/planos/2026-09-17-crm-overhaul.md)
-- QUEM VE QUAL TAREFA — permissao fn:manage_tasks ("Gerenciar Tarefas")
--
-- PEDIDO DO CEO (17/09/2026): "quem nao tem a permissao de gerenciar tarefas ve
-- so as suas, quem tem ve todas".
--
-- A permissao e SEPARADA de fn:view_all_schedule por decisao explicita do CEO:
--   "A tarefa da Agenda NAO esta no CRM. A tarefa do CRM PODE estar na Agenda."
-- A agenda e um SUBCONJUNTO das tarefas; quem ve o calendario inteiro nao
-- necessariamente deve ver a tarefa de funil de todo mundo.
--
-- A REGRA, e SO para entry_type = 'tarefa':
--   user_has_permission(uid,'fn:manage_tasks')                   -- ve TODAS
--   OU (fn:view_all_schedule E show_in_schedule = true)          -- ve as do CALENDARIO
--   OU technician_id = uid
--   OU created_by   = uid
--   OU esta em service_order_assignees
--   OU e membro da EQUIPE (service_orders.team_id) da tarefa
--   OU tarefa TOTALMENTE sem dono (fila da empresa — ver secao 5)
--
-- ⚠️ ORDEM DE SERVICO (entry_type <> 'tarefa') NAO E AFETADA. A primeira
-- clausula do USING/WITH CHECK e literalmente "nao e tarefa -> passa". Errar
-- isso esconderia OS de tecnico em campo, que e o pior estrago possivel neste
-- sistema. As 994 OS de producao continuam regidas so pelo company_id de
-- sempre.
--
-- POR QUE A CLAUSULA DE fn:view_all_schedule EXISTE (e por que ela carrega o
-- "AND show_in_schedule")
-- ---------------------------------------------------------------------------
-- src/pages/Schedule.tsx (linhas ~195-216) JA esconde tarefa hoje, e usa
-- fn:view_all_schedule ("Ver Toda a Agenda") pra isso. Medido em producao: 3
-- usuarios tem essa permissao sem serem admin e sem curinga, e um deles
-- (Rayellen, Glacial) enxerga HOJE as 471 tarefas da empresa por causa dela.
-- Fazer a RLS olhar so pra fn:manage_tasks TIRARIA na marra uma permissao que o
-- cliente ja concedeu e configurou — regressao, nao feature.
--
-- Mas conceder "todas as tarefas" a quem tem so "Ver Toda a Agenda" seria o
-- erro oposto: passaria a mostrar tambem a tarefa EXCLUSIVA do CRM
-- (show_in_schedule = false), que por definicao nunca aparece no calendario.
-- Isso contraria a propria semantica do CEO. Por isso a clausula e a
-- INTERSECAO: fn:view_all_schedule enxerga toda tarefa DO CALENDARIO, e so
-- fn:manage_tasks enxerga as que vivem so no funil.
--
-- CORNER CASE ACEITO, de propósito: quem tem SO fn:view_all_schedule e tenta
-- DESMARCAR "Mostrar na agenda" de uma tarefa que nao e dele leva
-- "new row violates row-level security policy" — porque a linha nova sairia do
-- alcance dele. E o comportamento correto (ele nao tem permissao sobre tarefa
-- de funil, entao nao pode empurrar uma tarefa pra la), so nao e um erro bonito.
-- Se virar reclamacao, o conserto e no client: esconder o checkbox de quem nao
-- tem fn:manage_tasks.
--
-- POR QUE A CLAUSULA DE EQUIPE EXISTE
-- ---------------------------------------------------------------------------
-- O mesmo Schedule.tsx ja trata "sou membro da equipe da tarefa" como ser dono
-- (myTeamIds, linha ~158: associacao lida de public.team_members, SEM filtro de
-- teams.is_active — espelhado aqui de proposito, pra banco e tela nao
-- divergirem). Medido: 94 tarefas tem team_id, e HOJE nenhuma e visivel
-- *apenas* por equipe (o membro sempre e tambem tecnico ou assignee), entao o
-- impacto imediato e zero. Entra mesmo assim porque o risco numero 3 do plano e
-- exatamente banco e tela discordarem: a primeira tarefa atribuida a uma equipe
-- sem tecnico nominal sumiria pra equipe inteira.
--
-- POR QUE "AS RESTRICTIVE" E NAO PERMISSIVA
-- ---------------------------------------------------------------------------
-- public.service_orders ja tem DUAS policies permissivas pra authenticated
-- ("Users manage own company service_orders" FOR ALL e "Service orders visible
-- to own company" FOR SELECT), ambas por company_id. Policies permissivas se
-- somam com OR — uma policy nova permissiva ALARGARIA o acesso em vez de
-- estreitar. Mesma licao das Ondas C e D. RESTRICTIVE combina com AND.
-- FOR ALL e nao FOR SELECT: cobrir so leitura deixaria alterar por id uma
-- tarefa que a pessoa nao enxerga.
--
-- RECURSAO DE RLS (armadilha tratada)
-- ---------------------------------------------------------------------------
-- A policy de service_orders precisa consultar service_order_assignees, e a
-- policy de service_order_assignees ja consulta service_orders (EXISTS direto,
-- por company_id). EXISTS direto nos dois lados faz o Postgres abortar com
-- "infinite recursion detected in policy for relation". Foi assim que a Onda C
-- quebrou o ciclo leads <-> lead_assignees e a Onda D o
-- crm_pipelines <-> crm_pipeline_access: os dois lados passam por funcao
-- SECURITY DEFINER (roda como dono, RLS desligada) em vez de EXISTS inline.
-- Vale tambem pra team_members, cuja policy tambem consulta outra tabela
-- (teams): a policy aqui NUNCA referencia team_members direto.
--
-- O CAMINHO PUBLICO DO PORTAL (anon) NAO E TOCADO
-- ---------------------------------------------------------------------------
-- "Public can create portal tickets" e INSERT TO anon. Esta policy nasce
-- TO authenticated; policy RESTRICTIVE so se aplica aos papeis listados em TO,
-- e anon e um papel separado de authenticated no Postgres do Supabase
-- (authenticator e membro dos dois, mas a sessao faz SET ROLE pra UM deles).
-- Conferido em pg_auth_members: anon NAO e membro de authenticated. O chamado
-- de portal publico continua entrando. Mesma logica pro service_role, que a
-- edge crm-lead-webhook e o portal usam: papel fora do TO e, ainda por cima,
-- BYPASSRLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. created_by da TAREFA — o buraco que trava a criacao se nao for tapado
--
-- MEDIDO EM PRODUCAO ANTES DE ESCREVER ESTE ARQUIVO: das 475 tarefas vivas,
-- created_by esta preenchido em ZERO. Das 994 OS, em 988. A razao esta em
-- src/hooks/useTaskSubmit.ts (insertTaskOccurrences): o insert de tarefa monta
-- entry_type/task_title/technician_id/... e NUNCA passa created_by, enquanto o
-- caminho de OS passa.
--
-- Sem este gatilho, a regra acima quebraria o fluxo normal de trabalho:
--   * quem nao tem fn:manage_tasks e cria uma tarefa PARA OUTRA PESSOA tomaria
--     "new row violates row-level security policy" no proprio INSERT (nao e
--     technician_id, nao e assignee — os assignees so entram no INSERT
--     seguinte, depois que a linha ja existe);
--   * e, se passasse, a tarefa sumiria da tela de quem acabou de cria-la.
-- Preencher created_by no banco (e nao so no client) tambem garante que
-- qualquer outro caminho de escrita nasca coerente.
--
-- COALESCE, nunca sobrescrita: quem ja manda created_by (o caminho de OS)
-- continua mandando. auth.uid() e NULL no caminho anon/portal e no service_role
-- — nesses casos a coluna segue nula, exatamente como hoje.
--
-- ⚠️ ORDEM: em INSERT o Postgres roda os BEFORE ROW triggers ANTES de avaliar o
-- WITH CHECK de RLS (ExecBRInsertTriggers antes de ExecWithCheckOptions em
-- ExecInsert). Logo a policy abaixo ja enxerga created_by preenchido. Isso esta
-- provado no roteiro de teste da entrega, nao e suposicao.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_orders_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.service_orders_set_created_by() IS
  'Preenche service_orders.created_by com auth.uid() quando o client nao manda (caso de 100% das tarefas, ver useTaskSubmit). NULL no caminho anon/portal e service_role, de proposito.';

DROP TRIGGER IF EXISTS trg_service_orders_set_created_by ON public.service_orders;
CREATE TRIGGER trg_service_orders_set_created_by
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.service_orders_set_created_by();

-- ---------------------------------------------------------------------------
-- 2. Funcoes SECURITY DEFINER que quebram o ciclo de RLS
-- ---------------------------------------------------------------------------

-- (a) "esta pessoa e responsavel desta linha de service_orders?"
CREATE OR REPLACE FUNCTION public.is_service_order_assignee(_service_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_order_assignees sa
    WHERE sa.service_order_id = _service_order_id
      AND sa.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_service_order_assignee(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_service_order_assignee(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_service_order_assignee(uuid, uuid) TO authenticated, service_role;

-- (b) "esta linha tem ALGUM responsavel apontado?" — usada pela clausula de
--     fila (secao 5). Definida aqui, e nao la embaixo, porque a policy da
--     secao 3 ja a referencia: funcao tem que existir antes do CREATE POLICY.
CREATE OR REPLACE FUNCTION public.service_order_has_any_assignee(_service_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_order_assignees sa
    WHERE sa.service_order_id = _service_order_id
  );
$$;

REVOKE ALL ON FUNCTION public.service_order_has_any_assignee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_order_has_any_assignee(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.service_order_has_any_assignee(uuid) TO authenticated, service_role;

-- (c) "esta pessoa e membro da equipe da tarefa?"
--
-- A associacao usuario<->equipe mora em public.team_members (team_id, user_id),
-- com unique (team_id, user_id) — que ja e o indice que esta consulta usa, sem
-- precisar de indice novo. NAO filtra por teams.is_active, de proposito: o
-- client (Schedule.tsx -> myTeamIds -> useTeams) tambem nao filtra, e divergir
-- faria a tarefa de uma equipe desativada sumir do banco mas continuar na tela.
--
-- SECURITY DEFINER pelo mesmo motivo das outras: a policy de team_members faz
-- EXISTS em teams, e referenciar team_members direto na policy de
-- service_orders empilharia avaliacao de RLS sobre RLS.
CREATE OR REPLACE FUNCTION public.is_service_order_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_service_order_team_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_service_order_team_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_service_order_team_member(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_service_order_team_member(uuid, uuid) IS
  'Espelho SQL do myTeamIds de src/pages/Schedule.tsx: a pessoa e membro da equipe (public.team_members) atribuida a tarefa. Sem filtro de teams.is_active, igual ao client.';

-- (d) Regra COMPLETA de visibilidade de uma linha de service_orders, usada pela
--     policy de service_order_assignees. Tem que ficar em SINCRONIA com a
--     policy RESTRICTIVE da secao 3 — mexeu em uma, mexe na outra NA MESMA
--     MIGRATION (licao da Onda C: se discordarem, a pessoa enxerga a tarefa mas
--     nao consegue mexer nos responsaveis dela, ou vice-versa).
CREATE OR REPLACE FUNCTION public.can_access_service_order(_service_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_orders so
    WHERE so.id = _service_order_id
      AND (
        so.company_id = public.get_user_company_id(_user_id)
        OR public.is_super_admin(_user_id)
      )
      AND (
        -- ORDEM DE SERVICO passa direto: esta onda so fala de tarefa.
        so.entry_type IS DISTINCT FROM 'tarefa'
        OR so.technician_id = _user_id
        OR so.created_by    = _user_id
        OR public.user_has_permission(_user_id, 'fn:manage_tasks')
        -- "Ver Toda a Agenda" alcanca toda tarefa DO CALENDARIO, nunca a
        -- exclusiva do funil (show_in_schedule = false).
        OR (so.show_in_schedule AND public.user_has_permission(_user_id, 'fn:view_all_schedule'))
        OR EXISTS (
          SELECT 1 FROM public.service_order_assignees sa
          WHERE sa.service_order_id = so.id AND sa.user_id = _user_id
        )
        OR (
          so.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = so.team_id AND tm.user_id = _user_id
          )
        )
        -- FILA: tarefa TOTALMENTE sem dono (ver secao 5).
        OR (
          so.technician_id IS NULL
          AND so.created_by IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.service_order_assignees sa
            WHERE sa.service_order_id = so.id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_service_order(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_service_order(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_service_order(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_service_order(uuid, uuid) IS
  'Regra COMPLETA de visibilidade de uma linha de service_orders: (empresa) E (nao e tarefa OU tecnico OU criador OU fn:manage_tasks OU (fn:view_all_schedule E show_in_schedule) OU co-responsavel OU membro da equipe OU tarefa totalmente sem dono). Tem que ficar em sincronia com a policy RESTRICTIVE "Tarefas visiveis a quem e responsavel" de public.service_orders.';

-- ---------------------------------------------------------------------------
-- 3. A policy de visibilidade — RESTRICTIVE, so ESTREITA
--
-- O isolamento entre empresas continua sendo das policies PERMISSIVAS por
-- company_id que ja existem. Esta aqui nao concede nada a ninguem.
--
-- ORDEM DAS CLAUSULAS de proposito: comparacao de coluna primeiro (custo zero),
-- chamada de funcao depois. O OR curto-circuita, entao o caso comum (sou o
-- tecnico da minha propria tarefa) nem chega a consultar permissao.
--
-- USING = WITH CHECK (simetrico, como nas Ondas C e D). POR QUE: assimetria
-- barraria a operacao legitima de REPASSAR a tarefa — quem e tecnico hoje e
-- troca o responsavel pra um colega estaria, no WITH CHECK, escrevendo uma
-- linha que ele proprio nao enxergaria mais, e levaria "new row violates
-- row-level security policy", erro opaco. Com created_by preenchido pelo
-- gatilho da secao 1, quem criou continua alcancando a tarefa depois do
-- repasse, entao a simetria nao vira brecha.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tarefas visiveis a quem e responsavel" ON public.service_orders;
CREATE POLICY "Tarefas visiveis a quem e responsavel"
  ON public.service_orders
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    service_orders.entry_type IS DISTINCT FROM 'tarefa'
    OR service_orders.technician_id = (SELECT auth.uid())
    OR service_orders.created_by    = (SELECT auth.uid())
    OR public.user_has_permission((SELECT auth.uid()), 'fn:manage_tasks')
    OR (service_orders.show_in_schedule
        AND public.user_has_permission((SELECT auth.uid()), 'fn:view_all_schedule'))
    OR public.is_service_order_assignee(service_orders.id, (SELECT auth.uid()))
    OR (service_orders.team_id IS NOT NULL
        AND public.is_service_order_team_member(service_orders.team_id, (SELECT auth.uid())))
    OR (
      service_orders.technician_id IS NULL
      AND service_orders.created_by IS NULL
      AND NOT public.service_order_has_any_assignee(service_orders.id)
    )
  )
  WITH CHECK (
    service_orders.entry_type IS DISTINCT FROM 'tarefa'
    OR service_orders.technician_id = (SELECT auth.uid())
    OR service_orders.created_by    = (SELECT auth.uid())
    OR public.user_has_permission((SELECT auth.uid()), 'fn:manage_tasks')
    OR (service_orders.show_in_schedule
        AND public.user_has_permission((SELECT auth.uid()), 'fn:view_all_schedule'))
    OR public.is_service_order_assignee(service_orders.id, (SELECT auth.uid()))
    OR (service_orders.team_id IS NOT NULL
        AND public.is_service_order_team_member(service_orders.team_id, (SELECT auth.uid())))
    OR (
      service_orders.technician_id IS NULL
      AND service_orders.created_by IS NULL
      AND NOT public.service_order_has_any_assignee(service_orders.id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. service_order_assignees — fecha a escalada de privilegio
--
-- Sem esta policy a restricao da secao 3 seria COSMETICA: a policy permissiva
-- "Users manage own service_order_assignees" e so por company_id, entao
-- qualquer pessoa da empresa poderia INSERIR a si mesma como responsavel de
-- QUALQUER tarefa e, com isso, passar a enxerga-la. Mesma amarracao que a
-- Onda C fez em lead_assignees via can_access_lead.
--
-- Note que o teste e sobre o acesso de QUEM ESCREVE, nao de quem esta sendo
-- apontado: continua valendo apontar um colega como responsavel de uma tarefa
-- que eu enxergo — que e o fluxo normal do formulario de tarefa.
-- OS (entry_type <> 'tarefa') passa direto, dentro de can_access_service_order.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Responsaveis restritos a tarefa acessivel" ON public.service_order_assignees;
CREATE POLICY "Responsaveis restritos a tarefa acessivel"
  ON public.service_order_assignees
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING      (public.can_access_service_order(service_order_id, (SELECT auth.uid())))
  WITH CHECK (public.can_access_service_order(service_order_id, (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. A FILA — tarefa totalmente sem dono e da empresa, nao um buraco negro
--
-- Mesma decisao que a Onda C tomou pros leads em 20260917163000: linha sem
-- NINGUEM apontado nao pode ficar invisivel pra todo mundo que nao e gestor.
-- MEDIDO EM PRODUCAO: 1 tarefa em 475 esta nesse estado (Glacial Cold Brasil,
-- "Realizar 1 a 1 com a Razmila do BNI", concluida, 29/04/2026).
--
-- DIFERENCA IMPORTANTE em relacao ao lead: em leads.assigned_to <-> lead_assignees
-- ha trigger de espelho, entao "sem assigned_to" ja implicava "sem co-responsavel".
-- Em service_orders NAO HA espelho: technician_id e service_order_assignees sao
-- independentes (medido: 6 tarefas tem technician_id que nao esta entre os
-- assignees). Por isso a clausula de fila carrega o terceiro teste,
-- NOT service_order_has_any_assignee(...). Sem ele, uma tarefa com responsaveis
-- explicitos mas sem "tecnico" cairia na fila e VAZARIA pra empresa inteira.
--
-- A condicao e AND entre os tres, NUNCA OR:
--   tecnico NULL + criador PREENCHIDO -> tarefa do criador (segue privada)
--   tecnico NULL + criador NULL + sem responsavel -> fila (a empresa ve)
--
-- Continua sendo fila DA EMPRESA: quem garante o company_id e a policy
-- permissiva, e esta e RESTRICTIVE (AND). Nao vaza entre tenants.
--
-- (A funcao service_order_has_any_assignee esta definida na secao 2b, porque a
--  policy da secao 3 precisa dela antes.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. Indices que a policy passa a exigir
--
-- Todos PARCIAIS em entry_type = 'tarefa': as 994 OS (e as dezenas de milhares
-- que virao) nao tem nada a ver com esta regra, e indexa-las so engordaria a
-- escrita de toda OS de campo.
--
-- Equipe nao ganha indice novo: team_members ja tem UNIQUE (team_id, user_id),
-- que e exatamente a busca de is_service_order_team_member.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_service_orders_tarefa_technician
  ON public.service_orders (technician_id)
  WHERE entry_type = 'tarefa' AND technician_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_tarefa_created_by
  ON public.service_orders (created_by)
  WHERE entry_type = 'tarefa' AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_tarefa_sem_dono
  ON public.service_orders (company_id)
  WHERE entry_type = 'tarefa' AND technician_id IS NULL AND created_by IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Prova de que a OS nao foi tocada — falha alto se retroagiu
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_os       bigint;
  v_tarefas  bigint;
  v_orfas    bigint;
BEGIN
  SELECT count(*) FILTER (WHERE entry_type <> 'tarefa'),
         count(*) FILTER (WHERE entry_type =  'tarefa')
    INTO v_os, v_tarefas
    FROM public.service_orders;

  SELECT count(*) INTO v_orfas
    FROM public.service_orders so
   WHERE so.entry_type = 'tarefa'
     AND so.technician_id IS NULL
     AND so.created_by IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.service_order_assignees sa
                      WHERE sa.service_order_id = so.id);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'service_orders'
       AND policyname = 'Tarefas visiveis a quem e responsavel'
       AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'A policy de tarefa nao ficou RESTRICTIVE — abortando: permissiva ALARGARIA o acesso.';
  END IF;

  RAISE NOTICE 'E3 aplicada: % OS intocadas, % tarefas sob a nova regra, % tarefa(s) na fila sem dono.',
    v_os, v_tarefas, v_orfas;
END $$;
