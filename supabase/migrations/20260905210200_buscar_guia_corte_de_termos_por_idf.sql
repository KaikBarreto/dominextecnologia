-- PORTADO DO ECOSISTEMA (worktree nashville, 20260905235700). Corpo idêntico:
-- as medições citadas abaixo (df de cada palavra, "813 chunks", nomes de seção
-- T2/T9/T11) são as do corpus do EcoSistema, que foi onde a afinação foi feita.
-- Elas ficam registradas de propósito, porque explicam POR QUE cada constante
-- tem o valor que tem. O que muda por corpus é só o df absoluto — todos os
-- cortes aqui são RELATIVOS (fração de v_total), exatamente pra sobreviver à
-- troca de corpus. Não mexer no ranqueamento sem medir contra o guia da Dominex.

-- buscar_guia: o corte de termos passa a ser por RARIDADE (IDF), e não mais
-- arbitrário. Só isso muda — assinatura, pesos do ranking e bônus seguem iguais.
--
-- O DEFEITO (medido):
--   A versão anterior recortava a pergunta assim:
--
--     SELECT DISTINCT t FROM regexp_split_to_table(v_limpa, '[^a-z0-9\-]+') AS t
--      WHERE length(t) >= 3
--      LIMIT 12          -- <<< sem ORDER BY
--
--   `LIMIT` sem `ORDER BY` não tem resultado definido: quais 12 palavras
--   sobrevivem é decisão do plano de execução. Desde que a edge do Cato passou
--   a compor a consulta com a pergunta crua + a paráfrase do modelo + os termos
--   da área, a pergunta estourou os 12 com frequência e o corte virou loteria.
--
--   Medição na pergunta "quero que meu vendedor veja os pedidos mas não veja o
--   lucro nem o custo dos materiais permissões vendas pedido venda cliente
--   romaneio": o corte antigo ficava com `nem`, `dos` e `que` (df = 0, casam com
--   ZERO chunk, ou seja, 3 das 12 vagas jogadas fora) e descartava `romaneio`
--   (df 28), `materiais` (115) e `cliente` (224). Sobravam 9 termos úteis, e o
--   resultado vinha dominado por T9.
--
-- O CONSERTO, em duas partes:
--
--   1. O corte acontece DEPOIS de conhecer o `df` de cada termo, não antes.
--      Fica com os 12 de maior IDF (menor `df` em guia_chunks), empate resolvido
--      em ordem alfabética -> o mesmo texto devolve sempre o mesmo conjunto de
--      termos, e daí o mesmo ranking. Termos com df = 0 nem entram na disputa
--      (eles já eram descartados logo depois; agora não desperdiçam vaga).
--
--   2. Piso de raridade. Só o item 1 não resolvia o caso acima: a pergunta tem
--      exatamente 12 termos com df > 0, então o teto de 12 não descartava nada e
--      o resultado PIORAVA (T2 sumia do top 6, medido). O problema não é o teto,
--      é `venda`/`vendas` (df 309 = 38% do guia), `pedido`/`pedidos` (252) e
--      `compra` (289) entrarem na média ponderada: termo que aparece em um terço
--      dos chunks não distingue chunk nenhum, só dilui quem distingue. Então
--      termo com df acima de 30% do corpus é descartado.
--
--      TRAVA obrigatória: as 4 palavras mais raras da pergunta ficam SEMPRE,
--      mesmo acima dos 30%. Sem isso, "quero fazer uma venda" (único termo:
--      `venda`, df 309) ficaria sem termo nenhum. Conferido: perguntas curtas de
--      vocabulário comum ("como faço uma venda", "quero cadastrar um cliente",
--      "pedido de compra do cliente") devolvem resultado idêntico ao de antes.
--
-- Custo: calcular `df` de todos os termos (e não só de 12) custa ~0,2 ms por
-- termo (probe no índice GIN). Medido: 30 termos = 6 ms. Como o corte por IDF
-- ainda derruba os termos genéricos, a parte cara (candidatos x termos com
-- ts_rank_cd) fica MENOR: a pergunta de exemplo caiu de ~220 ms para ~150 ms.
-- Ainda assim há teto: no máximo 40 palavras entram no cálculo de df (as mais
-- longas primeiro, empate alfabético), pra um desabafo de 300 palavras não virar
-- 300 probes.

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

  c_max_termos     constant integer := 12;    -- teto de termos que entram no ranking
  c_max_candidatos constant integer := 40;    -- teto de termos que têm o df calculado
  c_min_termos     constant integer := 4;     -- piso: nunca fica sem termo nenhum
  c_df_generico    constant float8  := 0.30;  -- termo em >=30% do guia não distingue nada

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

  -- ---------------------------------------------------------------------
  -- Seleção de termos: raridade primeiro, e 100% reprodutível.
  -- A ordem é sempre (df crescente, termo alfabético) — nenhum passo depende
  -- da ordem em que o Postgres resolveu devolver as linhas.
  -- ---------------------------------------------------------------------
  WITH cru AS (
    SELECT DISTINCT t
      FROM regexp_split_to_table(v_limpa, '[^a-z0-9\-]+') AS t
     WHERE length(t) >= 3
  ),
  -- teto de custo: no máximo 40 palavras chegam a ter o df calculado.
  -- Palavra mais longa primeiro porque é a que tende a ser específica
  -- ("movimentacao" antes de "que"); empate alfabético, pra ser determinístico.
  universo AS (
    SELECT t FROM cru ORDER BY length(t) DESC, t ASC LIMIT c_max_candidatos
  ),
  com_df AS (
    SELECT a.t,
           a.tsq,
           (SELECT count(*) FROM public.guia_chunks g WHERE g.busca @@ a.tsq) AS df
      FROM (SELECT t, plainto_tsquery('portuguese', t) AS tsq FROM universo) a
     WHERE a.tsq IS NOT NULL AND a.tsq::text <> ''
  ),
  -- df = 0 é palavra que não existe no guia: não ocupa vaga
  vivos AS (
    SELECT t, tsq, df, row_number() OVER (ORDER BY df ASC, t ASC) AS rn
      FROM com_df
     WHERE df > 0
  ),
  escolhidos AS (
    SELECT t, tsq, df
      FROM vivos
     WHERE rn <= c_max_termos
       AND (df <= c_df_generico * v_total::float8 OR rn <= c_min_termos)
  )
  SELECT coalesce(array_agg(t   ORDER BY df, t), '{}'::text[]),
         coalesce(array_agg(tsq ORDER BY df, t), '{}'::tsquery[]),
         coalesce(array_agg(ln(1 + v_total::float8 / greatest(df, 1)) ORDER BY df, t), '{}'::float8[])
    INTO v_termos, v_tsqs, v_idfs
    FROM escolhidos;

  -- nenhum termo isolado casou (só a frase inteira casa): rankeia pelo OR/AND
  IF v_tsqs IS NULL OR cardinality(v_tsqs) = 0 THEN
    v_termos := coalesce(v_termos, '{}'::text[]);
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
  'Busca no Guia Técnico (public.guia_chunks) por texto livre, do jeito que o cliente escreve. Limpa muleta de conversa, escolhe os 12 termos mais raros do corpus (IDF na mão, porque ts_rank_cd não tem) descartando termo genérico (df >= 30% do guia, com piso de 4 termos), junta AND e OR no mesmo ranking e dá bônus pra problema/faq e sobreposição com chaves. Determinística: mesma consulta, mesmo resultado. Documentação de produto: sem company_id.';

-- GRANTS explícitos (o default privilege do schema public concede EXECUTE a
-- anon/authenticated; REVOKE FROM PUBLIC sozinho não basta). anon segue com
-- EXECUTE porque a página /guia-tecnico é aberta e a função só lê guia_chunks,
-- que é documentação de produto sem company_id. Ver 20260905210100.
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_guia(text, integer, text[], text) TO anon, authenticated, service_role;
