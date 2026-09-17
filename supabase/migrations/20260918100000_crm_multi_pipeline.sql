-- ============================================================================
-- Onda D1 do overhaul do CRM (plano docs/planos/2026-09-17-crm-overhaul.md)
-- MULTI-PIPELINE: a empresa deixa de ter UM funil implicito e passa a ter N.
--
-- POR QUE: pedido do CEO ("poder ter mais de um pipeline, estudar como o Kommo,
-- RD Station CRM etc. fazem"). Hoje crm_stages so tem company_id, entao todo
-- estagio da empresa cai no mesmo quadro. Sem um container de funil nao da pra
-- separar "Vendas" de "Pos-venda" / "Manutencao" / "Licitacao".
--
-- O QUE ENTRA (SO SCHEMA — a tela e o D2, o ACL por funil e o D3):
--   1. public.crm_pipelines            — o funil em si, por empresa.
--   2. crm_stages.pipeline_id NOT NULL — todo estagio mora num funil.
--   3. leads.pipeline_id NULL          — denormalizado, pro kanban filtrar sem
--                                        join; mantido por trigger.
--   4. Backfill: TODA empresa ganha "Funil de Vendas" (is_default), e estagios
--      e leads existentes apontam pro funil da PROPRIA empresa.
--   5. Gancho preguicoso: empresa que ainda nao tem estagio nenhum ganha o
--      funil na hora que o primeiro estagio (ou o primeiro lead) nascer.
--
-- ---------------------------------------------------------------------------
-- DECISOES E POR QUES (ler antes de "simplificar" qualquer coisa aqui)
-- ---------------------------------------------------------------------------
-- (a) ON DELETE RESTRICT nas DUAS FKs novas (crm_stages.pipeline_id e
--     leads.pipeline_id).
--     CASCADE apagaria estagio — e, por tabela, chegaria a apagar oportunidade
--     de cliente — quando alguem excluisse um funil. SET NULL deixaria estagio
--     orfao e lead fora de qualquer quadro (sumiria da tela sem aviso, que e
--     pior que erro). RESTRICT faz o banco recusar a exclusao enquanto o funil
--     tiver conteudo: o D2 tem que oferecer "mover as etapas pra outro funil"
--     antes de excluir. Erro explicito > dado sumindo em silencio.
--
-- (b) crm_stages.pipeline_id e NOT NULL; leads.pipeline_id e NULLABLE.
--     Estagio: criar estagio e ato interativo de admin/gestor (a policy de
--     escrita exige can_manage_system). Estagio sem funil seria invisivel no
--     D2, entao falhar alto e melhor. O NOT NULL e seguro porque o trigger
--     BEFORE INSERT preenche o valor ANTES da checagem da constraint — o
--     client de hoje (seedDefaultStages/createStage em src/hooks/useCrmStages.ts)
--     continua inserindo SEM pipeline_id e continua funcionando. Isso e o que
--     faz o servidor poder subir antes do frontend (D2).
--     Lead: lead nasce tambem pela edge crm-lead-webhook (service_role, captacao
--     externa). "Lead novo que ninguem ve e cliente perdido" — e lead RECUSADO e
--     pior ainda. Entao a coluna aceita NULL: se alguma coisa falhar na
--     resolucao do funil, o lead entra mesmo assim e da pra consertar depois.
--     Na pratica o trigger sempre preenche.
--
-- (c) A denormalizacao NAO PODE divergir: o trigger BEFORE em leads RECALCULA
--     pipeline_id a partir do stage_id em toda escrita — nao confia no valor que
--     o client mandou. E o trigger AFTER em crm_stages propaga pros leads quando
--     um estagio muda de funil. Os dois juntos fecham as duas direcoes.
--
-- (d) DIVERGENCIA LEGADA ENCONTRADA (nao foi introduzida aqui): 9 leads de 4
--     empresas apontam pra estagio da empresa 478ee686 (resquicio da migration
--     20260418155127, que carimbou todos os estagios globais dessa empresa).
--     Esses leads ja hoje nao aparecem em coluna nenhuma do kanban da empresa
--     deles. Esta migration NAO mexe no stage_id deles (destruir a pista seria
--     pior) e NAO os manda pro funil de outro tenant: eles recebem o funil
--     padrao da PROPRIA empresa. O trigger passa a RECUSAR qualquer stage_id
--     cross-tenant NOVO, entao a drift para de crescer.
--
-- (e) RLS DA ONDA C INTOCADA: nenhuma policy de leads/lead_assignees e alterada,
--     e can_access_lead/is_lead_assignee nao sao redefinidas. Os triggers novos
--     sao SECURITY DEFINER e NAO consultam leads a partir de lead_assignees (nem
--     o contrario), entao a recursao de RLS quebrada na Onda C nao volta.
--     crm_pipelines nao e citada por nenhuma policy de leads.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.crm_pipelines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_pipelines IS
  'Funis do CRM. Uma empresa pode ter N funis; exatamente um e o padrao (is_default), garantido por indice unico parcial. Container das crm_stages.';
COMMENT ON COLUMN public.crm_pipelines.is_default IS
  'Funil padrao da empresa: destino de estagio/lead que nasce sem funil informado. No maximo UM por empresa (idx_crm_pipelines_one_default).';

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_company_id
  ON public.crm_pipelines (company_id, position);

-- Garantia NO BANCO de que a empresa nao tem dois funis padrao.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_pipelines_one_default
  ON public.crm_pipelines (company_id)
  WHERE is_default;

-- Tabela nova em public nasce com GRANT pra anon pelo ACL default do projeto.
REVOKE ALL ON public.crm_pipelines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
-- Explicito, e nao herdado do default: 20260917164000 tirou TRUNCATE de anon e
-- authenticated nas tabelas de entao; tabela nova tem que nascer igual.
REVOKE TRUNCATE ON public.crm_pipelines FROM anon, authenticated;

DROP TRIGGER IF EXISTS update_crm_pipelines_updated_at ON public.crm_pipelines;
CREATE TRIGGER update_crm_pipelines_updated_at
  BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 1b. RLS de crm_pipelines — espelho literal do que crm_stages ja usa
--     (leitura pra empresa inteira; escrita so pra can_manage_system).
--     O D3 (ACL por funil) entra DEPOIS, por cima disto. Enquanto nao entra,
--     "sem nenhuma linha de ACL = funil visivel pra todos" ja e o default.
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_crm_pipelines" ON public.crm_pipelines;
CREATE POLICY "service_role_full_access_crm_pipelines"
  ON public.crm_pipelines FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own company crm_pipelines" ON public.crm_pipelines;
CREATE POLICY "Users view own company crm_pipelines"
  ON public.crm_pipelines FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "System managers can manage crm_pipelines" ON public.crm_pipelines;
CREATE POLICY "System managers can manage crm_pipelines"
  ON public.crm_pipelines FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR (public.can_manage_system((SELECT auth.uid()))
        AND company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))))
  )
  WITH CHECK (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR (public.can_manage_system((SELECT auth.uid()))
        AND company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))))
  );

