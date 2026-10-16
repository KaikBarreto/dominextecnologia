-- ============================================================================
-- NFS-e AUTOMÁTICA POR CONTRATO — ONDA 2 (banco): as 5 RPCs do runner
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE:
--   A Onda 1 (20261016140000) entregou a configuração no contrato, a fila
--   (nfse_auto_jobs), os dois produtores e o CLAIM. Faltava o outro lado da
--   conversa: o que o runner chama DEPOIS de reivindicar um job. São estas
--   cinco RPCs. Sem elas, o runner teria que fazer UPDATE direto na fila com
--   service_role — exatamente o que a R3 proíbe (o lugar que emite é o lugar
--   onde a regra tem que morar, em SQL, não em três `await` no Deno).
--
--   Plano-pai:   docs/planos/2026-10-16-nfse-automatica-contrato.md
--   Autorização: docs/planos/2026-10-16-nfse-automatica-regra-de-autorizacao.md
--   A edge `nfse-auto-runner` está sendo escrita EM PARALELO por 🛡️ Plataforma
--   contra este mesmo contrato: nome, parâmetros e semântica abaixo são FIXOS.
--
-- NÃO reescreve a 20261016140000, que já está aplicada em produção. Tudo aqui
-- é aditivo ou CREATE OR REPLACE com assinatura idêntica.
--
-- ============================================================================
-- DECISÃO ESTRUTURAL DESTA MIGRATION: `attempts` = TENTATIVA DE EMISSÃO
-- ============================================================================
-- A Onda 1 incrementava `attempts` no CLAIM, e a R7.2 exige que job barrado em
-- gate (bloqueada_assinatura/bloqueada_modulo/bloqueada_cota) NÃO consuma
-- tentativa. As duas coisas juntas só fecham se alguém "devolver attempts ao
-- valor anterior" depois — e isso é corrida embutida: dois processos, duas
-- leituras, um decremento perdido.
--
-- O Tech Lead resolveu por DESENHO, não por compensação:
--
--   attempts     = quantas vezes NÓS FALAMOS COM O PROVEDOR por este job.
--                  Incrementado SÓ por nfse_auto_registrar_tentativa, que o
--                  runner chama IMEDIATAMENTE ANTES da chamada ao provedor.
--                  É a coluna onde mora o teto de 3 (§2.2 do plano).
--   claim_count  = quantas vezes este job foi REIVINDICADO da fila.
--                  Incrementado pelo claim. Reivindicar não é tentar emitir.
--                  Serve pra UMA pergunta: "este job está derrubando o runner
--                  e voltando como órfão em loop?" (claim_count alto com
--                  attempts baixo e status 'processando' = sim).
--
-- CONSEQUÊNCIA, que é o ponto: o teto de 3 passa a ser medido por `attempts`,
-- e `attempts` só existe quando houve chamada ao provedor. Job que ficou 60
-- dias em bloqueada_modulo tem attempts = 0 e NUNCA estoura teto, sem nenhuma
-- linha de código pra isso — é a ausência de código que garante (nem
-- nfse_auto_claim nem nfse_auto_adiar mencionam `attempts` no SET). O §7 desta
-- migration PROVA isso lendo prosrc e abortando se a palavra aparecer.
--
-- POR QUE CONTAR A TENTATIVA *ANTES* DA CHAMADA, E NÃO DEPOIS: se o provedor
-- derruba o runner no meio (OOM, timeout de wall clock, pânico no Deno), o
-- "depois" nunca acontece. O job voltaria como órfão com attempts intacto e
-- tentaria pra sempre — um job envenenado trancando a fila do tenant todo dia.
-- Contar antes custa, no pior caso, uma tentativa a mais marcada do que
-- aconteceu; não contar custa loop infinito. Fácil.
--
-- ============================================================================
-- INVARIANTE QUE NENHUMA DAS CINCO PODE FURAR
-- ============================================================================
--   UMA PARCELA NUNCA GERA UMA SEGUNDA NOTA.
--   Travas, em ordem de quem morde primeiro:
--     (1) UNIQUE (company_id, financial_transaction_id) de nfse_auto_jobs —
--         física, criada na Onda 1. nfse_auto_enfileirar nunca cria o segundo
--         job: ou reabre o que existe, ou recusa.
--     (2) nfse_auto_enfileirar RECUSA, com motivo em PT-BR leigo, parcela que
--         já tem job 'emitida', job com nfse_emission_id preenchido, ou nota
--         viva em nfse_emissions. E recusa job 'processando' (a nota está
--         saindo agora — reabrir pra 'pendente' no meio do voo é como se pede
--         duas).
--     (3) UNIQUE (company_id, idempotency_key) de nfse_emissions, com chave
--         derivada DA PARCELA (R8). É a última linha de defesa, do lado do
--         documento fiscal.
--     (4) nfse_auto_concluir não aceita fechar job com nota de OUTRA empresa:
--         quarentena o job e não fecha.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) claim_count: a coluna que separa "reivindicado" de "tentado"
-- ----------------------------------------------------------------------------
ALTER TABLE public.nfse_auto_jobs
  ADD COLUMN IF NOT EXISTS claim_count integer NOT NULL DEFAULT 0;

-- SEM BACKFILL, de propósito. Medido em produção antes de escrever isto:
-- nfse_auto_jobs tem 0 linhas e contracts tem 0 contratos com
-- nfse_auto_enabled=true (a Onda 1 nasceu desligada em 100%, invariante 4).
-- Não existe `attempts` histórico pra migrar — o que seria a conversa difícil
-- (o attempts antigo significava claim, o novo significa emissão). O §7 aborta
-- esta migration se aparecer linha com attempts > 0, que é o único cenário em
-- que a ausência de backfill mentiria.

DO $claim_count_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfse_auto_jobs_claim_count_check') THEN
    ALTER TABLE public.nfse_auto_jobs
      ADD CONSTRAINT nfse_auto_jobs_claim_count_check
      CHECK (claim_count >= 0);
  END IF;
