-- RPC de consulta do Guia Técnico pelas nossas LLMs (o agente de WhatsApp do
-- suporte hoje, o assistente dentro do produto depois) e pela busca da página
-- pública /guia-tecnico. Recebe a pergunta como o cliente escreveu e devolve os
-- N chunks mais relevantes, com rotas e prints, pra LLM montar a resposta sem
-- receber o manual inteiro no prompt.
--
-- Portado do EcoSistema. Os números citados abaixo (df de cada palavra) são as
-- medições feitas lá, sobre um corpus de 813 chunks — é de onde vieram os pesos
-- e as constantes. A LÓGICA é a mesma; o que muda por corpus é só o valor
-- absoluto de df, e todo corte aqui é RELATIVO (fração de v_total), justamente
-- pra sobreviver a essa troca.
--
-- Sem pgvector neste projeto: é tsvector/tsquery `portuguese` sobre a coluna
-- gerada `guia_chunks.busca`. Três coisas que só ficaram óbvias medindo contra
-- o corpus real:
--
-- 1. LIMPEZA DE MULETA. O acento sai ANTES de montar a tsquery (o cliente
--    digita "manutencao"), e isso RESSUSCITA stopwords do português que na
--    lista oficial só existem acentuadas: "não", "está", "já", "só". "nao" vira
--    termo de busca. Somado ao falar de WhatsApp ("pra", "tá", "faço",
--    "consigo"), destruía a busca: "como faço pra reabrir a OS" virava
--    'fac & pra & reabr & os' e casava com UM capítulo aleatório que por acaso
--    tinha "faço" e "pra". Limpo, vira 'reabr & os'. A limpeza é só do lado da
--    PERGUNTA — o corpus fica intacto.
--
-- 2. IDF NA MÃO. `ts_rank_cd` não tem noção de raridade: uma palavra presente
--    em 30% do corpus pesa igual a uma que aparece em 1%. No EcoSistema,
--    "cliente" (224 dos 813 chunks) pesava igual a "parcelar" (8 chunks) e o
--    resultado entregava o capítulo genérico escondendo o chunk específico.
--    Aqui cada termo é rankeado separado e a média é ponderada por
--    ln(1 + N/df): o termo raro é o que decide, que é o que o usuário quer.
--    Custa uma contagem por termo (~50ms no corpus inteiro).
--
-- 3. AND E OR JUNTOS, ORDENADOS PELO MESMO SCORE. O AND (websearch) é mais
--    preciso, mas pergunta comprida de WhatsApp quase nunca casa com tudo — e
--    pior, às vezes casa por coincidência num capítulo longo e ESCONDE o chunk
--    certo, que só perdeu por uma palavra. Então o conjunto candidato é o OR
--    (nunca volta vazio) e quem casa com o AND leva bônus, competindo no mesmo
--    ranking em vez de bloquear a lista.
--
-- Bônus extras: `problema` e `faq` são os chunks que respondem dúvida direta;
-- e sobreposição com o array `chaves` do chunk.

