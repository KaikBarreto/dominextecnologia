-- Zerar Sistema: solta a compra do financeiro antes do DELETE
-- + restaura o SELECT de anon em service_ratings (dependencia de avaliacao de policy)
--
-- Sexta rodada do dia. Duas correcoes independentes, uma transacao.
--
-- ===========================================================================
-- PARTE 1 -- public.service_ratings: ultimo caso da VARREDURA REVERSA
--
-- Contexto: a 20261019051000 (minha, de hoje) documentou que o Postgres exige
-- privilegio nas tabelas CITADAS DENTRO da expressao de uma policy, nao so na
-- tabela que a policy protege. A 20261018211000 revogou anon de 135 relacoes
-- usando um criterio que ignorava essa segunda forma de consumo de um GRANT.
--
-- Esta migration fecha o conjunto. A varredura foi feita por DOIS metodos
-- independentes que deram o MESMO resultado:
--   (a) pg_depend: toda policy que alcanca anon (polroles contem 'anon' ou 0 =
--       PUBLIC), em QUALQUER schema -- 32 policies -- cruzada com as suas
--       dependencias registradas em pg_depend (classid='pg_policy'), filtrando
--       refobjid <> polrelid para ficar so com citacao CRUZADA;
--   (b) leitura do texto de pg_get_expr(polqual|polwithcheck) das 32.
--
-- Resultado: existem exatamente 6 pares (policy, tabela citada) cruzados, e
-- apenas TRES tabelas distintas sao citadas de fora:
--   quotes          <- quote_items."Public can view quote_items by valid quote"  [SELECT ok]
--   quotes          <- quote_items."Public view quote_items via quote"          [SELECT ok]
--   service_orders  <- form_responses."Public submit form_responses via portal" [SELECT ok, 20261019051000]
--   service_orders  <- technician_locations."Public view ... via portal"        [SELECT ok, 20261019051000]
--   service_ratings <- form_responses."Public submit form_responses via portal" [SELECT FALTANDO <- aqui]
--   service_ratings <- technician_locations."Public view ... via portal"        [SELECT FALTANDO <- aqui]
--
-- A funcao citada pelas duas policies de portal, public.is_customer_in_active_portal(uuid),
-- e SECURITY DEFINER e anon JA tem EXECUTE: o corpo dela le customer_portals
-- com o privilegio do owner, entao NAO exige GRANT nenhum pra anon. Conferido.
--
-- Medido com a chave anon publica real (PostgREST), ANTES desta migration:
--   GET /service_ratings       -> HTTP 401 42501 permission denied for table service_ratings
--   GET /technician_locations  -> HTTP 401 42501 permission denied for table service_ratings
--   GET /service_orders        -> HTTP 200 []   (o GRANT da 20261019051000 e tranca, nao porta)
--
-- Por que o GRANT e seguro, relacao por relacao:
--   public.service_ratings esta com RLS LIGADA (relrowsecurity = true) e tem
--   EXATAMENTE UMA policy: "Users manage own service_ratings", FOR ALL TO
--   {authenticated}. Nenhuma policy alcanca anon (0 policies anon, medido).
--   Logo anon com SELECT le ZERO das 503 linhas existentes. O GRANT serve so
--   pra a policy de OUTRA tabela poder ser AVALIADA sem abortar.
--
-- NAO conserta o mapa de rastreio publico sozinho, e isso e de proposito: as
-- duas policies passam TAMBEM por service_orders, onde anon nao tem policy
-- nenhuma, entao technician_locations volta a devolver 0 linhas em vez de
-- 42501. Sair do erro cru pro vazio e o escopo DESTA migration; devolver a
-- posicao do tecnico e o conserto por RPC que esta sendo feito em src/.
--
-- ===========================================================================
-- PARTE 2 -- Zerar Sistema > Movimentacoes Financeiras abortava
--
-- Sintoma medido em producao (transacao revertida, super_admin, Glacial Cold
-- Brasil LTDA 293900d9-174a-4db9-9be1-febe5c2baa30):
--   reset_system_step(company, 'financial_movements', audit)
--     -> 23514 direct_purchase_financial_is_immutable
--
-- Causa: o step apaga public.financial_transactions, e o trigger BEFORE DELETE
-- guard_direct_purchase_financial_immutable() barra o DELETE de qualquer
-- lancamento apontado por compra_ordens.financial_transaction_id cuja compra
-- seja flow_type='compra_direta'. Ha 1 vinculo desses em producao, exatamente
-- na empresa que usa o PDV -- entao o reposicionamento do cofre do PDV que a
-- 20261019050000 colocou nesse mesmo step era codigo INALCANCAVEL: o step
-- morria antes de chegar nele.
--
-- O guard nao e removido nem enfraquecido. Ele existe pra impedir que alguem
-- apague um lancamento de compra direta POR ENGANO no dia a dia. Zerar Sistema
-- e o oposto de um engano: e deliberado, confirmado e auditado em
-- destructive_actions_audit, e o proposito literal dele e apagar as
-- movimentacoes. O que nao pode acontecer e a compra ficar apontando pra um
-- lancamento que nao existe mais -- e soltar o ponteiro ANTES resolve isso.
-- Depois do UPDATE nao sobra o que o guard proiba, e o guard segue valendo
-- integralmente pro caminho normal.
--
-- Soltar o ponteiro (em vez de abrir uma valvula no guard) tambem e a unica
-- opcao que FUNCIONA, e isso foi medido: a FK
-- compra_ordens_financial_transaction_id_fkey e ON DELETE **RESTRICT**, nao
-- SET NULL. Uma valvula no trigger so trocaria o 23514 por um 23503 da FK.
--
-- Escopo do UPDATE: company_id = p_company_id, e TODAS as ordens da empresa
-- com ponteiro nao-nulo -- nao apenas as de compra_direta. A FK RESTRICT vale
-- pra qualquer ordem vinculada, entao restringir a compra_direta deixaria o
-- 23503 de pe para as outras. Nao existe ponteiro cruzando empresa hoje
-- (medido: 0 ordens cujo lancamento pertence a outra company_id -- o trigger
-- trg_guard_compra_ordem_financial_link ja impede isso no INSERT/UPDATE),
-- entao o escopo por company_id nao deixa nada pra tras.
--
-- compras e compra_ordens NAO sao apagadas aqui: isso e do step 'materials'
-- e a ordem dos steps nao muda. O historico da compra fica inteiro, so sem o
-- ponteiro pro lancamento que o proprio usuario pediu pra apagar.
--
-- Nota: o trigger BEFORE UPDATE trg_compra_ordens_defaults carimba sent_at
-- quando status='enviada' e sent_at IS NULL. Efeito colateral inocuo (a linha
-- e candidata a DELETE no step 'materials' e o campo nao alimenta relatorio).
--
-- Precedente: o OUTRO guard BEFORE DELETE de financial_transactions,
-- _guard_reconciled_transaction_delete(), JA resolveu esta mesma classe de
-- problema -- ele tem uma valvula explicita que consulta
-- destructive_actions_audit (action_type='reset_system', janela de 6h). Por
-- isso a conciliacao bancaria NAO bloqueia este step. Auditoria dos outros
-- triggers BEFORE DELETE/UPDATE no caminho do step esta no RELATORIO no fim.
--
-- A funcao e recriada a partir da definicao VIVA (pg_get_functiondef), nunca
-- de arquivo, com replace programatico que ABORTA se a ancora nao casar
-- exatamente 1 vez. Idempotente: se o marcador ja existir, nao faz nada.

