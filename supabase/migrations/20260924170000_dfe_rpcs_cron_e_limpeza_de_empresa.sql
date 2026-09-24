-- ============================================================================
-- Notas destinadas — PARTE 4/4: RPCs de operação, agendamento e limpeza
-- ============================================================================
-- Plano: docs/planos/2026-09-24-notas-destinadas-e-config-fiscal.md (Frente C).
-- Depende de: 20260924160000 (opt-in + dfe_sync_state)
--             20260924161000 (inbound_nfse)
--             20260924162000 (inbound_nfe + dfe_manifestacao_jobs)
--
-- O QUE ENTRA AQUI
--   1. Correções de CHECK das partes 2/3, conferidas contra o motor da VPS.
--   2. As 8 RPCs que as edges chamam (`dfe-sync`, `dfe-sync-cron`,
--      `dfe-manifestar`, `dfe-manifestar-worker`).
--   3. `admin_delete_company` passa a conhecer as 4 tabelas novas.
--   4. A decisão (com o porquê) sobre `zerar_sistema`.
--   5. O agendamento dos dois crons.
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ POR QUE TANTA COISA É RPC E NÃO CÓDIGO NA EDGE                            │
-- │                                                                           │
-- │ Três operações aqui são INDIVISÍVEIS, e o Deno não tem transação:         │
-- │   * reivindicar a rodada = "marcar que consultei" + "pagar a janela de 1h" │
-- │     num UPDATE condicional só. Em dois round-trips, duas chamadas          │
-- │     simultâneas passariam as duas e o CNPJ tomaria 656.                    │
-- │   * enfileirar manifestação = linha na fila + selo "enviando" na nota.     │
-- │     Meio caminho deixa job sem selo (tela mentindo) ou selo sem job        │
-- │     (spinner eterno).                                                     │
-- │   * concluir manifestação = fechar o job + gravar o fato na nota.          │
-- │                                                                           │
-- │ E uma é INDIVISÍVEL *e* precisa de MERGE de coluna: o upsert das notas     │
-- │ tem que preservar XML completo já guardado quando o mesmo documento        │
-- │ reaparece na fila como resumo. `upsert()` do PostgREST sobrescreve tudo.   │
-- └───────────────────────────────────────────────────────────────────────────┘
-- ============================================================================