-- ---------------------------------------------------------------------------
-- 2. ensure_default_crm_pipeline — pega ou cria o funil padrao da empresa
--
-- INTERNA DE PROPOSITO: e SECURITY DEFINER e escreve em crm_pipelines de
-- qualquer empresa, entao NAO recebe execute de authenticated (um usuario
-- passando o company_id de outro tenant criaria funil no vizinho). Os triggers
-- que a chamam sao SECURITY DEFINER com owner do schema, e o owner tem execute
-- implicito. O D2 cria funil com INSERT normal, sob RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_default_crm_pipeline(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Empresa que tem funil mas nenhum marcado como padrao: promove o primeiro em
  -- vez de criar um sexto "Funil de Vendas" duplicado.
  SELECT id INTO v_id
    FROM public.crm_pipelines
   WHERE company_id = _company_id
   ORDER BY position, created_at
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.crm_pipelines SET is_default = true WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.crm_pipelines (company_id, name, position, is_default)
  VALUES (_company_id, 'Funil de Vendas', 0, true)
  ON CONFLICT (company_id) WHERE is_default DO NOTHING
  RETURNING id INTO v_id;

  -- Corrida: outra sessao criou o padrao entre o SELECT e o INSERT.
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.crm_pipelines
     WHERE company_id = _company_id AND is_default
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_default_crm_pipeline(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_crm_pipeline(uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_default_crm_pipeline(uuid) IS
  'Pega (ou cria) o funil padrao "Funil de Vendas" da empresa. Interna: sem execute pra authenticated, porque recebe company_id arbitrario.';

-- ---------------------------------------------------------------------------
-- 3. Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.crm_stages.pipeline_id IS
  'Funil dono da etapa. NOT NULL: preenchido pelo trigger trg_crm_stages_resolve_pipeline quando o client nao informa (compatibilidade com o CRM pre-D2).';
COMMENT ON COLUMN public.leads.pipeline_id IS
  'Denormalizacao do funil da etapa (crm_stages.pipeline_id), pro kanban filtrar sem join. Mantida por trigger nas duas direcoes — NAO escrever a mao esperando que o valor sobreviva.';

CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline_id
  ON public.crm_stages (pipeline_id, position);

-- O kanban do D2 le "leads da empresa X no funil Y".
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id
  ON public.leads (company_id, pipeline_id);

-- Nao existia: o trigger de propagacao varre leads por stage_id.
CREATE INDEX IF NOT EXISTS idx_leads_stage_id
  ON public.leads (stage_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill — idempotente (so toca linha com pipeline_id ainda nulo/divergente)
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_n  integer;
  v_c  record;
  v_criados integer := 0;
BEGIN
  -- 4a. TODA empresa ganha um funil padrao. "Nenhuma empresa pode acordar sem
  --     funil" — inclusive a que ainda nao configurou estagio nenhum.
  FOR v_c IN SELECT id FROM public.companies LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_pipelines WHERE company_id = v_c.id AND is_default
    ) THEN
      PERFORM public.ensure_default_crm_pipeline(v_c.id);
      v_criados := v_criados + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'crm_pipelines: % funil(is) padrao criado(s)', v_criados;

  -- 4b. Estagio -> funil padrao da PROPRIA empresa.
  UPDATE public.crm_stages s
     SET pipeline_id = p.id
    FROM public.crm_pipelines p
   WHERE p.company_id = s.company_id
     AND p.is_default
     AND s.pipeline_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'crm_stages: % etapa(s) apontada(s) pro funil padrao', v_n;

  -- 4c. Lead -> funil da etapa dele, quando a etapa e da MESMA empresa.
  UPDATE public.leads l
     SET pipeline_id = s.pipeline_id
    FROM public.crm_stages s
   WHERE s.id = l.stage_id
     AND s.company_id = l.company_id
     AND l.pipeline_id IS DISTINCT FROM s.pipeline_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'leads: % oportunidade(s) herdaram o funil da etapa', v_n;

  -- 4d. O resto: lead sem etapa, ou com a etapa cross-tenant legada (ver
  --     decisao (d) no cabecalho). Vai pro funil padrao da PROPRIA empresa —
  --     nunca pro funil de outro tenant.
  UPDATE public.leads l
     SET pipeline_id = p.id
    FROM public.crm_pipelines p
   WHERE p.company_id = l.company_id
     AND p.is_default
     AND l.pipeline_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'leads: % oportunidade(s) sem etapa propria foram pro funil padrao', v_n;

  -- 4e. Trava de seguranca: a migration nao termina deixando etapa sem funil.
  SELECT count(*) INTO v_n FROM public.crm_stages WHERE pipeline_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % etapa(s) sem pipeline_id', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.leads WHERE pipeline_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % oportunidade(s) sem pipeline_id', v_n;
  END IF;

  -- 4f. Nenhum ponteiro cross-tenant criado por ESTA migration.
  SELECT count(*) INTO v_n
    FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
   WHERE p.company_id <> s.company_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Vazamento: % etapa(s) apontando pra funil de outra empresa', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.leads l JOIN public.crm_pipelines p ON p.id = l.pipeline_id
   WHERE p.company_id <> l.company_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Vazamento: % oportunidade(s) apontando pra funil de outra empresa', v_n;
  END IF;
END
$backfill$;

ALTER TABLE public.crm_stages ALTER COLUMN pipeline_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Triggers de coerencia
-- ---------------------------------------------------------------------------

-- (i) crm_stages BEFORE: preenche o funil quando o client nao manda (o CRM
--     pre-D2 nao manda) e barra funil de outra empresa.
CREATE OR REPLACE FUNCTION public.crm_stages_resolve_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.pipeline_id IS NULL THEN
    NEW.pipeline_id := public.ensure_default_crm_pipeline(NEW.company_id);
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_owner
    FROM public.crm_pipelines
   WHERE id = NEW.pipeline_id;

  IF v_owner IS NULL OR v_owner <> NEW.company_id THEN
    RAISE EXCEPTION 'O funil informado nao pertence a esta empresa'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_crm_stages_resolve_pipeline ON public.crm_stages;
CREATE TRIGGER trg_crm_stages_resolve_pipeline
  BEFORE INSERT OR UPDATE OF pipeline_id, company_id ON public.crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.crm_stages_resolve_pipeline();

-- (ii) crm_stages AFTER: mover uma etapa de funil leva junto os leads dela,
--      senao a denormalizacao de leads.pipeline_id passa a mentir.
CREATE OR REPLACE FUNCTION public.crm_stages_propagate_pipeline_to_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    UPDATE public.leads
       SET pipeline_id = NEW.pipeline_id
     WHERE stage_id = NEW.id
       AND company_id = NEW.company_id
       AND pipeline_id IS DISTINCT FROM NEW.pipeline_id;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_crm_stages_propagate_pipeline ON public.crm_stages;
CREATE TRIGGER trg_crm_stages_propagate_pipeline
  AFTER UPDATE OF pipeline_id ON public.crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.crm_stages_propagate_pipeline_to_leads();

-- (iii) leads BEFORE: a etapa MANDA no funil. O valor que o client mandou em
--       pipeline_id e ignorado sempre que houver etapa resolvivel — e assim que
--       a denormalizacao nao diverge.
CREATE OR REPLACE FUNCTION public.leads_resolve_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_stage_company  uuid;
  v_stage_pipeline uuid;
  v_pipe_company   uuid;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT s.company_id, s.pipeline_id
      INTO v_stage_company, v_stage_pipeline
      FROM public.crm_stages s
     WHERE s.id = NEW.stage_id;

    IF v_stage_company IS NOT NULL AND v_stage_company = NEW.company_id THEN
      NEW.pipeline_id := v_stage_pipeline;
      RETURN NEW;
    END IF;

    -- Etapa de OUTRA empresa. Recusa o que for NOVO (a drift para de crescer),
    -- mas tolera as 9 linhas legadas sendo editadas por outro motivo — ver
    -- decisao (d) no cabecalho.
    IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      RAISE EXCEPTION 'A etapa escolhida nao pertence a esta empresa'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Sem etapa (ou etapa legada cross-tenant): respeita o funil informado desde
  -- que seja da propria empresa; senao cai no padrao da empresa.
  IF NEW.pipeline_id IS NOT NULL THEN
    SELECT company_id INTO v_pipe_company
      FROM public.crm_pipelines
     WHERE id = NEW.pipeline_id;

    IF v_pipe_company IS NOT NULL AND v_pipe_company = NEW.company_id THEN
      RETURN NEW;
    END IF;
  END IF;

  NEW.pipeline_id := public.ensure_default_crm_pipeline(NEW.company_id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_leads_resolve_pipeline ON public.leads;
CREATE TRIGGER trg_leads_resolve_pipeline
  BEFORE INSERT OR UPDATE OF stage_id, pipeline_id, company_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_resolve_pipeline();

-- ---------------------------------------------------------------------------
-- 6. RPCs de limpeza precisam conhecer a tabela nova
--
-- O patch e feito sobre a DEFINICAO VIVA (pg_get_functiondef) em vez de colar
-- 17KB de funcao aqui: outras sessoes mexem nessas RPCs, e recriar a partir do
-- arquivo antigo reverteria o trabalho delas. CREATE OR REPLACE preserva grants.
--
--   * admin_delete_company: OBRIGATORIO. companies e referenciada por
--     crm_pipelines com ON DELETE RESTRICT — sem este DELETE, excluir empresa
--     passaria a falhar com violacao de FK.
--   * reset_system_step ("Zerar Sistema"): apaga so os funis NAO-padrao e ja
--     vazios. O funil padrao FICA de proposito — zerar o sistema nao pode
--     deixar a empresa sem funil (e o mesmo invariante do backfill). A clausula
--     NOT EXISTS evita que o passo exploda por FK quando os leads ainda nao
--     foram apagados (os passos sao chamadas independentes, em qualquer ordem).
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def          text;
  v_anchor_adc   text := 'DELETE FROM public.crm_stages WHERE company_id = p_company_id;';
  v_anchor_reset text :=
    '    DELETE FROM public.crm_stages WHERE company_id = p_company_id;' || E'\n' ||
    '    GET DIAGNOSTICS v_n = ROW_COUNT;'                               || E'\n' ||
    '    v_counts := jsonb_set(v_counts, ''{crm_stages}'', to_jsonb(v_n));';
  v_add_reset    text :=
    E'\n\n'                                                                             ||
    '    DELETE FROM public.crm_pipelines p'                                   || E'\n' ||
    '     WHERE p.company_id = p_company_id'                                   || E'\n' ||
    '       AND NOT p.is_default'                                              || E'\n' ||
    '       AND NOT EXISTS (SELECT 1 FROM public.crm_stages s WHERE s.pipeline_id = p.id)' || E'\n' ||
    '       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.pipeline_id = p.id);'      || E'\n' ||
    '    GET DIAGNOSTICS v_n = ROW_COUNT;'                                    || E'\n' ||
    '    v_counts := jsonb_set(v_counts, ''{crm_pipelines}'', to_jsonb(v_n));';
  v_add_adc      text :=
    E'\n'                                                                               ||
    '  -- crm_pipelines POR ULTIMO: FK RESTRICT vinda de crm_stages e de leads.' || E'\n' ||
    '  DELETE FROM public.crm_pipelines WHERE company_id = p_company_id;';
BEGIN
  -- ---- admin_delete_company (obrigatorio: sem isso, excluir empresa quebra) --
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_delete_company'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'admin_delete_company nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%crm_pipelines%' THEN
    RAISE NOTICE 'admin_delete_company ja limpa crm_pipelines; nada a fazer';
  ELSIF position(v_anchor_adc IN v_def) = 0 THEN
    RAISE EXCEPTION 'admin_delete_company mudou de forma: ancora nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    EXECUTE replace(v_def, v_anchor_adc, v_anchor_adc || v_add_adc);
    RAISE NOTICE 'admin_delete_company patchada: passa a apagar crm_pipelines';
  END IF;

  -- ---- reset_system_step ("Zerar Sistema") ---------------------------------
  -- A ancora inclui o GET DIAGNOSTICS de crm_stages DE PROPOSITO: inserir o
  -- DELETE novo entre o DELETE de crm_stages e o GET DIAGNOSTICS dele faria o
  -- contador de {crm_stages} passar a reportar o ROW_COUNT do statement errado.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reset_system_step'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'reset_system_step nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%crm_pipelines%' THEN
    RAISE NOTICE 'reset_system_step ja limpa crm_pipelines; nada a fazer';
  ELSIF position(v_anchor_reset IN v_def) = 0 THEN
    RAISE EXCEPTION 'reset_system_step mudou de forma: ancora nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    EXECUTE replace(v_def, v_anchor_reset, v_anchor_reset || v_add_reset);
    RAISE NOTICE 'reset_system_step patchada: apaga funis nao-padrao e vazios';
  END IF;
END
$patch$;
