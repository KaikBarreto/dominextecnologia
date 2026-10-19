-- Zerar Sistema: remove de reset_system_step a referencia a public.contract_occurrences
--
-- SINTOMA (medido em producao, transacao revertida, Glacial 293900d9):
--   reset_system_step(company, 'contracts',  audit) -> 42P01
--   reset_system_step(company, 'customers',  audit) -> 42P01
--   "relation \"public.contract_occurrences\" does not exist"
-- Incondicional: nao depende de dado nem de ordem, atinge TODO tenant. Com
-- todos os flags marcados o pipeline morre no STEP 2 de 12, entao hoje ninguem
-- consegue zerar o sistema por inteiro -- e os steps seguintes que dependem de
-- 'contracts' ter rodado ('equipment', 'custom_configs') caem em 23503 atras
-- dele, por FK de contract_items/contracts.
--
-- A TABELA TEVE SUCESSORA? NAO -- e isso foi verificado antes de remover:
--   • to_regclass('public.contract_occurrences') = NULL, e a busca por
--     '%occurrence%'/'%ocorrenc%' em pg_class, pg_type e
--     information_schema.columns volta VAZIA em TODOS os schemas: nao existe
--     tabela de nome parecido, nem coluna, nem tipo.
--   • grep contract_occurrences em src/ = 0 (inclusive em types.ts).
--   • A tabela foi APOSENTADA de proposito pela migration
--     20260606160000_drop_contract_occurrences.sql (Fase 2 de um refactor).
--     Ela era uma COPIA-SOMBRA de service_orders: cada visita recorrente de
--     contrato vivia em duas tabelas, com um trigger
--     (trg_sync_occurrence_from_os) so pra manter os dois lados coerentes.
--     A sucessora conceitual e public.service_orders, que passou a ser a fonte
--     unica de verdade da visita -- e ela JA e apagada nos dois steps:
--       - step 'contracts': service_orders foi apagada no step 'service_orders',
--         que roda ANTES dele no pipeline (este branch so faz
--         UPDATE service_orders SET contract_id = NULL);
--       - step 'customers': ha um DELETE FROM public.service_orders explicito
--         poucas linhas abaixo, no mesmo branch.
--     Logo nao ha dado orfao: remover as duas linhas nao deixa nada pra tras.
--
-- POR QUE A REFERENCIA VOLTOU (pra nao acontecer de novo):
--   A 20260606160000 JA tinha removido estes dois blocos exatos, deixando no
--   lugar o comentario "[REMOVIDO nesta migration] DELETE FROM
--   public.contract_occurrences ...". Foi uma REGRESSAO, e ela tem dono:
--     20260619190000_zerar_sistema_inclui_compras.sql (13 dias depois do drop)
--     recriou reset_system_step a partir de uma COPIA DO ARQUIVO antiga, de
--     ANTES do drop -- ela nao usa pg_get_functiondef em lugar nenhum --, e
--     com isso RESSUSCITOU os dois DELETEs.
--   Dali pra frente as recriacoes seguintes (20260911210100, 20261018173000,
--   20261019050000) passaram a usar pg_get_functiondef da versao viva e, por
--   isso mesmo, CARREGARAM a referencia podre pra frente fielmente, sem culpa.
--   Este bug e a prova historica da lei "recriar funcao a partir da definicao
--   VIVA, nunca do arquivo": aqui foi exatamente o arquivo que mentiu.
--
-- O CONSERTO: remover as duas referencias e deixar comentario no lugar, pra
-- ninguem "restaurar" depois achando que faltava um DELETE. Nenhuma outra
-- linha do reset e tocada -- nem ordem de step, nem contagem, nem semantica.
--
-- Funcao recriada a partir de pg_get_functiondef da versao VIVA (ela mudou
-- duas vezes hoje, pelas 20261019050000 e 20261019060000 -- o arquivo de
-- origem nao e mais a verdade), com replace programatico que ABORTA se a
-- ancora nao casar exatamente 1x.
--
-- ORDEM DOS DOIS REPLACES IMPORTA, e esta travada: a ancora do step
-- 'customers' (DELETE puro) e SUBSTRING da ancora do step 'contracts'
-- (DELETE + GET DIAGNOSTICS + jsonb_set). Medido na definicao viva:
--   ancora 'contracts' -> 1 ocorrencia
--   ancora 'customers' -> 2 ocorrencias (uma delas DENTRO da de 'contracts')
-- Trocando 'contracts' primeiro, sobra exatamente 1 de 'customers'. Se fosse
-- ao contrario, o primeiro replace comeria metade do bloco de 'contracts' e
-- deixaria um GET DIAGNOSTICS orfao lendo o ROW_COUNT do statement errado.
--
-- Idempotente: se nao houver mais nenhuma mencao a contract_occurrences na
-- definicao viva, a migration nao faz nada e avisa.