-- ============================================================================
-- 0) CORREÇÕES DAS PARTES 2/3 (idempotentes)
-- ============================================================================
-- As migrations 161000/162000 foram escritas ANTES de o motor DF-e existir na
-- VPS. Conferidas agora contra `services/dominex-fiscal/app/sefaz/` (§10.2 do
-- RUNBOOK), duas regras estavam erradas. Os arquivos originais já foram
-- corrigidos; este bloco existe pra que um banco onde eles JÁ tenham rodado
-- fique igual — `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` + `ADD` é a única
-- forma idempotente, porque `CREATE TABLE IF NOT EXISTS` não revisa CHECK.
--
--   (a) 'ciencia' (210210) ENTRA na fila de manifestação.
--       Ela não é automática: o motor de distribuição só LÊ. E é justamente a
--       ciência que destrava o XML completo — sem ela toda nota fica
--       `resumo = true` para sempre, sem caminho de saída.
--
--   (b) Justificativa é obrigatória em UM tipo só: 'nao_realizada' (210240).
--       A NT 2020.001 v1.50 dispensou a do Desconhecimento, e o motor só
--       serializa <xJust> na Operação não Realizada. Exigir mais que o governo
--       não é rigor — é bloquear operação que a SEFAZ aceita. Nos demais o
--       texto é PROIBIDO: guardar justificativa nunca transmitida seria prova
--       falsa de algo que o cliente não declarou.
-- ============================================================================
DO $correcoes$
BEGIN
  IF to_regclass('public.inbound_nfe') IS NOT NULL THEN
    ALTER TABLE public.inbound_nfe
      DROP CONSTRAINT IF EXISTS inbound_nfe_manifestacao_pendente_check;
    ALTER TABLE public.inbound_nfe
      ADD CONSTRAINT inbound_nfe_manifestacao_pendente_check
      CHECK (manifestacao_pendente IS NULL
             OR manifestacao_pendente IN ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada'));
  END IF;

  IF to_regclass('public.dfe_manifestacao_jobs') IS NOT NULL THEN
    ALTER TABLE public.dfe_manifestacao_jobs
      DROP CONSTRAINT IF EXISTS dfe_manifestacao_jobs_tipo_check;
    ALTER TABLE public.dfe_manifestacao_jobs
      ADD CONSTRAINT dfe_manifestacao_jobs_tipo_check
      CHECK (tipo IN ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada'));

    ALTER TABLE public.dfe_manifestacao_jobs
      DROP CONSTRAINT IF EXISTS dfe_manifestacao_jobs_justificativa_check;
    ALTER TABLE public.dfe_manifestacao_jobs
      ADD CONSTRAINT dfe_manifestacao_jobs_justificativa_check
      CHECK (
        CASE
          WHEN tipo = 'nao_realizada'
            THEN justificativa IS NOT NULL
                 AND char_length(btrim(justificativa)) BETWEEN 15 AND 255
          ELSE justificativa IS NULL
        END
      );
  END IF;
END
$correcoes$;

-- ============================================================================
-- 1) dfe_sync_claim — reivindicar a rodada ANTES de falar com o governo
-- ============================================================================
-- ⚠️ ESTA É A OBRIGAÇÃO 1 DA §10.3 DO RUNBOOK, E ELA MORA AQUI DE PROPÓSITO.
--
-- O serviço da VPS é stateless: se a SEFAZ servir NSU e a resposta HTTP se
-- perder (timeout do proxy, edge morta), ninguém do lado de lá sabe. A rodada
-- seguinte repetiria NSU já servido e o CNPJ tomaria **1 hora de bloqueio**
-- (rejeição 656) — o cliente fica sem ver nota nenhuma nesse período.
--
-- A defesa é PAGAR A JANELA ADIANTADO: o mesmo UPDATE que marca
-- `ultima_consulta_em` já empurra `proxima_consulta_em` a hora cheia. Se nada
-- voltar, o bloqueio JÁ está no banco. Encurtar a janela é privilégio de quem
-- recebeu resposta (`dfe_sync_concluir`), nunca de quem só tentou.
--
-- O `WHERE proxima_consulta_em <= now()` faz o UPDATE ser o próprio lock: duas
-- chamadas simultâneas (botão + cron, ou dois cliques) serializam na linha, e a
-- segunda reavalia o WHERE contra o valor já gravado e casa 0 linhas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_sync_claim(
  p_company_id     uuid,
  p_tipo           text,
  p_espera_minutos integer DEFAULT 65
)
RETURNS TABLE (
  claimed              boolean,
  ultimo_nsu           text,
  max_nsu              text,
  proxima_consulta_em  timestamptz,
  ciclos_sem_documento integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_espera integer := GREATEST(COALESCE(p_espera_minutos, 65), 1);
BEGIN
  IF p_company_id IS NULL OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'dfe_sync_claim: empresa e tipo sao obrigatorios'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A linha nasce LIBERADA (proxima_consulta_em DEFAULT now()): empresa que
  -- acabou de ligar o opt-in sincroniza na hora, sem esperar uma janela.
  INSERT INTO public.dfe_sync_state (company_id, tipo)
  VALUES (p_company_id, p_tipo)
  ON CONFLICT (company_id, tipo) DO NOTHING;

  RETURN QUERY
  WITH tomada AS (
    UPDATE public.dfe_sync_state s
       SET ultima_consulta_em  = now(),
           proxima_consulta_em = now() + make_interval(mins => v_espera),
           updated_at          = now()
     WHERE s.company_id = p_company_id
       AND s.tipo       = p_tipo
       AND s.proxima_consulta_em <= now()
    RETURNING s.ultimo_nsu, s.max_nsu, s.proxima_consulta_em, s.ciclos_sem_documento
  )
  SELECT true, t.ultimo_nsu, t.max_nsu, t.proxima_consulta_em, t.ciclos_sem_documento
    FROM tomada t
  UNION ALL
  -- Não deu pra tomar: devolve o estado atual pra tela poder dizer QUANDO volta.
  SELECT false, s.ultimo_nsu, s.max_nsu, s.proxima_consulta_em, s.ciclos_sem_documento
    FROM public.dfe_sync_state s
   WHERE s.company_id = p_company_id
     AND s.tipo       = p_tipo
     AND NOT EXISTS (SELECT 1 FROM tomada);
END;
$fn$;

COMMENT ON FUNCTION public.dfe_sync_claim(uuid, text, integer) IS
  'Reivindica UMA rodada de consulta de notas destinadas. Cria a linha de dfe_sync_state se faltar e faz um UPDATE condicional atomico que marca ultima_consulta_em E JA PAGA a janela anti-656 inteira (proxima_consulta_em = now() + p_espera_minutos). Devolve claimed=false quando a janela ainda nao venceu. Pagar adiantado e a defesa contra resposta perdida: se a SEFAZ servir NSU e o HTTP morrer, o bloqueio ja esta gravado. So quem RECEBEU resposta pode encurtar a janela (dfe_sync_concluir).';

-- ============================================================================
-- 2) dfe_sync_concluir — gravar o cursor, SEMPRE
-- ============================================================================
-- ⚠️ OBRIGAÇÃO 3 DA §10.3: `ultNsu` é gravado INCLUSIVE quando a rodada veio
-- `parcial: true`. "Parcial" significa "sobrou fila", NUNCA "não veio nada" —
-- os NSU cobertos JÁ SAÍRAM da fila da SEFAZ e não serão servidos de novo.
-- Descartar o avanço porque "deu erro no meio" é o caminho mais curto pro 656.
--
-- O cursor é CLAMPADO em vez de validado: o trigger
-- `dfe_sync_state_nsu_nao_regride` recusaria (com EXCEPTION) um valor menor, e
-- aí a rodada inteira perderia também o cStat, o contador e a janela. Clampar
-- preserva o resto da gravação e mantém o invariante ("só avança").
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_sync_concluir(
  p_company_id            uuid,
  p_tipo                  text,
  p_ult_nsu               text,
  p_max_nsu               text,
  p_cstat                 text,
  p_documentos            integer,
  p_espera_minutos        integer DEFAULT 65,
  p_ciclos_ate_ocioso     integer DEFAULT 24,
  p_espera_ociosa_minutos integer DEFAULT 240
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.dfe_sync_state s
     SET ultimo_nsu = CASE
           WHEN p_ult_nsu ~ '^[0-9]{1,15}$'
                AND (s.ultimo_nsu IS NULL OR p_ult_nsu::bigint > s.ultimo_nsu::bigint)
             THEN lpad(p_ult_nsu, 15, '0')
           ELSE s.ultimo_nsu
         END,
         max_nsu = CASE
           WHEN p_max_nsu ~ '^[0-9]{1,15}$' THEN lpad(p_max_nsu, 15, '0')
           ELSE s.max_nsu
         END,
         ultimo_cstat           = COALESCE(NULLIF(btrim(p_cstat), ''), s.ultimo_cstat),
         documentos_ultimo_lote = COALESCE(p_documentos, 0),
         ciclos_sem_documento   = CASE
           WHEN COALESCE(p_documentos, 0) > 0 THEN 0
           ELSE s.ciclos_sem_documento + 1
         END,
         -- Ciclo que deu certo limpa o erro anterior: erro velho na tela depois
         -- de a coisa voltar a funcionar é pior que nenhum erro.
         ultimo_erro    = NULL,
         ultimo_erro_em = NULL,
         proxima_consulta_em = now() + make_interval(mins => CASE
           -- Fila passiva e vazia há muito tempo (~26h): alarga a espera em vez
           -- de bater de hora em hora à toa. Nota nova reseta o contador.
           WHEN COALESCE(p_documentos, 0) = 0
                AND s.ciclos_sem_documento + 1 >= GREATEST(COALESCE(p_ciclos_ate_ocioso, 24), 1)
             THEN GREATEST(COALESCE(p_espera_ociosa_minutos, 240), COALESCE(p_espera_minutos, 65))
           ELSE GREATEST(COALESCE(p_espera_minutos, 65), 1)
         END),
         updated_at = now()
   WHERE s.company_id = p_company_id
     AND s.tipo       = p_tipo;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_sync_concluir(uuid, text, text, text, text, integer, integer, integer, integer) IS
  'Fecha uma rodada BEM-SUCEDIDA de consulta de notas destinadas: grava o cursor (ultimo_nsu) INCLUSIVE quando a rodada foi parcial — os NSU cobertos ja sairam da fila da SEFAZ e ignora-los faria a rodada seguinte repetir NSU servido (rejeicao 656). O cursor e CLAMPADO (nunca regride) em vez de validado, pra que um valor estranho da SEFAZ nao derrube a gravacao inteira pelo trigger. Encurtar a janela so e permitido aqui, porque so aqui sabemos que a resposta chegou.';

-- ============================================================================
-- 3) dfe_sync_falhar — registrar a falha SEM nunca encurtar a espera
-- ============================================================================
-- ⚠️ OBRIGAÇÃO 2 DA §10.3: timeout conta como RODADA CONSUMIDA. A SEFAZ pode
-- ter servido NSU e a resposta ter se perdido — tratar como "não aconteceu" e
-- tentar de novo é exatamente o 656.
--
-- O `GREATEST(proxima_consulta_em, ...)` não é zelo: é a regra codificada onde
-- nenhum chamador futuro consiga afrouxá-la. Esta função é INCAPAZ de adiantar
-- a próxima consulta, aconteça o que acontecer na edge.
--
-- E NÃO toca em `ultimo_nsu`: rodada que falhou não avança cursor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_sync_falhar(
  p_company_id     uuid,
  p_tipo           text,
  p_cstat          text,
  p_erro           text,
  p_max_nsu        text    DEFAULT NULL,
  p_espera_minutos integer DEFAULT 65
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- A linha pode não existir se a falha veio antes do claim (config incompleta).
  INSERT INTO public.dfe_sync_state (company_id, tipo)
  VALUES (p_company_id, p_tipo)
  ON CONFLICT (company_id, tipo) DO NOTHING;

  UPDATE public.dfe_sync_state s
     SET ultimo_erro    = left(COALESCE(NULLIF(btrim(p_erro), ''), 'falha nao identificada'), 500),
         ultimo_erro_em = now(),
         ultimo_cstat   = COALESCE(NULLIF(btrim(p_cstat), ''), s.ultimo_cstat),
         -- maxNsu do 656 é DIAGNÓSTICO (mede o quanto a fila anda), nunca
         -- cursor. Ver o porquê em dfe-sync-core.ts#tratarFalha.
         max_nsu = CASE
           WHEN p_max_nsu ~ '^[0-9]{1,15}$' THEN lpad(p_max_nsu, 15, '0')
           ELSE s.max_nsu
         END,
         proxima_consulta_em = GREATEST(
           s.proxima_consulta_em,
           now() + make_interval(mins => GREATEST(COALESCE(p_espera_minutos, 65), 1))
         ),
         updated_at = now()
   WHERE s.company_id = p_company_id
     AND s.tipo       = p_tipo;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_sync_falhar(uuid, text, text, text, text, integer) IS
  'Registra a falha de uma rodada de consulta de notas destinadas. NUNCA encurta proxima_consulta_em (GREATEST) e NUNCA avanca ultimo_nsu: timeout ou resposta perdida contam como rodada CONSUMIDA, porque a SEFAZ pode ter servido NSU do outro lado. Guarda o maxNsu do retorno 656 apenas como diagnostico — pular o cursor ate ele queimaria as notas do intervalo.';

-- ============================================================================
-- 4) dfe_upsert_inbound_nfe — ingestão idempotente das notas
-- ============================================================================
-- Alvo do upsert: (company_id, chave). Rodar duas vezes com o mesmo lote não
-- duplica nada — é o que torna seguro repetir uma rodada cuja gravação falhou.
--
-- ⚠️ O MERGE É POR COLUNA, E ISSO NÃO É DETALHE. O mesmo documento reaparece na
-- fila várias vezes: primeiro como RESUMO (resNFe, sem XML) e depois, quando a
-- manifestação destrava, como procNFe completo. Um upsert que sobrescreve tudo
-- apagaria o XML completo na próxima vez que o resumo passasse. Daí o
-- COALESCE(EXCLUDED.x, t.x) em tudo, e o `resumo` DERIVADO do que sobrou.
--
-- Exceção consciente: `situacao_sefaz`. Cancelamento chega DEPOIS e precisa
-- sobrescrever 'autorizada'. NULL ("não sabemos") continua não apagando nada.
--
-- NÃO toca em financial_transaction_id, supplier_id nem nas colunas de
-- manifestação: são do cliente e do worker, não da ingestão.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_upsert_inbound_nfe(
  p_company_id uuid,
  p_documentos jsonb
)
RETURNS TABLE (novas integer, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_novas integer := 0;
  v_total integer := 0;
BEGIN
  IF p_company_id IS NULL
     OR p_documentos IS NULL
     OR jsonb_typeof(p_documentos) <> 'array' THEN
    novas := 0; total := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_documentos) AS d(
      chave          text,
      origem         text,
      nsu            text,
      numero         integer,
      serie          integer,
      emitente_cnpj  text,
      emitente_nome  text,
      valor          numeric,
      data_emissao   timestamptz,
      natureza       text,
      cfop_principal text,
      fin_nfe        smallint,
      ref_nfe_key    text,
      situacao_sefaz text,
      xml_content    text,
      resumo         boolean
    )
  ),
  -- Deduplicar DENTRO do lote: ON CONFLICT DO UPDATE não tolera a mesma chave
  -- duas vezes no mesmo comando ("cannot affect row a second time"). Entre
  -- duplicatas, fica a que tem XML — a mais completa.
  unicos AS (
    SELECT DISTINCT ON (e.chave) e.*
      FROM entrada e
     WHERE e.chave ~ '^[0-9]{44}$'
     ORDER BY e.chave, (e.xml_content IS NOT NULL) DESC, e.nsu DESC NULLS LAST
  ),
  gravados AS (
    INSERT INTO public.inbound_nfe AS t (
      company_id, chave, origem, nsu, numero, serie,
      emitente_cnpj, emitente_nome, valor, data_emissao, natureza,
      cfop_principal, fin_nfe, ref_nfe_key, situacao_sefaz, xml_content, resumo
    )
    SELECT
      p_company_id,
      u.chave,
      COALESCE(NULLIF(btrim(u.origem), ''), 'dfe'),
      u.nsu, u.numero, u.serie,
      u.emitente_cnpj, u.emitente_nome, u.valor, u.data_emissao, u.natureza,
      u.cfop_principal, u.fin_nfe, u.ref_nfe_key, u.situacao_sefaz,
      u.xml_content,
      COALESCE(u.resumo, u.xml_content IS NULL)
      FROM unicos u
    ON CONFLICT (company_id, chave) DO UPDATE SET
      nsu            = COALESCE(EXCLUDED.nsu,            t.nsu),
      numero         = COALESCE(EXCLUDED.numero,         t.numero),
      serie          = COALESCE(EXCLUDED.serie,          t.serie),
      emitente_cnpj  = COALESCE(EXCLUDED.emitente_cnpj,  t.emitente_cnpj),
      emitente_nome  = COALESCE(EXCLUDED.emitente_nome,  t.emitente_nome),
      valor          = COALESCE(EXCLUDED.valor,          t.valor),
      data_emissao   = COALESCE(EXCLUDED.data_emissao,   t.data_emissao),
      natureza       = COALESCE(EXCLUDED.natureza,       t.natureza),
      cfop_principal = COALESCE(EXCLUDED.cfop_principal, t.cfop_principal),
      fin_nfe        = COALESCE(EXCLUDED.fin_nfe,        t.fin_nfe),
      ref_nfe_key    = COALESCE(EXCLUDED.ref_nfe_key,    t.ref_nfe_key),
      situacao_sefaz = COALESCE(EXCLUDED.situacao_sefaz, t.situacao_sefaz),
      xml_content    = COALESCE(EXCLUDED.xml_content,    t.xml_content),
      resumo         = (COALESCE(EXCLUDED.xml_content, t.xml_content) IS NULL),
      updated_at     = now()
    -- xmax = 0 no RETURNING distingue INSERT de UPDATE. É o que faz o "N notas
    -- novas" da tela ser verdade em vez de contar o lote inteiro.
    RETURNING (xmax = 0) AS inserida
  )
  SELECT COALESCE(count(*) FILTER (WHERE g.inserida), 0)::integer,
         COALESCE(count(*), 0)::integer
    INTO v_novas, v_total
    FROM gravados g;

  novas := COALESCE(v_novas, 0);
  total := COALESCE(v_total, 0);
  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_upsert_inbound_nfe(uuid, jsonb) IS
  'Ingestao idempotente de NF-e destinadas: upsert por (company_id, chave) a partir de um array JSON de documentos. O MERGE e por coluna (COALESCE(EXCLUDED, atual)) porque o mesmo documento reaparece na fila primeiro como resumo e depois como XML completo — sobrescrever tudo apagaria o XML ja destravado. Excecao: situacao_sefaz sobrescreve (cancelamento chega depois). Nao toca em financial_transaction_id, supplier_id nem manifestacao. Devolve (novas, total), com novas contado por xmax=0.';