END
$claim_count_check$;

COMMENT ON COLUMN public.nfse_auto_jobs.claim_count IS
  'Quantas vezes este job foi REIVINDICADO da fila por nfse_auto_claim. NÃO é tentativa de emissão — é só "quantas vezes o runner pegou esta linha na mão". Existe pra responder uma pergunta que attempts não responde: job com claim_count alto, attempts baixo e status ''processando'' está DERRUBANDO o runner antes de falar com o provedor e voltando como órfão em loop (consulta de monitoramento: SELECT id, claim_count, attempts, status FROM nfse_auto_jobs WHERE claim_count > 5 AND status <> ''emitida''). Diferença de attempts: reivindicar é de graça e pode acontecer 50 vezes sem efeito nenhum no mundo; tentar emitir fala com o governo.';

-- REESCREVE o comentário da Onda 1, que descrevia a regra ANTIGA ("o claim
-- incrementa; quem bloqueia devolve ao valor anterior"). Comentário que
-- descreve regra morta é pior que comentário ausente: o próximo dev confia.
COMMENT ON COLUMN public.nfse_auto_jobs.attempts IS
  'Tentativas REAIS de emissão: quantas vezes nós efetivamente FALAMOS COM O PROVEDOR por este job. Incrementado SÓ por public.nfse_auto_registrar_tentativa, chamada pelo runner imediatamente ANTES da chamada ao provedor (contar depois perderia a tentativa que derrubou o runner, e o job tentaria pra sempre). É aqui que o teto de 3 (§2.2 do plano) é medido, e por isso ele NUNCA se aplica a job barrado em gate: nfse_auto_claim e nfse_auto_adiar não tocam esta coluna, então job em bloqueada_assinatura/bloqueada_modulo/bloqueada_cota tem attempts congelado por construção (R7.2). Quantas vezes o job foi REIVINDICADO é outra coluna: claim_count.';

-- ----------------------------------------------------------------------------
-- 2) trigger_reason ganha 'manual' + carimbo de quem pediu à mão
-- ----------------------------------------------------------------------------
-- A quinta RPC (nfse_auto_enfileirar) é disparada por um HUMANO. O job que ela
-- cria não veio de dia_fixo, nem de vencimento, nem de pagamento — e carimbar
-- um dos três seria mentir sobre "por que esta nota saiu nesse dia", que é a
-- única razão de trigger_reason existir.
DO $trigger_reason$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfse_auto_jobs_trigger_reason_check') THEN
    ALTER TABLE public.nfse_auto_jobs DROP CONSTRAINT nfse_auto_jobs_trigger_reason_check;
  END IF;

  ALTER TABLE public.nfse_auto_jobs
    ADD CONSTRAINT nfse_auto_jobs_trigger_reason_check
    CHECK (trigger_reason IN ('dia_fixo', 'vencimento', 'pagamento', 'manual'));
END
$trigger_reason$;

COMMENT ON COLUMN public.nfse_auto_jobs.trigger_reason IS
  'Qual gatilho enfileirou: dia_fixo, vencimento, pagamento (os três automáticos, do contrato) ou manual (um humano pediu, via nfse_auto_enfileirar — o botão "tentar de novo" da tela de pendências). Auditoria: responde "por que esta nota saiu nesse dia". Em ''manual'', quem pediu e por quê estão em reenfileirado_por/reenfileirado_motivo/reenfileirado_em.';

-- Nota automática não tem "quem apertou o botão" (R5) — mas nota REENFILEIRADA
-- À MÃO tem, e esse rosto não pode se perder. Sem estas três colunas, o
-- p_motivo da RPC seria parâmetro decorativo: recebido e jogado fora.
ALTER TABLE public.nfse_auto_jobs
  ADD COLUMN IF NOT EXISTS reenfileirado_por uuid;

ALTER TABLE public.nfse_auto_jobs
  ADD COLUMN IF NOT EXISTS reenfileirado_motivo text;

ALTER TABLE public.nfse_auto_jobs
  ADD COLUMN IF NOT EXISTS reenfileirado_em timestamptz;

COMMENT ON COLUMN public.nfse_auto_jobs.reenfileirado_por IS
  'Usuário que mandou este job pra fila À MÃO (auth.uid() dentro de nfse_auto_enfileirar). NULO no caminho automático, onde ninguém apertou botão nenhum e a responsabilidade mora em contracts.nfse_auto_enabled_by/at (R5). SEM FK pra auth.users, mesma régua de contracts.nfse_auto_enabled_by: usuário excluído não pode apagar o rastro de quem autorizou uma emissão fiscal.';
COMMENT ON COLUMN public.nfse_auto_jobs.reenfileirado_motivo IS
  'Por que um humano pediu esta emissão de novo, em texto livre (ex.: "cadastro do cliente corrigido", "cota renovou"). Vai pra tela de pendências junto com last_error, porque "tentou de novo e falhou de novo" sem o motivo da primeira tentativa não dá pra investigar.';
COMMENT ON COLUMN public.nfse_auto_jobs.reenfileirado_em IS
  'Quando o job foi reenfileirado à mão pela última vez. Reabrir sobrescreve (o rastro longo de cada tentativa é o last_error + o log, não esta coluna).';

