-- ============================================================================
-- NFS-e AUTOMÁTICA POR CONTRATO — ONDA 3 (banco): os dois desfechos que faltavam
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE:
--   A Onda 2 (20261016200000) entregou 5 RPCs de desfecho e o runner
--   (`nfse-auto-runner`, 🛡️ Plataforma) foi escrito contra elas. Ao escrever o
--   runner, as DUAS lacunas que o review da Onda 2 já tinha apontado apareceram
--   na prática:
--
--     (L1) A R7.5 — "competência já fechou, para de tentar sozinho e espera
--          clique humano" — não tinha função nenhuma que chegasse ao status
--          'aguardando_decisao'. Ele existe no CHECK desde a Onda 1 e era
--          INALCANÇÁVEL. O runner só podia escolher entre `nfse_auto_adiar`
--          (que agenda AMANHÃ, e portanto reabriria o ciclo automático que a
--          R7.5 manda interromper) e `nfse_auto_falhar` (que chama de falha o
--          que não é falha).
--
--     (L2) Cinco desfechos que NÃO são falha estavam saindo por
--          `nfse_auto_falhar(definitivo => true)`: automação desligada no
--          contrato, contrato encerrado, parcela cancelada, parcela deixou de
--          estar quitada, parcela já tem nota manual. Funciona, mas rotula
--          como "falhou" o que foi ENCERRADO POR DECISÃO — e a tela de
--          "Emissões automáticas" da Onda 3 agruparia por status, mostrando
--          erro vermelho onde não houve erro nenhum. "Mostrar problema onde não
--          há" treina o gestor a ignorar a tela, que é como o problema de
--          verdade passa batido depois.
--
--   Plano-pai:   docs/planos/2026-10-16-nfse-automatica-contrato.md
--   Autorização: docs/planos/2026-10-16-nfse-automatica-regra-de-autorizacao.md (R7.5)
--
--   NÃO reescreve 20261016140000, 20261016200000 nem 20261016210000, todas já
--   aplicadas em produção. Tudo aqui é aditivo, ou CREATE OR REPLACE com
--   assinatura IDÊNTICA (preserva os GRANTs — drop de função leva os grants
--   embora e ninguém percebe até o 403).
--
--   Os dois status já estão no CHECK `nfse_auto_jobs_status_check` desde a Onda
--   1. Esta migration NÃO mexe no CHECK: ela só constrói as portas que levam
--   até eles.
--
-- ============================================================================
-- A DECISÃO ESTRUTURAL DESTA MIGRATION: `proxima_tentativa_em` VIRA NULLABLE
-- ============================================================================
-- A R7.5 exige que o job de competência encerrada NUNCA volte sozinho. A única
-- forma honesta de dizer isso na tabela é "não há próxima tentativa", e a
-- única forma honesta de escrever "não há" é NULL.
--
-- A coluna nasceu `NOT NULL DEFAULT now()` na Onda 1, quando todo job tinha,
-- por definição, uma próxima tentativa. Sem o DROP NOT NULL abaixo,
-- `nfse_auto_aguardar_decisao` estouraria `not_null_violation` (23502) DENTRO
-- do runner, no pior momento possível: depois de reivindicar o job e decidir
-- não emitir. O job ficaria 'processando', voltaria como órfão e tentaria de
-- novo amanhã — exatamente o ciclo que a R7.5 manda interromper, com a regra
-- aparentemente implementada.
--
-- POR QUE NULL E NÃO UM SENTINELA ('infinity', ou 2999-12-31):
--   O sentinela mentiria pra tela da Onda 3 ("próxima tentativa: 31/12/2999") e
--   pra qualquer relatório, e `<= now()` o excluiria por acidente de
--   magnitude, não por regra. NULL é excluído por SEMÂNTICA: `NULL <= now()`
--   é NULL, nunca true, então o `WHERE cand.proxima_tentativa_em <= now()` do
--   claim já o ignora sem uma linha de código nova. E, de novo, o status
--   'aguardando_decisao' nem aparece na lista de status reivindicáveis do
--   claim — são duas travas independentes, não uma.
--
-- E O PREÇO DO NULLABLE É PAGO NA HORA, com uma trava física (§1.2): NULL só é
-- permitido em status que o claim NÃO procura. Sem esse CHECK, um NULL
-- escrito por engano num job 'pendente' o tornaria invisível pro claim e a
-- parcela ficaria sem nota PARA SEMPRE, em silêncio — a classe de falha mais
-- cara desta feature, porque ninguém recebe erro nenhum.
--
-- ============================================================================
-- O VOCABULÁRIO DE DESFECHO, DEPOIS DESTA MIGRATION
-- ============================================================================
--   emitida              nfse_auto_concluir          a nota saiu
--   pendente (amanhã)    nfse_auto_falhar(false)     tropeço (rede, 503)
--   falhou               nfse_auto_falhar(true)      erro de DADO / teto de 3
--   bloqueada_*          nfse_auto_adiar             porta fechada, volta amanhã
--   aguardando_decisao   nfse_auto_aguardar_decisao  NUNCA volta sozinho   ← novo
--   cancelada            nfse_auto_encerrar          encerrado por decisão ← novo
--
-- As duas colunas de controle de retry separam as três famílias, e a separação
-- é feita por AUSÊNCIA de código, não por compensação:
--   • `attempts`             só nfse_auto_registrar_tentativa escreve (R7.2).
--   • `proxima_tentativa_em` só quem PRETENDE voltar escreve. As duas funções
--     novas não escrevem valor não-nulo nela — e o §4 prova isso lendo
--     `prosrc` do catálogo e ABORTANDO a migration se a regra for furada.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1) proxima_tentativa_em passa a aceitar NULL = "não há próxima tentativa"
-- ----------------------------------------------------------------------------
-- Idempotente: DROP NOT NULL em coluna que já é nullable é no-op silencioso no
-- Postgres (não precisa de IF EXISTS).
ALTER TABLE public.nfse_auto_jobs
  ALTER COLUMN proxima_tentativa_em DROP NOT NULL;

