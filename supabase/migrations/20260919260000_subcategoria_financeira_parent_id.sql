-- ============================================================================
-- Subcategoria financeira: `parent_id` auto-referente, DOIS NÍVEIS, sem tocar
-- em nada que já existe
-- ============================================================================
--
-- O QUE O CLIENTE PEDIU
-- Categoria pai com filhas ("CSP" > "Pedágio"), pra aparecer como segundo
-- select nos modais de lançamento, expansível na tela de Categorias e agrupada
-- na DRE.
--
-- ----------------------------------------------------------------------------
-- O FATO QUE DITA A MODELAGEM (medido em produção, 2026-09-19, só leitura)
-- ----------------------------------------------------------------------------
-- public.financial_transactions.category é `text` — o NOME COPIADO da
-- categoria. NÃO existe coluna `category_id` em lugar nenhum e NENHUMA tabela
-- referencia financial_categories.id por chave estrangeira (conferido em
-- information_schema.columns e pg_constraint; o mesmo já estava documentado em
-- 20260919190000).
--
-- Consequência: o NOME é a chave de junção de todo o financeiro. A DRE monta
-- Map<name, dre_group> e Map<name, {color,icon}> a partir do nome
-- (FinanceDRE.tsx:233-260); o select de lançamento grava nome
-- (CategorySelectField.tsx); a cascata de rename reescreve nome nas duas
-- pontas (useFinancialCategories.ts).
--
-- Por isso a subcategoria NÃO ganha identificador novo do lado do lançamento.
-- O lançamento continua gravando UM nome — o nome da folha que o usuário
-- escolheu. Filha é categoria de verdade, com nome próprio e único na empresa;
-- "pai" é só hierarquia de exibição. Zero linha de financial_transactions é
-- tocada por esta migration, agora ou depois.
--
-- ----------------------------------------------------------------------------
-- MEDIÇÃO EM PRODUÇÃO (2026-09-19, antes de escrever — somente SELECT)
-- ----------------------------------------------------------------------------
--   financial_categories ........................... 1079 linhas / 52 empresas
--   categorias por empresa ......................... min 20 / média 20,8 / máx 48
--   financial_transactions ......................... 668 linhas (662 com categoria)
--   FKs apontando pra financial_categories.id ...... 0
--   coluna `parent_id` já existente ................ não
--   funções que fazem SELECT * FROM financial_categories
--     pra dentro de rowtype ........................ 0
--     (admin_delete_company, generate_payroll_for_employee, reset_system_step,
--      resolve_system_category_name, seed_system_financial_categories — todas
--      usam lista de colunas nomeada, então coluna nova não quebra nenhuma)
--
-- Padrão "<prefixo> <separador> <resto>" nos nomes (só medição, NADA é
-- convertido — decisão explícita do CEO: "não mude o nome das categorias já
-- aplicadas"):
--   ' - '  (hífen) ......... 105 categorias em 52 empresas
--                            (103 são a semente 'CSP - Materiais' /
--                             'CSP - Mão de Obra Avulsa', 1 por empresa)
--   ' – '  (EN DASH) ....... 15 categorias em 1 empresa (Glacial Cold Brasil)
--   ' / '  .................  3 categorias em 1 empresa — FALSO POSITIVO
--                            ('Hospedagem / Domínio / Assinaturas',
--                             'Telefonia / Celulares TIM': não são pai>filha)
--
-- 🔴 POR QUE NENHUMA CONVERSÃO AUTOMÁTICA SERIA CORRETA (fica registrado):
--   a) As 15 do cliente usam EN DASH (U+2013), não o hífen da semente. Uma
--      heurística de ' - ' não acharia nenhuma delas; uma que normalizasse os
--      dois faria 'CSP – Mão de Obra Avulsa' (do cliente) colidir com
--      'CSP - Mão de Obra Avulsa' (da semente) no índice único de nome.
--   b) O grupo 'CSP –' tem `dre_group` MISTURADO: 4 em 'opex' e 7 em 'cmv'.
--      'Salários – Administrativo' é opex e 'Salários – Ajudantes' é cmv.
--      Qualquer regra de "filha herda o grupo do pai" MOVERIA essas linhas de
--      lugar na DRE — mudaria o passado, em silêncio.
--   c) Nomes como 'CSP – Fretes e Entregas Uber, 99' e 'CSP – Peças de
--      Reposição Contratos, clientes' têm texto livre grudado no fim.
--   É por (b) que a filha MANTÉM `dre_group` PRÓPRIO nesta modelagem, e não
--   herda do pai: os dados do próprio cliente provam que ele usa o mesmo
--   prefixo em grupos de DRE diferentes, de propósito.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ
-- ----------------------------------------------------------------------------
--   1. Coluna `parent_id` NULL (toda linha existente nasce NULL = raiz).
--   2. FK auto-referente ON DELETE SET NULL — NUNCA CASCADE (ver nota abaixo).
--   3. CHECK de auto-referência + índice parcial pra hierarquia.
--   4. Gatilho que TRAVA A PROFUNDIDADE EM 2 NÍVEIS no banco, e mais:
--      mesma empresa, tipo compatível.
--
-- O QUE ELA NÃO FAZ, DE PROPÓSITO
--   • não renomeia nada;  • não converte prefixo em hierarquia;
--   • não mexe em financial_transactions;  • não mexe no índice único de nome;
--   • não cria policy de RLS (ver seção RLS no fim).
--
-- NADA MUDA PRA QUEM NÃO USAR: categoria sem filha tem parent_id NULL e nenhuma
-- filha apontando pra ela — exatamente o estado das 1079 linhas de hoje.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- constraint criada dentro de DO com checagem em pg_constraint, função com
-- CREATE OR REPLACE e DROP TRIGGER IF EXISTS antes do CREATE TRIGGER.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) A coluna
--
-- NULL = categoria raiz (o que toda linha de hoje é, e continua sendo).
-- NOT NULL = subcategoria, e aponta pra raiz da MESMA empresa.
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid;

