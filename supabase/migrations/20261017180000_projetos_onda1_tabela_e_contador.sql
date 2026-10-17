-- ============================================================================
-- PROJETOS (gestao de obras) — Onda 1, parte 1 de 3: a tabela e o contador.
--
-- O CONCEITO
-- ---------------------------------------------------------------------------
-- Um PROJETO e uma obra ("instalar 80 splits na industria X"). Ele agrupa
-- FRENTES DE TRABALHO (compras, engenharia, operacional), e cada frente E UM
-- FUNIL DO CRM (public.crm_pipelines) — reusamos o kanban inteiro em vez de
-- construir um quadro novo. A parte 2 desta onda liga as duas coisas com
-- crm_pipelines.project_id:
--     project_id IS NULL      => funil comercial, continua em /crm como hoje;
--     project_id IS NOT NULL  => frente de obra, aparece so dentro do projeto.
--
-- O FATO QUE DEIXA ESTA ONDA LIMPA
-- ---------------------------------------------------------------------------
-- No momento em que esta migration roda NAO EXISTE NENHUM PROJETO NO BANCO
-- (conferido: a tabela nao existe). Entao nao ha backfill de DADO, so de
-- INVARIANTE: todo CHECK, todo NOT NULL e todo indice unico nasce valido por
-- construcao, e o "antes" e o "depois" sao identicos pra 100% das empresas.
-- Mesma retorica do cabecalho de 20260918110000_crm_pipeline_access.sql.
--
-- DECISOES DO CEO — TRAVADAS, NAO REABRIR
-- ---------------------------------------------------------------------------
--  * Progresso = cards em etapa is_won / cards nao-perdidos (is_lost fora da
--    conta). Sem peso por frente, sem percentual digitado a mao.
--  * Projeto NAO TEM endereco proprio (o endereco e o do cliente / das OSs).
--  * customer_id e NULLABLE: projeto interno (reforma da propria sede, obra de
--    showroom) existe e nao tem cliente.
--  * Nenhum modulo pago novo. O gate e o modulo `crm`, aplicado pela UI.
--  * Progresso e UM NUMERO UNICO por projeto, igual pra todo mundo da empresa —
--    inclusive pra quem nao enxerga todos os cards. Ver a RPC na parte 3.
--
-- A ACL POR FUNIL (public.can_access_pipeline) NAO MUDA NESTA ONDA
-- ---------------------------------------------------------------------------
-- Decisao explicita, registrada aqui pra ninguem achar que foi esquecimento:
--   (1) can_access_pipeline e avaliada POR LINHA em todo SELECT de leads (via
--       a policy RESTRICTIVE "Leads restritos ao funil acessivel"). Qualquer
--       termo novo ali e custo em cima do caminho mais quente do CRM.
--   (2) A regra dela vive em QUATRO lugares que tem que concordar (policies de
--       crm_pipelines, crm_stages e leads + a funcao can_access_lead, usada
--       pela policy de lead_assignees). Mexer em um exige mexer nos quatro NA
--       MESMA MIGRATION — ver o cabecalho de 20260918110000. Nao e trabalho de
--       carona numa onda de feature.
--   (3) "Quem ve a FRENTE" nao e a mesma pergunta que "quem ve o PROJETO".
--       Misturar as duas numa so ACL fecharia a porta pro modelo certo. O
--       acesso ao projeto vira uma public.project_access propria numa onda
--       futura, somada por uma policy RESTRICTIVE NOVA — que combina com AND
--       sem reescrever nada do que ja existe.
-- Resultado desta onda: toda frente de obra herda exatamente o comportamento
-- de ACL que um funil comercial ja tem hoje (sem linha de ACL = aberto pra
-- empresa). Nenhum usuario ganha nem perde acesso por causa deste arquivo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) public.project_number_counters — contador de codigo POR EMPRESA
-- ---------------------------------------------------------------------------
-- Espelha public.equipment_number_counters (20260610140000).
--
-- POR QUE NAO SERIAL / SEQUENCE GLOBAL: order_number e quote_number usam
-- sequence global, e por isso o tenant A ve 1,2,3 enquanto o B ve 4,7,9 — os
-- buracos VAZAM o volume de operacao do vizinho. Contador por empresa faz cada
-- obra comecar em #1 na casa de cada um.
--
-- POR QUE NAO MAX+1: corrida. Duas criacoes simultaneas leriam o mesmo MAX e
-- gravariam o mesmo codigo. O upsert com ON CONFLICT trava a linha do contador.
CREATE TABLE IF NOT EXISTS public.project_number_counters (
  company_id uuid    PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.project_number_counters IS
  'Proximo codigo sequencial de obra por empresa. SEM NENHUMA POLICY de propósito: o client nunca toca nesta tabela, so a funcao SECURITY DEFINER public.next_project_code. Espelha equipment_number_counters.';

-- RLS habilitada e DELIBERADAMENTE SEM POLICY NENHUMA pra authenticated/anon:
-- RLS nega tudo o que nao tem policy, entao isso ja fecha a tabela. Os GRANTs
-- abaixo sao a segunda camada (o pg_default_acl do schema public concede
-- arwdDxtm pra anon E authenticated em toda tabela nova — conferido neste
-- banco; sem o REVOKE a tabela nasceria aberta no nivel de privilegio).
ALTER TABLE public.project_number_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.project_number_counters FROM anon, authenticated;
GRANT ALL ON public.project_number_counters TO service_role;


-- ---------------------------------------------------------------------------
-- 2) public.next_project_code — consome e devolve o proximo codigo, atomico
-- ---------------------------------------------------------------------------
-- DIVERGENCIA DELIBERADA DO PRECEDENTE next_equipment_identifier:
--   aquela funcao concede EXECUTE a `authenticated`, e isso e um SMELL. Ela e
--   SECURITY DEFINER e recebe p_company_id ARBITRARIO: qualquer usuario logado
--   pode chamar next_equipment_identifier('<uuid de outro tenant>') e AVANCAR O
--   CONTADOR do vizinho. Nao vaza dado, mas suja a numeracao de quem nao tem
--   nada com isso, e sem rastro.
--   Aqui seguimos o raciocinio de public.ensure_default_crm_pipeline, que e
--   interna DE PROPOSITO: EXECUTE so pra service_role. Quem chama de verdade e
--   o trigger trg_set_project_code, que tambem e SECURITY DEFINER e pertence a
--   `postgres` — e o OWNER tem EXECUTE implicito, sobrevivendo aos REVOKEs.
--   Nao tocamos em next_equipment_identifier: corrigi-la e mudanca de
--   comportamento de outra feature, fora do escopo desta onda (registrado no
--   relatorio como achado).
CREATE OR REPLACE FUNCTION public.next_project_code(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_consumed integer;
BEGIN
  -- Upsert atomico: na primeira obra da empresa a linha nasce com next_value=2
  -- e o RETURNING ve a linha final, logo 2-1 = 1 = codigo consumido. Em
  -- conflito, o DO UPDATE soma 1 e o RETURNING ve a linha pos-update, entao
  -- (next_value)-1 e exatamente o valor antigo = o codigo consumido.
  INSERT INTO public.project_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN v_consumed;
END;
$fn$;

-- O pg_default_acl deste schema concede EXECUTE pra anon E authenticated em
-- toda FUNCAO nova (conferido neste banco: defaclobjtype='f'). Sem estes
-- REVOKEs a funcao nasceria chamavel por anonimo.
REVOKE ALL ON FUNCTION public.next_project_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_project_code(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_project_code(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_project_code(uuid) TO service_role;

COMMENT ON FUNCTION public.next_project_code(uuid) IS
  'Consome o proximo codigo sequencial de obra da empresa (atomico, sem corrida). INTERNA: sem EXECUTE pra authenticated porque recebe company_id arbitrario e um usuario poderia avancar o contador de outro tenant. Chamada so pelo trigger trg_set_project_code (SECURITY DEFINER, owner postgres).';


-- ---------------------------------------------------------------------------
-- 3) public.projects
-- ---------------------------------------------------------------------------
-- Notas de projeto (sao decisoes, nao estilo — nao remover):
--
-- * status e text + CHECK, NAO enum. Convencao da casa; ondas futuras precisam
--   somar status ('aguardando_material', 'em_medicao'...) e ALTER TYPE de enum
--   nao roda dentro de transacao em todas as formas, alem de nao ter como
--   remover valor.
--
-- * code e INTEGER, nao text zero-padded. Ordena e busca sem gambiarra
--   (`code = 7` em vez de `code = '0007'` ou cast em cada query). A formatacao
--   de exibicao (#0001) e responsabilidade da UI. Divergencia consciente de
--   equipment.identifier, que e text por ser rotulo livre herdado.
--
-- * code nasce NULLABLE e recebe SET NOT NULL no fim deste arquivo: o trigger
--   BEFORE INSERT preenche antes de a constraint ser avaliada, entao o NOT NULL
--   e seguro — mesma mecanica que crm_stages.pipeline_id usou na Onda D1.
--
-- * company_id ON DELETE CASCADE. A parte 3 desta onda adiciona um DELETE
--   explicito em admin_delete_company, mas o CASCADE e o cinto: se um caminho
--   novo de exclusao de tenant aparecer sem passar pela RPC, a exclusao nao
--   quebra por violacao de FK.
--
-- * customer_id ON DELETE SET NULL: excluir um cliente nunca pode apagar a obra
--   (o historico financeiro e as OSs dela continuam existindo).
--
-- * color NOT NULL DEFAULT: DEFAULT sozinho nao protege — um INSERT com
--   {"color": null} explicito gravaria null e a UI ficaria sem cor.
CREATE TABLE IF NOT EXISTS public.projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                 integer,
  name                 text NOT NULL,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  responsible_user_id  uuid REFERENCES auth.users(id)       ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'em_andamento',
  start_date           date,
  end_date             date,
  description          text,
  color                text NOT NULL DEFAULT '#2563EB',
  created_by           uuid REFERENCES auth.users(id)       ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_ck CHECK (status IN ('planejada','em_andamento','pausada','concluida','cancelada')),
  CONSTRAINT projects_dates_ck  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.projects IS
  'Obras / projetos. Agrupa frentes de trabalho, que sao funis do CRM (crm_pipelines.project_id). NAO tem endereco proprio (decisao do CEO). O progresso nao mora aqui: e calculado pela RPC project_progress_summary a partir dos cards nas etapas is_won das frentes.';
COMMENT ON COLUMN public.projects.code IS
  'Numero sequencial POR EMPRESA (#1, #2, ...), preenchido pelo trigger trg_set_project_code. Integer de proposito: a formatacao zero-padded e da UI. Nao e o id — nenhuma FK aponta pra ele.';
COMMENT ON COLUMN public.projects.customer_id IS
  'Cliente da obra. NULLABLE de proposito: obra interna (reforma da propria sede) nao tem cliente. ON DELETE SET NULL: excluir cliente nao apaga a obra.';
COMMENT ON COLUMN public.projects.status IS
  'planejada | em_andamento | pausada | concluida | cancelada. text + CHECK e nao enum, pra ondas futuras somarem status sem ALTER TYPE.';

-- Codigo unico por empresa. Este e o handle estavel da obra pro usuario.
CREATE UNIQUE INDEX IF NOT EXISTS projects_company_code_uidx
  ON public.projects (company_id, code);

-- Caminho quente da listagem: "obras da empresa X, filtradas por status".
CREATE INDEX IF NOT EXISTS projects_company_status_idx
  ON public.projects (company_id, status);

-- Estes dois NAO sao cosmeticos: o ON DELETE SET NULL faz o Postgres varrer
-- public.projects pela FK a CADA exclusao de cliente e a cada exclusao de
-- usuario. Sem indice isso e seq scan em toda a tabela, dentro da transacao de
-- quem esta so apagando um cadastro. Parciais porque a esmagadora maioria das
-- linhas tem esses campos nulos (obra interna / sem responsavel definido) e
-- linha nula nunca e alvo do SET NULL.
CREATE INDEX IF NOT EXISTS projects_customer_id_idx
  ON public.projects (customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_responsible_user_id_idx
  ON public.projects (responsible_user_id) WHERE responsible_user_id IS NOT NULL;

-- SEM indice unico por (company_id, lower(name)) — divergencia CONSCIENTE de
-- public.cost_centers, que tem. Centro de custo homonimo arrebenta a leitura
-- historica do DRE (duas fatias com o mesmo rotulo); obra homonima e NORMAL:
-- "Reforma Loja 3" em 2025 e "Reforma Loja 3" em 2026 sao duas obras legitimas,
-- cada uma com seu periodo e seu faturamento. O handle unico e o `code`.

-- updated_at: reusa a funcao compartilhada do projeto. NAO criar outra.
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------------
-- 4) Trigger que preenche o codigo
-- ---------------------------------------------------------------------------
-- Espelha public.set_equipment_identifier. BEFORE INSERT, entao roda ANTES do
-- NOT NULL e do indice unico serem avaliados.
--
-- Respeita um code que o chamador tenha informado (importacao/migracao de dado
-- legado pode querer preservar a numeracao antiga); so gera quando vem NULL.
CREATE OR REPLACE FUNCTION public.set_project_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.code IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.code := public.next_project_code(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_project_code ON public.projects;
CREATE TRIGGER trg_set_project_code
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_code();


-- ---------------------------------------------------------------------------
-- 5) RLS — QUATRO policies, uma por comando. PROIBIDO `FOR ALL` pra authenticated
-- ---------------------------------------------------------------------------
-- Policies PERMISSIVAS do Postgres se SOMAM por OR. Uma unica `FOR ALL` pra
-- authenticated sombreia qualquer restricao por comando e a torna letra morta —
-- foi exatamente o incidente de 04/09 em financial_transactions (um usuario sem
-- nenhuma permissao de financeiro apagou lancamento porque a "FOR ALL" liberava
-- DELETE por OR). Ver 20260904150000_rls_delete_finance_somente_gestor.sql e o
-- padrao canonico de 20260911210000_centro_de_custo.sql, seguido aqui.
--
-- InitPlan: toda chamada de funcao de auth vai embrulhada em (SELECT ...), pra
-- ser avaliada UMA VEZ por query em vez de uma vez por linha
-- (20260826161618_rls_wrap_auth_initplan).
--
-- SEM CLAUSULA DE is_super_admin EM NENHUMA DAS QUATRO — divergencia CONSCIENTE
-- de crm_pipelines, que tem. Aqui seguimos cost_centers / financial_categories /
-- financial_accounts: "o painel master nao le dado operacional de tenant". Nao
-- foi esquecimento; nao "consertar" depois. Se o painel master precisar de obra
-- um dia, isso entra como RPC explicita e auditavel, nao como clausula de policy.
--
-- ESCRITA POR can_manage_system E NAO POR UMA fn:manage_projects NOVA —
-- divergencia consciente da preferencia do CEO por permissao granular, e o
-- motivo e mecanico: criar FRENTE de projeto JA exige can_manage_system (frente
-- e crm_pipelines + crm_stages, cujas policies de escrita exigem isso). Uma
-- permissao nova so pro projeto deixaria o usuario criar a obra e NAO conseguir
-- criar nenhuma frente dentro dela — obra vazia e inutil. Granularizar exige
-- granularizar o CRM junto, que e outra onda.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_projects" ON public.projects;
CREATE POLICY "service_role_full_access_projects"
  ON public.projects FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own company projects" ON public.projects;
CREATE POLICY "Users can view own company projects"
  ON public.projects FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Managers can insert own company projects" ON public.projects;
CREATE POLICY "Managers can insert own company projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.can_manage_system((SELECT auth.uid())))
  );

-- O WITH CHECK do UPDATE existe pra impedir `SET company_id = '<outro tenant>'`:
-- o USING so valida a linha ANTES da mudanca, e sem o WITH CHECK um gestor
-- poderia empurrar a obra dele pra dentro de outra empresa. NAO REMOVER.
DROP POLICY IF EXISTS "Managers can update own company projects" ON public.projects;
CREATE POLICY "Managers can update own company projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.can_manage_system((SELECT auth.uid())))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.can_manage_system((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Managers can delete own company projects" ON public.projects;
CREATE POLICY "Managers can delete own company projects"
  ON public.projects FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.can_manage_system((SELECT auth.uid())))
  );

