-- ============================================================================
-- PROJETOS — Onda 1, parte 2 de 3: a FRENTE DE TRABALHO e as travas dela.
--
-- Frente de trabalho de uma obra E UM FUNIL DO CRM. Esta migration adiciona
-- crm_pipelines.project_id e tudo o que impede essa coluna de virar um buraco:
--     project_id IS NULL      => funil comercial, continua em /crm como hoje;
--     project_id IS NOT NULL  => frente de obra, aparece so dentro da obra.
--
-- ⚠️ ESTA MIGRATION E INDIVISIVEL. NAO QUEBRAR EM DUAS.
-- ---------------------------------------------------------------------------
-- O bloco 3 adiciona a CHECK (project_id IS NULL OR is_default = false) e o
-- bloco 2 patcha public.ensure_default_crm_pipeline. Se a CHECK entrar SEM o
-- patch, a captacao de lead do site PASSA A FALHAR EM SILENCIO:
--   ensure_default_crm_pipeline, hoje, quando a empresa nao tem nenhum funil
--   marcado como is_default, pega o PRIMEIRO funil da empresa SEM NENHUM FILTRO
--   (ORDER BY position, created_at LIMIT 1) e o promove a padrao. Com a CHECK no
--   ar, numa empresa cujo funil padrao sumiu (reset, SQL direto, corrida) ela
--   tentaria promover uma FRENTE DE OBRA, bateria na CHECK e levantaria excecao
--   DENTRO de um BEFORE INSERT de crm_stages E de leads.
--   E o caminho de leads e usado pela edge crm-lead-webhook (service_role) e
--   pelo formulario publico de captacao. Resultado: lead do site recusado com
--   500, assincrono, sem ninguem na tela, descoberto dias depois.
-- Por isso o patch vem ANTES da CHECK neste arquivo, e nunca em outro arquivo.
--
-- Nenhuma obra existe no banco quando isto roda, entao project_id nasce NULL em
-- 100% dos funis e o comportamento do /crm e bit-a-bit o de hoje.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) A coluna
-- ---------------------------------------------------------------------------
-- ON DELETE RESTRICT, NUNCA SET NULL. Com SET NULL, excluir uma obra
-- PROMOVERIA as frentes dela a funis comerciais globais, despejando todos os
-- cards da obra no quadro de vendas da empresa. O dado nao some: reaparece no
-- lugar errado, misturado com pipeline comercial de verdade — que e pior que
-- erro, porque ninguem percebe.
-- CASCADE tambem esta fora: apagar o funil bateria no ON DELETE RESTRICT de
-- crm_stages.pipeline_id dois niveis abaixo, e o usuario levaria um erro de FK
-- de uma tabela que ele nunca ouviu falar. Com RESTRICT aqui, quem barra e a
-- nossa propria trava (prevent_delete_project_in_use, parte 1), com texto
-- PT-BR dizendo quantas frentes e quantos cards existem.
ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS project_id uuid
  REFERENCES public.projects(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.crm_pipelines.project_id IS
  'NULL = funil COMERCIAL (aparece em /crm, comportamento historico). NOT NULL = FRENTE DE TRABALHO de uma obra (aparece so dentro do projeto, nunca no /crm). ON DELETE RESTRICT de proposito: SET NULL promoveria a frente a funil comercial e despejaria os cards da obra no quadro de vendas.';


-- ---------------------------------------------------------------------------
-- 2) 🔴 PATCH OBRIGATORIO em public.ensure_default_crm_pipeline
--    (tem que vir ANTES da CHECK do bloco 3 — ver o cabecalho)
-- ---------------------------------------------------------------------------
-- Os dois SELECT ganham `AND project_id IS NULL` e o INSERT final explicita
-- project_id = NULL. Assim a auto-cura do funil padrao NUNCA considera uma
-- frente de obra: numa empresa que so tem frentes, ela cria um "Funil de
-- Vendas" comercial novo, que e o comportamento correto.
--
-- O primeiro SELECT (WHERE is_default) ja seria protegido pela CHECK por
-- construcao, mas o filtro entra la tambem: se a CHECK for algum dia relaxada,
-- a funcao nao volta a ser um buraco por omissao.
--
-- CREATE OR REPLACE partindo da DEFINICAO VIVA do banco (pg_get_functiondef,
-- conferida nesta sessao), nao do arquivo de 20260918100000: outras sessoes
-- mexem nessa RPC e recriar do arquivo antigo reverteria o trabalho delas. O
-- corpo abaixo e identico ao vivo, com 3 linhas alteradas e marcadas.
--
-- NAO MEXER no indice idx_crm_pipelines_one_default. A tentacao e trocar
-- `WHERE is_default` por `WHERE is_default AND project_id IS NULL`, mas isso
-- passaria a PERMITIR um default global MAIS um default por obra, reabrindo
-- exatamente o buraco que a CHECK do bloco 3 fecha. Fica como esta.
CREATE OR REPLACE FUNCTION public.ensure_default_crm_pipeline(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.crm_pipelines
   WHERE company_id = _company_id AND is_default
     AND project_id IS NULL                      -- <-- Onda 1 de Projetos
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Empresa que tem funil mas nenhum marcado como padrao: promove o primeiro em
  -- vez de criar um sexto "Funil de Vendas" duplicado.
  -- Onda 1 de Projetos: NUNCA promover uma frente de obra. Sem este filtro a
  -- promocao bateria na CHECK crm_pipelines_project_not_default e explodiria
  -- dentro do BEFORE INSERT de leads — ou seja, na captacao do site.
  SELECT id INTO v_id
    FROM public.crm_pipelines
   WHERE company_id = _company_id
     AND project_id IS NULL                      -- <-- Onda 1 de Projetos
   ORDER BY position, created_at
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.crm_pipelines SET is_default = true WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.crm_pipelines (company_id, name, position, is_default, project_id)
  VALUES (_company_id, 'Funil de Vendas', 0, true, NULL)   -- <-- Onda 1 de Projetos
  ON CONFLICT (company_id) WHERE is_default DO NOTHING
  RETURNING id INTO v_id;

  -- Corrida: outra sessao criou o padrao entre o SELECT e o INSERT.
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.crm_pipelines
     WHERE company_id = _company_id AND is_default
       AND project_id IS NULL                    -- <-- Onda 1 de Projetos
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$fn$;

-- CREATE OR REPLACE preserva a ACL, mas reafirmamos pra migration ficar
-- auto-suficiente (a funcao e INTERNA: nenhum execute pra authenticated).
REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_crm_pipeline(uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_default_crm_pipeline(uuid) IS
  'Pega (ou cria) o funil padrao "Funil de Vendas" COMERCIAL da empresa. So considera funil com project_id IS NULL: frente de obra nunca pode ser promovida a padrao (bateria na CHECK e derrubaria a captacao de lead). Interna: sem execute pra authenticated, porque recebe company_id arbitrario.';


-- ---------------------------------------------------------------------------
-- 3) A CHECK: frente de obra nunca e o funil padrao da empresa
-- ---------------------------------------------------------------------------
-- O funil padrao e o destino de todo lead/etapa que nasce sem funil informado
-- (captacao do site, webhook, CRM pre-D2). Se uma frente de obra pudesse ser o
-- padrao, lead comercial anonimo cairia DENTRO de uma obra e mexeria na barra
-- de progresso dela de fora pra dentro.
DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'crm_pipelines_project_not_default'
       AND conrelid = 'public.crm_pipelines'::regclass
  ) THEN
    ALTER TABLE public.crm_pipelines
      ADD CONSTRAINT crm_pipelines_project_not_default
      CHECK (project_id IS NULL OR is_default = false);
    RAISE NOTICE 'crm_pipelines: CHECK crm_pipelines_project_not_default criada';
  ELSE
    RAISE NOTICE 'crm_pipelines: CHECK crm_pipelines_project_not_default ja existe';
  END IF;