COMMENT ON COLUMN public.financial_categories.parent_id IS
  'Categoria PAI, na mesma empresa. NULL = categoria raiz (padrao). Hierarquia '
  'tem no maximo DOIS niveis: uma linha com parent_id preenchido nunca pode ser '
  'pai de outra (travado pelo gatilho trg_financial_categories_valida_parent). '
  'A FILHA e uma categoria completa: nome proprio e unico na empresa, type, '
  'color, icon e dre_group PROPRIOS — nao herda dre_group do pai. O lancamento '
  '(financial_transactions.category, text) guarda o NOME DA FOLHA escolhida, '
  'nunca o do pai: por isso nenhum valor e contado duas vezes na DRE.';

-- ---------------------------------------------------------------------------
-- 2) FK auto-referente — ON DELETE SET NULL, nunca CASCADE
--
-- 🔴 CASCADE seria destrutivo e irreversível: excluir o pai "CSP" apagaria em
-- silêncio todas as filhas, e como o lançamento guarda o NOME da filha (texto,
-- sem FK), o histórico financeiro delas ficaria órfão — sem cor, sem ícone e
-- fora do grupo do DRE — sem nenhum aviso. Exclusão de categoria existe hoje na
-- tela (FinanceCategorias.tsx) pra qualquer categoria que não seja de sistema.
--
-- SET NULL: excluir o pai PROMOVE as filhas a raiz. Elas mantêm nome,
-- dre_group, cor, ícone e todo o histórico. Perde-se o agrupamento visual, que
-- é o único dado que era do pai. Reversível na mão em 1 clique.
--
-- Sem ON UPDATE porque `id` é uuid gerado e nunca muda.
-- ---------------------------------------------------------------------------
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_categories'::regclass
       AND conname  = 'financial_categories_parent_id_fkey'
  ) THEN
    ALTER TABLE public.financial_categories
      ADD CONSTRAINT financial_categories_parent_id_fkey
      FOREIGN KEY (parent_id)
      REFERENCES public.financial_categories (id)
      ON DELETE SET NULL;
  END IF;
