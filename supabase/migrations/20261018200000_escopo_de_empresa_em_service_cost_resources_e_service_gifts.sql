-- =====================================================================
-- ONDA 2: fecha vazamento ENTRE TENANTS LOGADOS em service_cost_resources
--         e service_gifts (leitura E escrita)
--
-- Regra definida por: Dev Plataforma & Multi-tenant (2026-10-18)
-- SQL escrito e aplicado por: Dev Database (2026-10-18)
--
-- ===================== O VAZAMENTO (medido, nao suposto) =============
--
-- `service_cost_resources` e `service_gifts` NAO tem coluna `company_id`.
-- O tenant-root delas e o pai: `service_types.company_id`.
--
-- A policy de escrita das duas tabelas era:
--
--   CREATE POLICY "System managers can manage <tabela>"
--     ON public.<tabela> FOR ALL TO authenticated
--     USING      (can_manage_system(auth.uid()))
--     WITH CHECK (can_manage_system(auth.uid()));
--
-- ZERO recorte de empresa. Quem tem `can_manage_system` nao e caso raro:
-- role `admin`, role `gestor`, permissao curinga `*` (Acesso Total) e
-- `fn:manage_settings`.
--
-- POR QUE A POLICY FROUXA NAO FICA "NEUTRA" DO LADO DA CORRETA:
-- policy PERMISSIVE compoe com OR. Existe ao lado uma policy de SELECT
-- correta ("Users view own ...", escopada pelo `service_types` pai desde
-- 2026-06-06). Como a `FOR ALL` acima tambem cobre SELECT e e PERMISSIVE,
-- o resultado final e `correta OR frouxa`, e `frouxa` e `true` pra
-- qualquer gestor. Ou seja: a policy boa foi ANULADA pela frouxa ao lado.
-- Nao basta escrever a policy certa; a frouxa tem de ser SUBSTITUIDA.
--
-- MEDIDO EM PRODUCAO, 2026-10-18, antes desta migration, com usuario real
-- (admin de `478ee686` = Glacial Cold Brasil, sem super_admin):
--
--   SELECT count(*) FROM service_cost_resources   -> 77  (3 empresas)
--   o que ele DEVERIA ver                         -> 23  (1 empresa)
--
--   UPDATE em linha da empresa 1f8f9fb0 (VS PROJECT) -> 1 linha afetada
--   DELETE em linha da empresa 1f8f9fb0 (VS PROJECT) -> 1 linha afetada
--
-- E no sentido inverso, com admin real da VS PROJECT:
--   UPDATE no brinde da Glacial -> 1 linha;  DELETE -> 1 linha.
--
-- Nao era so leitura: um gestor APAGAVA estrutura de custo de outro
-- cliente. Esse e o motivo de isto nao esperar QA de tela.
--
-- CUIDADO AO MEDIR (pegadinha que ja custou um diagnostico errado):
--   SELECT count(*) FROM service_cost_resources scr
--     JOIN service_types st ON st.id = scr.service_id
--   devolve 23 e ESCONDE o furo, porque o JOIN passa pela RLS (correta)
--   de `service_types` e filtra o que a tabela crua ja tinha entregado.
--   Para medir vazamento destas tabelas, conte na TABELA CRUA, sem JOIN.
--
-- ===================== DESDE QUANDO (rastreado) ======================
--
--   20260309023425: cria as duas tabelas e as policies. A `FOR ALL` JA
--                   NASCE sem recorte de empresa. Na MESMA migration, as
--                   tabelas-pai `cost_resources` e `cost_resource_items`
--                   receberam `company_id = get_user_company_id(...) AND
--                   can_manage_system(...)`, corretamente. Ou seja: quem
--                   escreveu escopou onde a coluna `company_id` existia e
--                   simplesmente ABANDONOU o escopo nas duas filhas, que
--                   nao tem a coluna, em vez de alcancar o pai.
--   20260418163700: aperta a policy de SELECT ("Users view own ...").
--   20260606170000: a de SELECT ganha o isolamento correto via
--                   `service_types` pai. A `FOR ALL` frouxa NAO e tocada.
--   20260826161618: wrap de InitPlan, cosmetico.
--
-- Entao o furo esta aberto desde 2026-03-09, cerca de 7 meses, e nao tem
-- relacao com o PDV. A licao que fica: endurecer a policy de SELECT
-- enquanto sobra uma `FOR ALL` sem escopo na mesma tabela e trabalho
-- perdido. PERMISSIVE alarga; auditoria de RLS tem de olhar o CONJUNTO
-- de policies da tabela, nunca uma policy isolada.
--
-- ===================== CONTAMINACAO JA EXISTENTE NOS DADOS ===========
--
-- Auditoria feita ANTES de aplicar (e que mudou o desenho desta migration):
--
--   service_cost_resources cujo `resource_id` aponta pra `cost_resources`
--   de empresa DIFERENTE do `service_types` pai .......... 49 de 77
--     servico da VS PROJECT  -> recurso da Glacial ....... 48
--     servico da KGIE        -> recurso da VS PROJECT .....  1
--   service_gifts na mesma situacao ....................... 0
--
-- Isto e o vazamento JA CONSUMIDO: a VS PROJECT tem 111 service_types e
-- so 2 cost_resources proprios, e 48 dos custos dos servicos dela estao
-- pendurados em recursos da Glacial. Provavel caminho: a view
-- `cost_resources_with_rate` ficou sem `security_invoker` de 2026-03-16
-- ate hoje (corrigido na 20261018190000) e expunha id + valor-hora de
-- todos os tenants; esta policy frouxa permitia pendurar. Os dois furos
-- se combinam.
--
-- CONSEQUENCIA PRO DESENHO: a regra pedia `WITH CHECK` exigindo tambem
-- que o `resource_id` fosse da propria empresa. Aplicada em UPDATE, essa
-- clausula tornaria 48 das 53 linhas da VS PROJECT NAO-EDITAVEIS (o
-- `updateOverride` da tela de custo passaria a dar erro de RLS), porque
-- `WITH CHECK` avalia a linha NOVA e ela continua apontando pro recurso
-- da Glacial mesmo quando so o `override_value` muda. Seria trocar um
-- vazamento por uma quebra em cliente real.
--
-- NAO corrigimos o dado aqui. Repontar ou remover 49 linhas de estrutura
-- de custo de cliente e decisao de negocio e tem de ser confirmada com o
-- cliente (licao do incidente Glacial de 2026-06: nada de DELETE em
-- catalogo de tenant por suposicao). Fica reportado pro CEO, com a query
-- de auditoria no fim deste arquivo.
--
-- ===================== COMO FICA, POR COMANDO ========================
--
-- Em vez de uma `FOR ALL`, quatro policies por comando. Isso permite ser
-- estrito onde precisa sem quebrar o legado:
--
--   INSERT: escopo do servico pai E do recurso. Bloqueia contaminacao
--           NOVA nos dois sentidos.
--   UPDATE: escopo do servico pai, nos dois lados (USING e WITH CHECK).
--           Sem clausula de recurso, de proposito, pra nao travar as 48
--           linhas legadas da VS PROJECT.
--   DELETE: escopo do servico pai.
--   SELECT: segue na policy "Users view own ..." que ja existe e ja esta
--           correta (e que e onde o super_admin le, via
--           `OR is_super_admin`). Nao mexemos nela.
--
-- O buraco que a ausencia da clausula de recurso no UPDATE abriria seria
-- `UPDATE ... SET resource_id = '<uuid de outro tenant>'` numa linha
-- propria. Esse buraco e fechado por PRIVILEGIO DE COLUNA, nao por RLS:
-- `authenticated` perde UPDATE na tabela inteira e recebe UPDATE apenas
-- em `override_value`. Conferido antes: o unico UPDATE que o app faz e
-- `update({ override_value })` em src/hooks/useServiceCostResources.ts;
-- `service_id`/`resource_id` nunca sao alterados pelo cliente, so
-- inseridos ou deletados. A tabela nao tem trigger nem `updated_at`.
--
-- SUPER_ADMIN: NAO ganha bypass de ESCRITA (o painel master nao gerencia
-- custo de servico de cliente). A LEITURA dele continua intacta, pela
-- policy de SELECT ja existente. As RPCs `admin_delete_company` e
-- `reset_system_step` sao SECURITY DEFINER e rodam como dono da tabela,
-- logo nao passam por RLS nem por privilegio de coluna: seguem funcionando.
--
-- ANON: as duas tabelas ainda tinham GRANT de SELECT/INSERT/UPDATE/DELETE
-- pra `anon` (sobra de 2026-03; a onda 1 de hoje nao cobriu estas duas).
-- Hoje a RLS ja nega `anon` (medido: 0 linhas, nao existe policy `TO anon`),
-- entao isto e defesa em profundidade, nao correcao de vazamento aberto.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- service_cost_resources
-- ---------------------------------------------------------------------

