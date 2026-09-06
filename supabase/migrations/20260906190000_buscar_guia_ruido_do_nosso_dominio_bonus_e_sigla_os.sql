-- buscar_guia: afinação medida contra 11 perguntas reais de suporte
--
-- Contexto: `c_ruido` e o bônus de problema/faq vieram do EcoSistema (corpus de
-- ferro-velho, 813 chunks). O corpus daqui é outro (Guia Técnico da Dominex,
-- 641 chunks) e três defeitos apareceram na medição. Cada mudança abaixo foi
-- medida com as MESMAS 11 perguntas antes e depois, mais três conjuntos de
-- controle (12 perguntas de sintoma, 5 perguntas onde "os" é ARTIGO, 8 onde
-- "OS" é a SIGLA). O que regrediu está registrado como "ficou de fora".
--
-- NADA MAIS MUDA: assinatura, pesos A/B/C/D, os dois wrappers
-- immutable_unaccent, o cálculo de IDF, o ORDER BY antes do LIMIT nas CTEs,
-- c_max_termos / c_max_candidatos / c_min_termos / c_df_generico e os grants
-- (anon continua FORA, ver 20260905210400). O corpo abaixo partiu do
-- pg_get_functiondef da função viva em produção.
--
-- ---------------------------------------------------------------------------
-- DEFEITO 1 — a lista de ruído era de outro corpus
-- ---------------------------------------------------------------------------
-- Entraram (medidos, melhoraram):
--   onde     — df=189 de 641 (29,5%): passa RASPANDO pelo corte de genérico
--              (c_df_generico = 30%) e entra no ranking com peso de termo útil.
--              Não tem informação nenhuma: `chaves` = 0 chunks, mas está no
--              TÍTULO de 55 ("Onde fica...", "Onde vejo..."), então puxava
--              qualquer capítulo cujo título começa com "Onde".
--              Prova: "onde vejo o cronograma do PMOC" — t11-c08 (Aba
--              Cronograma) sobe de 9º pra 5º só com esta palavra fora.
--   coloco / coloca / colocar — stem 'coloc', df=14. É o oposto: tão raro que o
--              IDF PREMIA (ln(1+641/14) = 3,86, o maior da frase), e é verbo da
--              pergunta, não do assunto.
--              Prova: "onde coloco o logo da empresa no relatório" — t1-c03
--              (White Label) sai de 3º pra 1º.
--
-- Ficaram DE FORA porque a medição regrediu ou empatou:
--   encontrar/encontro — "onde encontro o relatório de estoque" piora de 10º
--              pra 22º. df=24, mas o texto do guia usa o verbo.
--   procurar/procuro   — o guia escreve o problema NA VOZ DO CLIENTE
--              ("Procurei em Configurações"). Tirar não muda nada e arrisca.
--   porque, mexer      — ganho zero nas 5 sondas; não entra o que não mede.
--   acho / achar       — ARMADILHA: 11 títulos de problema começam com "Não
--              acho..." ("Não acho o PMOC no menu"). É vocabulário do corpus,
--              não muleta.
--   ver                — continua de fora, pelo motivo já registrado em
--              20260905210300: é nome de botão ("Ver detalhes", 47 chunks
--              em `chaves`).
--
-- ---------------------------------------------------------------------------
-- DEFEITO 2 — o bônus de problema/faq soterrava o passo a passo (0,30 -> 0,10)
-- ---------------------------------------------------------------------------
-- Sintoma: "como emitir nota fiscal de serviço" não trazia o capítulo exato
-- (t14-c07, "Emitir nota — stepper de 4 passos") nem no top 8. Restringindo a
-- busca a `capitulo` ele vinha em 1º com 0,905 — ou seja, o conteúdo estava
-- certo e o multiplicador é que decidia: chunk de problema com score cru ~0,78
-- passava na frente de um capítulo de 0,90 só por ser problema.
--
-- Testados: 0,30 / 0,20 / 0,15 / 0,12 / 0,10 / 0,08 / 0,05 / 0 e uma versão
-- CONDICIONADA (bônus só quando a pergunta parece sintoma). Resultado:
--   * 0,10 é o melhor: 11 perguntas vão de 4 pra 6 acertos em 1º lugar.
--   * 0 (tirar o bônus) piora — o bônus tem função, é o tamanho que estava errado.
--   * condicionar por "parece sintoma" mede PIOR (5/11) que o 0,10 chapado,
--     porque sintoma real muitas vezes não tem palavra negativa: "a nota ficou
--     horas em processando" não casa com nenhum gatilho e perderia o bônus.
--     Heurística a mais, resultado a menos: fica de fora.
-- Custo medido no conjunto de controle de 12 perguntas de sintoma: 11/12 -> 10/12.
-- A única que caiu foi "não consigo subir o certificado digital", que passou a
-- devolver em 1º o CAPÍTULO que ensina a subir o certificado (t14-c03) em vez
-- do problema homônimo. É resposta melhor, não pior.
--
-- ---------------------------------------------------------------------------
-- DEFEITO 3 — "OS" é o substantivo central do produto e é stopword
-- ---------------------------------------------------------------------------
-- `os` é artigo masculino plural: o dicionário `portuguese` descarta
-- (to_tsvector('portuguese','os') = ''), e a sigla OS aparece em 390 dos 641
-- chunks (60,8%). O termo mais central do produto é invisível pra busca.
--
-- Por que NÃO dá pra resolver trocando o dicionário (as duas razões):
--   1. Impossível no Supabase Cloud. Um dicionário snowball com lista de
--      stopwords própria exige ARQUIVO em $SHAREDIR/tsearch_data. Tentado:
--      CREATE TEXT SEARCH DICTIONARY (TEMPLATE=snowball, Language=portuguese,
--      StopWords=portugues_dominex) -> ERRO F0000 "could not open stop-word
--      file". Não há acesso ao filesystem do servidor.
--   2. E não adiantaria: a seleção de termos desta função só considera palavra
--      com `length(t) >= 3`. Mesmo indexando 'os', ele JAMAIS entraria no
--      ranking — só mudaria v_and/v_or. Pra valer teria que baixar o piso pra 2,
--      o que deixa entrar "de", "da", "em", "no".
--
-- O que entra aqui é a única parte do problema que é do BANCO: quando a própria
-- frase PROVA que "os" não é artigo, a sigla é expandida. A prova é gramatical,
-- não é chute: "os" artigo é masculino plural e NUNCA vem depois de determinante
-- feminino — "a OS", "uma OS", "minha OS", "na OS" só existem como sigla.
-- Segundo gatilho: "OS" em caixa alta numa frase que não é toda em caixa alta.
--   Prova (ganho): "reabrir uma OS" — t5-c08, o capítulo que tem o botão
--   Reabrir, sai de 16º pra 3º. "quem pode excluir uma OS": 21º -> 7º.
--   Prova (não-dano): as 5 perguntas em que "os" é ARTIGO ("os clientes não
--   aparecem na lista", "os feriados não aparecem na agenda", ...) ficam
--   IDÊNTICAS — o gatilho não dispara. Sem a guarda, a expansão ingênua
--   destrói essas perguntas: "os clientes não aparecem na lista" cai de 1º
--   pra fora do top 30, porque 'ordem' (IDF 1,86) passa na frente de
--   'cliente' (IDF 1,03).
--
-- O QUE ESTA MIGRATION *NÃO* RESOLVE, e é do lado do CONTEÚDO:
--   * pergunta em que a sigla aparece sem determinante ("técnico não vê a OS
--     dele no app") continua errando — e ali a expansão não muda nada: o buraco
--     é de vocabulário (o guia responde em "agenda", o cliente pergunta em
--     "app"). Trocar "app" por "agenda" na mesma pergunta traz a resposta certa
--     em 1º. Isso é chunk, não é SQL.
--   * a recomendação pro conteúdo é escrever "ordem de serviço (OS)" em
--     `sinonimos` e `chaves` (pesos B e C), não só no corpo (peso D).
--
-- ---------------------------------------------------------------------------
-- DEFEITO 3b — "nfse" sem hífen casava ZERO chunk
-- ---------------------------------------------------------------------------
-- O guia escreve "NFS-e", que indexa como 'nfs-e' + 'nfs' (47 chunks). O lexema
-- 'nfse' não existe em lugar nenhum, e é como o cliente digita no WhatsApp.
-- Como termo isolado ele morria calado (df=0 é descartado), mas quando era a
-- ÚNICA palavra de conteúdo a busca voltava VAZIA: "nfse" e "o que é nfse"
-- devolviam 0 resultados. Com a normalização, "nfse" devolve o bloco fiscal e
-- "o que é nfse" traz t14-c01 em 2º. O preço é pequeno e medido: "como emitir
-- nfse" sai de 1º pra 2º (t14-c07 continua no top 3) — troca boa contra
-- "não devolve nada".

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
    -- 'vejo'/'veja' stemizam pra 'vej' (df=15 aqui), stem separado de 'ver'
    -- (df=90), entao ganhavam IDF alto e roubavam vaga de termo de dominio.
    -- DE FORA de proposito (medidos, regrediram): 'ver' e 'mostrar/mostra' sao
    -- nome de botao do proprio guia; 'vendo' stemiza pra 'vend', igual a
    -- venda/vender/vendas; 'conferir' e acao de dominio (conferir caixa).
    || 'veja|vejo|visualizar|olhar|saber|entender|checar|'
    -- interrogativo e verbo de consulta DESTE corpus (ver cabecalho, defeito 1).
    -- 'onde' escapa do corte de generico por 3 chunks (29,5%) e nao distingue
    -- nada; 'coloc' e raro (df=14) e por isso ganha o MAIOR peso da frase.
    || 'onde|coloco|coloca|colocar)\M';

  -- Determinante feminino: "os" ARTIGO e masculino plural, entao nunca aparece
  -- depois destas palavras. Se apareceu, e a sigla OS (ordem de servico).
  c_os_femin constant text :=
    '\m(a|na|da|pela|uma|numa|minha|essa|esta|aquela|sua|nossa|outra|cada|toda|primeira|ultima)\s+os\M';

  c_max_termos     constant integer := 12;    -- teto de termos que entram no ranking
  c_max_candidatos constant integer := 40;    -- teto de termos que têm o df calculado
  c_min_termos     constant integer := 4;     -- piso: nunca fica sem termo nenhum
  c_df_generico    constant float8  := 0.30;  -- termo em >=30% do guia não distingue nada
  -- problema/faq respondem duvida direta, entao valem um empurrao — mas 0,30
  -- soterrava capitulo de passo a passo. 0,10 medido como melhor (ver cabecalho).
  c_bonus_direto   constant float8  := 0.10;

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

  -- sigla que o cliente digita sem hifen e o guia escreve com ("NFS-e" indexa
  -- como 'nfs-e'+'nfs'; 'nfse' nao existe no corpus). Sem isto, "nfse" sozinho
  -- devolve VAZIO. Só a sigla inteira, pra nao pegar "nfse" dentro de url.
  v_bruta := regexp_replace(v_bruta, '\mnfse\M', 'nfs-e', 'g');

  -- expansao da sigla OS, só quando a frase PROVA que não é o artigo:
  --   (a) veio depois de determinante feminino  -> "a OS", "minha OS", "na OS";
  --   (b) veio em CAIXA ALTA numa frase que não é toda em caixa alta.
  -- Fora desses dois casos nada acontece — "os clientes não aparecem" segue
  -- intacta. O termo original continua na frase; a expansão só ACRESCENTA.
  IF v_bruta ~ c_os_femin
     OR (p_consulta ~ '\mOS\M' AND p_consulta <> upper(p_consulta))
  THEN
    v_bruta := v_bruta || ' ordem de servico';
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
           * (1 + CASE WHEN c.tipo IN ('problema', 'faq') THEN c_bonus_direto ELSE 0 END)
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

COMMENT ON FUNCTION public.buscar_guia(text, integer, text[], text) IS
  'Busca no Guia Técnico (public.guia_chunks) por texto livre, do jeito que o cliente escreve. Limpa muleta de conversa (inclusive interrogativo e verbo de consulta: onde/coloco/veja/vejo/olhar/checar; "ver" e "acho" ficam de fora de propósito, são vocabulário do próprio guia), normaliza "nfse" para "nfs-e" (sem isso a busca voltava vazia) e expande a sigla OS para "ordem de serviço" SÓ quando a frase prova que não é o artigo (determinante feminino antes, ou OS em caixa alta). Escolhe os 12 termos mais raros do corpus (IDF na mão, porque ts_rank_cd não tem) descartando termo genérico (df >= 30% do guia, com piso de 4 termos), junta AND e OR no mesmo ranking e dá bônus de 10% pra problema/faq (era 30%, que soterrava capítulo de passo a passo) e por sobreposição com chaves. Determinística: mesma consulta, mesmo resultado. Documentação de produto: sem company_id. EXECUTE só para authenticated e service_role.';

-- CREATE OR REPLACE preserva grants, mas a regra deste repositório é declarar
-- EXECUTE explicitamente. anon continua FORA (ver 20260905210400): o consumidor
-- real roda server-side com service_role.
REVOKE ALL     ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.buscar_guia(text, integer, text[], text) TO authenticated, service_role;
