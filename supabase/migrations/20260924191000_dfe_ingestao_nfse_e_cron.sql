-- ============================================================================
-- Notas destinadas — INGESTÃO DE NFS-e RECEBIDA (documentos + eventos)
-- ============================================================================
-- Depende de: 20260924161000 (inbound_nfse), 20260924170000 (RPCs de DF-e).
--
-- Par de `dfe_upsert_inbound_nfe`, para o outro tipo. Existe porque o caminho
-- NFS-e da edge `dfe-sync` passou a ser implementado de verdade (a rota
-- POST /v1/dfe/nfse/distribuicao do `dominex-fiscal` existe agora).
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ POR QUE ISTO NÃO É UM `.upsert()` DO POSTGREST                            │
-- │                                                                           │
-- │ Três exigências que o upsert do PostgREST não sabe expressar:             │
-- │                                                                           │
-- │ 1. EVENTO SEM NOTA NÃO PODE CRIAR LINHA. O cancelamento de uma NFS-e      │
-- │    chega pelo feed em NSU próprio e PODE CHEGAR MESES DEPOIS da nota — ou │
-- │    antes dela, se a empresa ligou o opt-in no meio. Um upsert INSERIRIA   │
-- │    uma nota fantasma "cancelada" sem valor, sem prestador e sem XML, que  │
-- │    apareceria na tela do cliente como documento fiscal. Aqui evento é     │
-- │    UPDATE puro: não casou, é ignorado em silêncio (e só contado).         │
-- │                                                                           │
-- │ 2. MERGE POR COLUNA. `COALESCE(EXCLUDED.x, t.x)` em tudo: o mesmo         │
-- │    documento reaparece no feed e um campo ausente na segunda passagem não │
-- │    pode apagar o que já estava gravado. O upsert do PostgREST sobrescreve.│
-- │                                                                           │
-- │ 3. `iss_retido` TRI-ESTADO. NULL ali significa "o governo não informou",  │
-- │    NÃO "não houve retenção" — e a diferença é dinheiro: tratar como false │
-- │    subestima o que o cliente ainda deve ao prestador. O COALESCE preserva │
-- │    o NULL na entrada e impede que um NULL posterior apague um true já     │
-- │    conhecido.                                                            │
-- └───────────────────────────────────────────────────────────────────────────┘
-- ============================================================================