-- ---------------------------------------------------------------------------
-- PARTE 1
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.service_ratings TO anon;

COMMENT ON TABLE public.service_ratings IS
  'Avaliacao (NPS) da OS pelo cliente. O GRANT de SELECT para anon NAO e privilegio morto e NAO deve ser revogado por varredura automatica: ele sustenta a AVALIACAO das policies anon de public.form_responses ("Public submit form_responses via portal") e public.technician_locations ("Public view technician_locations via portal"), que citam service_ratings dentro de um EXISTS. Sem o GRANT essas leituras abortam com 42501 nomeando esta tabela, em vez de devolver 0 linhas. anon le 0 linhas daqui: RLS ligada e a unica policy e FOR ALL TO authenticated. Ver 20261019060000 e 20261019051000.';

-- Reforca o comentario de service_orders: a 20261019051000 documentou a
-- dependencia de POLICY, mas a varredura desta rodada achou uma SEGUNDA
-- dependencia na mesma tabela, de outra natureza (trigger), que tambem seria
-- quebrada por uma revogacao futura.
COMMENT ON TABLE public.service_orders IS
  'OS/tarefa do tenant. O GRANT de SELECT para anon NAO e privilegio morto e nao deve ser revogado por varredura automatica. Duas dependencias distintas: (1) AVALIACAO DE POLICY -- as policies anon de public.form_responses ("Public submit form_responses via portal") e public.technician_locations ("Public view technician_locations via portal") citam service_orders dentro do EXISTS; (2) TRIGGER EM TABELA ESCRITA POR ANON -- public.guard_quote_converted_os_same_tenant() e SECURITY INVOKER e le service_orders, e dispara em BEFORE UPDATE de public.quotes, onde anon TEM UPDATE pela policy "Public can update quote by valid token" (aprovacao de orcamento no portal publico). Sem o GRANT, os dois caminhos abortam com 42501 em vez de devolver 0 linhas. anon le 0 linhas desta tabela: RLS ligada e as 2 policies sao {authenticated}. Ver 20261019051000 e 20261019060000.';