CREATE OR REPLACE FUNCTION public.buscar_guia(
  p_consulta text,
  p_limite   integer DEFAULT 6,
  p_tipos    text[]  DEFAULT NULL,
  p_secao    text    DEFAULT NULL
)
RETURNS TABLE (
  id           text,
  secao        text,
  secao_titulo text,
  tipo         text,
  titulo       text,
  capitulo     text,
  rotas        text[],
  prints       text[],
  texto        text,
  score        real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- muleta de conversa e stopword acentuada que sobrevive ao unaccent.
  -- Não tem palavra do domínio aqui: nada de OS, cliente, equipamento, PMOC.
  c_ruido constant text :=
       '\m(nao|sim|como|cade|ja|so|ai|ne|ta|to|tao|pra|pro|para|por|faco|faz|fazer|fazendo|'
    || 'feito|consigo|consegue|conseguir|consegui|quer|quero|queria|preciso|precisa|pode|'
    || 'posso|poderia|gostaria|gente|cara|favor|coisa|tudo|nada|aqui|agora|hoje|ontem|'
    || 'alguem|algum|alguma|qual|quais|quem|meu|minha|meus|minhas|nosso|nossa|isso|esse|'
    || 'essa|este|esta|dar|deu|vai|foi|fica|ficou|acontece|acontecendo|jeito|forma|maneira|'
    || 'voce|voces|ola|bom|dia|tarde|noite)\M';

  c_max_termos constant integer := 12;  -- teto de custo pro desabafo comprido

  v_bruta    text := lower(public.immutable_unaccent(coalesce(p_consulta, '')));
  v_limpa    text;
  v_limite   integer := least(greatest(coalesce(p_limite, 6), 1), 30);
  v_secao    text := nullif(upper(btrim(coalesce(p_secao, ''))), '');
  v_termos   text[];      -- palavras cruas, pro bônus de `chaves`
  v_tsqs     tsquery[];   -- uma tsquery por termo
  v_idfs     float8[];    -- o peso de cada termo
  v_and      tsquery;
  v_or       tsquery;
  v_total    bigint;
BEGIN
  IF btrim(v_bruta) = '' THEN
    RETURN;
  END IF;

  -- se a pergunta for SÓ muleta ("como faço?"), fica com a original
  v_limpa := nullif(btrim(regexp_replace(regexp_replace(v_bruta, c_ruido, ' ', 'g'), '\s+', ' ', 'g')), '');
  v_limpa := coalesce(v_limpa, v_bruta);

  v_and := websearch_to_tsquery('portuguese', v_limpa);
  -- mesmos lexemas ligados por OR: é o conjunto candidato, pra pergunta
  -- comprida não voltar vazia
  v_or  := nullif(replace(plainto_tsquery('portuguese', v_limpa)::text, '&', '|'), '')::tsquery;

  IF (v_and IS NULL OR v_and::text = '') AND (v_or IS NULL OR v_or::text = '') THEN
    RETURN;  -- pergunta só de stopword
  END IF;

  SELECT count(*) INTO v_total FROM public.guia_chunks;

  -- palavras da pergunta (as `chaves` do chunk já vêm minúsculas e sem acento)
  SELECT coalesce(array_agg(t), '{}'::text[])
    INTO v_termos
    FROM (
      SELECT DISTINCT t FROM regexp_split_to_table(v_limpa, '[^a-z0-9\-]+') AS t
       WHERE length(t) >= 3
       LIMIT c_max_termos
    ) x;

  -- peso de cada termo: quanto mais raro no guia, mais ele decide o resultado
  SELECT coalesce(array_agg(tsq), '{}'::tsquery[]),
         coalesce(array_agg(ln(1 + v_total::float8 / greatest(df, 1))), '{}'::float8[])
    INTO v_tsqs, v_idfs
    FROM (
      SELECT tsq,
             (SELECT count(*) FROM public.guia_chunks g WHERE g.busca @@ tsq) AS df
      FROM (
        SELECT plainto_tsquery('portuguese', t) AS tsq FROM unnest(v_termos) AS t
      ) a
      WHERE tsq IS NOT NULL AND tsq::text <> ''
    ) b
   WHERE df > 0;

  -- nenhum termo isolado casou (só a frase inteira casa): rankeia pelo OR/AND
  IF v_tsqs IS NULL OR cardinality(v_tsqs) = 0 THEN
    v_tsqs := ARRAY[coalesce(v_or, v_and)];
    v_idfs := ARRAY[1.0::float8];
  END IF;

  RETURN QUERY
  WITH termos AS MATERIALIZED (
    SELECT t.tsq, i.idf
    FROM unnest(v_tsqs) WITH ORDINALITY AS t(tsq, n)
    JOIN unnest(v_idfs) WITH ORDINALITY AS i(idf, n) USING (n)
  ),
  candidatos AS MATERIALIZED (
    SELECT g.id, g.secao, g.secao_titulo, g.tipo, g.titulo,
           g.capitulo, g.rotas, g.prints, g.texto, g.busca, g.chaves
    FROM public.guia_chunks g
    WHERE (
            (v_or  IS NOT NULL AND v_or::text  <> '' AND g.busca @@ v_or)
         OR (v_and IS NOT NULL AND v_and::text <> '' AND g.busca @@ v_and)
          )
      AND (p_tipos IS NULL OR g.tipo = ANY (p_tipos))
      AND (v_secao IS NULL OR g.secao = v_secao)
  )
  SELECT c.id, c.secao, c.secao_titulo, c.tipo, c.titulo,
         c.capitulo, c.rotas, c.prints, c.texto,
         (
           -- média dos ranks por termo, ponderada pela raridade do termo.
           -- 32 = rank/(rank+1): cada parcela fica em 0..1.
           sum(t.idf * ts_rank_cd(c.busca, t.tsq, 32)) / sum(t.idf)
           -- problema e faq respondem dúvida direta; capítulo explica o assunto
           * (1 + CASE WHEN c.tipo IN ('problema', 'faq') THEN 0.30 ELSE 0 END)
           -- casou com TODOS os termos
           + CASE WHEN v_and IS NOT NULL AND v_and::text <> '' AND c.busca @@ v_and
                  THEN 0.15 ELSE 0 END
           -- sobreposição com as palavras-chave do chunk
           + 0.02 * least(
               (SELECT count(*) FROM unnest(c.chaves) AS k WHERE k = ANY (v_termos)),
               5
             )
         )::real AS score
  FROM candidatos c CROSS JOIN termos t
  GROUP BY c.id, c.secao, c.secao_titulo, c.tipo, c.titulo,
           c.capitulo, c.rotas, c.prints, c.texto, c.busca, c.chaves
  ORDER BY score DESC, c.id
  LIMIT v_limite;
END;
$function$;

COMMENT ON FUNCTION public.buscar_guia(text, integer, text[], text) IS
  'Busca no Guia Técnico (public.guia_chunks) por texto livre, do jeito que o cliente escreve. Limpa muleta de conversa, pondera cada termo pela raridade no corpus (IDF na mão, porque ts_rank_cd não tem), junta AND e OR no mesmo ranking e dá bônus pra problema/faq e sobreposição com chaves. Documentação de produto: sem company_id. Leitura pública (a página /guia-tecnico é aberta).';

-- ---------------------------------------------------------------------------
-- GRANTS — explícitos de propósito, nunca no default implícito
-- ---------------------------------------------------------------------------
-- O default privilege do schema `public` já concede EXECUTE a anon e
-- authenticated em função nova: `REVOKE ... FROM PUBLIC` sozinho NÃO fecha
-- nada, e "não escrever GRANT" NÃO quer dizer "fechado". Então revoga-se tudo
-- primeiro e concede-se de novo linha a linha.
--
-- Por que `anon` PODE executar (e no EcoSistema não podia):
--   * a função é SECURITY DEFINER, mas lê UMA tabela só — public.guia_chunks —
--     que é documentação de produto, sem company_id e sem nenhum dado de
--     cliente. Não há nada que ela devolva que a política de SELECT de anon na
--     própria tabela já não devolva.
--   * a página /guia-tecnico da Dominex é aberta e tem busca; sem EXECUTE pra
--     anon, o visitante sem login teria a busca quebrada.
--   * p_limite é preso em 1..30 e o corte de termos tem teto, então não dá pra
--     transformar a chamada anônima em varredura cara.
-- Se um dia a função passar a ler qualquer tabela com company_id, este GRANT a
-- anon tem que cair no mesmo commit.
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_guia(text, integer, text[], text) TO anon, authenticated, service_role;