-- ============================================================================
-- 5) dfe_enfileirar_manifestacao — o pedido do usuário vira linha de fila
-- ============================================================================
-- Manifestação é EVENTO IRREVERSÍVEL perante a Receita. O app nunca escreve
-- `inbound_nfe.manifestacao`: escreve o PEDIDO. O fato consumado só é gravado
-- por `dfe_manifestacao_concluir`, depois do aceite da SEFAZ.
--
-- A posse é conferida aqui (company_id + id da nota) além de na edge: RPC
-- SECURITY DEFINER bypassa RLS, então a checagem tem que ser explícita.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_enfileirar_manifestacao(
  p_company_id     uuid,
  p_inbound_nfe_id uuid,
  p_tipo           text,
  p_justificativa  text,
  p_user_id        uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_chave         text;
  v_manifestacao  text;
  v_status        text;
  v_justificativa text;
BEGIN
  IF p_tipo NOT IN ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada') THEN
    RAISE EXCEPTION 'dfe_enfileirar_manifestacao: tipo invalido (%)', p_tipo
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT n.chave, n.manifestacao
    INTO v_chave, v_manifestacao
    FROM public.inbound_nfe n
   WHERE n.id = p_inbound_nfe_id
     AND n.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN 'nao_encontrada';
  END IF;

  -- Repetir o MESMO evento não faz nada de útil: a SEFAZ devolveria 573
  -- (duplicidade). Evoluir ciência -> confirmação/desconhecimento continua
  -- permitido, porque é operação legítima e de propósito.
  IF v_manifestacao = p_tipo THEN
    RETURN 'ja_manifestada';
  END IF;

  SELECT j.status INTO v_status
    FROM public.dfe_manifestacao_jobs j
   WHERE j.inbound_nfe_id = p_inbound_nfe_id;

  IF v_status IN ('pendente', 'processando') THEN
    RETURN 'em_andamento';
  END IF;

  -- Justificativa só existe em 'nao_realizada'. A CHECK da tabela recusa texto
  -- nos demais tipos; normalizar aqui evita transformar clique em erro 500.
  v_justificativa := CASE
    WHEN p_tipo = 'nao_realizada' THEN NULLIF(btrim(p_justificativa), '')
    ELSE NULL
  END;

  -- UNIQUE(inbound_nfe_id): reenfileirar é UPDATE da MESMA linha, nunca uma
  -- segunda. Duas linhas vivas seriam dois eventos na Receita.
  INSERT INTO public.dfe_manifestacao_jobs AS j (
    company_id, inbound_nfe_id, chave, tipo, justificativa,
    status, tentativas, proxima_tentativa_em, bloqueado_em,
    solicitado_por, solicitado_em, concluido_em, cstat, protocolo, ultimo_erro
  ) VALUES (
    p_company_id, p_inbound_nfe_id, v_chave, p_tipo, v_justificativa,
    'pendente', 0, now(), NULL,
    p_user_id, now(), NULL, NULL, NULL, NULL
  )
  ON CONFLICT (inbound_nfe_id) DO UPDATE SET
    tipo                 = EXCLUDED.tipo,
    justificativa        = EXCLUDED.justificativa,
    status               = 'pendente',
    tentativas           = 0,
    proxima_tentativa_em = now(),
    bloqueado_em         = NULL,
    solicitado_por       = EXCLUDED.solicitado_por,
    solicitado_em        = now(),
    concluido_em         = NULL,
    cstat                = NULL,
    protocolo            = NULL,
    ultimo_erro          = NULL,
    updated_at           = now();

  -- O selo "enviando" na nota, na MESMA transação da fila. Separar os dois
  -- deixaria job sem selo (tela mentindo) ou selo sem job (spinner eterno).
  UPDATE public.inbound_nfe
     SET manifestacao_pendente    = p_tipo,
         manifestacao_pendente_em = now(),
         manifestacao_erro        = NULL,
         updated_at               = now()
   WHERE id = p_inbound_nfe_id
     AND company_id = p_company_id;

  RETURN 'enfileirada';
END;
$fn$;

COMMENT ON FUNCTION public.dfe_enfileirar_manifestacao(uuid, uuid, text, text, uuid) IS
  'Enfileira o pedido de manifestacao do destinatario e marca o selo "enviando" na nota, NA MESMA TRANSACAO. Nunca escreve inbound_nfe.manifestacao — esse e fato consumado e so a conclusao do job o grava, depois do aceite da SEFAZ (evento irreversivel perante a Receita). Confere a posse (company_id) porque SECURITY DEFINER bypassa RLS. Devolve enfileirada | ja_manifestada | em_andamento | nao_encontrada.';

-- ============================================================================
-- 6) dfe_manifestacao_claim — worker reivindica jobs sem lock distribuído
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_manifestacao_claim(
  p_limite         integer DEFAULT 10,
  p_orfao_minutos  integer DEFAULT 10
)
RETURNS TABLE (
  id             uuid,
  company_id     uuid,
  inbound_nfe_id uuid,
  chave          text,
  tipo           text,
  justificativa  text,
  tentativas     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Job órfão: o processo morreu com o job 'processando'. Devolver pra fila é
  -- seguro porque a SEFAZ responde 573 (duplicidade) a evento repetido, e o
  -- worker trata 573 como SUCESSO. Sem isso, um crash trancaria a nota pra
  -- sempre em "enviando".
  UPDATE public.dfe_manifestacao_jobs j
     SET status       = 'pendente',
         bloqueado_em = NULL,
         updated_at   = now()
   WHERE j.status = 'processando'
     AND j.bloqueado_em IS NOT NULL
     AND j.bloqueado_em < now() - make_interval(mins => GREATEST(COALESCE(p_orfao_minutos, 10), 1));

  RETURN QUERY
  UPDATE public.dfe_manifestacao_jobs j
     SET status       = 'processando',
         bloqueado_em = now(),
         tentativas   = j.tentativas + 1,
         updated_at   = now()
   WHERE j.id IN (
     SELECT c.id
       FROM public.dfe_manifestacao_jobs c
      WHERE c.status = 'pendente'
        AND c.proxima_tentativa_em <= now()
      ORDER BY c.solicitado_em
      LIMIT GREATEST(COALESCE(p_limite, 10), 1)
      -- SKIP LOCKED: duas instâncias do cron não pegam o mesmo job.
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.id, j.company_id, j.inbound_nfe_id, j.chave, j.tipo,
            j.justificativa, j.tentativas;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_manifestacao_claim(integer, integer) IS
  'Reivindica ate p_limite jobs de manifestacao prontos pra transmitir, com FOR UPDATE SKIP LOCKED (duas instancias do cron nao pegam o mesmo job) e incremento de tentativas. Antes disso solta jobs orfaos (status=processando ha mais de p_orfao_minutos), o que e seguro porque a SEFAZ responde 573 a evento repetido e o worker trata 573 como sucesso.';

-- ============================================================================
-- 7) dfe_manifestacao_concluir — a SEFAZ aceitou: grava o FATO
-- ============================================================================
-- ⚠️ cStat 573 (duplicidade) chega aqui como SUCESSO, e tem que ser assim: o
-- evento JÁ está registrado na SEFAZ. Tratar como erro mostraria falha pra algo
-- que existe e não se desfaz.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_manifestacao_concluir(
  p_job_id        uuid,
  p_cstat         text,
  p_protocolo     text        DEFAULT NULL,
  p_registrada_em timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inbound uuid;
  v_company uuid;
  v_tipo    text;
BEGIN
  UPDATE public.dfe_manifestacao_jobs j
     SET status       = 'concluida',
         concluido_em = now(),
         bloqueado_em = NULL,
         cstat        = NULLIF(btrim(p_cstat), ''),
         protocolo    = NULLIF(btrim(p_protocolo), ''),
         ultimo_erro  = NULL,
         updated_at   = now()
   WHERE j.id = p_job_id
  RETURNING j.inbound_nfe_id, j.company_id, j.tipo
       INTO v_inbound, v_company, v_tipo;

  IF v_inbound IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.inbound_nfe
     SET manifestacao            = v_tipo,
         manifestacao_data       = COALESCE(p_registrada_em, now()),
         manifestacao_pendente   = NULL,
         manifestacao_pendente_em = NULL,
         manifestacao_erro       = NULL,
         updated_at              = now()
   WHERE id = v_inbound
     AND company_id = v_company;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_manifestacao_concluir(uuid, text, text, timestamptz) IS
  'Fecha o job de manifestacao e grava o FATO CONSUMADO em inbound_nfe.manifestacao, limpando o selo "enviando". Chamada tambem quando a SEFAZ responde cStat 573 (duplicidade), que e sucesso: o evento ja estava registrado. Unico caminho que escreve inbound_nfe.manifestacao.';

-- ============================================================================
-- 8) dfe_manifestacao_falhar — recusa definitiva x tropeço transitório
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_manifestacao_falhar(
  p_job_id         uuid,
  p_erro           text,
  p_permanente     boolean DEFAULT false,
  p_espera_minutos integer DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inbound uuid;
  v_company uuid;
  v_msg     text := left(COALESCE(NULLIF(btrim(p_erro), ''), 'Falha nao identificada.'), 500);
BEGIN
  UPDATE public.dfe_manifestacao_jobs j
     SET status       = CASE WHEN p_permanente THEN 'erro' ELSE 'pendente' END,
         bloqueado_em = NULL,
         concluido_em = CASE WHEN p_permanente THEN now() ELSE NULL END,
         proxima_tentativa_em = CASE
           WHEN p_permanente THEN j.proxima_tentativa_em
           ELSE now() + make_interval(mins => GREATEST(COALESCE(p_espera_minutos, 5), 1))
         END,
         ultimo_erro  = v_msg,
         updated_at   = now()
   WHERE j.id = p_job_id
  RETURNING j.inbound_nfe_id, j.company_id
       INTO v_inbound, v_company;

  IF v_inbound IS NULL THEN
    RETURN;
  END IF;

  IF p_permanente THEN
    -- Some o selo "enviando" e aparece o motivo. A nota volta a poder ser
    -- manifestada — quem decide tentar de novo é o usuário.
    UPDATE public.inbound_nfe
       SET manifestacao_pendente    = NULL,
           manifestacao_pendente_em = NULL,
           manifestacao_erro        = v_msg,
           updated_at               = now()
     WHERE id = v_inbound
       AND company_id = v_company;
  END IF;
  -- Falha TRANSITÓRIA mantém `manifestacao_pendente`: pro usuário continua
  -- "enviando", porque de fato continua. Piscar erro a cada retentativa e
  -- voltar pra "enviando" seria ruído sobre uma coisa que ainda vai dar certo.
END;
$fn$;

COMMENT ON FUNCTION public.dfe_manifestacao_falhar(uuid, text, boolean, integer) IS
  'Registra falha de um job de manifestacao. Permanente (recusa 422 da SEFAZ, certificado invalido, tentativas esgotadas): job vira erro, o selo "enviando" some da nota e o motivo aparece. Transitoria (503, timeout, rede): job volta pra fila com backoff e a nota CONTINUA em "enviando", porque continua mesmo — piscar erro a cada retentativa seria ruido.';

-- ============================================================================
-- 9) Privilégios das RPCs
-- ============================================================================
-- NENHUMA delas é chamada pelo cliente: todas passam por edge com service_role.
-- O Supabase concede EXECUTE a PUBLIC por default privilege em toda função nova
-- — esse furo se fecha na mão, sempre. Sem o REVOKE, um usuário autenticado
-- poderia chamar `dfe_sync_claim` direto do browser e queimar a cota horária de
-- qualquer CNPJ (as funções são SECURITY DEFINER e bypassam RLS).
-- ============================================================================
DO $privilegios$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
    'public.dfe_sync_claim(uuid, text, integer)',
    'public.dfe_sync_concluir(uuid, text, text, text, text, integer, integer, integer, integer)',
    'public.dfe_sync_falhar(uuid, text, text, text, text, integer)',
    'public.dfe_upsert_inbound_nfe(uuid, jsonb)',
    'public.dfe_enfileirar_manifestacao(uuid, uuid, text, text, uuid)',
    'public.dfe_manifestacao_claim(integer, integer)',
    'public.dfe_manifestacao_concluir(uuid, text, text, timestamptz)',
    'public.dfe_manifestacao_falhar(uuid, text, boolean, integer)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
  RAISE NOTICE '[notas destinadas 4/4] % RPC(s) fechadas pra anon/authenticated, abertas so pra service_role.',
    array_length(v_fns, 1);
END
$privilegios$;

-- ============================================================================
-- 10) admin_delete_company passa a conhecer as 4 tabelas novas
-- ============================================================================
-- Pendência levantada no plano (§Pendências abertas, item 1). A RPC enumera as
-- tabelas explicitamente e não conhece `inbound_nfe`, `inbound_nfse`,
-- `dfe_sync_state` nem `dfe_manifestacao_jobs`.
--
-- ⚠️ EXCLUIR EMPRESA NÃO ESTAVA QUEBRADO: as 4 têm ON DELETE CASCADE a partir de
-- `companies`. O motivo de entrarem na lista é OUTRO — `inbound_nfe` e
-- `inbound_nfse` apontam pra `suppliers` e `financial_transactions` com
-- ON DELETE SET NULL. Se elas só morressem no CASCADE final, cada DELETE
-- daquelas duas tabelas (que acontece ANTES, nas seções 3 e 6) varreria estas
-- pra zerar ponteiro de linha que morre logo em seguida. Daí a inserção ficar
-- ANTES da seção 3 (Compras), e não no fim.
--
-- O patch é feito sobre a DEFINIÇÃO VIVA (`pg_get_functiondef`) e não colando
-- 17KB de função aqui — mesmo padrão de 20260918100000_crm_multi_pipeline.sql.
-- Recriar a partir do arquivo antigo REVERTERIA o patch de crm_pipelines que
-- aquela migration aplicou, e qualquer outro feito por sessões paralelas.
-- ============================================================================
DO $patch_adc$
DECLARE
  v_def    text;
  -- Âncora SEM indentação de propósito: `pg_get_functiondef` devolve o corpo com
  -- o espaçamento de quem criou a função por último, e prender o patch a "dois
  -- espaços" faria ele quebrar no dia em que outra sessão recriar a RPC com
  -- formatação diferente. Como a substituição é `bloco || ancora`, os espaços
  -- que já existem antes da âncora passam a indentar a 1ª linha do bloco — daí
  -- ela nascer sem indentação e o bloco terminar com quebra + 2 espaços, pra
  -- devolver a indentação à linha da âncora.
  v_ancora text := 'DELETE FROM public.compra_cotacao_precos WHERE company_id = p_company_id;';
  v_bloco  text :=
    '-- ==================================================================='         || E'\n' ||
    '  -- 2b) NOTAS RECEBIDAS (DF-e) — antes de suppliers e financeiro'              || E'\n' ||
    '  --     As 4 tabelas tem ON DELETE CASCADE a partir de companies, entao'       || E'\n' ||
    '  --     excluir empresa ja funcionava. Elas vem AQUI, e nao no fim, porque'    || E'\n' ||
    '  --     inbound_nfe/inbound_nfse referenciam suppliers e'                      || E'\n' ||
    '  --     financial_transactions com ON DELETE SET NULL: apaga-las depois'       || E'\n' ||
    '  --     faria cada DELETE daquelas tabelas varrer estas pra zerar ponteiro'    || E'\n' ||
    '  --     de linha que morre em seguida.'                                        || E'\n' ||
    '  -- ==================================================================='       || E'\n' ||
    '  DELETE FROM public.dfe_manifestacao_jobs WHERE company_id = p_company_id;'    || E'\n' ||
    '  DELETE FROM public.inbound_nfe           WHERE company_id = p_company_id;'    || E'\n' ||
    '  DELETE FROM public.inbound_nfse          WHERE company_id = p_company_id;'    || E'\n' ||
    '  DELETE FROM public.dfe_sync_state        WHERE company_id = p_company_id;'    || E'\n' ||
    E'\n  ';