-- O DEFAULT now() FICA: todo job nasce com uma próxima tentativa, e os três
-- produtores (trigger de pagamento, cron de enfileiramento, enfileirar à mão)
-- continuam inserindo sem mencionar a coluna. NULL é um estado que só se
-- alcança de propósito, por UPDATE de uma função nomeada.

COMMENT ON COLUMN public.nfse_auto_jobs.proxima_tentativa_em IS
  'A partir de quando nfse_auto_claim pode reivindicar este job de novo. Erro de rede/provedor empurra pra amanhã (nfse_auto_falhar); porta fechada também (nfse_auto_adiar). NULO = NÃO HÁ próxima tentativa: o job parou e só volta por decisão humana (nfse_auto_aguardar_decisao, R7.5 — competência encerrada). NULL é escolhido em vez de um sentinela de data futura porque "NULL <= now()" é NULL e nunca true, então o claim já o ignora por semântica, sem uma linha de código nova — e porque sentinela mentiria pra tela ("próxima tentativa: 31/12/2999"). O CHECK nfse_auto_jobs_proxima_tentativa_viva impede que esse NULL apareça em status que o claim PROCURA, o que tornaria o job invisível e a parcela ficaria sem nota pra sempre, em silêncio. Molde de dfe_manifestacao_jobs.';

-- ----------------------------------------------------------------------------
-- 1.2) A trava física do nullable: NULL só em status que o claim não procura
-- ----------------------------------------------------------------------------
-- Sem este CHECK, o nullable do §1.1 abre um jeito novo de perder faturamento
-- em silêncio: job 'pendente' (ou 'bloqueada_*') com proxima_tentativa_em NULL
-- nunca casa o `proxima_tentativa_em <= now()` do claim, não aparece em erro
-- nenhum, não tem last_error, e a nota simplesmente nunca sai.
--
-- 'processando' entra na lista proibida porque a liberação de órfão devolve o
-- job pra 'pendente' SEM tocar proxima_tentativa_em: um NULL herdado ali viraria
-- o mesmo job invisível, uma rodada depois.
DO $proxima_tentativa_viva$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfse_auto_jobs_proxima_tentativa_viva') THEN
    ALTER TABLE public.nfse_auto_jobs
      ADD CONSTRAINT nfse_auto_jobs_proxima_tentativa_viva
      CHECK (
        proxima_tentativa_em IS NOT NULL
        OR status NOT IN (
             'pendente', 'processando',
             'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota'
           )
      );
  END IF;
END
$proxima_tentativa_viva$;