-- A policy frouxa tem de SAIR, nao ficar ao lado: PERMISSIVE faz OR.
DROP POLICY IF EXISTS "System managers can manage service_cost_resources"
  ON public.service_cost_resources;

DROP POLICY IF EXISTS "Managers insert service_cost_resources of their company"
  ON public.service_cost_resources;
CREATE POLICY "Managers insert service_cost_resources of their company"
  ON public.service_cost_resources FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_cost_resources.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
    AND EXISTS (
      SELECT 1 FROM public.cost_resources cr
       WHERE cr.id = service_cost_resources.resource_id
         AND cr.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Managers update service_cost_resources of their company"
  ON public.service_cost_resources;
CREATE POLICY "Managers update service_cost_resources of their company"
  ON public.service_cost_resources FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_cost_resources.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  )
  WITH CHECK (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_cost_resources.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Managers delete service_cost_resources of their company"
  ON public.service_cost_resources;
CREATE POLICY "Managers delete service_cost_resources of their company"
  ON public.service_cost_resources FOR DELETE TO authenticated
  USING (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_cost_resources.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  );

-- Fecha o `SET resource_id = <outro tenant>` por privilegio de coluna.
REVOKE UPDATE ON public.service_cost_resources FROM authenticated;
GRANT  UPDATE (override_value) ON public.service_cost_resources TO authenticated;

-- ---------------------------------------------------------------------
-- service_gifts
--
-- Aqui NAO existe contaminacao legada (sg_cruzada = 0) e o app nunca faz
-- UPDATE nesta tabela (so INSERT e DELETE), entao da pra exigir o escopo
-- do recurso tambem no UPDATE, sem risco de travar cliente.
-- `resource_id` e NULLABLE (brinde digitado a mao, sem recurso de custo
-- vinculado): so exige escopo quando vier id.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "System managers can manage service_gifts"
  ON public.service_gifts;

DROP POLICY IF EXISTS "Managers insert service_gifts of their company"
  ON public.service_gifts;
CREATE POLICY "Managers insert service_gifts of their company"
  ON public.service_gifts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_gifts.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
    AND (
      service_gifts.resource_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.cost_resources cr
         WHERE cr.id = service_gifts.resource_id
           AND cr.company_id = (SELECT public.get_user_company_id(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Managers update service_gifts of their company"
  ON public.service_gifts;
CREATE POLICY "Managers update service_gifts of their company"
  ON public.service_gifts FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_gifts.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  )
  WITH CHECK (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_gifts.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
    AND (
      service_gifts.resource_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.cost_resources cr
         WHERE cr.id = service_gifts.resource_id
           AND cr.company_id = (SELECT public.get_user_company_id(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Managers delete service_gifts of their company"
  ON public.service_gifts;
CREATE POLICY "Managers delete service_gifts of their company"
  ON public.service_gifts FOR DELETE TO authenticated
  USING (
    (SELECT public.can_manage_system(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = service_gifts.service_id
         AND st.company_id = (SELECT public.get_user_company_id(auth.uid()))
    )
  );

-- ---------------------------------------------------------------------
-- Defesa em profundidade: `anon` nao tem o que fazer nestas duas tabelas.
-- (RLS ja negava; o GRANT era sobra de 2026-03.)
-- ---------------------------------------------------------------------
REVOKE ALL ON public.service_cost_resources FROM anon;
REVOKE ALL ON public.service_gifts          FROM anon;

COMMIT;

-- =====================================================================
-- PENDENCIA DE DADO, PRA DECISAO DO CEO COM O CLIENTE (nao e SQL a rodar)
--
-- 49 linhas de service_cost_resources apontam pra cost_resources de outra
-- empresa. Esta migration NAO as altera: ela para a sangria (ninguem
-- cria mais linha cruzada, e ninguem mexe na linha de outro tenant) e
-- deixa o legado legivel e editavel pelo dono do servico.
--
-- Query de auditoria:
--
--   SELECT scr.id, st.company_id AS empresa_do_servico,
--          cr.company_id AS empresa_do_recurso, cr.name AS recurso
--     FROM public.service_cost_resources scr
--     JOIN public.service_types  st ON st.id = scr.service_id
--     JOIN public.cost_resources cr ON cr.id = scr.resource_id
--    WHERE cr.company_id IS DISTINCT FROM st.company_id
--    ORDER BY st.company_id;
--
-- Quando houver decisao, o caminho e repontar pro recurso equivalente da
-- propria empresa (ou marcar inativo), NUNCA DELETE em massa.
-- =====================================================================