BEGIN
  IF to_regclass('public.inbound_nfe') IS NULL
     OR to_regclass('public.inbound_nfse') IS NULL
     OR to_regclass('public.dfe_sync_state') IS NULL
     OR to_regclass('public.dfe_manifestacao_jobs') IS NULL THEN
    RAISE EXCEPTION 'Tabelas de notas destinadas ausentes: rode as migrations 20260924160000..162000 antes desta.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_delete_company'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'admin_delete_company nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%inbound_nfe%' THEN
    RAISE NOTICE 'admin_delete_company ja limpa as tabelas de notas recebidas; nada a fazer';
  ELSIF position(v_ancora IN v_def) = 0 THEN
    RAISE EXCEPTION 'admin_delete_company mudou de forma: ancora nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    EXECUTE replace(v_def, v_ancora, v_bloco || v_ancora);
    RAISE NOTICE 'admin_delete_company patchada: passa a apagar inbound_nfe, inbound_nfse, dfe_sync_state e dfe_manifestacao_jobs';
  END IF;
END
$patch_adc$;

-- ============================================================================
-- 11) DECISÃO: `zerar_sistema` (reset_system_step) NÃO limpa estas tabelas
-- ============================================================================
-- Pendência do plano (§Pendências abertas, item 1): "é preciso decidir se
-- `zerar_sistema` também as limpa". Decidido: **NÃO**, e nenhuma linha de
-- `reset_system_step` é alterada. Os quatro motivos, do mais forte ao mais fraco:
--
-- 1. ZERAR O CURSOR SERIA UM TIRO NO PÉ, E O PIOR POSSÍVEL.
--    Apagar a linha de `dfe_sync_state` faz a próxima rodada começar do NSU 0 e
--    reler a fila inteira. Fora o reprocessamento, a SEFAZ interpreta o pedido
--    de NSU já servido como Consumo Indevido (cStat 656) e BLOQUEIA O CNPJ POR
--    1 HORA. O cliente que acabou de zerar o sistema ficaria sem ver nota
--    nenhuma — e sem entender por quê. É exatamente o acidente que toda a
--    trava anti-656 desta entrega existe pra evitar.
--
-- 2. NOTA FISCAL RECEBIDA NÃO É DADO OPERACIONAL DO CLIENTE.
--    É documento que TERCEIROS emitiram contra o CNPJ dele e que o governo
--    registrou. "Zerar o sistema" é recomeçar a própria operação (OS, clientes,
--    orçamentos), não apagar arquivo fiscal com guarda legal de 5 anos.
--    PRECEDENTE NO PRÓPRIO CÓDIGO: `reset_system_step` já não apaga
--    `nfse_emissions` nem `nfse_events` — as notas EMITIDAS sobrevivem ao
--    reset. Recebidas seguem a mesma régua; o contrário seria incoerente.
--
-- 3. MANIFESTAÇÃO É IRREVERSÍVEL PERANTE A RECEITA.
--    Apagar `dfe_manifestacao_jobs` cancelaria em silêncio uma transmissão que
--    o usuário pediu, ou destruiria o registro de um evento que JÁ existe na
--    SEFAZ e não se desfaz. O job é prova, não rascunho.
--
-- 4. O QUE PRECISAVA SE SOLTAR JÁ SE SOLTA SOZINHO.
--    O vínculo com o financeiro é `ON DELETE SET NULL`. O step
--    `financial_movements` apaga `financial_transactions`, e com isso o selo
--    "Lançada" cai sozinho e o botão de lançar despesa reaparece — que é
--    exatamente o comportamento desejado depois de um reset. Zero código.
--
-- Se um dia alguém quiser mesmo limpar o acervo de notas recebidas, isso é uma
-- AÇÃO PRÓPRIA E EXPLÍCITA ("apagar notas recebidas"), com confirmação separada
-- — e AINDA ASSIM preservando `dfe_sync_state`, pelo motivo 1.
-- ============================================================================