-- ---------------------------------------------------------------------------
-- PARTE 2
-- ---------------------------------------------------------------------------

DO $mig$
DECLARE
  v_def    text;
  v_new    text;
  v_hits   int;
  v_marker text := 'compra_ordens_financial_unlinked';
  v_anchor text := $anchor$    DELETE FROM public.financial_transactions WHERE company_id = p_company_id;$anchor$;
  v_patch  text := $patch$    -- =====================================================================
    -- SOLTA O VINCULO COMPRA -> FINANCEIRO ANTES DE APAGAR O LANCAMENTO.
    --
    -- Sem este UPDATE o step inteiro ABORTA: o trigger BEFORE DELETE
    -- guard_direct_purchase_financial_immutable() barra o DELETE de qualquer
    -- financial_transactions apontado por compra_ordens.financial_transaction_id
    -- quando a compra e flow_type='compra_direta' (23514
    -- direct_purchase_financial_is_immutable). E, atras dele, a FK
    -- compra_ordens_financial_transaction_id_fkey e ON DELETE RESTRICT, que
    -- barraria igual (23503) qualquer ordem vinculada, de compra direta ou nao.
    --
    -- O guard continua valendo integralmente pro caminho normal: ele existe pra
    -- impedir que se apague um lancamento de compra direta POR ENGANO. Zerar
    -- Sistema e deliberado, confirmado e auditado, e o proposito literal dele e
    -- apagar as movimentacoes -- manter o guard no caminho nao protegia
    -- coerencia nenhuma, so garantia erro cru na cara do cliente. O que nao
    -- pode acontecer e a compra apontar pra lancamento inexistente, e soltar o
    -- ponteiro antes e exatamente o que evita isso.
    --
    -- TODAS as ordens da empresa (nao so compra_direta), porque a FK RESTRICT
    -- vale pra qualquer vinculo. compras/compra_ordens NAO sao apagadas aqui --
    -- isso e do step 'materials'. O historico da compra fica inteiro.
    -- =====================================================================
    UPDATE public.compra_ordens o
       SET financial_transaction_id = NULL
     WHERE o.company_id = p_company_id
       AND o.financial_transaction_id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{compra_ordens_financial_unlinked}', to_jsonb(v_n));

    DELETE FROM public.financial_transactions WHERE company_id = p_company_id;$patch$;