-- Segunda camada, no nivel de privilegio: o pg_default_acl do schema public
-- concede arwdDxtm pra anon em TODA tabela nova (conferido neste banco). Nao e
-- exploravel com as policies acima (todas TO authenticated/service_role, e RLS
-- nega o que nao tem policy), mas deixaria a seguranca apoiada numa camada so.
REVOKE ALL ON public.projects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
-- Explicito, e nao herdado do default: 20260917164000 tirou TRUNCATE de anon e
-- authenticated nas tabelas de entao; tabela nova tem que nascer igual.
REVOKE TRUNCATE ON public.projects FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) Gatilho BEFORE DELETE — integridade, NAO seguranca
-- ---------------------------------------------------------------------------
-- Espelha public.prevent_delete_cost_center_in_use (20260911210000).
--
-- POR QUE ISSO NAO VIRA UMA CLAUSULA NA POLICY DE DELETE:
--   RLS negando DELETE no PostgREST devolve 204 com ZERO LINHAS AFETADAS e
--   NENHUM ERRO. O usuario ve "excluido com sucesso", a tela some o item e a
--   obra continua la — reaparecendo no proximo refresh. Gatilho dispara sempre
--   (inclusive via CASCADE) e devolve mensagem legivel.
--
-- ERRCODE 23001 (restrict_violation): a classe 23 vira HTTP 409 no PostgREST e
-- nao colide com 23505 (unique) nem 23503 (FK), entao o front distingue este
-- caso de "codigo duplicado".
--
-- SECURITY DEFINER de proposito: se a contagem rodasse sob a RLS do chamador, a
-- ACL por funil (can_access_pipeline) poderia esconder frentes do contador, ele
-- contaria 0 e liberaria a exclusao de uma obra que tem conteudo. Nao filtra
-- por company_id: as FKs ja garantem o escopo.
--
-- A SAIDA RECOMENDADA e mudar o status pra 'cancelada', nao excluir — preserva
-- o historico (mesma logica do `voided` do financeiro).
--
-- NOTA DE ORDEM: o corpo referencia crm_pipelines.project_id, que so nasce na
-- PARTE 2 desta onda. plpgsql resolve nomes em tempo de EXECUCAO, entao o
-- CREATE aqui passa; e como as tres partes sao aplicadas na mesma sequencia e
-- nao existe nenhuma obra no banco, nao ha janela em que um DELETE real caia
-- entre os dois arquivos.
CREATE OR REPLACE FUNCTION public.prevent_delete_project_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_fronts bigint;
  v_cards  bigint;