-- ============================================================================
-- 1) dfe_upsert_inbound_nfse — documentos e eventos, na MESMA transação
-- ============================================================================
-- Os dois andam juntos de propósito: um lote pode trazer a nota E o evento que
-- a cancela. Gravar em duas chamadas deixaria uma janela em que a tela mostra
-- como válida uma nota que o governo já cancelou.
--
-- A entrada chega em SNAKE_CASE, já normalizada pela edge (mesma régua de
-- `dfe_upsert_inbound_nfe`): a tradução camelCase→coluna é da borda, o SQL fala
-- o vocabulário da tabela.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dfe_upsert_inbound_nfse(
  p_company_id uuid,
  p_documentos jsonb,
  p_eventos    jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  novas             integer,
  total             integer,
  eventos_aplicados integer,
  eventos_ignorados integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_novas    integer := 0;
  v_total    integer := 0;
  v_ev_ok    integer := 0;
  v_ev_total integer := 0;
BEGIN
  IF p_company_id IS NULL THEN
    novas := 0; total := 0; eventos_aplicados := 0; eventos_ignorados := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ---- Documentos ---------------------------------------------------------
  IF p_documentos IS NOT NULL AND jsonb_typeof(p_documentos) = 'array' THEN
    WITH entrada AS (
      SELECT * FROM jsonb_to_recordset(p_documentos) AS d(
        chave_acesso                text,
        numero                      text,
        serie                       text,
        codigo_verificacao          text,
        municipio_incidencia_ibge   text,
        -- ⚠️ DATAS ENTRAM COMO TEXTO, DE PROPÓSITO. Declarar `timestamptz` aqui
        -- faria o CAST acontecer na varredura do jsonb, e um único valor
        -- malformado vindo do XML do governo abortaria o lote INTEIRO. Como a
        -- RPC falhando impede o cursor de avançar, a rodada seguinte pediria a
        -- MESMA página e falharia igual: pílula envenenada, de hora em hora,
        -- para sempre. Com texto + regex, o valor ruim vira NULL e as outras
        -- notas do lote entram.
        data_emissao                text,
        competencia                 text,
        valor_servico               numeric,
        valor_liquido               numeric,
        valor_iss                   numeric,
        iss_retido                  boolean,
        prestador_documento         text,
        prestador_nome              text,
        prestador_im                text,
        prestador_municipio_ibge    text,
        tomador_documento           text,
        tomador_nome                text,
        codigo_tributacao_nacional  text,
        codigo_tributacao_municipal text,
        discriminacao               text,
        situacao                    text,
        xml_content                 text,
        resumo                      boolean,
        origem_ref                  text,
        nsu                         text
      )
    ),
    -- Saneamento ANTES do INSERT. Uma CHECK violada aqui abortaria o lote
    -- INTEIRO depois de o cursor já ter andado do lado do governo — e a rodada
    -- seguinte não traria esses NSU de volta. Documento malformado é
    -- DESCARTADO (uma linha), nunca derruba os outros.
    saneado AS (
      SELECT
        CASE WHEN e.chave_acesso ~ '^[0-9]{50}$' THEN e.chave_acesso END AS chave_acesso,
        NULLIF(btrim(e.numero), '')                     AS numero,
        NULLIF(btrim(e.serie), '')                      AS serie,
        NULLIF(btrim(e.codigo_verificacao), '')         AS codigo_verificacao,
        NULLIF(btrim(e.municipio_incidencia_ibge), '')  AS municipio_incidencia_ibge,
        -- Só o que TEM FORMA de data ISO é convertido; o resto vira NULL
        -- ("não sabemos quando"), que é honesto e não derruba o lote.
        CASE
          WHEN e.data_emissao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}.*)?$'
            THEN e.data_emissao::timestamptz
        END AS data_emissao,
        CASE
          WHEN e.competencia ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN e.competencia::date
          -- dCompet as vezes chega so com ano-mes. Primeiro dia do mes e a
          -- leitura certa: competencia e MES, nao dia.
          WHEN e.competencia ~ '^[0-9]{4}-[0-9]{2}$' THEN (e.competencia || '-01')::date
        END AS competencia,
        e.valor_servico, e.valor_liquido, e.valor_iss,
        e.iss_retido,
        NULLIF(btrim(e.prestador_documento), '')        AS prestador_documento,
        NULLIF(btrim(e.prestador_nome), '')             AS prestador_nome,
        NULLIF(btrim(e.prestador_im), '')               AS prestador_im,
        NULLIF(btrim(e.prestador_municipio_ibge), '')   AS prestador_municipio_ibge,
        NULLIF(btrim(e.tomador_documento), '')          AS tomador_documento,
        NULLIF(btrim(e.tomador_nome), '')               AS tomador_nome,
        NULLIF(btrim(e.codigo_tributacao_nacional), '') AS codigo_tributacao_nacional,
        NULLIF(btrim(e.codigo_tributacao_municipal), '') AS codigo_tributacao_municipal,
        NULLIF(btrim(e.discriminacao), '')              AS discriminacao,
        CASE
          WHEN btrim(lower(e.situacao)) IN ('autorizada', 'cancelada', 'substituida')
            THEN btrim(lower(e.situacao))
          ELSE 'autorizada'
        END                                             AS situacao,
        NULLIF(btrim(e.xml_content), '')                AS xml_content,
        NULLIF(btrim(e.origem_ref), '')                 AS origem_ref,
        CASE WHEN e.nsu ~ '^[0-9]{1,15}$' THEN e.nsu END AS nsu
        FROM entrada e
    ),
    -- ⚠️ ESPELHO DA COLUNA GERADA `inbound_nfse.chave_natural`. Se aquela
    -- expressão mudar, ESTA TEM QUE MUDAR JUNTO — senão a deduplicação do lote
    -- deixa de casar com o alvo do ON CONFLICT e o comando estoura com
    -- "cannot affect row a second time".
    identificado AS (
      SELECT s.*,
             COALESCE(
               NULLIF(btrim(s.chave_acesso), ''),
               'MUN:' || COALESCE(NULLIF(btrim(s.municipio_incidencia_ibge), ''), '?') ||
               '|PRE:' || COALESCE(NULLIF(btrim(s.prestador_documento), ''), '?') ||
               '|SER:' || COALESCE(NULLIF(btrim(s.serie), ''), '?') ||
               '|NUM:' || COALESCE(NULLIF(btrim(s.numero), ''), '?')
             ) AS chave_natural
        FROM saneado s
       -- Mesma condição da CONSTRAINT inbound_nfse_identidade_check: sem
       -- identidade, duas notas diferentes virariam a MESMA chave_natural
       -- ('MUN:?|PRE:?|SER:?|NUM:?') e uma sobrescreveria a outra.
       WHERE s.chave_acesso IS NOT NULL
          OR (s.prestador_documento IS NOT NULL AND s.numero IS NOT NULL)
    ),
    -- Entre duplicatas do MESMO lote fica a mais completa (a que tem XML).
    unicos AS (
      SELECT DISTINCT ON (i.chave_natural) i.*
        FROM identificado i
       ORDER BY i.chave_natural, (i.xml_content IS NOT NULL) DESC, i.nsu DESC NULLS LAST
    ),
    gravados AS (
      INSERT INTO public.inbound_nfse AS t (
        company_id, origem, origem_ref, nsu,
        chave_acesso, numero, serie, codigo_verificacao, municipio_incidencia_ibge,
        data_emissao, competencia, valor_servico, valor_liquido, valor_iss, iss_retido,
        prestador_documento, prestador_nome, prestador_im, prestador_municipio_ibge,
        tomador_documento, tomador_nome,
        codigo_tributacao_nacional, codigo_tributacao_municipal, discriminacao,
        situacao, xml_content, resumo
      )
      SELECT
        p_company_id, 'dfe', u.origem_ref, u.nsu,
        u.chave_acesso, u.numero, u.serie, u.codigo_verificacao, u.municipio_incidencia_ibge,
        u.data_emissao, u.competencia, u.valor_servico, u.valor_liquido, u.valor_iss,
        -- Tri-estado preservado: NULL entra como NULL ("não informado").
        u.iss_retido,
        u.prestador_documento, u.prestador_nome, u.prestador_im, u.prestador_municipio_ibge,
        u.tomador_documento, u.tomador_nome,
        u.codigo_tributacao_nacional, u.codigo_tributacao_municipal, u.discriminacao,
        u.situacao, u.xml_content,
        -- `resumo` é DERIVADO, nunca copiado do fio: se o XML veio, não é resumo.
        COALESCE(u.resumo, u.xml_content IS NULL)
        FROM unicos u
      ON CONFLICT (company_id, chave_natural) DO UPDATE SET
        origem_ref                  = COALESCE(EXCLUDED.origem_ref,                  t.origem_ref),
        nsu                         = COALESCE(EXCLUDED.nsu,                         t.nsu),
        chave_acesso                = COALESCE(EXCLUDED.chave_acesso,                t.chave_acesso),
        numero                      = COALESCE(EXCLUDED.numero,                      t.numero),
        serie                       = COALESCE(EXCLUDED.serie,                       t.serie),
        codigo_verificacao          = COALESCE(EXCLUDED.codigo_verificacao,          t.codigo_verificacao),
        municipio_incidencia_ibge   = COALESCE(EXCLUDED.municipio_incidencia_ibge,   t.municipio_incidencia_ibge),
        data_emissao                = COALESCE(EXCLUDED.data_emissao,                t.data_emissao),
        competencia                 = COALESCE(EXCLUDED.competencia,                 t.competencia),
        valor_servico               = COALESCE(EXCLUDED.valor_servico,               t.valor_servico),
        valor_liquido               = COALESCE(EXCLUDED.valor_liquido,               t.valor_liquido),
        valor_iss                   = COALESCE(EXCLUDED.valor_iss,                   t.valor_iss),
        -- ⚠️ NÃO é `EXCLUDED.iss_retido` puro: um lote posterior sem o campo
        -- apagaria a retenção já conhecida e o cliente pagaria o prestador a
        -- mais. "Não informado" nunca sobrescreve "informado".
        iss_retido                  = COALESCE(EXCLUDED.iss_retido,                  t.iss_retido),
        prestador_documento         = COALESCE(EXCLUDED.prestador_documento,         t.prestador_documento),
        prestador_nome              = COALESCE(EXCLUDED.prestador_nome,              t.prestador_nome),
        prestador_im                = COALESCE(EXCLUDED.prestador_im,                t.prestador_im),
        prestador_municipio_ibge    = COALESCE(EXCLUDED.prestador_municipio_ibge,    t.prestador_municipio_ibge),
        tomador_documento           = COALESCE(EXCLUDED.tomador_documento,           t.tomador_documento),
        tomador_nome                = COALESCE(EXCLUDED.tomador_nome,                t.tomador_nome),
        codigo_tributacao_nacional  = COALESCE(EXCLUDED.codigo_tributacao_nacional,  t.codigo_tributacao_nacional),
        codigo_tributacao_municipal = COALESCE(EXCLUDED.codigo_tributacao_municipal, t.codigo_tributacao_municipal),
        discriminacao               = COALESCE(EXCLUDED.discriminacao,               t.discriminacao),
        -- Cancelada/substituída são TERMINAIS. O feed reapresenta a nota como
        -- 'autorizada' (é o default da coluna, e o documento original não muda),
        -- e aceitar isso RESSUSCITARIA uma nota que o governo já derrubou.
        situacao                    = CASE
          WHEN t.situacao IN ('cancelada', 'substituida') THEN t.situacao
          ELSE EXCLUDED.situacao
        END,
        xml_content                 = COALESCE(EXCLUDED.xml_content,                 t.xml_content),
        resumo                      = (COALESCE(EXCLUDED.xml_content, t.xml_content) IS NULL),
        updated_at                  = now()
      -- xmax = 0 distingue INSERT de UPDATE: é o que faz o "N notas novas" da
      -- tela ser verdade em vez de contar o lote inteiro.
      RETURNING (xmax = 0) AS inserida
    )
    SELECT COALESCE(count(*) FILTER (WHERE g.inserida), 0)::integer,
           COALESCE(count(*), 0)::integer
      INTO v_novas, v_total
      FROM gravados g;
  END IF;

  -- ---- Eventos (cancelamento / substituição) ------------------------------
  -- ⚠️ UPDATE PURO, SEM INSERT. Ver o motivo 1 do cabeçalho: evento cuja nota
  -- não está no acervo é IGNORADO EM SILÊNCIO. Não é erro, não é aviso — é o
  -- caso normal de quem ligou o opt-in depois da nota ter circulado.
  IF p_eventos IS NOT NULL AND jsonb_typeof(p_eventos) = 'array' THEN
    v_ev_total := jsonb_array_length(p_eventos);

    WITH entrada AS (
      SELECT * FROM jsonb_to_recordset(p_eventos) AS e(
        chave_acesso      text,
        situacao          text,
        -- Texto pelo mesmo motivo das datas do documento: data malformada num
        -- evento não pode derrubar o cancelamento dos outros.
        data_cancelamento text,
        chave_substituta  text
      )
    ),
    valido AS (
      SELECT DISTINCT ON (e.chave_acesso)
             e.chave_acesso,
             btrim(lower(e.situacao)) AS situacao,
             CASE
               WHEN e.data_cancelamento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}.*)?$'
                 THEN e.data_cancelamento::timestamptz
             END AS data_cancelamento,
             CASE WHEN e.chave_substituta ~ '^[0-9]{50}$' THEN e.chave_substituta END AS chave_substituta
        FROM entrada e
       WHERE e.chave_acesso ~ '^[0-9]{50}$'
         -- Só evento que MUDA A SITUAÇÃO entra. Qualquer outro tipo que o feed
         -- traga é ruído pra esta tabela.
         AND btrim(lower(e.situacao)) IN ('cancelada', 'substituida')
       ORDER BY e.chave_acesso, e.data_cancelamento DESC NULLS LAST
    ),
    aplicados AS (
      UPDATE public.inbound_nfse t
         SET situacao          = v.situacao,
             data_cancelamento = COALESCE(v.data_cancelamento, t.data_cancelamento, now()),
             chave_substituta  = COALESCE(v.chave_substituta, t.chave_substituta),
             updated_at        = now()
        FROM valido v
       WHERE t.company_id    = p_company_id
         -- Casa por `chave_natural` (e não por `chave_acesso`) porque é ela que
         -- tem o índice único de (company_id, chave_natural) — e quando a nota
         -- veio do ADN as duas são o mesmo valor por construção.
         AND t.chave_natural = v.chave_acesso
      RETURNING 1
    )
    SELECT COALESCE(count(*), 0)::integer INTO v_ev_ok FROM aplicados;
  END IF;

  novas             := COALESCE(v_novas, 0);
  total             := COALESCE(v_total, 0);
  eventos_aplicados := COALESCE(v_ev_ok, 0);
  eventos_ignorados := GREATEST(COALESCE(v_ev_total, 0) - COALESCE(v_ev_ok, 0), 0);
  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_upsert_inbound_nfse(uuid, jsonb, jsonb) IS
  'Ingestao idempotente de NFS-e RECEBIDAS (servico tomado) vindas da distribuicao do Ambiente de Dados Nacional: upsert por (company_id, chave_natural) + aplicacao de eventos, na MESMA transacao. Tres regras que um upsert comum nao expressa: (1) EVENTO SEM NOTA NUNCA CRIA LINHA — cancelamento chega em NSU proprio e pode chegar meses depois; nao casou, e ignorado em silencio; (2) merge por coluna com COALESCE, porque campo ausente numa segunda passagem do feed nao pode apagar o que ja estava gravado; (3) iss_retido e TRI-ESTADO — NULL e "nao informado", nao false, e nunca sobrescreve um valor ja conhecido. situacao cancelada/substituida e TERMINAL: o feed reapresenta a nota como autorizada e aceitar isso a ressuscitaria. Devolve (novas, total, eventos_aplicados, eventos_ignorados).';