BEGIN
  v_def := pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure);

  -- Idempotencia: reaplicar nao pode duplicar o UPDATE.
  IF position(v_marker IN v_def) > 0 THEN
    RAISE NOTICE 'reset_system_step ja contem o marcador %, nada a fazer', v_marker;
    RETURN;
  END IF;

  -- A ancora TEM que casar exatamente 1x. Se a funcao viva mudou de forma,
  -- abortar e muito melhor que patchear no lugar errado.
  v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'ancora do DELETE de financial_transactions casou % vez(es) na definicao viva de reset_system_step, esperado exatamente 1 -- abortado sem alterar nada', v_hits;
  END IF;

  v_new := replace(v_def, v_anchor, v_patch);

  IF position(v_marker IN v_new) = 0 THEN
    RAISE EXCEPTION 'replace nao inseriu o marcador %, abortado', v_marker;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'reset_system_step recriada a partir da definicao viva, com o unlink de compra_ordens';
END $mig$;

-- Privilegio explicito: CREATE OR REPLACE preserva a ACL, mas declarar a
-- intencao evita que a funcao fique com EXECUTE herdado de default privilege.
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_system_step(uuid, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_system_step(uuid, text, uuid) IS
  'Executa UM step do reset_system (idempotente). Step ''materials'' apaga tambem public.compras (CASCADE cobre compra_materiais/compra_cotacoes/compra_cotacao_precos); suppliers NAO e apagado. Step ''financial_movements'' SOLTA compra_ordens.financial_transaction_id (escopado em company_id) antes do DELETE de financial_transactions: sem isso o guard guard_direct_purchase_financial_immutable (23514) e a FK ON DELETE RESTRICT abortam o step inteiro. Ver 20261019060000.';

-- Verificacao final: has_function_privilege, nunca proacl.
DO $ver$
DECLARE
  v_marker text := 'compra_ordens_financial_unlinked';
BEGIN
  IF position(v_marker IN pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-verificacao: reset_system_step viva nao contem o marcador %', v_marker;
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

  IF NOT has_table_privilege('anon', 'public.service_ratings', 'SELECT') THEN
    RAISE EXCEPTION 'pos-verificacao: anon sem SELECT em service_ratings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p
     WHERE p.polrelid = 'public.service_ratings'::regclass
       AND (p.polroles @> ARRAY[0::oid]
            OR p.polroles @> ARRAY['anon'::regrole::oid])
  ) THEN
    RAISE EXCEPTION 'pos-verificacao: service_ratings ganhou policy alcancando anon -- o GRANT deixaria de ser tranca e viraria porta';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.service_ratings'::regclass) THEN
    RAISE EXCEPTION 'pos-verificacao: RLS desligada em service_ratings -- GRANT para anon seria vazamento';
  END IF;

  RAISE NOTICE 'pos-verificacao ok';
END $ver$;

-- ===========================================================================
-- PARTE 3 -- payload de localizacao do tecnico no link publico da OS
--
-- Regra que sai do achado de hoje: dado de portal publico vem por RPC
-- SECURITY DEFINER, NUNCA por leitura direta de tabela com a chave anonima.
-- O mapa de rastreio publico lia public.technician_locations direto (e ouvia
-- Realtime na mesma tabela), e os dois caminhos morrem pro anonimo pelo mesmo
-- motivo: a policy "Public view technician_locations via portal" cita
-- service_ratings e service_orders no EXISTS, e o Realtime avalia a MESMA
-- policy sob o MESMO role. O GRANT da PARTE 1 tira o 42501 do caminho mas
-- devolve 0 linhas de proposito -- quem passa a servir a posicao e a RPC.
--
-- Varredura de pg_proc confirmou que NAO existe outra funcao executavel por
-- anon que leia technician_locations, entao get_public_os e o veiculo.
-- get_public_os_by_code herda de graca: ela delega (RETURN get_public_os(v_id)).
--
-- CONTRATO (4 campos, nada alem):
--   lat        double precision  -> marcador + rota
--   lng        double precision  -> marcador + rota
--   event_type text              -> ('en_route','tracking') liga o banner de ETA
--   created_at timestamptz       -> dedupe do polling e "atualizado ha X"
--
-- NAO vao: id, user_id, company_id e address. `address` e o logradouro reverso
-- da posicao do tecnico -- mandar pro anonimo seria entregar endereco de
-- funcionario de graca, e o mapa nao usa. (Hoje a coluna esta 100% NULL em
-- producao, 0 de 8258 linhas -- mas a allowlist nao depende disso.)
--
-- UMA definicao de "ultima posicao", nao duas: as duas RPCs chamam o mesmo
-- helper public._public_os_last_technician_location(uuid). O helper NAO e
-- exposto a anon/authenticated (ele nao tem o gate de entry_type); so os
-- SECURITY DEFINER donos do gate o chamam, e por serem definer de postgres a
-- chamada interna tem privilegio.
--
-- Por que existe a RPC irma em vez de pollar get_public_os: o componente se
-- atualizava por Realtime, que esta morto pro anonimo. A substituicao e
-- polling, e pollar get_public_os custa ~12 KB na OS medida e ~136 KB numa
-- real, a cada 15-20s, no 4G de quem espera o tecnico na porta. A irma custa
-- ~120 bytes.
--
-- CREATE OR REPLACE em todas, nunca DROP: DROP leva os GRANTs (a armadilha da
-- cost_resources_with_rate). Mantem STABLE SECURITY DEFINER e o owner atual.
-- ===========================================================================

-- Helper unico: a ultima posicao, so os 4 campos do contrato.
CREATE OR REPLACE FUNCTION public._public_os_last_technician_location(p_os_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
           'lat',        tl.lat,
           'lng',        tl.lng,
           'event_type', tl.event_type,
           'created_at', tl.created_at
         )
    FROM public.technician_locations tl
   WHERE tl.service_order_id = p_os_id
   ORDER BY tl.created_at DESC
   LIMIT 1
$fn$;

-- Helper NAO e superficie publica: sem o gate de entry_type, ele serviria a
-- posicao de uma tarefa interna. Quem fala com anon sao as duas RPCs abaixo.
REVOKE ALL ON FUNCTION public._public_os_last_technician_location(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._public_os_last_technician_location(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._public_os_last_technician_location(uuid) FROM authenticated;

COMMENT ON FUNCTION public._public_os_last_technician_location(uuid) IS
  'Ultima posicao do tecnico de uma OS (lat/lng/event_type/created_at), ou NULL se nao houver ponto. Definicao UNICA reusada por get_public_os e get_public_os_technician_location. NAO expor a anon/authenticated: nao tem o gate de entry_type=tarefa. Ver 20261019060000.';

-- 4a: chave technician_location no payload de get_public_os, recriada a partir
-- da definicao VIVA com replace programatico que aborta se a ancora nao casar 1x.
DO $mig$
DECLARE
  v_def    text;
  v_new    text;
  v_hits   int;
  -- Marcador = nome do helper. Atencao: a string 'technician_location' NAO
  -- serve de marcador porque ja casa dentro de 'technician_locations' num
  -- comentario preexistente da funcao.
  v_marker text := '_public_os_last_technician_location';
  v_anchor text := $anchor$    'service_order', COALESCE(($anchor$;
  v_patch  text := $patch$    -- Ultima posicao do tecnico (4 campos: lat, lng, event_type, created_at),
    -- ou JSON null quando a OS nao tem ponto -- o componente ja trata nulo.
    -- Sem id/user_id/company_id/address de proposito. Ver 20261019060000.
    'technician_location', public._public_os_last_technician_location(p_os_id),

    'service_order', COALESCE(($patch$;
BEGIN
  v_def := pg_get_functiondef('public.get_public_os(uuid)'::regprocedure);

  IF position(v_marker IN v_def) > 0 THEN
    RAISE NOTICE 'get_public_os ja contem o marcador %, nada a fazer', v_marker;
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'ancora do service_order casou % vez(es) na definicao viva de get_public_os, esperado exatamente 1 -- abortado sem alterar nada', v_hits;
  END IF;

  v_new := replace(v_def, v_anchor, v_patch);

  IF position(v_marker IN v_new) = 0 THEN
    RAISE EXCEPTION 'replace nao inseriu o marcador %, abortado', v_marker;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_public_os recriada a partir da definicao viva, com a chave technician_location';
END $mig$;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload do link publico da OS. Allowlist de colunas por CHAVE (coluna nova nasce fora do payload) e recusa entry_type = tarefa. Exposta a anon. Inclui a chave top-level technician_location (lat/lng/event_type/created_at da ultima posicao, ou null) -- sem address/user_id/company_id. Ver 20261019060000.';

-- 4b: RPC irma, corte barato pro polling. Mesmos 4 campos, mesma semantica de
-- NULL, mesmo gate de entry_type='tarefa' e de OS inexistente.
CREATE OR REPLACE FUNCTION public.get_public_os_technician_location(p_os_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_entry_type text;
BEGIN
  -- Mesmo gate de get_public_os, na mesma ordem: OS inexistente e tarefa
  -- interna devolvem NULL (nunca erro), e o front trata igual a "nao achou".
  SELECT so.entry_type INTO v_entry_type
    FROM public.service_orders so
   WHERE so.id = p_os_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_entry_type = 'tarefa' THEN
    RETURN NULL;
  END IF;

  RETURN public._public_os_last_technician_location(p_os_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_public_os_technician_location(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_os_technician_location(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_public_os_technician_location(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_os_technician_location(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_os_technician_location(uuid) IS
  'Corte barato (~120 bytes) da ultima posicao do tecnico pro POLLING do mapa publico, no lugar do Realtime em technician_locations (morto pro anon: o Realtime avalia a mesma policy sob o mesmo role). Mesmos 4 campos e mesma semantica de NULL de get_public_os.technician_location, mesmo gate de entry_type=tarefa e de OS inexistente. Exposta a anon. Ver 20261019060000.';

-- Verificacao final da PARTE 3: has_function_privilege, nunca proacl.
DO $ver3$
BEGIN
  IF position('_public_os_last_technician_location' IN
              pg_get_functiondef('public.get_public_os(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-verificacao: get_public_os viva nao chama o helper de localizacao';
  END IF;

  -- As duas RPCs publicas: anon e authenticated executam.
  IF NOT has_function_privilege('anon', 'public.get_public_os(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: anon perdeu EXECUTE em get_public_os';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_public_os_by_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: anon perdeu EXECUTE em get_public_os_by_code';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_public_os_technician_location(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: anon sem EXECUTE em get_public_os_technician_location';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_public_os_technician_location(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: authenticated sem EXECUTE em get_public_os_technician_location';
  END IF;

  -- O helper NAO pode ser alcancavel por anon/authenticated/PUBLIC.
  IF has_function_privilege('anon', 'public._public_os_last_technician_location(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: anon NAO pode executar o helper de localizacao (nao tem gate de tarefa)';
  END IF;
  IF has_function_privilege('authenticated', 'public._public_os_last_technician_location(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-verificacao: authenticated NAO pode executar o helper de localizacao';
  END IF;

  RAISE NOTICE 'pos-verificacao da parte 3 ok';
END $ver3$;
