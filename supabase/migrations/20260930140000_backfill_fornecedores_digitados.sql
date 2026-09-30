-- =============================================================================
-- ESTOQUE — BACKFILL DE DADO DE CLIENTE: cria os fornecedores que existiam so
-- como texto digitado a mao e liga os materiais neles.
-- 2026-09-30 — Lista curada e APROVADA PELO CEO. Nao e mudanca de schema.
-- =============================================================================
--
-- POR QUE ISTO EXISTE
--   A migration 20260930130000_inventory_supplier_id criou inventory.supplier_id
--   e fez backfill SO por correspondencia exata de nome contra o cadastro
--   public.suppliers. De proposito, ela nao criou fornecedor nenhum: quem
--   decide o que vira cadastro e o CEO, com a lista medida em maos.
--
--   Resultado medido: o cadastro tinha 6 fornecedores no banco inteiro, entao
--   so 20 materiais casaram. Os outros 158 (5 empresas) ficaram com o nome em
--   texto e supplier_id nulo. Como o front ja trocou o <Input> de texto livre
--   por um select do cadastro, sem este povoamento o select abre VAZIO para
--   quase todo mundo — o cliente perderia de vista o fornecedor que ele mesmo
--   digitou.
--
--   Esta migration corrige isso uma vez so, com a lista que o CEO aprovou.
--
-- O QUE ELA NAO FAZ
--   * Nao cria coluna, indice, policy, funcao nem gatilho. Zero schema.
--   * Nao apaga nem renomeia fornecedor existente. A UNICA alteracao em
--     cadastro pre-existente e o btrim do passo 0 (tirar espaco das pontas).
--   * Nao inventa fornecedor fora da lista aprovada. Texto que nao e
--     fornecedor ("Supermercado", "Lojas"), a propria empresa ("Engetec"),
--     pessoa ("SAMUEL ENGETEC") e campo com DOIS fornecedores juntos
--     ("Frigelar/Mercado Livre", "Clima Rio ou Frigelar") ficam como estao,
--     com supplier_id NULL. Isso e decisao de negocio do CEO, nao descuido.
--   * Nao adivinha. "Nopar fogoes" (Alo gas) PODE ser o mesmo que "Nopar",
--     mas isso e suposicao — fica sem vinculo ate o CEO decidir.
--
-- -----------------------------------------------------------------------------
-- INVARIANTES
-- -----------------------------------------------------------------------------
--   * ISOLAMENTO ENTRE EMPRESAS. Todo INSERT carrega company_id explicito e
--     todo vinculo casa i.company_id = s.company_id. No fim do bloco ha uma
--     ASSERCAO que aborta a transacao inteira se sobrar UMA linha de inventory
--     apontando para suppliers de outra empresa. Cruzar empresa aqui colocaria
--     o fornecedor de um cliente dentro do estoque de outro.
--
--   * COMPARACAO SEMPRE NORMALIZADA, NUNCA CRUA. public.suppliers NAO tem
--     UNIQUE em (company_id, name) — conferido em pg_constraint antes de
--     escrever isto. Entao a unica protecao contra duplicar cadastro e o
--     WHERE NOT EXISTS comparando por lower(btrim(extensions.unaccent(...))).
--     Igualdade crua deixaria "Multitec" e "MULTITEC" virarem dois cadastros.
--     A extensao unaccent JA esta instalada no schema extensions (v1.1);
--     nada e instalado aqui.
--
--   * "ATOM Brasil" (Imperium) E NOME NOVO. A Imperium ja tem "Atom Bahia"
--     cadastrado, que e OUTRO fornecedor e NAO deve ser reusado. A comparacao
--     normalizada separa os dois sozinha ("atom bahia" <> "atom brasil");
--     esta nota existe para a proxima pessoa nao "otimizar" isso.
--
--   * O TEXTO inventory.supplier NAO E ESCRITO A MAO em lugar nenhum daqui.
--     Quem reescreve e o gatilho tg_inventory_sync_supplier_name, que ja
--     existe. Fonte da verdade unica: suppliers.name.
--
--   * TRANSACAO UNICA. Todas as escritas vivem dentro de UM unico bloco DO,
--     que e um unico statement e portanto atomico mesmo se o runner nao
--     abrir transacao explicita. Qualquer RAISE EXCEPTION no meio desfaz
--     tudo: nao existe estado pela metade (fornecedor criado sem material
--     ligado, ou vice-versa).
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCIA (rodar 2x nao pode duplicar nem revincular errado)
-- -----------------------------------------------------------------------------
--   * Passo 0: WHERE name <> btrim(name) — na 2a vez nao sobra linha.
--   * Passo 1: INSERT ... WHERE NOT EXISTS por nome normalizado — na 2a vez o
--     cadastro ja existe e nada e inserido. O DISTINCT ON tambem protege
--     contra duas entradas da propria lista colidirem na mesma empresa.
--   * Passo 2: todo UPDATE exige supplier_id IS NULL. Na 2a vez as linhas ja
--     estao ligadas e ficam de fora.
--   * Passo 2c (merges de digitacao): alem do supplier_id IS NULL, eles casam
--     pelo texto ERRADO ("TotakMak", "Clma Rio"). Depois do 1o vinculo o
--     gatilho ja reescreveu o texto para o nome certo, entao na 2a vez nao ha
--     nem candidato. Duplamente idempotente.
--   * Passo 3: so toca linha cujo espelho divergiu; na 2a vez nao diverge.
-- =============================================================================