-- ============================================================================
-- 2) Privilégios — mesma régua das outras 8 RPCs de DF-e
-- ============================================================================
-- SECURITY DEFINER bypassa RLS e a função recebe `p_company_id` por parâmetro:
-- aberta a `authenticated`, qualquer usuário gravaria nota no acervo de qualquer
-- empresa. O Supabase concede EXECUTE a PUBLIC por default privilege em toda
-- função nova — o furo se fecha na mão, sempre.
REVOKE ALL ON FUNCTION public.dfe_upsert_inbound_nfse(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dfe_upsert_inbound_nfse(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dfe_upsert_inbound_nfse(uuid, jsonb, jsonb) TO service_role;

-- ============================================================================
-- 3) O cron passa a se chamar pelo que faz: as DUAS filas
-- ============================================================================
-- A 20260924170000 agendou `dfe-sync-nfe` porque a edge só cobria NF-e. Agora a
-- MESMA edge (`dfe-sync-cron`) itera os dois opt-ins na mesma rodada, sob o
-- MESMO teto de chamadas ao governo. O nome antigo viraria a próxima mentira de
-- schema — mesma razão da migration 20260924190000.
--
-- `cron.unschedule` dos DOIS nomes antes de agendar: sem isso, um banco que já
-- tenha o nome antigo ficaria com DOIS jobs batendo na mesma edge a cada 10 min,
-- dobrando a pressão sobre o governo.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dfe-sync-nfe')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dfe-sync-nfe');
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

    RAISE NOTICE 'cron dfe-sync-notas (*/10) agendado; dfe-sync-nfe removido se existia';
  ELSE
    RAISE NOTICE 'pg_cron ausente — RPC criada, agendamento pulado';
  END IF;