BEGIN
  SELECT count(*) INTO v_fronts
    FROM public.crm_pipelines p
   WHERE p.project_id = OLD.id;

  IF v_fronts > 0 THEN
    SELECT count(*) INTO v_cards
      FROM public.leads l
     WHERE l.pipeline_id IN (
       SELECT p.id FROM public.crm_pipelines p WHERE p.project_id = OLD.id
     );

    RAISE EXCEPTION
      'Esta obra tem % frente% de trabalho com % oportunidade% e nao pode ser excluida. Mova ou exclua as frentes primeiro, ou mude o status da obra para "cancelada" para preservar o historico.',
      v_fronts, CASE WHEN v_fronts = 1 THEN ''  ELSE 's'  END,
      v_cards,  CASE WHEN v_cards  = 1 THEN ''  ELSE 's'  END
      USING ERRCODE = '23001';
  END IF;

  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS prevent_delete_project_in_use ON public.projects;
CREATE TRIGGER prevent_delete_project_in_use
  BEFORE DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_project_in_use();


-- ---------------------------------------------------------------------------
-- 7) code vira NOT NULL (por ultimo, depois do trigger existir)
-- ---------------------------------------------------------------------------
-- Seguro sem backfill: a tabela nasceu neste arquivo e esta vazia, e de agora
-- em diante o trigger BEFORE INSERT preenche o valor antes de a constraint ser
-- avaliada. Mesma mecanica de crm_stages.pipeline_id na Onda D1.
ALTER TABLE public.projects ALTER COLUMN code SET NOT NULL;

DO $check$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.projects WHERE code IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Invariante quebrada: % obra(s) sem code', v_n;
  END IF;
  RAISE NOTICE 'projects: tabela criada, % linha(s), code NOT NULL ativo',
    (SELECT count(*) FROM public.projects);
END
$check$;
