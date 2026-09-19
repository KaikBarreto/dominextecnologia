-- ============================================================================
-- Categorias financeiras duplicadas: limpa o que existe e TRANCA a porta
-- ============================================================================
--
-- SINTOMA: na tela de Categorias, a Glacial Cold Brasil enxerga "Vendas de
-- Serviços" 2x, "Tarifas e Taxas" 2x e "CSP - Materiais" 2x (mais o par
-- "CMV - Mão de Obra Avulsa", já inativo desde 20260919150000).
--
-- CAUSA RAIZ (medida, não suposta): public.financial_categories NUNCA teve
-- índice único. O único índice da tabela hoje é a PK em (id) — conferido em
-- pg_indexes. Logo TODO caminho de semeadura insere às cegas:
--
--   1. public.seed_system_financial_categories() (AFTER INSERT ON companies)
--      termina com `ON CONFLICT DO NOTHING`, que sem constraint em
--      (company_id, name) não infere NADA e nunca suprime linha nenhuma. O
--      próprio 20260904100000 já documentou isso (linha ~101) e protegeu o
--      BACKFILL com NOT EXISTS — mas deixou a FUNÇÃO DO GATILHO inserindo cego.
--   2. supabase/functions/create-company/index.ts:259 e
--      supabase/functions/self-register/index.ts:692 inserem 14 categorias
--      default por cima do que o gatilho acabou de semear (bulk .insert(),
--      sem onConflict). Hoje NÃO colidem por sorte: nenhum dos 14 nomes bate
--      com os 6 do gatilho ("Impostos e Taxas" != "Tarifas e Taxas").
--   3. Backfills de migration (20260418195512, 20260418210000, 20260904100000)
--      e generate_payroll_for_employee(): esses sim usam NOT EXISTS / SELECT
--      antes do INSERT, e estão corretos.
--
-- O par duplicado da Glacial nasceu de DOIS eventos de semeadura separados por
-- 7 dias (created_at 2026-04-18 19:55:11.789 = o backfill de 20260418195512, e
-- 2026-04-25 19:40:42.774899 = uma segunda semeadura da MESMA empresa). Nenhum
-- dos dois foi barrado porque não havia o que barrar.
--
-- MEDIÇÃO EM PRODUÇÃO (somente leitura, 2026-09-19, antes de escrever):
--   financial_categories ........................ 1083 linhas / 52 empresas
--   grupos (company_id, name) com count(*) > 1 ..... 4, TODOS na Glacial
--   linhas que este dedup apaga .................... 4 (1 por grupo)
--   grupos com company_id NULL ..................... 0
--   grupos com mais de um `type` ................... 0
--   grupos com `is_system` misturado ............... 0 (as 8 são is_system=true)
--   duplicata só por caixa/espaço (lower+btrim) .... 0 grupos além desses 4
--   FKs apontando pra financial_categories.id ...... 0 (pg_constraint contype='f')
--
-- 🔴 POR QUE O DELETE É SEGURO: financial_transactions.category é `text` — o
-- NOME copiado —, não é chave estrangeira; não existe coluna category_id em
-- lugar nenhum e nenhuma tabela referencia financial_categories.id por FK
-- (verificado em pg_constraint). Apagar a linha gêmea não desvincula
-- lançamento nenhum: o nome que o lançamento guarda continua existindo na
-- linha que sobrevive. Não há filho pra remapear.
--
-- IDEMPOTENTE: rodar 2x não apaga nada a mais (na 2ª passada não existe mais
-- grupo com count(*) > 1) e não dá erro (índice com IF NOT EXISTS, função com
-- CREATE OR REPLACE).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Dedup — com DUAS travas de segurança antes de apagar qualquer linha
--
-- Esta tabela é CATÁLOGO DE TENANT: apagar linha aqui por suposição já custou
-- caro uma vez (incidente Glacial 2026-06-06, service_types). Então o bloco
-- ABORTA a migration inteira, em vez de apagar, se o estado do banco tiver
-- andado desde a medição acima:
--
--   Trava A — grupo (company_id, name) com mais de um `type`: seriam duas
--   categorias legitimamente diferentes (uma de entrada, outra de saída) e
--   NÃO podem ser fundidas por um script. Hoje: 0 grupos.
--
--   Trava B — grupo com `is_system` misturado: uma das linhas foi criada pelo
--   CLIENTE e a outra pelo sistema. Quem sobrevive vira decisão de produto,
--   não de script. Hoje: 0 grupos.
--
-- SOBREVIVENTE: `is_active DESC, created_at ASC, id ASC`. É "a mais antiga",
-- como pedido — mas a linha ATIVA tem prioridade sobre a inativa, pra que o
-- dedup nunca esconda da empresa uma categoria que ela enxerga hoje. Hoje os 4
-- grupos são homogêneos em is_active, então o critério é idêntico a "a mais
-- antiga"; a cláusula só existe pra não morder se o estado mudar.
--
-- `company_id IS NOT NULL` em tudo: é exatamente o que o índice único do passo
-- 2 consegue vigiar (NULL é distinto de NULL em índice btree). Hoje são 0
-- linhas sem empresa, mas o dedup não deve prometer mais do que a trava cumpre.
-- ---------------------------------------------------------------------------
DO $dedup$
DECLARE
  v_conflito_tipo   integer := 0;
  v_conflito_system integer := 0;
  v_grupos          integer := 0;
  v_apagadas        integer := 0;