-- ============================================================================
-- 12) Agendamento (pg_cron + pg_net + Vault)
-- ============================================================================
-- Mesmo padrão de extend-contract-billing-daily / extend-recurring-tasks-daily:
-- o segredo vem do Vault, nunca chumbado na migration.
--
-- ⚠️ LIGAR ISTO NÃO FALA COM O GOVERNO SOZINHO. As duas edges só agem sobre
-- empresas com `dfe_nfe_ativo` / `dfe_nfse_ativo = true`, e as duas colunas
-- nascem `false` pra todo mundo (migration 20260924160000). Enquanto nenhum
-- cliente ligar o opt-in, os dois jobs rodam, não acham nada e terminam.
--
-- Passo CURTO nos dois de propósito:
--   * `dfe-sync-notas` a cada 10 min — a trava real é por empresa
--     (`proxima_consulta_em`), então varrer de 10 em 10 min só significa "pegar
--     quem já venceu a janela". Quem não venceu é recusado no claim, sem custo
--     e sem chamada ao governo. Passo longo faria uma empresa que venceu a
--     janela às 10:01 esperar até a hora seguinte à toa.
--   * `dfe-manifestar-worker` a cada 2 min — manifestação é ação que o usuário
--     acabou de pedir e está olhando a tela esperando. Rodada com fila vazia
--     custa um SELECT.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Nome NEUTRO de propósito: a mesma edge cobre NF-e e NFS-e recebidas
    -- (a versão inicial chamava 'dfe-sync-nfe'; a 20260924191000 renomeia quem
    -- já tiver o nome antigo).
    PERFORM cron.unschedule('dfe-sync-notas')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dfe-sync-notas');

    PERFORM cron.schedule(
      'dfe-sync-notas',
      '*/10 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/dfe-sync-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    PERFORM cron.unschedule('dfe-manifestar-worker')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dfe-manifestar-worker');

    PERFORM cron.schedule(
      'dfe-manifestar-worker',
      '*/2 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/dfe-manifestar-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    RAISE NOTICE 'cron dfe-sync-notas (*/10) e dfe-manifestar-worker (*/2) agendados';
  ELSE
    RAISE NOTICE 'pg_cron ausente — RPCs criadas, agendamento pulado';
  END IF;
END
$cron$;

-- ============================================================================
-- 13) Guarda
-- ============================================================================
-- Asserções = invariantes permanentes (a migration é re-executável). Contagem é
-- só relatório.
DO $guard$
DECLARE
  v_rpcs   integer;
  v_soltas integer;
  v_adc    boolean;
  v_optin  integer;
