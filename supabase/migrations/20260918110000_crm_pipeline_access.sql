-- ============================================================================
-- Onda D3 do overhaul do CRM (plano docs/planos/2026-09-17-crm-overhaul.md)
-- ACL POR FUNIL: quem enxerga qual funil do CRM.
--
-- POR QUE: pedido do CEO ("poder ocultar uma coluna de um pipeline de um
-- usuario, ou fazer um CRUD dos usuarios que podem ver aquele pipeline").
-- Decisao do Tech Lead, seguindo Kommo e RD Station: ACL por FUNIL agora;
-- ocultar ETAPA individual e recurso avancado e fica pra depois. Este arquivo
-- NAO implementa ACL de etapa.
--
-- A REGRA (definida por 🛡️ Plataforma, implementada aqui)
-- ---------------------------------------------------------------------------
-- Acesso ao FUNIL:
--     NAO existe nenhuma linha de ACL pra esse funil   (funil aberto, default)
--  OU o usuario esta listado na ACL desse funil
--  OU user_has_permission(uid, 'fn:manage_crm')
--
-- "Funil sem nenhuma linha de ACL e visivel pra empresa toda" e PROPOSITAL:
-- nenhuma empresa pode acordar com funil escondido por causa desta migration.
-- A tabela nasce vazia, entao o antes e o depois sao identicos (medido: 52
-- empresas, 52 funis, 1 funil por empresa, 0 usuarios perdem acesso).
--
-- Acesso as OPORTUNIDADES: a regra da Onda C continua e a de funil soma com AND:
--     (manage_crm OU responsavel OU co-responsavel OU criador OU fila)
--   E (regra de acesso ao funil acima)
-- O AND existe porque card sem coluna pra morar e pior que card escondido: se o
-- usuario enxergasse a oportunidade sem enxergar o funil, sobraria card orfao.
--
-- POR QUE "AS RESTRICTIVE" E NAO PERMISSIVA
-- ---------------------------------------------------------------------------
-- crm_pipelines / crm_stages / leads ja tem policies PERMISSIVAS (company_id,
-- can_manage_system, Onda C). Policies permissivas se somam com OR — uma policy
-- nova permissiva ALARGARIA o acesso em vez de estreitar. Isso ja mordeu na
-- Onda C. Entao tudo aqui entra como RESTRICTIVE, que combina com AND.
-- FOR ALL e nao FOR SELECT, mesma razao da Onda C: cobrir so a leitura deixaria
-- alterar por id um funil/etapa/lead que a pessoa nao enxerga.
--
-- RECURSAO DE RLS (armadilha tratada)
-- ---------------------------------------------------------------------------
-- O ciclo que ameacava nascer aqui e:
--     crm_pipelines -> (policy) -> crm_pipeline_access -> (policy) -> crm_pipelines
-- Um EXISTS direto nos dois lados faz o Postgres abortar com "infinite
-- recursion detected in policy for relation". Como na Onda C, os DOIS lados
-- passam por funcao SECURITY DEFINER, que roda como dono da tabela (RLS
-- desligada) e quebra o ciclo:
--   * can_access_pipeline(pipeline_id, user_id) -> le crm_pipeline_access sem RLS
--   * crm_pipeline_company_id(pipeline_id)      -> le crm_pipelines sem RLS
-- Nenhuma policy desta migration referencia outra TABELA diretamente; todas
-- chamam funcao. leads/crm_stages so passam UMA COLUNA DA PROPRIA LINHA
-- (pipeline_id) pra funcao, entao o ciclo leads <-> lead_assignees quebrado na
-- Onda C tambem nao volta.
--
-- ONDE A REGRA VIVE (tem que concordar, igual a Onda C)
-- ---------------------------------------------------------------------------
--   (a) policy RESTRICTIVE "Funis restritos a quem tem acesso"   (crm_pipelines)
--   (b) policy RESTRICTIVE "Etapas restritas ao funil acessivel" (crm_stages)
--   (c) policy RESTRICTIVE "Leads restritos ao funil acessivel"  (leads)
--   (d) public.can_access_lead(), usada pela policy de lead_assignees
-- Mexeu em uma, mexe nas quatro NA MESMA MIGRATION. Se (c) e (d) discordarem, o
-- usuario ve o lead mas nao consegue mexer na lista de responsaveis dele.
--
-- RPCs DE LIMPEZA
-- ---------------------------------------------------------------------------
--   * admin_delete_company: NAO precisa de patch. crm_pipeline_access.pipeline_id
--     e ON DELETE CASCADE e a RPC ja apaga crm_pipelines da empresa; a ACL cai
--     junto. user_id tambem e CASCADE, pra quando o usuario e excluido.
--     (Provado por teste de cascade em transacao com rollback.)
--   * reset_system_step ('custom_configs'): PRECISA. O funil PADRAO sobrevive
--     ao "Zerar Sistema" de proposito (a empresa nao pode ficar sem funil) —
--     se a ACL dele sobrevivesse junto, a empresa acordaria do reset com o
--     funil escondido de parte do time. Patch feito na DEFINICAO VIVA
--     (pg_get_functiondef + replace + EXECUTE), nunca recriando do arquivo
--     antigo: outras sessoes mexem nessa RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.crm_pipeline_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_pipeline_access (
  pipeline_id uuid        NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id)                   ON DELETE SET NULL,
  PRIMARY KEY (pipeline_id, user_id)
);