-- ----------------------------------------------------------------------------
-- 3) nfse_auto_amanha() — UM lugar pra definir "amanhã"
-- ----------------------------------------------------------------------------
-- Duas RPCs abaixo (falhar transitório e adiar) empurram o job pra "amanhã".
-- Duas cópias da mesma expressão de fuso é como as duas divergem em seis meses.
--
-- "Amanhã" = 00:00 de amanhã NO FUSO DO CLIENTE (America/Sao_Paulo), não
-- now() + 24h. O banco roda em UTC: `current_date` vira o dia 3 horas antes do
-- cliente, e "+ 24 horas" faria o job voltar no MEIO do dia seguinte, depois do
-- cron do runner já ter passado — o retry pularia um dia inteiro, em silêncio.
-- Meia-noite de São Paulo (03:00 UTC) é ANTES de qualquer cron desta feature
-- (o enfileirador roda 05:50 UTC), então o job está elegível quando o runner
-- acorda. Mês/dia calendário, nunca aritmética de 30 dias / 24h.
CREATE OR REPLACE FUNCTION public.nfse_auto_amanha()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT (((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp
          AT TIME ZONE 'America/Sao_Paulo');
$fn$;

COMMENT ON FUNCTION public.nfse_auto_amanha() IS
  'Meia-noite de AMANHÃ no fuso America/Sao_Paulo, como timestamptz. Único lugar que define "amanhã" na NFS-e automática: usada por nfse_auto_falhar (retry transitório) e nfse_auto_adiar (porta fechada) pra gravar proxima_tentativa_em. Não é now() + 24h de propósito — isso jogaria o job pro meio do dia seguinte, DEPOIS do cron, e o retry pularia um dia sem ninguém notar.';

-- ----------------------------------------------------------------------------
-- 4) nfse_auto_claim — DEIXA de incrementar attempts; passa a contar claim
-- ----------------------------------------------------------------------------
-- Corpo IDÊNTICO ao da Onda 1 (conferido byte a byte contra a definição viva em
-- produção: md5(prosrc) = 87f3d729b03e471b92277d9fb48797d3) exceto UMA linha no
-- passo (3): `attempts = j.attempts + CASE WHEN ... END` saiu e
-- `claim_count = j.claim_count + 1` entrou.
--
-- RETURNS TABLE inalterado, coluna por coluna, de propósito: o runner que está
-- sendo escrito em paralelo lê essas chaves. Acrescentar `claim_count` ao
-- retorno exigiria DROP + CREATE (OUT params não mudam em CREATE OR REPLACE),
-- perderia os GRANTs no caminho e mudaria um contrato que não precisa mudar —
-- o runner não tem o que fazer com claim_count; quem lê é a consulta de
-- monitoramento.
CREATE OR REPLACE FUNCTION public.nfse_auto_claim(
  p_limite        integer DEFAULT 10,
  p_orfao_minutos integer DEFAULT 15
)
RETURNS TABLE (
  job_id                   uuid,
  job_company_id           uuid,
  job_contract_id          uuid,
  job_transaction_id       uuid,
  job_competencia          date,
  job_trigger_reason       text,
  job_scheduled_for        date,
  job_attempts             integer,
  parcela_amount           numeric,
  parcela_due_date         date,
  parcela_transaction_date date,
  parcela_is_paid          boolean,
  parcela_amount_received  numeric,
  parcela_description      text,
  contrato_nome            text,
  contrato_status          text,
  contrato_auto_enabled    boolean,
  contrato_auto_trigger    text,
  contrato_descricao_nota  text,
  contrato_service_type_id uuid,
  fiscal_servico_nome      text,
  fiscal_codigo_servico    text,
  fiscal_codigo_trib_mun   text,
  fiscal_codigo_nbs        text,
  fiscal_item_lc116        text,
  fiscal_iss_aliquota      numeric,
  cliente_id               uuid,
  cliente_nome             text,
  cliente_razao_social     text,
  cliente_documento        text,
  cliente_email            text,
  cliente_telefone         text,
  cliente_logradouro       text,
  cliente_numero           text,
  cliente_complemento      text,
  cliente_bairro           text,
  cliente_cidade           text,
  cliente_uf               text,
  cliente_cep              text,
  cliente_ibge             text,
  cliente_inscricao_mun    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_incoerentes integer := 0;
BEGIN
  -- (1) ÓRFÃOS. O processo morreu com o job em 'processando'. Devolver pra
  --     fila é seguro porque a emissão é idempotente nas duas pontas (UNIQUE
  --     do job + UNIQUE (company_id, idempotency_key) da emissão, com chave
  --     derivada da parcela). Sem isso, um crash trancaria a parcela pra
  --     sempre e o cliente ficaria sem nota, em silêncio.
  --     É aqui que claim_count ganha utilidade: job que volta como órfão em
  --     loop acumula claim_count SEM acumular attempts, e aparece na consulta
  --     de monitoramento antes de virar um mês de faturamento parado.
  UPDATE public.nfse_auto_jobs j
     SET status       = 'pendente',
         bloqueado_em = NULL,
         updated_at   = now()
   WHERE j.status = 'processando'
     AND j.bloqueado_em IS NOT NULL
     AND j.bloqueado_em < now() - make_interval(mins => GREATEST(COALESCE(p_orfao_minutos, 15), 1));

  -- (2) COERÊNCIA DE QUATRO LINHAS, antes de reivindicar qualquer coisa.
  --     attempts fica CONGELADO: isto não é tentativa de emissão que falhou,
  --     é agendamento inválido. A mensagem é PT-BR leigo porque vai direto
  --     pra tela de pendências.
  WITH incoerentes AS (
    SELECT j.id
      FROM public.nfse_auto_jobs j
      LEFT JOIN public.financial_transactions ft ON ft.id = j.financial_transaction_id
      LEFT JOIN public.contracts             c  ON c.id  = j.contract_id
      LEFT JOIN public.customers             cu ON cu.id = c.customer_id
     WHERE j.status IN ('pendente', 'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota')
       AND (
            ft.id IS NULL
         OR c.id  IS NULL
         OR cu.id IS NULL
         OR j.company_id  IS DISTINCT FROM ft.company_id
         OR j.company_id  IS DISTINCT FROM c.company_id
         OR j.company_id  IS DISTINCT FROM cu.company_id
         -- A parcela tem que ser DESTE contrato. Job apontando pra parcela de
         -- outro contrato da mesma empresa também é agendamento inválido.
         OR ft.contract_id IS DISTINCT FROM j.contract_id
       )
  )
  UPDATE public.nfse_auto_jobs j
     SET status       = 'falhou',
         last_error   = 'Inconsistência de empresa no agendamento da nota. A emissão automática foi interrompida por segurança.',
         bloqueado_em = NULL,
         updated_at   = now()
    FROM incoerentes i
   WHERE j.id = i.id;

  GET DIAGNOSTICS v_incoerentes = ROW_COUNT;
  IF v_incoerentes > 0 THEN
    RAISE WARNING '[nfse_auto_claim] % job(s) com incoerencia de posse marcados como falhou e NAO entregues ao chamador', v_incoerentes;
  END IF;

  -- (3) REIVINDICA com FOR UPDATE SKIP LOCKED (duas instâncias do runner nunca
  --     pegam o mesmo job) e devolve o job JÁ JOINADO.
  --
  --     attempts NÃO É TOCADO AQUI, e essa ausência é a regra (R7.2):
  --     reivindicar um job não é tentar emitir. Quem conta tentativa é
  --     nfse_auto_registrar_tentativa, chamada pelo runner na véspera da
  --     chamada ao provedor. Resultado: job que fica dois meses em
  --     bloqueada_modulo sendo reavaliado todo dia continua com attempts = 0 e
  --     nunca estoura o teto de 3 — sem nenhuma linha de código pra isso, que
  --     é justamente o ponto. Antes (Onda 1) o claim incrementava e esperava
  --     que quem bloqueasse devolvesse o valor: compensação com corrida
  --     embutida.
  RETURN QUERY
  WITH reivindicados AS (
    UPDATE public.nfse_auto_jobs j
       SET status       = 'processando',
           bloqueado_em = now(),
           claim_count  = j.claim_count + 1,
           updated_at   = now()
     WHERE j.id IN (
       SELECT cand.id
         FROM public.nfse_auto_jobs cand
        WHERE cand.status IN ('pendente', 'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota')
          AND cand.proxima_tentativa_em <= now()
        ORDER BY cand.scheduled_for, cand.created_at
        LIMIT GREATEST(COALESCE(p_limite, 10), 1)
        FOR UPDATE SKIP LOCKED
     )
    RETURNING j.*
  )
  SELECT j.id,
         j.company_id,
         j.contract_id,
         j.financial_transaction_id,
         j.competencia,
         j.trigger_reason,
         j.scheduled_for,
         j.attempts::integer,
         ft.amount,
         ft.due_date,
         ft.transaction_date,
         COALESCE(ft.is_paid, false),
         COALESCE(ft.amount_received, 0),
         ft.description,
         c.name,
         c.status,
         c.nfse_auto_enabled,
         c.nfse_auto_trigger,
         c.nfse_auto_description,
         c.service_type_id,
         st.name,
         -- Herança fiscal resolvida UMA vez, aqui: override do contrato vence,
         -- tipo de serviço completa. O runner não decide nada disso.
         COALESCE(c.nfse_codigo_servico,              st.codigo_servico),
         COALESCE(c.nfse_codigo_tributacao_municipal, st.codigo_tributacao_municipal),
         COALESCE(c.nfse_codigo_nbs,                  st.codigo_nbs),
         st.item_lc116,
         COALESCE(c.nfse_iss_aliquota,                st.iss_aliquota),
         cu.id,
         cu.name,
         cu.company_name,
         cu.document,
         cu.email,
         cu.phone,
         cu.address,
         COALESCE(cu.address_number, cu.street_number),
         cu.complement,
         cu.neighborhood,
         cu.city,
         cu.state,
         cu.zip_code,
         cu.ibge_municipality_code,
         cu.inscricao_municipal
    FROM reivindicados j
    -- INNER + igualdade de company_id = trava (ii). Job incoerente não sai.
    JOIN public.financial_transactions ft
      ON ft.id = j.financial_transaction_id AND ft.company_id = j.company_id
    JOIN public.contracts c
      ON c.id  = j.contract_id              AND c.company_id  = j.company_id
    JOIN public.customers cu
      ON cu.id = c.customer_id              AND cu.company_id = j.company_id
    LEFT JOIN public.service_types st
      ON st.id = c.service_type_id          AND st.company_id = j.company_id
   ORDER BY j.scheduled_for, j.created_at;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_claim(integer, integer) IS
  'ÚNICO caminho de consumo da fila nfse_auto_jobs. (1) solta jobs órfãos (processando há mais de p_orfao_minutos); (2) marca ''falhou'', SEM entregar, todo job cuja posse não fecha — job.company_id tem que bater com a parcela, o contrato E o cliente, e a parcela tem que ser do contrato do job; (3) reivindica até p_limite jobs com FOR UPDATE SKIP LOCKED (duas instâncias do runner nunca pegam o mesmo), incrementando CLAIM_COUNT (não attempts: reivindicar não é tentar emitir — quem conta tentativa é nfse_auto_registrar_tentativa, e é por isso que job em bloqueada_* nunca estoura o teto de 3, R7.2), e devolve cada job já JOINado com parcela, contrato, cliente e a herança fiscal resolvida (override do contrato vence o tipo de serviço). O chamador usa UM company_id por iteração, vindo deste retorno, e nada mais: company_id de requisição não existe neste caminho. REVOKE de anon/authenticated — só service_role chama.';

-- ----------------------------------------------------------------------------
-- 5) As 5 RPCs do runner
-- ----------------------------------------------------------------------------

-- 5.1 nfse_auto_registrar_tentativa — conta a tentativa ANTES do provedor
--
-- O runner chama isto na linha imediatamente anterior à chamada ao provedor.
-- Não é otimismo: é a única ordem em que um crash DENTRO da chamada deixa a
-- tentativa contada. Contar depois significa que o job que mata o runner volta
-- como órfão com attempts intacto e tenta de novo amanhã, e depois de amanhã,
-- pra sempre.
--
-- LEAST(..., 50) existe por causa do CHECK attempts <= 50 da Onda 1: com o teto
-- de 3 em nfse_auto_falhar, attempts jamais chega perto de 50 — mas se chegasse
-- (bug novo, reenfileiramento em loop), o UPDATE estouraria check_violation
-- DENTRO do runner, no pior momento possível: entre reivindicar e emitir.
-- Saturar em 50 é feio e visível; derrubar o runner é invisível e pior.
CREATE OR REPLACE FUNCTION public.nfse_auto_registrar_tentativa(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_attempts integer;
BEGIN
  UPDATE public.nfse_auto_jobs j
     SET attempts   = LEAST(j.attempts + 1, 50),
         updated_at = now()
   WHERE j.id = p_job_id
  RETURNING j.attempts::integer INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- Job sumiu entre o claim e aqui. Só acontece por CASCADE: a parcela foi
    -- apagada. NULL é a resposta honesta, e o runner tem que tratar NULL como
    -- "não emita" — não há parcela pra faturar.
    RAISE WARNING '[nfse_auto_registrar_tentativa] job % nao existe mais (parcela apagada por CASCADE?); nenhuma tentativa contada', p_job_id;
    RETURN NULL;
  END IF;

  RETURN v_attempts;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_registrar_tentativa(uuid) IS
  'Conta UMA tentativa real de emissão (attempts + 1) e devolve o novo valor. O runner chama IMEDIATAMENTE ANTES de falar com o provedor, nunca depois: assim a tentativa que derruba o runner no meio da chamada já está contada, e o job não volta como órfão pra tentar pra sempre. Devolve NULL (com RAISE WARNING) se o job não existe mais — a parcela foi apagada e o CASCADE levou o job; o chamador tem que tratar NULL como "não emita". Satura em 50 por causa do CHECK da tabela, pra nunca estourar check_violation entre reivindicar e emitir. É a ÚNICA função que incrementa attempts — nem o claim nem o adiar tocam a coluna (R7.2).';

-- 5.2 nfse_auto_concluir — fecha o job com a nota que saiu
--
-- p_nfse_emission_id é OBRIGATÓRIO: fechar um job como 'emitida' sem dizer QUAL
-- nota saiu quebra a cadeia de auditoria da R5 (nota -> job -> contrato -> quem
-- ligou a automação) e é exatamente a linha que ninguém consegue reconstruir
-- depois. Se o provedor autorizou mas o runner não tem o id da emissão, o
-- caminho certo é nfse_auto_falhar, não concluir às cegas.
--
-- A EMISSÃO É CONFERIDA CONTRA A EMPRESA DO JOB, pela mesma razão da R3: o id
-- que o runner manda é uma AFIRMAÇÃO. Se ele não bate, o job é posto em
-- quarentena ('falhou', com motivo de segurança) e NÃO fechado. De propósito
-- sem RAISE EXCEPTION: a exceção faria rollback da própria quarentena, o job
-- ficaria 'processando', voltaria como órfão e tentaria de novo — mascarando o
-- único sintoma do problema. Quarentena + WARNING no log deixa a prova no banco.
CREATE OR REPLACE FUNCTION public.nfse_auto_concluir(
  p_job_id           uuid,
  p_nfse_emission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_job_company uuid;
  v_emi_company uuid;
BEGIN
  IF p_nfse_emission_id IS NULL THEN
    RAISE EXCEPTION 'nfse_auto_concluir exige p_nfse_emission_id: fechar job como emitida sem dizer qual nota saiu quebra a auditoria da nota automatica. Use nfse_auto_falhar.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT j.company_id INTO v_job_company
    FROM public.nfse_auto_jobs j
   WHERE j.id = p_job_id;

  IF v_job_company IS NULL THEN
    RAISE WARNING '[nfse_auto_concluir] job % nao existe mais; nota % permanece registrada (documento fiscal nao depende do job)', p_job_id, p_nfse_emission_id;
    RETURN;
  END IF;

  SELECT e.company_id INTO v_emi_company
    FROM public.nfse_emissions e
   WHERE e.id = p_nfse_emission_id;

  IF v_emi_company IS DISTINCT FROM v_job_company THEN
    UPDATE public.nfse_auto_jobs j
       SET status       = 'falhou',
           last_error   = 'Inconsistência de empresa entre a nota emitida e o agendamento. A emissão automática foi interrompida por segurança.',
           bloqueado_em = NULL,
           updated_at   = now()
     WHERE j.id = p_job_id;

    RAISE WARNING '[nfse_auto_concluir] job % NAO fechado: emissao % e da empresa % e o job da empresa %. Job posto em quarentena.',
      p_job_id, p_nfse_emission_id, v_emi_company, v_job_company;
    RETURN;
  END IF;

  UPDATE public.nfse_auto_jobs j
     SET status           = 'emitida',
         nfse_emission_id = p_nfse_emission_id,
         last_error       = NULL,
         bloqueado_em     = NULL,
         emitted_at       = now(),
         updated_at       = now()
   WHERE j.id = p_job_id;

  -- Fecha a cadeia de auditoria DOS DOIS LADOS, na mesma transação. Se o
  -- runner esquecer de carimbar origem/nfse_auto_job_id ao inserir a emissão,
  -- a nota ficaria indistinguível de uma manual e a pergunta "quem autorizou
  -- esta nota automática?" não teria resposta (R5). COALESCE pra nunca
  -- sobrescrever um vínculo já gravado; company_id no WHERE porque nem aqui a
  -- posse se presume. created_by NÃO é tocado: nota automática nasce com
  -- created_by NULL (R11) e sobrescrever campo de autoria de documento fiscal
  -- em nome de uma suposição é pior que a inconsistência que corrigiria.
  UPDATE public.nfse_emissions e
     SET nfse_auto_job_id = COALESCE(e.nfse_auto_job_id, p_job_id),
         origem           = 'automatica'
   WHERE e.id         = p_nfse_emission_id
     AND e.company_id = v_job_company
     AND (e.nfse_auto_job_id IS NULL OR e.origem <> 'automatica');
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_concluir(uuid, uuid) IS
  'Fecha o job como ''emitida'', aponta nfse_emission_id pra nota que saiu e limpa last_error. p_nfse_emission_id é OBRIGATÓRIO (fechar sem dizer qual nota saiu quebra a cadeia de auditoria nota -> job -> contrato -> quem ligou a automação). CONFERE que a nota é da MESMA empresa do job: se não bate, NÃO fecha — põe o job em quarentena (''falhou'' com motivo de segurança) e loga WARNING, sem RAISE EXCEPTION, porque a exceção faria rollback da própria quarentena. Também carimba nfse_emissions.origem=''automatica'' e nfse_auto_job_id (só se ainda vazios), pra a pergunta "quem autorizou esta nota?" ter resposta mesmo se o runner esquecer. Nunca toca created_by.';

-- 5.3 nfse_auto_falhar — recusa definitiva x tropeço, e o TETO mora aqui
--
-- O teto de 3 (§2.2 do plano) é decidido NUM LUGAR SÓ, e é este. O runner não
-- conta, não compara, não decide: ele diz "falhou, e isto é/não é definitivo",
-- e o banco resolve se vira 'pendente' ou 'falhou'. Teto espalhado entre SQL e
-- TypeScript é como se emite 7 tentativas achando que são 3.
--
-- p_definitivo = true  -> erro de DADO (sem CNPJ, sem IBGE, município sem
--                         cobertura, tomador sem endereço). Retentar não
--                         conserta cadastro: vira pendência humana na hora.
-- p_definitivo = false -> tropeço (rede, 503 do provedor, timeout). Volta pra
--                         'pendente' com proxima_tentativa_em = amanhã, até o
--                         teto; no teto, vira 'falhou' com a contagem no
--                         motivo, porque "parou de tentar" sem dizer por quê é
--                         a falha silenciosa que a invariante 4 do plano proíbe.
CREATE OR REPLACE FUNCTION public.nfse_auto_falhar(
  p_job_id     uuid,
  p_mensagem   text,
  p_definitivo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- §2.2 do plano. Mora AQUI e em nenhum outro lugar.
  v_teto CONSTANT integer := 3;

  v_attempts integer;
  v_status   text;
  v_msg      text := left(
    COALESCE(NULLIF(btrim(p_mensagem), ''),
             'Não foi possível emitir a nota e o provedor não informou o motivo.'),
    500
  );
BEGIN
  SELECT j.attempts::integer INTO v_attempts
    FROM public.nfse_auto_jobs j
   WHERE j.id = p_job_id;

  IF v_attempts IS NULL THEN
    RAISE WARNING '[nfse_auto_falhar] job % nao existe mais (parcela apagada por CASCADE?); falha nao registrada', p_job_id;
    RETURN;
  END IF;

  IF COALESCE(p_definitivo, false) THEN
    v_status := 'falhou';
  ELSIF v_attempts >= v_teto THEN
    v_status := 'falhou';
    -- A contagem entra no motivo em PT-BR leigo: a tela de pendências tem que
    -- conseguir explicar sozinha por que paramos, sem ninguém abrir log.
    v_msg := left(v_msg || ' A emissão automática tentou ' || v_attempts
                        || ' vezes e parou. Resolva o motivo acima e use "tentar de novo".', 1000);
  ELSE
    v_status := 'pendente';
  END IF;

  UPDATE public.nfse_auto_jobs j
     SET status               = v_status,
         last_error           = v_msg,
         bloqueado_em         = NULL,
         proxima_tentativa_em = CASE
                                  WHEN v_status = 'pendente' THEN public.nfse_auto_amanha()
                                  ELSE j.proxima_tentativa_em
                                END,
         updated_at           = now()
   WHERE j.id = p_job_id;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_falhar(uuid, text, boolean) IS
  'Registra falha de emissão e decide o destino do job. p_definitivo=true (erro de DADO: sem CNPJ, sem IBGE, município sem cobertura) -> ''falhou'' na hora, porque retentar não conserta cadastro. p_definitivo=false (rede, 503, timeout) -> volta pra ''pendente'' com proxima_tentativa_em = amanhã, A MENOS QUE attempts >= 3, caso em que vira ''falhou'' com a contagem no motivo. O TETO DE 3 MORA SÓ AQUI: o runner não conta nem compara, pra não existirem dois tetos (um em SQL, um em TypeScript) que divergem. Como attempts só é incrementado por nfse_auto_registrar_tentativa, o teto nunca alcança job barrado em gate — esses passam por nfse_auto_adiar, que não toca attempts (R7.2). last_error em PT-BR leigo porque vai direto pra tela de pendências.';

-- 5.4 nfse_auto_adiar — porta fechada NÃO é tentativa falha (R7)
--
-- Assinatura Dominex vencida, módulo NFS-e fora do plano, cota do mês
-- estourada: o job FICA VIVO, com status próprio, motivo em português e
-- reavaliação amanhã. O faturamento do cliente não evapora porque o cartão da
-- NOSSA assinatura falhou — e o inverso também é lei: enquanto a porta está
-- fechada, nada é emitido.
--
-- `attempts` NÃO APARECE NO SET. Essa ausência é a implementação da R7.2: não
-- existe "devolver o valor anterior", não existe corrida, não existe um lugar
-- pra alguém esquecer. O §7 desta migration lê prosrc e aborta se a palavra
-- 'attempts' aparecer no corpo desta função.
--
-- A ALLOWLIST de status é explícita e o resto é recusado com exceção. O CHECK
-- da tabela aceitaria 'emitida' aqui — e "adiar" marcando 'emitida' é fechar
-- como sucesso uma nota que nunca saiu, a pior classe de bug desta feature.
CREATE OR REPLACE FUNCTION public.nfse_auto_adiar(
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
  v_msg    text := left(
    COALESCE(NULLIF(btrim(p_mensagem), ''),
             'Emissão automática pausada. Será reavaliada amanhã.'),
    500
  );
  v_afetados integer;
BEGIN
  IF v_status NOT IN ('bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota') THEN
    RAISE EXCEPTION 'nfse_auto_adiar: status "%" nao permitido. Use bloqueada_assinatura, bloqueada_modulo ou bloqueada_cota.', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.nfse_auto_jobs j
     SET status               = v_status,
         last_error           = v_msg,
         bloqueado_em         = NULL,
         proxima_tentativa_em = public.nfse_auto_amanha(),
         updated_at           = now()
   WHERE j.id = p_job_id;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  IF v_afetados = 0 THEN
    RAISE WARNING '[nfse_auto_adiar] job % nao existe mais (parcela apagada por CASCADE?); bloqueio nao registrado', p_job_id;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.nfse_auto_adiar(uuid, text, text) IS
  'Pausa o job numa PORTA FECHADA e o reavalia amanhã: p_status só aceita bloqueada_assinatura, bloqueada_modulo ou bloqueada_cota (qualquer outro valor é recusado com exceção — ''adiar'' marcando ''emitida'' fecharia como sucesso uma nota que nunca saiu). NÃO TOCA attempts, e a ausência da coluna no SET é a implementação da R7.2: porta fechada não é tentativa falha, então o teto de 3 nunca alcança um job bloqueado, por mais dias que ele fique parado. O job FICA VIVO com motivo em PT-BR leigo — faturamento do cliente não evapora porque a assinatura Dominex, o módulo ou a cota travou; e enquanto a porta está fechada, nada é emitido.';

-- 5.5 nfse_auto_enfileirar — a ÚNICA das cinco que um humano dispara
--
-- Vai virar o botão "tentar de novo" da tela de pendências (Onda 3). Por ser a
-- única com humano na ponta, é a única que CHECA PERMISSÃO DO CHAMADOR — e por
-- isso é a única que recebe GRANT pra authenticated.
--
-- ⚠️ DESVIO CONSCIENTE DA R11 ("❌ RPC nfse_auto_* com EXECUTE para
-- authenticated"), autorizado pelo Tech Lead e registrado aqui pra o review não
-- parar sem contexto. A R11 existe porque as outras quatro são service_role
-- puro: SECURITY DEFINER sem checagem de chamador + EXECUTE pra authenticated
-- = qualquer usuário do browser mexe na fila de qualquer empresa. Esta função
-- fecha o furo POR DENTRO, na ordem: (a) sessão existe, (b) permissão fiscal,
-- (c) a parcela é da empresa do usuário, (d) coerência parcela<->contrato,
-- (e) invariante de nota única. Nenhum company_id vem do parâmetro — o único
-- parâmetro de entidade é o id da parcela, e a empresa é DERIVADA dela e
-- conferida contra a do usuário.
--
-- ORDEM DOS GATES, de propósito: permissão ANTES de existência. Invertido, quem
-- não tem permissão fiscal usaria as mensagens diferentes ("não encontrada" x
-- "sem permissão") pra descobrir quais ids de parcela existem. E "não existe" e
-- "não é sua" devolvem a MESMA resposta, pela mesma razão.
--
-- attempts = 0 AO REABRIR é obrigatório, não cosmético: sem isso, job que
-- estourou o teto voltaria pra fila e nfse_auto_falhar o mataria na primeira
-- tentativa (attempts já >= 3). O botão "tentar de novo" não tentaria nada, e o
-- usuário clicaria pra sempre vendo o mesmo erro.
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

    -- falhou / cancelada / bloqueada_* / aguardando_decisao -> REABRE a linha
    -- que JÁ existe (nunca uma segunda), zerando o teto.
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
  'Enfileira à mão a nota de UMA parcela de contrato e devolve o id do job (vira o botão "tentar de novo" da tela de pendências, Onda 3). ÚNICA das cinco RPCs do runner com humano na ponta, e por isso a única que checa permissão por dentro — e a única com GRANT pra authenticated (desvio da R11 autorizado pelo Tech Lead, justificado no corpo). Gates, nesta ordem: sessão existe -> permissão fiscal (can_manage_system, a mesma de nfse-emit; nenhuma permissão nova) -> a parcela é da empresa do usuário ("não existe" e "não é sua" têm a MESMA mensagem) -> parcela elegível (de contrato, entrada, não cancelada, valor > 0, não é recebimento parcial) -> contrato coerente com a parcela -> INVARIANTE DE NOTA ÚNICA. Recusa, em PT-BR leigo: parcela com nota viva, job já ''emitida'', job com emissão vinculada, e job ''processando'' (a nota está saindo agora). Job ''pendente'' devolve o mesmo id sem criar nada (duplo clique é inócuo). Job morto (falhou/cancelada/bloqueada_*/aguardando_decisao) é REABERTO — a mesma linha, nunca uma segunda — com attempts = 0, sem o que o teto de 3 mataria a retentativa na hora e o botão não faria nada. Nenhum company_id vem de parâmetro: a empresa é derivada da parcela e conferida contra a do usuário.';

-- ----------------------------------------------------------------------------
-- 6) Privilégios (R10) — bloco no mesmo molde do DO $privilegios$ de
--    20260924170000
-- ----------------------------------------------------------------------------
-- O Supabase concede EXECUTE a PUBLIC por default privilege em TODA função
-- nova. Esse furo se fecha na mão, sempre. Sem o REVOKE, um usuário autenticado
-- chamaria nfse_auto_adiar/concluir/falhar do browser — são SECURITY DEFINER,
-- bypassam RLS, e não checam chamador nenhum: daria pra fechar como 'emitida'
-- um job de qualquer empresa (nota que nunca saiu marcada como saída) ou
-- bloquear a fila alheia pra sempre.
DO $privilegios$
DECLARE
  v_fn  text;
  v_fns text[] := ARRAY[
    'public.nfse_auto_amanha()',
    'public.nfse_auto_registrar_tentativa(uuid)',
    'public.nfse_auto_concluir(uuid, uuid)',
    'public.nfse_auto_falhar(uuid, text, boolean)',
    'public.nfse_auto_adiar(uuid, text, text)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;

  -- nfse_auto_claim já existia; o CREATE OR REPLACE do §4 preserva os GRANTs,
  -- mas reafirmar custa zero e protege contra um DROP/CREATE futuro
  -- (drop de função leva os grants embora e ninguém percebe até o 403).
  EXECUTE 'REVOKE ALL ON FUNCTION public.nfse_auto_claim(integer, integer) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.nfse_auto_claim(integer, integer) FROM anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.nfse_auto_claim(integer, integer) TO service_role';

  RAISE NOTICE '[nfse-e automatica onda 2] % RPC(s) fechadas pra anon/authenticated + o claim reafirmado.',
    array_length(v_fns, 1);
END
$privilegios$;

-- A EXCEÇÃO, e só ela: nfse_auto_enfileirar checa permissão POR DENTRO (sessão,
-- can_manage_system, posse da parcela), então authenticated pode chamá-la.
-- anon continua REVOKED: sem auth.uid() a função abortaria de todo jeito, mas
-- deixar o EXECUTE aberto pra anon convida a varredura de ids de parcela pelas
-- mensagens de erro.
REVOKE ALL     ON FUNCTION public.nfse_auto_enfileirar(uuid, text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.nfse_auto_enfileirar(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.nfse_auto_enfileirar(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) Conferência — aborta a migration se qualquer invariante não fechar
-- ----------------------------------------------------------------------------
-- Migration que "passa" e deixa a regra furada é pior que migration que falha:
-- a segunda acorda alguém, a primeira vira incidente em três semanas.
DO $audit$
DECLARE
  v_attempts_sujos integer;
  v_claim_src      text;
  v_adiar_src      text;
  v_acl_furada     integer;
  v_jobs           integer;
BEGIN
  -- (1) A ausência de backfill só é honesta se nenhum job tiver attempts
  --     herdado da semântica ANTIGA (quando o claim incrementava).
  SELECT count(*) INTO v_attempts_sujos
    FROM public.nfse_auto_jobs
   WHERE attempts > 0;

  IF v_attempts_sujos > 0 THEN
    RAISE EXCEPTION 'Abortado: % job(s) com attempts > 0 gravados pela semantica ANTIGA (claim incrementava). Esta migration muda o significado da coluna e nao faz backfill; com linha suja, o teto de 3 passaria a contar tentativa que nunca existiu.', v_attempts_sujos;
  END IF;

  -- (2) PROVA ESTRUTURAL da R7.2, lida do catálogo e não prometida em
  --     comentário: nem o claim nem o adiar podem ESCREVER em attempts.
  --     É o que garante que job bloqueado nunca estoura o teto de 3.
  --     Os comentários (-- ...) são removidos antes da busca e o espaçamento é
  --     normalizado: a prova tem que olhar o CÓDIGO, não a prosa que explica o
  --     código (a primeira versão deste bloco reprovou a si mesma por causa de
  --     um comentário que dizia "continua com attempts = 0").
  SELECT regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '[[:space:]]+', ' ', 'g')
    INTO v_claim_src
    FROM pg_proc WHERE proname = 'nfse_auto_claim';

  SELECT regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '[[:space:]]+', ' ', 'g')
    INTO v_adiar_src
    FROM pg_proc
   WHERE proname = 'nfse_auto_adiar'
     AND pg_get_function_identity_arguments(oid) = 'p_job_id uuid, p_status text, p_mensagem text';

  IF v_claim_src IS NULL OR v_adiar_src IS NULL THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_claim ou nfse_auto_adiar(uuid,text,text) nao existe depois desta migration.';
  END IF;

  -- Ler attempts pra devolver no resultado é legítimo (j.attempts::integer);
  -- ESCREVER não. A forma de escrita, depois da normalização, é "attempts =".
  IF position('attempts =' IN v_claim_src) > 0
     OR position('attempts=' IN v_claim_src) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_claim voltou a ESCREVER em attempts. Reivindicar nao e tentar emitir (R7.2) — quem conta tentativa e nfse_auto_registrar_tentativa.';
  END IF;

  IF position('attempts' IN v_adiar_src) > 0 THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_adiar menciona attempts. Porta fechada nao e tentativa falha (R7.2): a coluna nao pode nem aparecer no corpo.';
  END IF;

  -- (3) ACL: nenhuma das 4 de service_role pode ter anon/authenticated.
  SELECT count(*) INTO v_acl_furada
    FROM pg_proc p
   WHERE p.proname IN (
           'nfse_auto_claim', 'nfse_auto_registrar_tentativa', 'nfse_auto_concluir',
           'nfse_auto_falhar', 'nfse_auto_adiar', 'nfse_auto_amanha',
           'nfse_auto_enqueue_due_jobs', 'nfse_auto_trigger_date'
         )
     AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );

  IF v_acl_furada > 0 THEN
    RAISE EXCEPTION 'Abortado: % funcao(oes) nfse_auto_* de service_role ainda executaveis por anon/authenticated. SECURITY DEFINER sem checagem de chamador aberto pro browser = fila de qualquer empresa na mao do usuario.', v_acl_furada;
  END IF;

  -- (4) E a exceção tem que estar aberta pra authenticated e fechada pra anon.
  IF NOT has_function_privilege('authenticated', 'public.nfse_auto_enfileirar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar sem EXECUTE pra authenticated. O botao "tentar de novo" da Onda 3 daria permission denied em runtime.';
  END IF;

  IF has_function_privilege('anon', 'public.nfse_auto_enfileirar(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Abortado: nfse_auto_enfileirar executavel por anon.';
  END IF;

  SELECT count(*) INTO v_jobs FROM public.nfse_auto_jobs;

  RAISE NOTICE 'NFS-e automatica onda 2 OK: 5 RPCs do runner + claim_count. % job(s) na fila, nenhum com attempts sujo. attempts=tentativa de emissao (so registrar_tentativa escreve), claim_count=reivindicacao (so o claim escreve), teto de 3 so em nfse_auto_falhar.', v_jobs;
END
$audit$;