DO $mig$
DECLARE
  v_def  text;
  v_new  text;
  v_hits int;
  v_rest int;

  -- Step 'contracts': DELETE + GET DIAGNOSTICS + jsonb_set da contagem.
  v_anchor_contracts text := $a1$    DELETE FROM public.contract_occurrences
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contract_occurrences}', to_jsonb(v_n));
$a1$;
  v_patch_contracts text := $p1$    -- [REMOVIDO 20261019070000] DELETE FROM public.contract_occurrences ...
    -- Tabela APOSENTADA pela 20260606160000 (era copia-sombra de
    -- service_orders) e SEM SUCESSORA: nao existe relacao de nome parecido em
    -- nenhum schema, e src/ nao a menciona. A visita do contrato vive apenas em
    -- public.service_orders, ja apagada no step 'service_orders', que roda
    -- antes deste no pipeline. NAO RESTAURAR: referenciar a tabela aqui faz o
    -- step inteiro abortar com 42P01 pra todo tenant. A chave
    -- 'contract_occurrences' tambem sai do jsonb de contagens de proposito --
    -- contar o que nao existe mais so confunde a auditoria.
$p1$;

  -- Step 'customers': DELETE puro, sem contagem (cascade silencioso).
  v_anchor_customers text := $a2$    DELETE FROM public.contract_occurrences
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
$a2$;
  v_patch_customers text := $p2$    -- [REMOVIDO 20261019070000] DELETE FROM public.contract_occurrences ...
    -- Mesmo motivo do step 'contracts': tabela aposentada pela 20260606160000,
    -- sem sucessora. Aqui a visita e apagada pelo DELETE FROM
    -- public.service_orders deste mesmo branch, poucas linhas abaixo.
    -- NAO RESTAURAR (42P01 pra todo tenant).