END
$ck$;


-- ---------------------------------------------------------------------------
-- 4) Indices
-- ---------------------------------------------------------------------------
-- "As frentes desta obra, na ordem" — a tela do projeto.
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_project_id
  ON public.crm_pipelines (project_id, position)
  WHERE project_id IS NOT NULL;

-- "Os funis COMERCIAIS desta empresa, na ordem" — este e o caminho QUENTE do
-- /crm depois desta mudanca: a tela de CRM passa a precisar do
-- `project_id IS NULL` em toda listagem, e o idx_crm_pipelines_company_id
-- existente nao cobre o predicado parcial.
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_company_comercial
  ON public.crm_pipelines (company_id, position)
  WHERE project_id IS NULL;


-- ---------------------------------------------------------------------------
-- 5) Trigger de guarda — isolamento entre empresas e transicoes seguras
-- ---------------------------------------------------------------------------
-- (a) ISOLAMENTO. Sem isto, um PATCH direto em /rest/v1/crm_pipelines aceita um
--     project_id de OUTRO TENANT: as policies de crm_pipelines validam o
--     company_id DA LINHA, nao a dona do projeto apontado. O funil ficaria
--     visivel pra empresa A e contado no progresso da obra da empresa B — ou
--     seja, envenenaria a RPC de progresso da parte 3 e vazaria contagem entre
--     tenants. Espelha trg_crm_stages_resolve_pipeline e
--     validate_crm_webhook_destination, que resolvem o mesmo problema pra
--     pipeline_id e stage_id.
--
-- (b) MUDAR DE LADO COM CARD DENTRO. Vincular/desvincular um funil de uma obra
--     move TODOS os cards dele de quadro de uma vez, o que falsifica
--     retroativamente o progresso da obra (ou injeta cards de obra no funil de
--     vendas). Recusamos enquanto houver card; o usuario move os cards primeiro.
--
-- (c) ULTIMO FUNIL COMERCIAL. Transformar o unico funil comercial da empresa em
--     frente de obra deixaria o /crm sem nenhum quadro e a empresa sem destino
--     pra lead novo. Recusamos.
--
-- NAO EXISTE GUARDA EQUIVALENTE EM BEFORE DELETE DE crm_pipelines, DE PROPOSITO:
--     public.admin_delete_company e public.reset_system_step apagam funis EM
--     MASSA, e um guard de DELETE estouraria DENTRO delas. E a armadilha ja
--     documentada em 20260911210100 — o guard de cost_centers abortava o step do
--     "Zerar Sistema". A invariante "sempre existe funil comercial" fica na
--     guarda do client + na auto-cura de ensure_default_crm_pipeline (bloco 2),
--     que recria o padrao comercial sozinha quando ele falta.
--
-- SECURITY DEFINER: as contagens nao podem rodar sob a RLS do chamador. A ACL
-- por funil (can_access_pipeline) e as policies de leads podem esconder linhas
-- do contador, e um guard que conta 0 por falta de visibilidade libera
-- exatamente o que deveria barrar.
CREATE OR REPLACE FUNCTION public.crm_pipelines_guard_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_project_company uuid;
  v_cards           bigint;
  v_other_comercial bigint;