BEGIN
  SELECT count(*) INTO v_conflito_tipo
  FROM (
    SELECT company_id, name
      FROM public.financial_categories
     WHERE company_id IS NOT NULL
     GROUP BY company_id, name
    HAVING count(*) > 1 AND count(DISTINCT type) > 1
  ) g;

  IF v_conflito_tipo > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % grupo(s) (company_id, name) tem mais de um "type". Sao categorias diferentes, nao duplicatas — resolver manualmente antes de aplicar esta migration.',
      v_conflito_tipo;
  END IF;

  SELECT count(*) INTO v_conflito_system
  FROM (
    SELECT company_id, name
      FROM public.financial_categories
     WHERE company_id IS NOT NULL
     GROUP BY company_id, name
    HAVING count(*) > 1 AND count(DISTINCT is_system) > 1
  ) g;

  IF v_conflito_system > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % grupo(s) duplicado(s) misturam is_system true/false. Uma das linhas foi criada pelo cliente — decidir com o cliente qual sobrevive antes de aplicar.',
      v_conflito_system;
  END IF;

  SELECT count(*) INTO v_grupos
  FROM (
    SELECT company_id, name
      FROM public.financial_categories
     WHERE company_id IS NOT NULL
     GROUP BY company_id, name
    HAVING count(*) > 1
  ) g;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY company_id, name
             ORDER BY is_active DESC, created_at ASC, id ASC
           ) AS rn
      FROM public.financial_categories
     WHERE company_id IS NOT NULL
  )
  DELETE FROM public.financial_categories fc
   USING ranked r
   WHERE fc.id = r.id
     AND r.rn > 1;
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  RAISE NOTICE 'dedup financial_categories: % grupo(s) duplicado(s), % linha(s) apagada(s)', v_grupos, v_apagadas;
END
$dedup$;

-- ---------------------------------------------------------------------------
-- 2) A trava: UNIQUE (company_id, name) — SEM `type`
--
-- DECISÃO E PORQUÊ: a chave real do domínio é (empresa, NOME). O `type` fica
-- DE FORA de propósito:
--
--   a. financial_transactions.category guarda só o NOME (text). O `type` não
--      viaja junto. Se a mesma empresa tivesse "Comissões" de entrada e
--      "Comissões" de saída, o lançamento gravado como category='Comissões'
--      seria ambíguo por construção — nenhum consumidor conseguiria dizer de
--      qual das duas ele é.
--   b. A UI já resolve categoria por nome, e só por nome:
--      FinanceDRE.tsx:234 monta `Map<name, dre_group>` e :246 monta
--      `Map<name, {color, icon}>`. Com duas linhas de mesmo nome, a última do
--      forEach ganha em silêncio — o grupo do DRE, a cor e o ícone passam a
--      depender da ordem de leitura. Incluir `type` no índice deixaria esse
--      bug de pé.
--   c. O caso legítimo "a mesma categoria serve entrada e saída" já é
--      modelado: a coluna `type` aceita 'ambos' (é inclusive o DEFAULT da
--      coluna). Não precisa de duas linhas.
--   d. Custo zero hoje: agrupando só por (company_id, name), os grupos
--      duplicados são exatamente os mesmos 4 de (company_id, name, type).
--      Nenhuma empresa perde nada que exista hoje.
--
-- Índice, não CONSTRAINT, porque `ADD CONSTRAINT` não tem IF NOT EXISTS e a
-- migration precisa ser re-rodável. Sem CONCURRENTLY: não roda em bloco de
-- transação e a tabela tem ~1k linhas (instantâneo).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS financial_categories_company_id_name_key
  ON public.financial_categories (company_id, name);

COMMENT ON INDEX public.financial_categories_company_id_name_key IS
  'Nome de categoria e unico por empresa. financial_transactions.category guarda o NOME (text, nao FK) e a UI indexa por nome — duas linhas com o mesmo nome tornam o lancamento ambiguo e fazem cor/icone/dre_group dependerem da ordem de leitura.';

-- ---------------------------------------------------------------------------
-- 3) A semente de empresa nova para de inserir cego
--
-- ⚠️ Corpo copiado da DEFINIÇÃO VIVA (pg_get_functiondef), não de arquivo
-- antigo: a função em produção semeia SEIS categorias, com os nomes já
-- renomeados pra "CSP - ..." por 20260919150000. Reescrever a partir do
-- arquivo de abril faria toda empresa nova nascer com os nomes velhos e sem
-- "Pagamento de Fatura"/"Transferência entre contas".
--
-- Única mudança: `ON CONFLICT DO NOTHING` (que não inferia índice nenhum e
-- portanto nunca suprimiu linha) vira `ON CONFLICT (company_id, name) DO
-- NOTHING`, mirando o índice do passo 2. Agora a segunda semeadura da mesma
-- empresa vira no-op de verdade, inclusive sob corrida.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active)
  VALUES
    (NEW.id, 'Tarifas e Taxas',             'saida',   '#f59e0b', 'Receipt',    'impostos', true, true),
    (NEW.id, 'CSP - Materiais',             'saida',   '#8b5cf6', 'Package',    'cmv',      true, true),
    (NEW.id, 'CSP - Mão de Obra Avulsa',    'saida',   '#06b6d4', 'Wrench',     'cmv',      true, true),
    (NEW.id, 'Vendas de Serviços',          'entrada', '#10b981', 'Briefcase',  'opex',     true, true),
    (NEW.id, 'Pagamento de Fatura',         'saida',   '#6366f1', 'CreditCard', NULL,       true, true),
    (NEW.id, 'Transferência entre contas',  'saida',   '#64748b', 'RefreshCw',  NULL,       true, true)
  ON CONFLICT (company_id, name) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- O gatilho em si NÃO é recriado: já existe (trg_seed_system_financial_categories,
-- AFTER INSERT ON public.companies) e aponta pra esta mesma função, que acabou
-- de ser substituída no lugar. Recriar só adicionaria risco de janela sem gatilho.

COMMIT;