END
$fk$;

-- Auto-referência direta (A é pai de A). O gatilho também barra, com mensagem
-- melhor; a CHECK fica como rede de baixo custo, sempre verdadeira pro acervo
-- atual (todo parent_id e NULL), por isso a validação da tabela inteira passa.
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_categories'::regclass
       AND conname  = 'financial_categories_parent_id_nao_e_ela_mesma'
  ) THEN
    ALTER TABLE public.financial_categories
      ADD CONSTRAINT financial_categories_parent_id_nao_e_ela_mesma
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END
$chk$;

-- Índice parcial: só as filhas entram. Serve a FK, ao gatilho (que pergunta
-- "esta linha tem filha?") e à tela de Categorias. Com 0 filhas hoje o índice
-- nasce vazio e não custa nada.
CREATE INDEX IF NOT EXISTS financial_categories_parent_id_idx
  ON public.financial_categories (company_id, parent_id)
  WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) A trava de profundidade — no BANCO, não só na tela
--
-- Quatro regras, todas com RAISE EXCEPTION (erro de negócio, não silêncio):
--
--   R1 PROFUNDIDADE  o pai escolhido precisa ser RAIZ (parent_id IS NULL).
--                    Barra neto pelo lado de baixo.
--   R2 PROFUNDIDADE  a linha que está virando filha não pode JÁ TER filha.
--                    Barra neto pelo lado de cima (transformar um pai em filha
--                    criaria avô>pai>neto de uma vez).
--   R3 TENANT        o pai precisa ser da MESMA empresa. É a regra que impede
--                    uma empresa de pendurar categoria na hierarquia de outra;
--                    a leitura é SECURITY DEFINER justamente pra enxergar o pai
--                    mesmo quando a RLS o esconderia, e assim poder RECUSAR com
--                    mensagem honesta em vez de dizer "pai não existe".
--   R4 TIPO          o tipo da filha precisa caber no do pai (igual, ou pai
--                    'ambos'). A tela de Categorias tem coluna de ENTRADA e
--                    coluna de SAÍDA, e o select de lançamento filtra por tipo
--                    (financial-category-filter.ts): filha de tipo incompatível
--                    existiria no banco e nunca apareceria embaixo do pai.
--                    Vale nos dois sentidos — mexer no `type` do PAI também é
--                    checado contra as filhas que ele já tem.
--
-- Roda só quando `parent_id`, `company_id` ou `type` estão em jogo: UPDATE de
-- nome, cor, ícone, dre_group, sort_order ou is_active nem entra na função.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_categories_valida_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $valida$
DECLARE
  v_pai_parent_id  uuid;
  v_pai_company_id uuid;
  v_pai_type       text;
  v_pai_name       text;
  v_achou          boolean := false;
  v_filhas         integer := 0;
  v_incompat       integer := 0;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      -- ERRCODE 'raise_exception' (P0001) de propósito, e não 'check_violation'
      -- (23514) / 'foreign_key_violation' (23503): o front resolve erro pelo
      -- SQLSTATE ANTES do texto (errorMessages.ts), e esses dois códigos já têm
      -- mensagem genérica mapeada que engoliria a explicação específica daqui.
      -- P0001 não é mapeado, então a mensagem abaixo chega inteira no usuário.
      RAISE EXCEPTION 'Uma categoria nao pode ser subcategoria dela mesma.'
        USING ERRCODE = 'raise_exception';
    END IF;

    SELECT p.parent_id, p.company_id, p.type, p.name, true
      INTO v_pai_parent_id, v_pai_company_id, v_pai_type, v_pai_name, v_achou
      FROM public.financial_categories p
     WHERE p.id = NEW.parent_id;

    IF NOT v_achou THEN
      RAISE EXCEPTION 'Categoria pai selecionada nao existe mais. Recarregue a tela e escolha de novo.'
        USING ERRCODE = 'raise_exception';
    END IF;

    -- R3: mesma empresa. `IS DISTINCT FROM` porque company_id e nullable na
    -- tabela: NULL de um lado nunca pode "casar" com NULL do outro aqui.
    IF v_pai_company_id IS DISTINCT FROM NEW.company_id
       OR NEW.company_id IS NULL THEN
      RAISE EXCEPTION
        'Categoria pai "%" pertence a outra empresa. Subcategoria so pode ser criada dentro da mesma empresa.',
        v_pai_name
        USING ERRCODE = 'raise_exception';
    END IF;

    -- R1: o pai precisa ser raiz.
    IF v_pai_parent_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Categoria "%" ja e uma subcategoria. A hierarquia tem no maximo dois niveis: nao existe sub-subcategoria.',
        v_pai_name
        USING ERRCODE = 'raise_exception';
    END IF;

    -- R2: quem vira filha nao pode ja ter filha.
    IF TG_OP = 'UPDATE' THEN
      SELECT count(*) INTO v_filhas
        FROM public.financial_categories f
       WHERE f.parent_id = NEW.id;

      IF v_filhas > 0 THEN
        RAISE EXCEPTION
          'Categoria "%" tem % subcategoria(s) e por isso nao pode virar subcategoria de outra. Solte as subcategorias dela primeiro.',
          NEW.name, v_filhas
          USING ERRCODE = 'raise_exception';
      END IF;
    END IF;

    -- R4: tipo da filha cabe no do pai.
    IF v_pai_type <> 'ambos' AND v_pai_type <> NEW.type THEN
      RAISE EXCEPTION
        'Categoria pai "%" e do tipo "%" e a subcategoria e do tipo "%". A subcategoria precisa ser do mesmo tipo do pai (ou o pai ser "ambos").',
        v_pai_name, v_pai_type, NEW.type
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  -- R4 pelo lado do PAI: trocar o `type` de quem ja tem filha nao pode deixar
  -- filha incompativel pra tras.
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NULL AND NEW.type IS DISTINCT FROM OLD.type THEN
    SELECT count(*) INTO v_incompat
      FROM public.financial_categories f
     WHERE f.parent_id = NEW.id
       AND NEW.type <> 'ambos'
       AND f.type <> NEW.type;

    IF v_incompat > 0 THEN
      RAISE EXCEPTION
        'Categoria "%" tem % subcategoria(s) de outro tipo. Mude o tipo das subcategorias antes de mudar o tipo da categoria pai.',
        NEW.name, v_incompat
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END
$valida$;