BEGIN
  -- (a) Isolamento: a obra apontada tem que ser da MESMA empresa do funil.
  IF NEW.project_id IS NOT NULL THEN
    SELECT pr.company_id INTO v_project_company
      FROM public.projects pr
     WHERE pr.id = NEW.project_id;

    IF v_project_company IS NULL OR v_project_company <> NEW.company_id THEN
      RAISE EXCEPTION 'A obra informada nao pertence a esta empresa'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    -- (b) Nao da pra trocar de quadro levando os cards junto.
    SELECT count(*) INTO v_cards
      FROM public.leads l
     WHERE l.pipeline_id = OLD.id;

    IF v_cards > 0 THEN
      RAISE EXCEPTION
        'Este funil tem % oportunidade%. Mova as oportunidades antes de vincula-lo (ou desvincula-lo) de uma obra.',
        v_cards, CASE WHEN v_cards = 1 THEN '' ELSE 's' END
        USING ERRCODE = '23001';
    END IF;

    -- (c) A empresa nao pode ficar sem nenhum funil comercial.
    IF OLD.project_id IS NULL AND NEW.project_id IS NOT NULL THEN
      SELECT count(*) INTO v_other_comercial
        FROM public.crm_pipelines p
       WHERE p.company_id = OLD.company_id
         AND p.project_id IS NULL
         AND p.id <> OLD.id;

      IF v_other_comercial = 0 THEN
        RAISE EXCEPTION
          'Este e o ultimo funil comercial da empresa e nao pode ser transformado em frente de obra. Crie outro funil no CRM antes.'
          USING ERRCODE = '23001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS crm_pipelines_guard_project ON public.crm_pipelines;