END
$cron$;

-- ============================================================================
-- 4) Guarda
-- ============================================================================
-- Asserções = invariantes permanentes (migration re-executável). O resto é
-- relatório.
DO $guard$
DECLARE
  v_fn      integer;
  v_solta   integer;
  v_jobs    integer;
  v_notas   integer;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dfe_upsert_inbound_nfse';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'dfe_upsert_inbound_nfse nao foi criada (encontradas %).', v_fn;
  END IF;

  SELECT count(*) INTO v_solta
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dfe_upsert_inbound_nfse'
     AND (
       has_function_privilege('anon',          p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );
  IF v_solta <> 0 THEN
    RAISE EXCEPTION 'dfe_upsert_inbound_nfse executavel por anon/authenticated: grava nota no acervo de qualquer empresa.';
  END IF;

  -- Dois jobs batendo na mesma edge seria o dobro de chamadas ao governo.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT count(*) INTO v_jobs
      FROM cron.job WHERE jobname IN ('dfe-sync-nfe', 'dfe-sync-notas');
    IF v_jobs > 1 THEN
      RAISE EXCEPTION 'Ha % jobs de sync de notas destinadas agendados; deveria haver 1.', v_jobs;
    END IF;
  END IF;

  SELECT count(*) INTO v_notas FROM public.inbound_nfse;
  RAISE NOTICE '[notas destinadas] ingestao de NFS-e recebida pronta (dfe_upsert_inbound_nfse); acervo atual: % nota(s) de servico tomado.', v_notas;
END
$guard$;