-- ----------------------------------------------------------------------------
-- 2) nfse_auto_aguardar_decisao — o job que NUNCA volta sozinho (R7.5)
-- ----------------------------------------------------------------------------
-- Competência fechada = mês calendário ANTERIOR ao atual (a conta é do runner,
-- com date_trunc('month'), nunca "30 dias"). Emitir hoje uma nota com
-- competência de meses atrás tem efeito tributário no período JÁ APURADO
-- (ISS/DAS fechado, declaração entregue): é decisão humana com um clique
-- explícito "emitir mesmo assim", não retentativa automática.
--
-- O QUE DIFERENCIA ESTA FUNÇÃO DE nfse_auto_adiar, E É A FUNÇÃO INTEIRA:
--   `nfse_auto_adiar` grava proxima_tentativa_em = nfse_auto_amanha(). Os
--   bloqueada_* voltam sozinhos amanhã, e devem. Se este desfecho herdasse o
--   "tenta amanhã", o job voltaria pro fluxo automático na madrugada seguinte,
--   o runner reavaliaria a competência (que continua fechada), chamaria esta
--   função de novo, e amanhã outra vez — um loop diário eterno que acabaria
--   emitindo a nota de competência encerrada no primeiro dia em que qualquer
--   gate oscilasse. A regra inteira perderia sentido. Por isso:
--     proxima_tentativa_em := NULL   (não há próxima tentativa)
--     attempts             := intocado (a coluna não aparece no SET)
--
-- `attempts` INTOCADO, e não zerado, é deliberado: as tentativas que já
-- aconteceram aconteceram de verdade (falamos com o provedor), e apagá-las
-- apagaria o rastro de "esta nota já tentou 2 vezes antes de a competência
-- fechar", que é justamente o contexto de quem vai decidir. Quem zera é o
-- clique humano de retomada, em nfse_auto_enfileirar (§4), porque ali começa
-- uma série nova.
--
-- ALLOWLIST DE ESTADO DE ENTRADA, não denylist: só 'pendente' e 'processando'
-- fazem sentido parar. Na prática o runner só chama com 'processando' (é o
-- status que o claim grava ao entregar o job — inclusive para um job que
-- estava em bloqueada_*, que passa a 'processando' antes de qualquer desfecho).
-- 'pendente' é tolerado para um caminho de manutenção. Todo o resto é recusado
-- ALTO, com destaque pra 'emitida': parquear como "aguardando decisão" um job
-- cuja nota JÁ SAIU esconderia um documento fiscal autorizado atrás de uma
-- pendência, e a nota existiria no governo sem existir na tela.
CREATE OR REPLACE FUNCTION public.nfse_auto_aguardar_decisao(
  p_job_id   uuid,
  p_mensagem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_atual text;
  v_msg   text := left(
    COALESCE(NULLIF(btrim(p_mensagem), ''),
             'A competência desta nota já fechou. A emissão automática parou aqui e espera sua decisão.'),
    500
  );
  v_afetados integer;
BEGIN
  SELECT j.status INTO v_atual
    FROM public.nfse_auto_jobs j
   WHERE j.id = p_job_id;

  IF v_atual IS NULL THEN
    -- Job sumiu entre o claim e aqui. Só acontece por CASCADE: a parcela foi
    -- apagada, e sem parcela não há nada a decidir. WARNING, não EXCEPTION:
    -- a exceção derrubaria o lote inteiro do runner por causa de um job que
    -- deixou de existir legitimamente.
    RAISE WARNING '[nfse_auto_aguardar_decisao] job % nao existe mais (parcela apagada por CASCADE?); decisao pendente nao registrada', p_job_id;
    RETURN;
  END IF;

  IF v_atual = 'emitida' THEN
    RAISE EXCEPTION 'nfse_auto_aguardar_decisao: job % ja esta "emitida" — a nota desta parcela saiu. Parquear como pendencia humana esconderia um documento fiscal autorizado atras de uma decisao que nao existe mais.', p_job_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_atual NOT IN ('pendente', 'processando') THEN
    RAISE EXCEPTION 'nfse_auto_aguardar_decisao: job % esta em "%" e so faz sentido parar job em "pendente" ou "processando". Desfecho ja decidido nao se reabre por aqui — use nfse_auto_enfileirar.', p_job_id, v_atual
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- proxima_tentativa_em = NULL é a regra, não um detalhe. attempts NÃO
  -- aparece neste SET, e essa ausência é a implementação de "a competência
  -- fechar não é tentativa" (mesma régua da R7.2 em nfse_auto_adiar).
  UPDATE public.nfse_auto_jobs j
     SET status               = 'aguardando_decisao',
         last_error           = v_msg,
         bloqueado_em         = NULL,
         proxima_tentativa_em = NULL,
         updated_at           = now()
   WHERE j.id = p_job_id;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  IF v_afetados = 0 THEN
    RAISE WARNING '[nfse_auto_aguardar_decisao] job % desapareceu durante o UPDATE; decisao pendente nao registrada', p_job_id;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_aguardar_decisao(uuid, text) IS
  'Para o job DE VEZ e entrega a decisão a um humano (R7.5): grava status=''aguardando_decisao'', o motivo em PT-BR leigo em last_error e — o ponto da função — proxima_tentativa_em = NULL. É isso que a distingue de nfse_auto_adiar: os bloqueada_* voltam sozinhos amanhã (nfse_auto_amanha()), este NUNCA volta sozinho. Se herdasse o "tenta amanhã", o job reentraria no fluxo automático toda madrugada com a competência ainda fechada, e a regra inteira perderia sentido. Uso previsto: competência já encerrada (mês calendário anterior ao atual), em que emitir tem efeito tributário em período já apurado. NÃO toca attempts (a coluna não aparece no SET): as tentativas que já aconteceram são rastro, e quem zera é o clique humano de retomada em nfse_auto_enfileirar. Aceita só job ''pendente''/''processando''; recusa ALTO qualquer outro, com destaque pra ''emitida'' (parquear job cuja nota já saiu esconderia documento fiscal autorizado atrás de uma pendência). Job que não existe mais devolve WARNING, não exceção, pra não derrubar o lote do runner. Só service_role executa.';

-- ----------------------------------------------------------------------------
-- 3) nfse_auto_encerrar — desfecho que NÃO é falha
-- ----------------------------------------------------------------------------
-- Cinco situações do runner não são erro de nada e hoje saem por
-- `nfse_auto_falhar(definitivo => true)`:
--   1. automação desligada no contrato depois do job ter nascido;
--   2. contrato encerrado/pausado;
--   3. parcela cancelada (cancelled_at preenchido);
--   4. parcela deixou de estar quitada (no modo 'pagamento');
--   5. parcela já tem nota MANUAL (alguém emitiu à mão antes do runner).
-- Em todas, o sistema funcionou: ele conferiu, concluiu que não há nota a
-- emitir, e paroù. Chamar isso de 'falhou' faz a tela de "Emissões
-- automáticas" da Onda 3 pintar erro onde não houve erro, e tela que mostra
-- problema inexistente é tela que o gestor aprende a ignorar — é assim que o
-- erro de verdade passa batido depois.
--
-- TERMINAL DE VERDADE: não grava proxima_tentativa_em (o status 'cancelada'
-- não está na lista de reivindicáveis do claim, então o job não volta), e não
-- mexe em attempts (nem incrementa — não houve tentativa — nem zera — o rastro
-- das que houve fica). As duas colunas não aparecem no corpo da função, e o §4
-- prova isso lendo o catálogo.
--
-- ALLOWLIST DE UM ÚNICO VALOR, no mesmo molde do nfse_auto_adiar: 'cancelada'.
-- Parece exagero para um valor só, e é exatamente o ponto — o parâmetro existe
-- para o PRÓXIMO desfecho-por-decisão entrar na allowlist sem mudar a forma da
-- chamada do runner, e a allowlist existe para que o CHECK da tabela (que
-- aceitaria 'emitida' aqui) não seja a única coisa entre um bug de digitação e
-- um job fechado como sucesso sem nota nenhuma ter saído.
CREATE OR REPLACE FUNCTION public.nfse_auto_encerrar(
  p_job_id   uuid,
  p_status   text,
  p_mensagem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text := btrim(COALESCE(p_status, ''));
  v_atual  text;
  v_emissao uuid;
  v_msg    text := left(
    COALESCE(NULLIF(btrim(p_mensagem), ''),
             'A emissão automática foi encerrada para esta parcela. Não há nota a emitir.'),
    500
  );
  v_afetados integer;
BEGIN
  -- Allowlist ANTES de qualquer leitura: parâmetro inválido é bug do chamador,
  -- e bug do chamador não merece uma ida ao banco.
  IF v_status NOT IN ('cancelada') THEN
    RAISE EXCEPTION 'nfse_auto_encerrar: status "%" nao permitido. Hoje a allowlist tem um valor so: cancelada. Para porta fechada que volta amanha use nfse_auto_adiar; para competencia encerrada use nfse_auto_aguardar_decisao; para erro de emissao use nfse_auto_falhar.', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT j.status, j.nfse_emission_id
    INTO v_atual, v_emissao
    FROM public.nfse_auto_jobs j
   WHERE j.id = p_job_id;

  IF v_atual IS NULL THEN
    RAISE WARNING '[nfse_auto_encerrar] job % nao existe mais (parcela apagada por CASCADE?); encerramento nao registrado', p_job_id;
    RETURN;
  END IF;

  -- Encerrar NÃO desfaz nota. As duas pontas da mesma pergunta ("já existe
  -- nota por este job?"), igual ao gate de nfse_auto_enfileirar: o status e o
  -- vínculo. Qualquer uma delas basta pra recusar.
  IF v_atual = 'emitida' OR v_emissao IS NOT NULL THEN
    RAISE EXCEPTION 'nfse_auto_encerrar: job % ja tem nota emitida (status "%", emissao %). Encerrar nao desfaz nota fiscal — para anular a nota use o cancelamento no caminho fiscal, nunca a fila.', p_job_id, v_atual, v_emissao
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.nfse_auto_jobs j
     SET status       = v_status,
         last_error   = v_msg,
         bloqueado_em = NULL,
         updated_at   = now()
   WHERE j.id = p_job_id;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  IF v_afetados = 0 THEN
    RAISE WARNING '[nfse_auto_encerrar] job % desapareceu durante o UPDATE; encerramento nao registrado', p_job_id;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_encerrar(uuid, text, text) IS
  'Encerra o job por DECISÃO, não por falha: automação desligada no contrato, contrato encerrado, parcela cancelada, parcela deixou de estar quitada, parcela já tem nota manual. Antes desta função esses cinco desfechos saíam por nfse_auto_falhar(definitivo=>true) e apareciam como erro na tela de "Emissões automáticas" — tela que pinta problema onde não houve problema é tela que o gestor aprende a ignorar. p_status tem allowlist ESTRITA (hoje: ''cancelada''); qualquer outro valor é recusado com exceção, porque o CHECK da tabela aceitaria ''emitida'' aqui e um erro de digitação fecharia como sucesso um job cuja nota nunca saiu. Terminal de verdade: não grava proxima_tentativa_em (''cancelada'' não está entre os status reivindicáveis do claim) e não toca attempts — nem incrementa (não houve tentativa) nem zera (o rastro das que houve fica). RECUSA job com nota: status ''emitida'' ou nfse_emission_id preenchido — encerrar não desfaz documento fiscal; anular nota é o cancelamento do caminho fiscal, nunca a fila. Reverter o encerramento (enquanto não houver nota) é nfse_auto_enfileirar. Só service_role executa.';

-- ----------------------------------------------------------------------------
-- 4) nfse_auto_enfileirar — o clique "emitir mesmo assim" da R7.5
-- ----------------------------------------------------------------------------
-- Esta é a RPC que a tela da Onda 3 usa como AÇÃO HUMANA, e os dois status
-- novos desta migration são exatamente os dois que ela precisa saber retomar:
--   • 'aguardando_decisao' — é literalmente o clique "emitir mesmo assim" da
--     R7.5. Sem retomada, o job parado pela competência encerrada ficaria
--     parado pra sempre e a regra viraria "nunca emite", não "decide quem
--     emite".
--   • 'cancelada' — decisão humana é reversível ENQUANTO NÃO HOUVER NOTA. Quem
--     desligou a automação por engano, ou cancelou a parcela e reativou, tem
--     que poder voltar atrás. Depois que a nota existe, não: os dois gates de
--     nota única (status 'emitida' e nfse_emission_id preenchido) continuam
--     intactos acima e recusam ANTES de chegar aqui.
--
-- O QUE MUDA, em uma frase: o ramo de retomada era um ELSE IMPLÍCITO (qualquer
-- status que não fosse emitida/processando/pendente caía nele) e passa a ser
-- uma ALLOWLIST EXPLÍCITA. Funcionalmente os dois status já eram retomados
-- hoje — por acidente de cobertura, não por decisão. A diferença aparece no
-- dia em que o CHECK ganhar um status novo: com o ELSE implícito, esse status
-- nasceria retomável em silêncio, sem ninguém ter decidido isso; com a
-- allowlist, ele é recusado até alguém escrever o nome dele aqui. Numa feature
-- em que "reabrir" é o passo que antecede emitir documento fiscal, o default
-- tem que ser "não".
--
-- ZERAR attempts AO RETOMAR é obrigatório, não cosmético (já era assim e
-- continua): sem isso, job que estourou o teto de 3 voltaria pra fila e
-- nfse_auto_falhar o mataria na primeira tentativa, o botão não faria nada e o
-- usuário clicaria pra sempre vendo o mesmo erro. E é a decisão humana que
-- justifica o zero: é uma série NOVA, não a continuação da anterior — ao
-- contrário de nfse_auto_aguardar_decisao, que preserva o rastro porque ali
-- ninguém decidiu nada ainda.
--
-- proxima_tentativa_em = now() NA RETOMADA também deixou de ser detalhe: é o
-- que devolve um valor não-nulo à coluna que nfse_auto_aguardar_decisao zerou,
-- e o que faz o CHECK nfse_auto_jobs_proxima_tentativa_viva (§1.2) passar ao
-- gravar status 'pendente'. Sem ele, retomar um job de 'aguardando_decisao'
-- estouraria check_violation.
--
-- TODO O RESTO É IDÊNTICO À VERSÃO EM PRODUÇÃO (conferido byte a byte:
-- md5(prosrc) = b791cb8271b0f6ff5ab873555c362ca1 antes desta migration):
-- os gates de sessão/permissão/posse, "não existe" e "não é sua" com a MESMA
-- mensagem (resposta diferente é oráculo de dado de outro tenant), a recusa de
-- parcela de outra empresa, a recusa de parcela que já tem nota, o carimbo de
-- autor e motivo, e UMA PARCELA = UM JOB (reabre a linha que já existe, nunca
-- cria a segunda).
CREATE OR REPLACE FUNCTION public.nfse_auto_enfileirar(
  p_financial_transaction_id uuid,
  p_motivo                   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid              uuid := auth.uid();
  v_super            boolean;
  v_user_company     uuid;
  v_ft               RECORD;
  v_contract_company uuid;
  v_job              RECORD;
  v_motivo           text := left(
    COALESCE(NULLIF(btrim(p_motivo), ''), 'Enfileirado manualmente.'), 500
  );
  v_hoje             date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_job_id           uuid;
BEGIN
  -- (a) Sessão. Não existe ramo "sem usuário libera": a régua é afirmativa.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para continuar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_super        := public.is_super_admin(v_uid);
  v_user_company := public.get_user_company_id(v_uid);

  -- (b) Permissão fiscal — a MESMA régua que o projeto já usa em todo o
  --     caminho de nota (can_manage_system: admin/gestor, Acesso Total '*' ou
  --     fn:manage_settings; é o que authorizeFiscalManager exige na edge
  --     nfse-emit). Nenhuma permissão nova nasce aqui (R10): quem já emite
  --     nota à mão pode pedir a automática de novo, e mais ninguém.
  IF NOT (v_super OR public.can_manage_system(v_uid)) THEN
    RAISE EXCEPTION 'Você não tem permissão para emitir notas fiscais.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT ft.id,
         ft.company_id,
         ft.contract_id,
         ft.transaction_type::text AS transaction_type,
         ft.cancelled_at,
         ft.amount,
         ft.due_date,
         ft.transaction_date,
         ft.parent_transaction_id,
         ft.category
    INTO v_ft
    FROM public.financial_transactions ft
   WHERE ft.id = p_financial_transaction_id;

  -- (c) Posse. "Não existe" e "não é da sua empresa" levantam a MESMA
  --     exceção, com a MESMA mensagem: resposta diferente é oráculo de
  --     existência de dado de outro tenant. São dois IF separados (e não um
  --     OR) porque PL/pgSQL não garante short-circuit: num OR, o segundo ramo
  --     leria v_ft.company_id de um RECORD que o SELECT não preencheu.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_super AND v_ft.company_id IS DISTINCT FROM v_user_company THEN
    RAISE EXCEPTION 'Parcela não encontrada.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (d) Elegibilidade da parcela. Mensagens em PT-BR leigo porque vão parar
  --     num toast na cara do gestor, não num log.
  IF v_ft.contract_id IS NULL THEN
    RAISE EXCEPTION 'Esta cobrança não vem de um contrato. A nota automática existe só para parcelas de contrato.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_ft.transaction_type <> 'entrada' THEN
    RAISE EXCEPTION 'Esta movimentação é uma saída. Nota fiscal de serviço sai sobre o que você recebe.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_ft.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta parcela está cancelada. Reative a parcela antes de pedir a nota.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_ft.amount IS NULL OR v_ft.amount <= 0 THEN
    RAISE EXCEPTION 'Esta parcela não tem valor a faturar.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Recebimento parcial é transação FILHA (invariante 2 da Onda 1). A nota sai
  -- sobre a parcela, nunca sobre um pedaço dela. Nota o que NÃO está aqui: não
  -- se recusa a parcela-MÃE que foi recebida só em parte. O valor da nota é
  -- ft.amount (cheio), não amount_received, e em regime de competência a nota
  -- é do serviço prestado — meio recebimento não reduz a nota. O que a
  -- invariante 2 proíbe é o GATILHO 'pagamento' tratar meio pagamento como
  -- pagamento; aqui existe um humano pedindo, com motivo registrado.
  IF v_ft.parent_transaction_id IS NOT NULL
     OR v_ft.category = 'Recebimento parcial' THEN
    RAISE EXCEPTION 'Este lançamento é um recebimento parcial. A nota sai sobre a parcela inteira, não sobre uma parte dela.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (e) Coerência parcela <-> contrato, a mesma da R3, antes de criar a linha
  --     e não só no consumo. Enfileirar à mão é exatamente o "inserter novo"
  --     que a R3 previu; ele não vai confiar no próprio parâmetro.
  SELECT c.company_id INTO v_contract_company
    FROM public.contracts c
   WHERE c.id = v_ft.contract_id;

  IF v_contract_company IS NULL
     OR v_contract_company IS DISTINCT FROM v_ft.company_id THEN
    RAISE EXCEPTION 'O contrato desta parcela não foi encontrado na empresa dela. A emissão foi interrompida por segurança.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (f) INVARIANTE: uma parcela nunca gera uma segunda nota.
  --     Nota VIVA em nfse_emissions. 'rejeitada'/'erro'/'rascunho' não contam
  --     (nota rejeitada não é nota); 'cancelada' CONTA, porque reemitir depois
  --     de cancelar tem prazo legal e regra municipal — decisão humana no
  --     fluxo manual, nunca pela fila automática.
  IF EXISTS (
    SELECT 1
      FROM public.nfse_emissions e
     WHERE e.company_id               = v_ft.company_id
       AND e.financial_transaction_id = v_ft.id
       AND e.status IN ('pending', 'processando', 'autorizada', 'cancelada')
  ) THEN
    RAISE EXCEPTION 'Esta parcela já tem nota fiscal. Emitir outra criaria nota em duplicidade, com efeito no imposto — fale com o contador.'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT j.id, j.status, j.nfse_emission_id
    INTO v_job
    FROM public.nfse_auto_jobs j
   WHERE j.company_id               = v_ft.company_id
     AND j.financial_transaction_id = v_ft.id;

  IF FOUND THEN
    IF v_job.status = 'emitida' OR v_job.nfse_emission_id IS NOT NULL THEN
      RAISE EXCEPTION 'A nota desta parcela já foi emitida. A mesma parcela não pode gerar uma segunda nota.'
        USING ERRCODE = 'unique_violation';
    END IF;

    IF v_job.status = 'processando' THEN
      RAISE EXCEPTION 'A nota desta parcela está sendo emitida agora. Aguarde alguns minutos e confira de novo.'
        USING ERRCODE = 'object_in_use';
    END IF;

    IF v_job.status = 'pendente' THEN
      -- Já está na fila. Clicar de novo não é erro nem cria nada: devolve o
      -- mesmo job. Idempotência é o que faz o botão sobreviver a duplo clique
      -- e a retry de PWA offline.
      RETURN v_job.id;
    END IF;

    -- ALLOWLIST EXPLÍCITA DE RETOMADA. Era um ELSE implícito; virou lista.
    --   falhou              -> "tentar de novo" depois de corrigir o cadastro
    --   bloqueada_*         -> porta reabriu antes do cron reavaliar
    --   aguardando_decisao  -> "EMITIR MESMO ASSIM" da R7.5 (competência
    --                          encerrada; a decisão humana que a regra pede)
    --   cancelada           -> desfazer um encerramento por decisão, que é
    --                          reversível ENQUANTO NÃO HOUVER NOTA (e os dois
    --                          gates de nota única acima já garantem isso)
    -- Status novo no CHECK não entra nesta lista de graça: nasce recusado até
    -- alguém decidir, por escrito, que reabrir aquilo é seguro.
    IF v_job.status NOT IN (
         'falhou', 'cancelada', 'aguardando_decisao',
         'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota'
       ) THEN
      RAISE EXCEPTION 'A nota desta parcela está num estado que não permite pedir de novo agora. Atualize a tela e confira o andamento.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- REABRE a linha que JÁ existe (nunca uma segunda), zerando o teto.
    -- proxima_tentativa_em = now() devolve valor à coluna que
    -- nfse_auto_aguardar_decisao deixou NULL — sem isso, retomar um job de
    -- 'aguardando_decisao' estouraria o CHECK
    -- nfse_auto_jobs_proxima_tentativa_viva ao gravar status 'pendente'.
    UPDATE public.nfse_auto_jobs j
       SET status               = 'pendente',
           attempts             = 0,
           last_error           = NULL,
           bloqueado_em         = NULL,
           proxima_tentativa_em = now(),
           reenfileirado_por    = v_uid,
           reenfileirado_motivo = v_motivo,
           reenfileirado_em     = now(),
           updated_at           = now()
     WHERE j.id = v_job.id;

    RETURN v_job.id;
  END IF;

  -- Não havia job: nasce um, com trigger_reason='manual' (não mentir sobre por
  -- que esta nota saiu nesse dia) e elegível agora.
  INSERT INTO public.nfse_auto_jobs (
    company_id, contract_id, financial_transaction_id, competencia,
    trigger_reason, status, scheduled_for, proxima_tentativa_em,
    reenfileirado_por, reenfileirado_motivo, reenfileirado_em
  ) VALUES (
    v_ft.company_id,
    v_ft.contract_id,
    v_ft.id,
    date_trunc('month', COALESCE(v_ft.due_date, v_ft.transaction_date)::timestamp)::date,
    'manual',
    'pendente',
    v_hoje,
    now(),
    v_uid,
    v_motivo,
    now()
  )
  ON CONFLICT (company_id, financial_transaction_id) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    -- Corrida de duplo clique: outra transação criou o job entre o SELECT e o
    -- INSERT. A UNIQUE segurou (é o seu trabalho); devolve o job que venceu.
    SELECT j.id INTO v_job_id
      FROM public.nfse_auto_jobs j
     WHERE j.company_id               = v_ft.company_id
       AND j.financial_transaction_id = v_ft.id;
  END IF;

  RETURN v_job_id;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_enfileirar(uuid, text) IS
  'Enfileira à mão a nota de UMA parcela de contrato e devolve o id do job. É o botão "tentar de novo" da tela de pendências E o clique "EMITIR MESMO ASSIM" da R7.5 (job parado em aguardando_decisao por competência encerrada). ÚNICA das RPCs nfse_auto_* com humano na ponta, e por isso a única que checa permissão por dentro — e a única com GRANT pra authenticated (desvio da R11 autorizado pelo Tech Lead, justificado no corpo). Gates, nesta ordem: sessão existe -> permissão fiscal (can_manage_system, a mesma de nfse-emit; nenhuma permissão nova) -> a parcela é da empresa do usuário ("não existe" e "não é sua" têm a MESMA mensagem, porque mensagem diferente é oráculo de dado de outro tenant) -> parcela elegível (de contrato, entrada, não cancelada, valor > 0, não é recebimento parcial) -> contrato coerente com a parcela -> INVARIANTE DE NOTA ÚNICA. Recusa, em PT-BR leigo: parcela com nota viva em nfse_emissions, job já ''emitida'', job com emissão vinculada, e job ''processando'' (a nota está saindo agora). Job ''pendente'' devolve o mesmo id sem criar nada (duplo clique é inócuo). RETOMADA por ALLOWLIST EXPLÍCITA — falhou, cancelada, aguardando_decisao, bloqueada_assinatura, bloqueada_modulo, bloqueada_cota — e nada mais: status novo no CHECK nasce RECUSADO até alguém decidir por escrito que reabrir aquilo é seguro (antes era um ELSE implícito, que daria retomada de graça a qualquer status futuro). Retomar REABRE a mesma linha, nunca cria a segunda, com attempts = 0 (é uma série nova de decisão humana; sem o zero o teto de 3 mataria a retentativa na hora e o botão não faria nada) e proxima_tentativa_em = now() (devolve valor à coluna que nfse_auto_aguardar_decisao deixou NULL). Nenhum company_id vem de parâmetro: a empresa é derivada da parcela e conferida contra a do usuário.';

-- ----------------------------------------------------------------------------
-- 5) Privilégios (R10/R11) — mesmo molde do DO $privilegios$ de 20260924170000
-- ----------------------------------------------------------------------------
-- O Supabase concede EXECUTE a PUBLIC por default privilege em TODA função
-- nova. Esse furo se fecha na mão, sempre. As duas funções desta migration são
-- chamadas SÓ pelo runner: são SECURITY DEFINER, bypassam RLS e não checam
-- chamador nenhum, então EXECUTE pra authenticated significaria "qualquer
-- usuário do browser congela ou encerra a fila de nota fiscal de QUALQUER
-- empresa, pra sempre" — nfse_auto_aguardar_decisao é especialmente grave
-- porque o job que ela para NÃO volta sozinho.
DO $privilegios$
DECLARE
  v_fn  text;
  v_fns text[] := ARRAY[
    'public.nfse_auto_aguardar_decisao(uuid, text)',
    'public.nfse_auto_encerrar(uuid, text, text)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;

  RAISE NOTICE '[nfs-e automatica onda 3] % RPC(s) novas fechadas pra PUBLIC/anon/authenticated.',
    array_length(v_fns, 1);
END
$privilegios$;

-- nfse_auto_enfileirar: o CREATE OR REPLACE acima preserva os GRANTs, mas
-- reafirmar custa zero e protege contra um DROP/CREATE futuro (drop de função
-- leva os grants embora e ninguém percebe até o 403 em runtime).
REVOKE ALL     ON FUNCTION public.nfse_auto_enfileirar(uuid, text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.nfse_auto_enfileirar(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.nfse_auto_enfileirar(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.nfse_auto_enfileirar(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 6) Conferência — aborta a migration se qualquer invariante não fechar
-- ----------------------------------------------------------------------------
-- Migration que "passa" e deixa a regra furada é pior que migration que falha:
-- a segunda acorda alguém, a primeira vira incidente em três semanas.
--
-- As provas por prosrc normalizam o fonte antes de olhar: comentários (-- ...)
-- removidos e espaçamento colapsado. A prova tem que olhar o CÓDIGO, não a
-- prosa que explica o código (na Onda 2 a primeira versão deste bloco reprovou
-- a si mesma por causa de um comentário).
DO $audit$
DECLARE
  v_src_aguardar text;
  v_src_encerrar text;
  v_src_enfileirar text;
  v_nullable  text;
  v_check     integer;
  v_acl       integer;
  v_jobs      integer;
BEGIN
  -- (1) A coluna tem que aceitar NULL, senão nfse_auto_aguardar_decisao
  --     estoura 23502 dentro do runner e a R7.5 nunca acontece.
  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'nfse_auto_jobs'
     AND column_name  = 'proxima_tentativa_em';

  IF v_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_jobs.proxima_tentativa_em continua NOT NULL. nfse_auto_aguardar_decisao estouraria not_null_violation DENTRO do runner, depois de reivindicar o job — a R7.5 ficaria escrita e nao implementada.';
  END IF;

  -- (2) E o nullable tem que vir com a trava: NULL so em status que o claim
  --     NAO procura. Sem isso, um NULL num job 'pendente' o torna invisivel e
  --     a parcela fica sem nota pra sempre, sem erro nenhum.
  SELECT count(*) INTO v_check
    FROM pg_constraint
   WHERE conname = 'nfse_auto_jobs_proxima_tentativa_viva';

  IF v_check <> 1 THEN
    RAISE EXCEPTION 'Abortado: CHECK nfse_auto_jobs_proxima_tentativa_viva ausente. proxima_tentativa_em nullable sem essa trava permite job reivindicavel invisivel pro claim.';
  END IF;

  -- (3) As duas funcoes novas existem com a assinatura que o runner vai chamar.
  SELECT regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '[[:space:]]+', ' ', 'g')
    INTO v_src_aguardar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'nfse_auto_aguardar_decisao'
     AND pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_mensagem text';

  SELECT regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '[[:space:]]+', ' ', 'g')
    INTO v_src_encerrar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'nfse_auto_encerrar'
     AND pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_status text, p_mensagem text';

  SELECT regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '[[:space:]]+', ' ', 'g')
    INTO v_src_enfileirar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'nfse_auto_enfileirar'
     AND pg_get_function_identity_arguments(p.oid) = 'p_financial_transaction_id uuid, p_motivo text';

  IF v_src_aguardar IS NULL OR v_src_encerrar IS NULL OR v_src_enfileirar IS NULL THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_aguardar_decisao(uuid,text), nfse_auto_encerrar(uuid,text,text) ou nfse_auto_enfileirar(uuid,text) nao existe com a assinatura esperada depois desta migration. O runner chamaria por nome e levaria 404/42883 em runtime.';
  END IF;

  -- (4) PROVA ESTRUTURAL DA R7.5, lida do catalogo e nao prometida em
  --     comentario: nfse_auto_aguardar_decisao TEM que gravar NULL em
  --     proxima_tentativa_em, e NAO pode gravar valor nenhum alem de NULL.
  IF position('proxima_tentativa_em = NULL' IN v_src_aguardar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_aguardar_decisao nao grava proxima_tentativa_em = NULL. Sem isso o job herda uma proxima tentativa e volta pro fluxo automatico — a R7.5 (competencia encerrada espera decisao humana) perde o sentido inteiro.';
  END IF;

  -- "proxima_tentativa_em =" aparece UMA vez (a atribuicao de NULL). Duas
  -- ocorrencias significam que alguem acrescentou uma segunda escrita.
  IF (length(v_src_aguardar) - length(replace(v_src_aguardar, 'proxima_tentativa_em =', ''))) / length('proxima_tentativa_em =') <> 1 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_aguardar_decisao escreve em proxima_tentativa_em mais de uma vez. A unica escrita permitida e "= NULL": qualquer valor nao-nulo devolve o job ao fluxo automatico.';
  END IF;

  IF position('nfse_auto_amanha' IN v_src_aguardar) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_aguardar_decisao chama nfse_auto_amanha(). "Tenta amanha" e o comportamento de nfse_auto_adiar (porta fechada); este desfecho NUNCA volta sozinho.';
  END IF;

  -- attempts nao pode nem aparecer: competencia fechar nao e tentativa (R7.2).
  IF position('attempts' IN v_src_aguardar) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_aguardar_decisao menciona attempts. A competencia fechar nao e tentativa de emissao, e as tentativas que ja aconteceram sao rastro pra quem vai decidir — a coluna nao pode aparecer no corpo.';
  END IF;

  -- (5) PROVA ESTRUTURAL do encerrar: terminal de verdade. Nem
  --     proxima_tentativa_em (nao volta), nem attempts (nao houve tentativa, e
  --     o rastro das que houve fica), nem "amanha".
  IF position('proxima_tentativa_em' IN v_src_encerrar) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_encerrar menciona proxima_tentativa_em. Encerrar por decisao e terminal — agendar proxima tentativa contradiz a decisao.';
  END IF;

  IF position('attempts' IN v_src_encerrar) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_encerrar menciona attempts. Encerramento por decisao nao e tentativa (nao incrementa) e nao apaga o rastro das que houve (nao zera).';
  END IF;

  IF position('nfse_auto_amanha' IN v_src_encerrar) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_encerrar chama nfse_auto_amanha(). Desfecho encerrado por decisao nao volta amanha.';
  END IF;

  -- Allowlist estrita de UM valor, no molde do nfse_auto_adiar. 'emitida' no
  -- parametro fecharia como sucesso um job cuja nota nunca saiu.
  IF position('v_status NOT IN (''cancelada'')' IN v_src_encerrar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_encerrar perdeu a allowlist estrita de p_status. O CHECK da tabela aceitaria ''emitida'' aqui, e um erro de digitacao fecharia como sucesso um job sem nota nenhuma.';
  END IF;

  -- (6) PROVA ESTRUTURAL do enfileirar: os dois status novos sao retomaveis
  --     (senao o job parado pela R7.5 fica parado pra sempre e o "emitir mesmo
  --     assim" nao existe), a retomada zera attempts, e a allowlist e
  --     EXPLICITA (nao um ELSE implicito que daria retomada de graca a
  --     qualquer status futuro do CHECK).
  IF position('''falhou'', ''cancelada'', ''aguardando_decisao''' IN v_src_enfileirar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar nao tem a allowlist explicita de retomada com aguardando_decisao e cancelada. Sem ela, o clique "emitir mesmo assim" da R7.5 nao existe (job parado nunca volta) OU qualquer status futuro nasce retomavel em silencio.';
  END IF;

  IF position('attempts = 0' IN v_src_enfileirar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar nao zera attempts ao retomar. Job que estourou o teto de 3 voltaria pra fila e nfse_auto_falhar o mataria na primeira tentativa: o botao nao faria nada e o usuario clicaria pra sempre vendo o mesmo erro.';
  END IF;

  IF position('proxima_tentativa_em = now()' IN v_src_enfileirar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar nao devolve valor a proxima_tentativa_em ao retomar. Retomar um job de aguardando_decisao (que tem a coluna NULL) estouraria o CHECK nfse_auto_jobs_proxima_tentativa_viva ao gravar status pendente.';
  END IF;

  -- A recusa de parcela de outra empresa e a de parcela com nota tem que
  -- continuar vivas depois do CREATE OR REPLACE.
  IF position('Parcela não encontrada.' IN v_src_enfileirar) = 0
     OR position('Esta parcela já tem nota fiscal.' IN v_src_enfileirar) = 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar perdeu a recusa de parcela de outra empresa (mensagem sem oraculo) ou a de parcela que ja tem nota. O CREATE OR REPLACE desta migration nao podia mexer nesses gates.';
  END IF;

  -- (7) ACL: as duas novas sao de service_role puro. SECURITY DEFINER sem
  --     checagem de chamador aberto pro browser = fila de nota fiscal de
  --     qualquer empresa na mao do usuario — e, no caso do aguardar_decisao,
  --     congelada pra sempre, porque o job nao volta sozinho.
  SELECT count(*) INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('nfse_auto_aguardar_decisao', 'nfse_auto_encerrar')
     AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );

  IF v_acl > 0 THEN
    RAISE EXCEPTION 'Abortado: % das 2 RPCs novas ainda executavel(is) por anon/authenticated.', v_acl;
  END IF;

  IF NOT has_function_privilege('service_role', 'public.nfse_auto_aguardar_decisao(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.nfse_auto_encerrar(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Abortado: RPC nova sem EXECUTE pra service_role. O runner levaria permission denied em runtime.';
  END IF;

  -- (8) E a excecao da R11 continua exatamente como estava: aberta pra
  --     authenticated (checa permissao por dentro), fechada pra anon.
  IF NOT has_function_privilege('authenticated', 'public.nfse_auto_enfileirar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar sem EXECUTE pra authenticated. O botao "emitir mesmo assim" da Onda 3 daria permission denied em runtime.';
  END IF;

  IF has_function_privilege('anon', 'public.nfse_auto_enfileirar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar executavel por anon.';
  END IF;

  SELECT count(*) INTO v_jobs FROM public.nfse_auto_jobs;

  RAISE NOTICE 'NFS-e automatica onda 3 OK: aguardar_decisao (proxima_tentativa_em NULL, attempts intocado, nunca volta sozinho) + encerrar (allowlist cancelada, terminal, recusa job com nota) + enfileirar com allowlist explicita de retomada. % job(s) na fila.', v_jobs;
END
$audit$;