$p2$;
BEGIN
  v_def := pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure);

  -- Idempotencia: marcador de APLICACAO, nao mencao da tabela.
  --
  -- ATENCAO (erro cometido e corrigido ao escrever esta migration): NAO dá pra
  -- usar position('public.contract_occurrences' IN v_def) = 0 como guarda. O
  -- texto que esta migration INSERE no lugar dos DELETEs contem, de proposito,
  -- a frase "DELETE FROM public.contract_occurrences ..." dentro de um
  -- comentario -- justamente pra ninguem restaurar. Com aquela guarda, a 2a
  -- aplicacao achava a mencao (nos comentarios), nao retornava, e ia bater nas
  -- ancoras com 0 ocorrencia -> RAISE 'ancora casou 0 vez(es)'. A migration
  -- deixava de ser reaplicavel. Mesma classe do falso positivo de
  -- 'technician_location' dentro de 'technician_locations' na 20261019060000:
  -- marcador tem que ser string que SO existe depois de aplicar.
  IF position('[REMOVIDO 20261019070000]' IN v_def) > 0 THEN
    RAISE NOTICE 'reset_system_step ja saneada por esta migration, nada a fazer';
    RETURN;
  END IF;

  -- Cinto extra: se nao houver DELETE executavel nenhum (saneada por outro
  -- caminho), tambem nao e erro -- so nao ha o que fazer.
  IF position($chk0$    DELETE FROM public.contract_occurrences$chk0$ IN v_def) = 0 THEN
    RAISE NOTICE 'nenhum DELETE executavel de contract_occurrences na definicao viva, nada a fazer';
    RETURN;
  END IF;

  -- (1) step 'contracts' -- TEM que vir primeiro (ver comentario do cabecalho).
  v_hits := (length(v_def) - length(replace(v_def, v_anchor_contracts, '')))
            / length(v_anchor_contracts);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'ancora do step contracts casou % vez(es), esperado exatamente 1 -- abortado sem alterar nada', v_hits;
  END IF;
  v_new := replace(v_def, v_anchor_contracts, v_patch_contracts);

  -- (2) step 'customers' -- depois do (1), tem que sobrar exatamente 1.
  v_hits := (length(v_new) - length(replace(v_new, v_anchor_customers, '')))
            / length(v_anchor_customers);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'ancora do step customers casou % vez(es) apos tratar contracts, esperado exatamente 1 -- abortado sem alterar nada', v_hits;
  END IF;
  v_new := replace(v_new, v_anchor_customers, v_patch_customers);

  -- Trava final: nenhuma referencia EXECUTAVEL pode sobrar. As duas que ficam
  -- sao as mencoes dentro dos comentarios "[REMOVIDO ...]" que acabei de por.
  v_rest := (length(v_new) - length(replace(v_new, 'DELETE FROM public.contract_occurrences', '')))
            / length('DELETE FROM public.contract_occurrences');
  IF v_rest <> 2 THEN
    RAISE EXCEPTION 'esperava 2 mencoes de DELETE FROM public.contract_occurrences (ambas comentadas), achei % -- abortado', v_rest;
  END IF;
  IF position($chk$jsonb_set(v_counts, '{contract_occurrences}'$chk$ IN v_new) > 0 THEN
    RAISE EXCEPTION 'a contagem de contract_occurrences sobreviveu ao replace -- abortado';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'reset_system_step recriada da definicao viva, sem a referencia a contract_occurrences';
END $mig$;

-- Privilegio explicito: CREATE OR REPLACE preserva a ACL, mas declarar a
-- intencao evita EXECUTE herdado de default privilege.
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_system_step(uuid, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_system_step(uuid, text, uuid) IS
  'Executa UM step do reset_system (idempotente). Step ''materials'' apaga tambem public.compras (CASCADE cobre compra_materiais/compra_cotacoes/compra_cotacao_precos); suppliers NAO e apagado. Step ''financial_movements'' SOLTA compra_ordens.financial_transaction_id (escopado em company_id) antes do DELETE de financial_transactions: sem isso o guard guard_direct_purchase_financial_immutable (23514) e a FK ON DELETE RESTRICT abortam o step inteiro (20261019060000). Steps ''contracts'' e ''customers'' NAO referenciam public.contract_occurrences: tabela aposentada pela 20260606160000, sem sucessora -- a visita do contrato vive so em service_orders. Nao restaurar (42P01) -- ver 20261019070000.';

-- Verificacao final: has_function_privilege, nunca proacl.
DO $ver$
DECLARE
  v_def text := pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure);
BEGIN
  IF (length(v_def) - length(replace(v_def, 'DELETE FROM public.contract_occurrences', '')))
     / length('DELETE FROM public.contract_occurrences') <> 2 THEN
    RAISE EXCEPTION 'pos-verificacao: sobrou referencia executavel a contract_occurrences';
  END IF;
  IF to_regclass('public.contract_occurrences') IS NOT NULL THEN
    RAISE EXCEPTION 'pos-verificacao: public.contract_occurrences EXISTE agora -- revisar a decisao desta migration';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.reset_system_step(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: authenticated perdeu EXECUTE em reset_system_step';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.reset_system_step(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: service_role sem EXECUTE em reset_system_step';
  END IF;
  IF has_function_privilege('anon', 'public.reset_system_step(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: anon NAO pode ter EXECUTE em reset_system_step';
  END IF;

  -- O conserto de 20261019060000 nao pode ter sido perdido no replace.
  IF position('compra_ordens_financial_unlinked' IN v_def) = 0 THEN
    RAISE EXCEPTION 'pos-verificacao: o unlink de compra_ordens (20261019060000) desapareceu';
  END IF;

  RAISE NOTICE 'pos-verificacao ok';
END $ver$;