COMMENT ON FUNCTION public.financial_categories_valida_parent() IS
  'Trava de hierarquia de financial_categories: no maximo DOIS niveis, pai da '
  'mesma empresa e tipo compativel. No banco, nao so na tela.';

DROP TRIGGER IF EXISTS trg_financial_categories_valida_parent
  ON public.financial_categories;

CREATE TRIGGER trg_financial_categories_valida_parent
  BEFORE INSERT OR UPDATE OF parent_id, company_id, type
  ON public.financial_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.financial_categories_valida_parent();

-- ---------------------------------------------------------------------------
-- 4) RLS — nada a fazer, e o porquê
--
-- As 4 policies de public.financial_categories (SELECT/INSERT/UPDATE/DELETE)
-- filtram por LINHA, em company_id = get_user_company_id(auth.uid()), e nenhuma
-- delas enumera colunas. Coluna nova herda as policies existentes sem alteracao
-- e sem ampliar acesso nenhum: ninguem passa a ver linha que nao via.
--
-- O unico vetor novo seria apontar parent_id pra categoria de OUTRA empresa —
-- e isso e a regra R3 do gatilho acima, que recusa. A regra de quem-ve-o-que
-- nao muda, entao nao ha decisao de plataforma pendente aqui.
--
-- Nenhuma RPC nova foi criada, logo nao ha GRANT EXECUTE a dar. A funcao acima
-- e de gatilho (so o gatilho a chama) e nao precisa de GRANT.
-- ---------------------------------------------------------------------------

COMMIT;