CREATE TRIGGER crm_pipelines_guard_project
  BEFORE INSERT OR UPDATE OF project_id, company_id, is_default
  ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.crm_pipelines_guard_project();


-- ---------------------------------------------------------------------------
-- 6) Webhook de captacao nao pode apontar pra frente de obra
-- ---------------------------------------------------------------------------
-- Patch em public.validate_crm_webhook_destination (20260928143000): sem isto,
-- um lead EXTERNO (site, Meta, formulario de terceiro) cairia direto numa
-- frente de obra e passaria a MEXER NA BARRA DE PROGRESSO da obra de fora pra
-- dentro — sem ninguem da operacao autorizar.
--
-- O corpo abaixo e o vivo (conferido nesta sessao) com UM bloco somado no fim.
-- public.lead_capture_forms NAO tem pipeline_id nem stage_id (conferido: as 15
-- colunas da tabela), entao o formulario publico de captacao nao precisa de
-- trava equivalente — ele sempre cai no funil padrao, que a CHECK do bloco 3 ja
-- garante ser comercial.
CREATE OR REPLACE FUNCTION public.validate_crm_webhook_destination()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NEW.pipeline_id IS NULL THEN
    RAISE EXCEPTION 'A etapa de destino exige um funil de destino'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.pipeline_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.crm_pipelines p
     WHERE p.id = NEW.pipeline_id
       AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'O funil de destino não pertence à empresa do webhook'
      USING ERRCODE = '23514';
  END IF;

  -- Onda 1 de Projetos: captacao externa so cai em funil COMERCIAL.
  IF NEW.pipeline_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.crm_pipelines p
     WHERE p.id = NEW.pipeline_id
       AND p.project_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Webhook de captação só pode cair em funil comercial, não em frente de obra'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.crm_stages s
     WHERE s.id = NEW.stage_id
       AND s.pipeline_id = NEW.pipeline_id
       AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'A etapa de destino não pertence ao funil selecionado'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.validate_crm_webhook_destination() IS
  'Valida o destino do webhook de captacao do CRM: etapa exige funil, funil e etapa tem que ser da empresa do webhook, e (Onda 1 de Projetos) o funil tem que ser COMERCIAL — lead externo nao pode cair numa frente de obra e mexer no progresso dela.';


-- ---------------------------------------------------------------------------
-- 7) NAO denormalizamos project_id em leads nem em crm_stages
-- ---------------------------------------------------------------------------
-- A Onda D1 do CRM ja paga o preco de manter leads.pipeline_id coerente com
-- DOIS triggers de propagacao (leads_resolve_pipeline + crm_stages_propagate_
-- pipeline_to_leads). Um TERCEIRO caminho de propagacao e so mais uma forma de
-- o dado divergir em silencio.
-- A agregacao de progresso (parte 3) faz join por leads(company_id,
-- pipeline_id) — indice idx_leads_pipeline_id, que JA EXISTE.
DO $log$
DECLARE
  v_fronts integer;
BEGIN
  SELECT count(*) INTO v_fronts FROM public.crm_pipelines WHERE project_id IS NOT NULL;
  RAISE NOTICE 'crm_pipelines.project_id no ar: % frente(s) de obra, % funil(is) comercial(is)',
    v_fronts,
    (SELECT count(*) FROM public.crm_pipelines WHERE project_id IS NULL);
END
$log$;