DO $BACKFILL$
DECLARE
  -- Empresas alvo. Conferidas contra public.companies antes de escrever isto:
  --   e4c501fb... = ENGETEC PROJETOS INDUSTRIA E COMERCIO
  --   1f8f9fb0... = VS PROJECT
  --   478ee686... = Glacial Cold Brasil
  --   9bd3d561... = Alo gas Juquitiba
  --   6a68e299... = Imperium Controle Ambiental Ltda
  c_engetec  constant uuid := 'e4c501fb-9412-4c8b-aca8-f6e0e59e9895';
  c_vsproj   constant uuid := '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87';
  c_glacial  constant uuid := '478ee686-12dd-40a8-880a-a7375764a5a0';
  c_alogas   constant uuid := '9bd3d561-a567-48fa-899d-a05b04c2137f';
  c_imperium constant uuid := '6a68e299-58fc-43c6-bba0-f7c4b064ba89';

  v_btrim     integer;
  v_criados   integer;
  v_vinc_auto integer;
  v_vinc_merg integer;
  v_espelho   integer;
  v_pendente  text;
  v_sobrando  integer;
BEGIN
  ---------------------------------------------------------------------------
  -- GUARDA: as 5 empresas tem que existir. Se um company_id estiver errado,
  -- abortar e melhor do que criar fornecedor dentro do tenant errado.
  ---------------------------------------------------------------------------
  SELECT string_agg(alvo.cid::text, ', ') INTO v_pendente
    FROM (VALUES (c_engetec), (c_vsproj), (c_glacial), (c_alogas), (c_imperium))
         AS alvo(cid)
   WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = alvo.cid);

  IF v_pendente IS NOT NULL THEN
    RAISE EXCEPTION 'backfill abortado: company_id inexistente em public.companies: %', v_pendente;
  END IF;

  ---------------------------------------------------------------------------
  -- PASSO 0 — TIRAR ESPACO DAS PONTAS DOS NOMES JA CADASTRADOS
  --
  -- Nasceu do cadastro 'TOTALMAK ' da Engetec, com espaco no fim. Espaco
  -- invisivel no nome vaza para o select do front, para o PDF e para
  -- qualquer agrupamento por nome. Global de proposito: o banco inteiro
  -- tinha 6 fornecedores quando isto foi escrito, o risco e nulo.
  ---------------------------------------------------------------------------
  UPDATE public.suppliers
     SET name = btrim(name)
   WHERE name <> btrim(name);
  GET DIAGNOSTICS v_btrim = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- PASSO 1 — CRIAR OS FORNECEDORES DA LISTA APROVADA
  --
  -- So o nome. cpf_cnpj, contato, telefone, email, endereco e created_by
  -- ficam nulos: o cliente completa depois, na tela de Fornecedores. Criar
  -- registro com dado inventado seria pior do que criar so o nome.
  --
  -- DISTINCT ON por nome normalizado: garante que a propria lista nao insira
  -- duas vezes o mesmo fornecedor na mesma empresa, mesmo se alguem editar
  -- esta migration no futuro e repetir uma linha.
  ---------------------------------------------------------------------------
  WITH aprovados (company_id, name) AS (
    VALUES
      -- ENGETEC
      (c_engetec,  'MULTITEC'),
      (c_engetec,  'Mercado Livre'),
      (c_engetec,  'TM Soluções'),
      (c_engetec,  'Frigelar'),
      -- VS PROJECT
      (c_vsproj,   'EletroLinea'),
      (c_vsproj,   'Intelbras'),
      (c_vsproj,   'Gforce'),
      (c_vsproj,   'Master Condutt'),
      -- Glacial Cold Brasil
      (c_glacial,  'Clima Rio'),
      (c_glacial,  'Mercado Livre'),
      (c_glacial,  'Obramax'),
      -- Alo gas Juquitiba
      (c_alogas,   'Astra'),
      (c_alogas,   'Mercado Livre'),
      (c_alogas,   'Du Frio'),
      (c_alogas,   'Frigelar'),
      (c_alogas,   'Komeco'),
      (c_alogas,   'Nopar'),
      (c_alogas,   'Via Sol'),
      -- Imperium  (NAO confundir com o 'Atom Bahia' que ja existe)
      (c_imperium, 'ATOM Brasil')
  )
  INSERT INTO public.suppliers (company_id, name)
  SELECT DISTINCT ON (a.company_id, lower(btrim(extensions.unaccent(a.name))))
         a.company_id, a.name
    FROM aprovados a
   WHERE NOT EXISTS (
           SELECT 1
             FROM public.suppliers s
            WHERE s.company_id = a.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(a.name)))
         )
   ORDER BY a.company_id, lower(btrim(extensions.unaccent(a.name))), a.name;
  GET DIAGNOSTICS v_criados = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- PASSO 2a — VINCULO AUTOMATICO POR NOME, DENTRO DA MESMA EMPRESA
  --
  -- Mesma forma do backfill da 20260930130000, de proposito: tolera caixa
  -- ('Multitec' x 'MULTITEC'), espaco nas pontas ('Astra ') e acento.
  -- Empate resolvido pelo cadastro mais antigo (created_at, id) — determinista.
  --
  -- O EXISTS evita reescrever com NULL as linhas que nao casam: sem ele o
  -- update_inventory_updated_at bumparia updated_at de material a toa.
  ---------------------------------------------------------------------------
  UPDATE public.inventory i
     SET supplier_id = (
           SELECT s.id
             FROM public.suppliers s
            WHERE s.company_id = i.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(i.supplier)))
            ORDER BY s.created_at ASC, s.id ASC
            LIMIT 1
         )
   WHERE i.supplier_id IS NULL
     AND i.supplier IS NOT NULL
     AND btrim(i.supplier) <> ''
     AND EXISTS (
           SELECT 1
             FROM public.suppliers s
            WHERE s.company_id = i.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(i.supplier)))
         );
  GET DIAGNOSTICS v_vinc_auto = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- PASSO 2b — GUARDA DOS MERGES: o cadastro alvo TEM que existir
  --
  -- Os tres merges abaixo apontam texto errado para cadastro certo. Se o alvo
  -- nao existir, o merge viraria um no-op silencioso e o material ficaria
  -- orfao sem ninguem perceber. Melhor abortar a transacao inteira.
  ---------------------------------------------------------------------------
  SELECT string_agg(m.alvo || ' @ ' || m.company_id::text, '; ') INTO v_pendente
    FROM (VALUES
            (c_engetec, 'TOTALMAK'),
            (c_glacial, 'Clima Rio')
         ) AS m(company_id, alvo)
   WHERE NOT EXISTS (
           SELECT 1 FROM public.suppliers s
            WHERE s.company_id = m.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(m.alvo)))
         );

  IF v_pendente IS NOT NULL THEN
    RAISE EXCEPTION 'backfill abortado: cadastro alvo de merge nao encontrado: %', v_pendente;
  END IF;

  ---------------------------------------------------------------------------
  -- PASSO 2c — TRES MERGES EXPLICITOS DE DIGITACAO ERRADA
  --
  -- Aqui o texto NAO casa com o nome: e apontar de proposito, aprovado pelo
  -- CEO caso a caso. Nao generalizar isto para "parecido" nenhum.
  --
  --   ENGETEC  'TotakMak'    -> TOTALMAK   (letra trocada)
  --   Glacial  'Clma Rio'    -> Clima Rio  (letra faltando)
  --   Glacial  'Clima  Rio'  -> Clima Rio  (DOIS espacos no meio; o btrim so
  --                                         limpa as pontas, nao o miolo)
  --
  -- Depois do vinculo o gatilho reescreve inventory.supplier com o nome do
  -- cadastro, entao numa 2a execucao estes textos nem existem mais.
  ---------------------------------------------------------------------------
  UPDATE public.inventory i
     SET supplier_id = alvo.id
    FROM (VALUES
            (c_engetec, 'TotakMak',   'TOTALMAK'),
            (c_glacial, 'Clma Rio',   'Clima Rio'),
            (c_glacial, 'Clima  Rio', 'Clima Rio')
         ) AS m(company_id, digitado, cadastro)
    JOIN LATERAL (
           SELECT s.id
             FROM public.suppliers s
            WHERE s.company_id = m.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(m.cadastro)))
            ORDER BY s.created_at ASC, s.id ASC
            LIMIT 1
         ) AS alvo ON true
   WHERE i.company_id = m.company_id
     AND i.supplier_id IS NULL
     AND i.supplier IS NOT NULL
     AND lower(btrim(extensions.unaccent(i.supplier)))
       = lower(btrim(extensions.unaccent(m.digitado)));
  GET DIAGNOSTICS v_vinc_merg = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- PASSO 3 — RESSINCRONIZAR O ESPELHO DE QUEM JA ESTAVA VINCULADO
  --
  -- Consequencia direta do passo 0: os 20 materiais da Engetec ja apontavam
  -- para 'TOTALMAK ' e guardavam esse mesmo texto com espaco. Tirar o espaco
  -- do cadastro sem reencostar nos materiais deixaria o espelho torto
  -- (supplier_id preenchido, mas supplier <> suppliers.name), quebrando o
  -- invariante que a 20260930130000 estabeleceu.
  --
  -- Nao escrevemos o texto a mao: o SET grava o MESMO supplier_id so para
  -- acordar tg_inventory_sync_supplier_name, que e quem reescreve o nome.
  ---------------------------------------------------------------------------
  UPDATE public.inventory i
     SET supplier_id = s.id
    FROM public.suppliers s
   WHERE s.id = i.supplier_id
     AND i.supplier IS DISTINCT FROM s.name;
  GET DIAGNOSTICS v_espelho = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- ASSERCOES FINAIS — se qualquer uma falhar, a transacao inteira volta
  ---------------------------------------------------------------------------
  -- 1) Nenhum material pode apontar para fornecedor de OUTRA empresa.
  SELECT count(*) INTO v_sobrando
    FROM public.inventory i
    JOIN public.suppliers s ON s.id = i.supplier_id
   WHERE s.company_id <> i.company_id;

  IF v_sobrando > 0 THEN
    RAISE EXCEPTION 'backfill abortado: % material(is) apontando para fornecedor de outra empresa', v_sobrando;
  END IF;

  -- 2) Espelho coerente: supplier_id preenchido => supplier = suppliers.name.
  SELECT count(*) INTO v_sobrando
    FROM public.inventory i
    JOIN public.suppliers s ON s.id = i.supplier_id
   WHERE i.supplier IS DISTINCT FROM s.name;

  IF v_sobrando > 0 THEN
    RAISE EXCEPTION 'backfill abortado: % material(is) com texto de fornecedor fora de sincronia com o cadastro', v_sobrando;
  END IF;

  -- 3) Nenhum cadastro pode ter sobrado com espaco nas pontas.
  SELECT count(*) INTO v_sobrando
    FROM public.suppliers WHERE name <> btrim(name);

  IF v_sobrando > 0 THEN
    RAISE EXCEPTION 'backfill abortado: % fornecedor(es) ainda com espaco nas pontas do nome', v_sobrando;
  END IF;

  -- 4) Nenhum nome normalizado duplicado dentro da mesma empresa.
  SELECT count(*) INTO v_sobrando
    FROM (
      SELECT s.company_id, lower(btrim(extensions.unaccent(s.name))) AS norm
        FROM public.suppliers s
       GROUP BY 1, 2
      HAVING count(*) > 1
    ) dup;

  IF v_sobrando > 0 THEN
    RAISE EXCEPTION 'backfill abortado: % nome(s) de fornecedor duplicado(s) na mesma empresa', v_sobrando;
  END IF;

  RAISE NOTICE 'backfill fornecedores digitados -> btrim_nomes=% criados=% vinculados_por_nome=% vinculados_por_merge=% espelho_ressincronizado=%',
    v_btrim, v_criados, v_vinc_auto, v_vinc_merg, v_espelho;
END
$BACKFILL$;