BEGIN
  -- As 8 RPCs existem?
  SELECT count(*) INTO v_rpcs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'dfe_sync_claim', 'dfe_sync_concluir', 'dfe_sync_falhar',
       'dfe_upsert_inbound_nfe', 'dfe_enfileirar_manifestacao',
       'dfe_manifestacao_claim', 'dfe_manifestacao_concluir', 'dfe_manifestacao_falhar'
     );
  IF v_rpcs <> 8 THEN
    RAISE EXCEPTION 'Esperadas 8 RPCs de DF-e, encontradas %.', v_rpcs;
  END IF;

  -- Nenhuma delas pode estar aberta a anon/authenticated: são SECURITY DEFINER
  -- e bypassam RLS. Aberta = qualquer usuário queima a cota horária alheia.
  --
  -- ⚠️ A lista é NOMINAL, não `LIKE 'dfe_%'`. Um curinga também pegaria
  -- `dfe_sync_state_nsu_nao_regride`, que é função de GATILHO: ela nasce com
  -- EXECUTE pra PUBLIC como toda função nova, e isso não é buraco nenhum
  -- (função que retorna `trigger` não é invocável por SQL nem exposta pelo
  -- PostgREST). Com o curinga, esta guarda derrubaria a migration inteira por
  -- causa de um falso positivo.
  SELECT count(*) INTO v_soltas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'dfe_sync_claim', 'dfe_sync_concluir', 'dfe_sync_falhar',
       'dfe_upsert_inbound_nfe', 'dfe_enfileirar_manifestacao',
       'dfe_manifestacao_claim', 'dfe_manifestacao_concluir', 'dfe_manifestacao_falhar'
     )
     AND (
       has_function_privilege('anon',          p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );
  IF v_soltas <> 0 THEN
    RAISE EXCEPTION 'Há % RPC(s) de DF-e executaveis por anon/authenticated. Fechar antes de seguir.', v_soltas;
  END IF;

  -- admin_delete_company conhece as tabelas novas?
  SELECT (pg_get_functiondef(p.oid) LIKE '%inbound_nfe%') INTO v_adc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_delete_company'
   LIMIT 1;
  IF v_adc IS NOT NULL AND v_adc IS FALSE THEN
    RAISE EXCEPTION 'admin_delete_company nao ficou conhecendo inbound_nfe.';
  END IF;

  SELECT count(*) FILTER (WHERE dfe_nfe_ativo) INTO v_optin
    FROM public.company_fiscal_settings;

  RAISE NOTICE '[notas destinadas 4/4] 8 RPCs criadas e fechadas; admin_delete_company atualizada; zerar_sistema NAO alterado (decisao documentada); % empresa(s) com opt-in de NF-e destinada ligado.',
    v_optin;
END
$guard$;