COMMENT ON TABLE public.crm_pipeline_access IS
  'ACL por funil do CRM. Funil SEM NENHUMA LINHA aqui e visivel pra empresa inteira (default aberto, proposital). Com linhas, so os listados + quem tem fn:manage_crm. Ocultar etapa individual NAO existe: e ACL de funil.';
COMMENT ON COLUMN public.crm_pipeline_access.pipeline_id IS
  'ON DELETE CASCADE: a ACL e configuracao do funil, morre com ele. Nao segura a exclusao (quem segura sao crm_stages e leads, com RESTRICT).';

-- can_access_pipeline pergunta "existe linha pra este funil?" e "existe linha
-- pra este funil E este usuario?" — a PK (pipeline_id, user_id) atende as duas.
-- Este indice aqui e pro caminho inverso: "de quais funis este usuario
-- participa", usado pela tela de usuarios e pela limpeza ao excluir usuario.
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_access_user_id
  ON public.crm_pipeline_access (user_id);

-- Tabela nova em public nasce com GRANT pra anon pelo ACL default do projeto.
REVOKE ALL ON public.crm_pipeline_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_access TO authenticated;
GRANT ALL ON public.crm_pipeline_access TO service_role;
-- Explicito, e nao herdado do default: 20260917164000 tirou TRUNCATE de anon e
-- authenticated nas tabelas de entao; tabela nova tem que nascer igual.
REVOKE TRUNCATE ON public.crm_pipeline_access FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Funcoes SECURITY DEFINER que quebram o ciclo de RLS
-- ---------------------------------------------------------------------------

