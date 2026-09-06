-- PORTADO DO ECOSISTEMA (worktree nashville, 20260906000500). Corpo idêntico.
-- O achado é sobre o STEMMER do português, não sobre o corpus: 'vejo'/'veja'
-- stemizam pra 'vej', que é um stem SEPARADO de 'ver'. Isso vale igual aqui.
-- Os df citados são os do corpus do EcoSistema (813 chunks) — é a evidência de
-- por que cada palavra entrou ou ficou de fora. Não mexer sem medir.

-- buscar_guia: verbo de consulta vira ruído de conversa
--
-- Ponta que sobrou do corte de termos por IDF (20260905235700).
-- "quero que meu vendedor veja os pedidos mas não veja o lucro..." devolvia em
-- 1º lugar T11 · "Onde vejo o consumo de produção no estoque?" — ruído puro.
--
-- Causa: o stemmer português NÃO unifica "vejo"/"veja" com "ver". Eles viram o
-- stem 'vej', que aparece em só 22 dos 813 chunks (df=22 → IDF 3,65), enquanto
-- 'ver' aparece em 141. Ou seja: o verbo mais banal da conversa ganhava peso de
-- termo raro, entrava no corte e puxava justamente os títulos que começam com
-- "Onde vejo...". c_ruido só limpa a PERGUNTA — o corpus não é tocado.
--
-- Entraram (medidos, melhoraram ou empataram):
--   veja, vejo, visualizar, olhar, saber, entender, checar
--
-- Ficaram DE FORA porque a medição mostrou regressão:
--   ver      — df=141, em `chaves` de 84 chunks; é nome de botão da tela
--              ("Ver detalhes", "Ver relatório"). Tirar derruba
--              "quero ver o relatorio de estoque" do capítulo certo (t9-c08 1º→4º).
--   vendo    — stemiza pra 'vend', IGUAL a venda/vender/vendas (df=309).
--              Tirar mata a intenção de venda: "vendo sucata" vira "sucata".
--   mostrar/mostra — stem 'mostr', df=190, em `chaves` de 104 chunks. Ganho zero
--              e "o dashboard nao mostra nada" perde o capítulo 1 do Dashboard.
--   conferir — df=34, ação de domínio ("conferir caixa"). Tirar derruba
--              t25-c08 "Rotina diária: conferir caixa" de 1º pra 3º.
--
-- Nada mais muda: assinatura, pesos, bônus e as constantes c_max_termos /
-- c_max_candidatos / c_min_termos / c_df_generico ficam idênticos. O corpo
-- abaixo foi gerado a partir do pg_get_functiondef da função em produção.

CREATE OR REPLACE FUNCTION public.buscar_guia(p_consulta text, p_limite integer DEFAULT 6, p_tipos text[] DEFAULT NULL::text[], p_secao text DEFAULT NULL::text)
 RETURNS TABLE(id text, secao text, secao_titulo text, tipo text, titulo text, capitulo text, rotas text[], prints text[], texto text, score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    || 'voce|voces|ola|bom|dia|tarde|noite|'
    -- verbo de consulta: o usuario descreve o ATO de olhar, nao o assunto.
    -- 'vejo'/'veja' stemizam pra 'vej' (df=22), stem separado de 'ver' (df=141),
    -- entao ganhavam IDF alto e roubavam vaga de termo de dominio.
    -- DE FORA de proposito (medidos, regrediram): 'ver' e 'mostrar/mostra' sao
    -- nome de botao do proprio guia; 'vendo' stemiza pra 'vend', igual a
    -- venda/vender/vendas; 'conferir' e acao de dominio (conferir caixa).
    || 'veja|vejo|visualizar|olhar|saber|entender|checar)\M';

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
$function$
;

-- CREATE OR REPLACE preserva o COMMENT antigo, que descrevia a versão do
-- EcoSistema. Reescrito aqui pra dizer, na própria função, que a leitura é
-- pública neste projeto — quem for auditar grant lê isso primeiro.
COMMENT ON FUNCTION public.buscar_guia(text, integer, text[], text) IS
  'Busca no Guia Técnico (public.guia_chunks) por texto livre, do jeito que o cliente escreve. Limpa muleta de conversa (inclusive verbo de consulta: veja/vejo/olhar/checar; "ver" fica de fora de propósito, é nome de botão), escolhe os 12 termos mais raros do corpus (IDF na mão, porque ts_rank_cd não tem) descartando termo genérico (df >= 30% do guia, com piso de 4 termos), junta AND e OR no mesmo ranking e dá bônus pra problema/faq e sobreposição com chaves. Determinística: mesma consulta, mesmo resultado. Documentação de produto: sem company_id, leitura liberada a anon (a página /guia-tecnico é aberta).';

-- CREATE OR REPLACE preserva grants e comentário, mas a regra deste repositório
-- é declarar EXECUTE explicitamente em vez de confiar no default privilege do
-- schema public (que concede a anon/authenticated sozinho). anon mantém EXECUTE
-- porque /guia-tecnico é pública e a função só lê guia_chunks (documentação de
-- produto, sem company_id). Ver a justificativa longa em 20260905210100.
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_guia(text, integer, text[], text) TO anon, authenticated, service_role;