-- 2a. crm_pipeline_company_id — de quem e o funil, sem passar pela RLS de
--     crm_pipelines (que a partir desta migration consulta crm_pipeline_access).
CREATE OR REPLACE FUNCTION public.crm_pipeline_company_id(_pipeline_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.company_id FROM public.crm_pipelines p WHERE p.id = _pipeline_id;
$$;

REVOKE ALL ON FUNCTION public.crm_pipeline_company_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_pipeline_company_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.crm_pipeline_company_id(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_pipeline_company_id(uuid) IS
  'Empresa dona do funil, lida SEM RLS. Existe pra quebrar o ciclo crm_pipeline_access -> crm_pipelines -> crm_pipeline_access nas policies.';

-- 2b. can_access_pipeline — A REGRA DE ACESSO AO FUNIL, fonte unica.
--
-- _pipeline_id NULL devolve TRUE de proposito: leads.pipeline_id e NULLABLE
-- (decisao (b) da migration 20260918100000 — lead recusado e pior que lead sem
-- funil). Se a resolucao do funil falhar, o lead NAO pode sumir da tela.
--
-- Esta funcao NAO checa company_id. Quem garante o isolamento entre empresas
-- continua sendo a policy PERMISSIVA de cada tabela (company_id = ...). Esta
-- aqui so ESTREITA, dentro da empresa.
CREATE OR REPLACE FUNCTION public.can_access_pipeline(_pipeline_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _pipeline_id IS NULL
    OR public.user_has_permission(_user_id, 'fn:manage_crm')
    OR NOT EXISTS (
      SELECT 1 FROM public.crm_pipeline_access a
       WHERE a.pipeline_id = _pipeline_id
    )
    OR EXISTS (
      SELECT 1 FROM public.crm_pipeline_access a
       WHERE a.pipeline_id = _pipeline_id AND a.user_id = _user_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_pipeline(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_pipeline(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_pipeline(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_pipeline(uuid, uuid) IS
  'Regra de acesso ao funil: sem nenhuma linha de ACL => aberto; com linhas => so os listados; fn:manage_crm sempre passa. pipeline_id NULL => true (lead sem funil nao pode sumir). Fonte unica das policies de crm_pipelines, crm_stages e leads.';

-- ---------------------------------------------------------------------------
-- 3. RLS de crm_pipeline_access
--
-- Escrita: mesmo publico que ja administra funil e etapa (can_manage_system da
-- PROPRIA empresa, ou super_admin). Leitura: o administrador ve tudo da empresa
-- dele; o usuario comum ve so as proprias linhas.
--
-- DE PROPOSITO a policy desta tabela NAO depende de can_access_pipeline: se
-- dependesse, um gestor que se removesse da ACL por engano perderia o acesso a
-- propria ACL e ficaria trancado fora do funil pra sempre. Aqui ele sempre
-- consegue reabrir. (Admin/super_admin nunca cai nisso porque
-- user_has_permission devolve true no passo 1, mas gestor sem fn:manage_crm
-- cairia.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_pipeline_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_crm_pipeline_access" ON public.crm_pipeline_access;
CREATE POLICY "service_role_full_access_crm_pipeline_access"
  ON public.crm_pipeline_access FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own crm_pipeline_access" ON public.crm_pipeline_access;
CREATE POLICY "Users view own crm_pipeline_access"
  ON public.crm_pipeline_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "System managers manage crm_pipeline_access" ON public.crm_pipeline_access;
CREATE POLICY "System managers manage crm_pipeline_access"
  ON public.crm_pipeline_access FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR (public.can_manage_system((SELECT auth.uid()))
        AND public.crm_pipeline_company_id(pipeline_id)
            = (SELECT public.get_user_company_id((SELECT auth.uid()))))
  )
  WITH CHECK (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR (public.can_manage_system((SELECT auth.uid()))
        AND public.crm_pipeline_company_id(pipeline_id)
            = (SELECT public.get_user_company_id((SELECT auth.uid()))))
  );

-- ---------------------------------------------------------------------------
-- 4. crm_pipelines — funil que o usuario nao acessa nao aparece
-- ---------------------------------------------------------------------------
-- INSERT continua funcionando: funil recem-criado nao tem linha de ACL, entao
-- can_access_pipeline devolve true no WITH CHECK.
DROP POLICY IF EXISTS "Funis restritos a quem tem acesso" ON public.crm_pipelines;
CREATE POLICY "Funis restritos a quem tem acesso"
  ON public.crm_pipelines
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING      (public.can_access_pipeline(crm_pipelines.id, (SELECT auth.uid())))
  WITH CHECK (public.can_access_pipeline(crm_pipelines.id, (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. crm_stages — etapa de funil inacessivel nao aparece
-- ---------------------------------------------------------------------------
-- crm_stages.pipeline_id e NOT NULL e o trigger BEFORE (trg_crm_stages_resolve_
-- pipeline) preenche antes do WITH CHECK ser avaliado, entao criar etapa pelo
-- client pre-D2 (que nao manda pipeline_id) continua funcionando.
DROP POLICY IF EXISTS "Etapas restritas ao funil acessivel" ON public.crm_stages;
CREATE POLICY "Etapas restritas ao funil acessivel"
  ON public.crm_stages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING      (public.can_access_pipeline(crm_stages.pipeline_id, (SELECT auth.uid())))
  WITH CHECK (public.can_access_pipeline(crm_stages.pipeline_id, (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 6. leads — oportunidade de funil inacessivel nao aparece
--
-- POLICY SEPARADA, e nao edicao da policy da Onda C ("Leads visiveis apenas ao
-- responsavel"): policies RESTRICTIVE multiplas ja combinam com AND, que e
-- exatamente a regra pedida. Manter separado deixa a Onda C intocada (menos
-- risco de atropelar outra sessao) e torna o D3 reversivel com um DROP POLICY.
--
-- EFEITO ESPERADO E ACEITO: um vendedor responsavel por uma oportunidade que
-- vive num funil restrito ao qual ele nao pertence DEIXA de ver a oportunidade.
-- E o preco de existir ACL de funil; medido antes de aplicar: hoje isso atinge
-- 0 usuarios e 0 oportunidades, porque a tabela nasce vazia.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Leads restritos ao funil acessivel" ON public.leads;
CREATE POLICY "Leads restritos ao funil acessivel"
  ON public.leads
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING      (public.can_access_pipeline(leads.pipeline_id, (SELECT auth.uid())))
  WITH CHECK (public.can_access_pipeline(leads.pipeline_id, (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. can_access_lead — o outro lado da MESMA regra (policy de lead_assignees)
--
-- CREATE OR REPLACE preserva a ACL da funcao; os GRANTs sao reafirmados abaixo
-- pra migration continuar auto-suficiente. O corpo abaixo e o de
-- 20260917163000 (empresa + manage_crm/responsavel/criador/co-responsavel +
-- fila) COM o AND do funil no fim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        l.company_id = public.get_user_company_id(_user_id)
        OR public.is_super_admin(_user_id)
      )
      AND (
        public.user_has_permission(_user_id, 'fn:manage_crm')
        OR l.assigned_to = _user_id
        OR l.created_by  = _user_id
        OR EXISTS (
          SELECT 1 FROM public.lead_assignees la
          WHERE la.lead_id = l.id AND la.user_id = _user_id
        )
        -- FILA: sem responsavel E sem criador. AND, nunca OR.
        OR (l.assigned_to IS NULL AND l.created_by IS NULL)
      )
      -- D3: acesso ao funil combina com AND, nunca com OR.
      AND public.can_access_pipeline(l.pipeline_id, _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_lead(uuid, uuid) IS
  'Regra COMPLETA de visibilidade de um lead: (empresa) E (manage_crm OU responsavel OU criador OU co-responsavel OU fila sem dono) E (acesso ao funil, can_access_pipeline). Tem que ficar em sincronia com as policies RESTRICTIVE "Leads visiveis apenas ao responsavel" e "Leads restritos ao funil acessivel" de public.leads.';

-- ---------------------------------------------------------------------------
-- 8. reset_system_step — "Zerar Sistema" nao pode deixar ACL orfa
--
-- Patch sobre a DEFINICAO VIVA (pg_get_functiondef), nunca colando a funcao
-- inteira aqui: outras sessoes mexem nessa RPC e recriar do arquivo antigo
-- reverteria o trabalho delas. CREATE OR REPLACE preserva grants.
--
-- admin_delete_company NAO entra: o ON DELETE CASCADE de
-- crm_pipeline_access.pipeline_id ja resolve, e a RPC ja apaga crm_pipelines.
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def    text;
  v_anchor text := '    v_counts := jsonb_set(v_counts, ''{crm_stages}'', to_jsonb(v_n));';
  v_add    text :=
    E'\n\n'                                                                                  ||
    '    -- ACL por funil: o funil padrao sobrevive ao reset, a ACL dele nao pode' || E'\n' ||
    '    -- sobreviver — a empresa acordaria do reset com o funil escondido.'      || E'\n' ||
    '    DELETE FROM public.crm_pipeline_access a'                                 || E'\n' ||
    '     WHERE a.pipeline_id IN ('                                                || E'\n' ||
    '       SELECT p.id FROM public.crm_pipelines p WHERE p.company_id = p_company_id' || E'\n' ||
    '     );'                                                                      || E'\n' ||
    '    GET DIAGNOSTICS v_n = ROW_COUNT;'                                         || E'\n' ||
    '    v_counts := jsonb_set(v_counts, ''{crm_pipeline_access}'', to_jsonb(v_n));';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reset_system_step'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'reset_system_step nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%crm_pipeline_access%' THEN
    RAISE NOTICE 'reset_system_step ja limpa crm_pipeline_access; nada a fazer';
  ELSIF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'reset_system_step mudou de forma: ancora nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    -- O DELETE novo entra DEPOIS do GET DIAGNOSTICS de crm_stages, nunca entre
    -- o DELETE e o GET DIAGNOSTICS dele: o contador de {crm_stages} passaria a
    -- reportar o ROW_COUNT do statement errado.
    EXECUTE replace(v_def, v_anchor, v_anchor || v_add);
    RAISE NOTICE 'reset_system_step patchada: passa a limpar crm_pipeline_access';
  END IF;
END
$patch$;
