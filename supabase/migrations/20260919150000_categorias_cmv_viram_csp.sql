-- ============================================================================
-- Categorias padrão: "CMV - ..." passam a se chamar "CSP - ..."
-- ============================================================================
--
-- CONTEXTO: a linha de custo do DRE foi renomeada de "CMV (Custo da
-- Mercadoria/Serviço)" para "Custo dos Serviços Prestados (CSP)" — mas só o
-- RÓTULO de tela. As categorias semeadas em toda empresa nova continuavam se
-- chamando "CMV - Materiais" e "CMV - Mão de Obra Avulsa". O rótulo dizia uma
-- coisa e o dado dizia outra.
--
-- A chave interna `dre_group = 'cmv'` NÃO muda. Ela é valor gravado, não é
-- vista pelo usuário, e trocá-la exigiria mexer em todo consumidor. Só o NOME
-- visível muda.
--
-- 🔴 POR QUE ISTO NÃO É UM UPDATE SIMPLES:
--   `financial_transactions.category` é `text`, NÃO é chave estrangeira — a
--   transação guarda o NOME copiado. Renomear só a categoria orfanaria os
--   lançamentos que apontam para o nome antigo: perderiam grupo do DRE, cor e
--   ícone, em silêncio. Por isso o lançamento é renomeado A PARTIR da própria
--   categoria renomeada (CTE `renomeadas`), na mesma transação — e não por um
--   LIKE cego, que renomearia lançamento cuja categoria não foi tocada.
--
-- MEDIÇÃO EM PRODUÇÃO (só leitura, antes de escrever — reconferida em 18/09):
--   financial_categories : 106 linhas, em 52 empresas (a Glacial tem o par
--     DUPLICADO: 2× "CMV - Materiais" e 2× "CMV - Mão de Obra Avulsa").
--     TODAS as 106 são is_system=true, is_active=true, dre_group='cmv'.
--   financial_transactions: 11 linhas carregando o nome, em 2 empresas
--     (Alô gás Juquitiba 8, Engetec 3). Todas casam com categoria da própria
--     empresa hoje — nenhuma delas está órfã.
--   Varredura de TODA coluna de texto do schema `public` atrás do literal
--     'CMV - ': só bate em financial_categories.name e
--     financial_transactions.category. tenant_subscriptions /
--     tenant_payment_accounts têm 0 (tratadas mesmo assim, defensivamente).
--   Não existe índice único em (company_id, name) — renomear não viola nada.
--   Lançamentos já órfãos hoje (linha de base que não pode piorar): 3
--     ('Funcionários' ×2, 'Combustível' ×1 — nenhum com prefixo CMV/CSP).
--   Lançamentos com prefixo 'CSP - ' (hífen) hoje: 0 — é o que permite a trava
--     exata do passo 4.
--   Nenhuma regra no código compara pelo literal 'CMV - ' (só um comentário
--     em FinanceDRE.tsx:797).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) A semente de empresa nova
--
-- ⚠️ Corpo copiado da DEFINIÇÃO VIVA (`pg_get_functiondef`), não de um arquivo
-- antigo. A função em produção semeia SEIS categorias — 'Pagamento de Fatura'
-- e 'Transferência entre contas' entraram depois (modelagem de fatura de
-- cartão e de transferência entre contas). Reescrever só com as quatro
-- originais faria toda empresa nova nascer SEM elas, em silêncio.
-- Aqui muda exclusivamente o NOME das duas linhas de custo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active)
  VALUES
    (NEW.id, 'Tarifas e Taxas',             'saida',   '#f59e0b', 'Receipt',    'impostos', true, true),
    (NEW.id, 'CSP - Materiais',             'saida',   '#8b5cf6', 'Package',    'cmv',      true, true),
    (NEW.id, 'CSP - Mão de Obra Avulsa',    'saida',   '#06b6d4', 'Wrench',     'cmv',      true, true),
    (NEW.id, 'Vendas de Serviços',          'entrada', '#10b981', 'Briefcase',  'opex',     true, true),
    (NEW.id, 'Pagamento de Fatura',         'saida',   '#6366f1', 'CreditCard', NULL,       true, true),
    (NEW.id, 'Transferência entre contas',  'saida',   '#64748b', 'RefreshCw',  NULL,       true, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) 🔴 O CASO ESPECIAL, resolvido ANTES do rename geral
--
-- Uma empresa (Glacial Cold Brasil) já criou as próprias categorias com o
-- prefixo CSP, usando TRAVESSÃO ("CSP – Mão de Obra Avulsa"). A semente usa
-- HÍFEN. Renomear sem tratar deixaria a empresa com DUAS categorias
-- visualmente idênticas na lista, e não há índice único em (company_id, name)
-- que impeça isso.
--
-- Medido: as categorias SEMEADAS nessa empresa têm ZERO lançamentos. Então
-- desativá-las (soft, reversível) não órfã nada — e é melhor que criar a
-- gêmea. Só toca linha `is_system = true`: categoria criada pelo cliente
-- nunca é desativada por nós.
-- ---------------------------------------------------------------------------
UPDATE public.financial_categories c
   SET is_active = false,
       updated_at = now()
 WHERE c.name LIKE 'CMV - %'
   AND c.dre_group = 'cmv'
   AND c.is_system = true
   AND NOT EXISTS (
         SELECT 1 FROM public.financial_transactions t
          WHERE t.company_id = c.company_id AND t.category = c.name)
   AND EXISTS (
         SELECT 1 FROM public.financial_categories j
          WHERE j.company_id = c.company_id
            AND j.id <> c.id
            AND j.is_active IS DISTINCT FROM false
            AND lower(translate(j.name, '–—', '--'))
              = lower('csp - ' || substring(lower(c.name) from 7)));

-- ---------------------------------------------------------------------------
-- 3) O rename, nas duas pontas, na mesma transação
--
-- A categoria é renomeada primeiro e DEVOLVE (RETURNING) o par
-- (empresa, nome antigo → nome novo). O lançamento é atualizado a partir
-- desse par, e não por um `LIKE 'CMV - %'` solto: assim é impossível renomear
-- um lançamento cuja categoria não foi tocada (o que criaria órfão).
-- Idempotente: rodar de novo não acha mais nada com o prefixo antigo.
-- ---------------------------------------------------------------------------
WITH renomeadas AS (
  UPDATE public.financial_categories
     SET name = 'CSP - ' || substring(name from 7),
         updated_at = now()
   WHERE name LIKE 'CMV - %'
     AND dre_group = 'cmv'
     AND is_system = true
     AND is_active IS DISTINCT FROM false
  RETURNING company_id,
            'CMV - ' || substring(name from 7) AS nome_antigo,
            name                               AS nome_novo
),
alvo AS (
  SELECT DISTINCT company_id, nome_antigo, nome_novo FROM renomeadas
)
UPDATE public.financial_transactions t
   SET category = a.nome_novo
  FROM alvo a
 WHERE t.company_id = a.company_id
   AND t.category   = a.nome_antigo;

-- Auctus-level: medido 0 hoje, tratado defensivamente (um valor pode nascer
-- entre escrever e aplicar).
UPDATE public.tenant_subscriptions
   SET category = 'CSP - ' || substring(category from 7)
 WHERE category LIKE 'CMV - %';

UPDATE public.tenant_payment_accounts
   SET default_income_category = 'CSP - ' || substring(default_income_category from 7)
 WHERE default_income_category LIKE 'CMV - %';

UPDATE public.tenant_payment_accounts
   SET default_fee_category = 'CSP - ' || substring(default_fee_category from 7)
 WHERE default_fee_category LIKE 'CMV - %';

-- ---------------------------------------------------------------------------
-- 4) Trava: nenhum lançamento pode ter ficado órfão
--
-- Três checagens, e QUALQUER uma derruba a transação inteira:
--
--   (a) EXATA — nenhum lançamento com prefixo 'CSP - ' pode ficar sem
--       categoria correspondente na própria empresa. Hoje existem ZERO
--       lançamentos com esse prefixo, então depois do rename esse conjunto é
--       exatamente o que nós tocamos. É a checagem que não pode ser mascarada.
--   (b) AGREGADA — o total de órfãos não pode passar da linha de base (3).
--       Pega efeito colateral fora do prefixo. (Sozinha ela teria um furo:
--       curar um órfão e criar outro manteria a conta em 3 — por isso (a).)
--   (c) Não pode sobrar categoria ATIVA com prefixo 'CMV - '.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_csp_orfaos integer;
  v_orfaos     integer;
  v_base       constant integer := 3;
  v_resto      integer;
  v_cat_csp    integer;
  v_tx_csp     integer;
BEGIN
  -- (a) checagem exata sobre o conjunto que acabamos de tocar
  SELECT count(*) INTO v_csp_orfaos
    FROM public.financial_transactions t
   WHERE t.category LIKE 'CSP - %'
     AND NOT EXISTS (SELECT 1 FROM public.financial_categories c
                      WHERE c.company_id = t.company_id AND c.name = t.category);

  IF v_csp_orfaos > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % lançamento(s) renomeado(s) para CSP ficaram sem categoria na própria empresa.',
      v_csp_orfaos;
  END IF;

  -- (b) a conta global não pode piorar
  SELECT count(*) INTO v_orfaos
    FROM public.financial_transactions t
   WHERE t.category IS NOT NULL AND t.category <> ''
     AND NOT EXISTS (SELECT 1 FROM public.financial_categories c
                      WHERE c.company_id = t.company_id AND c.name = t.category);

  IF v_orfaos > v_base THEN
    RAISE EXCEPTION
      'ABORTADO: lançamentos órfãos subiram de % para %. O rename teria quebrado o vínculo por nome.',
      v_base, v_orfaos;
  END IF;

  -- (c) nada ativo pode continuar com o prefixo antigo
  SELECT count(*) INTO v_resto
    FROM public.financial_categories
   WHERE name LIKE 'CMV - %' AND is_active IS DISTINCT FROM false;

  IF v_resto > 0 THEN
    RAISE EXCEPTION 'ABORTADO: sobraram % categorias ativas com prefixo CMV.', v_resto;
  END IF;

  SELECT count(*) INTO v_cat_csp
    FROM public.financial_categories WHERE name LIKE 'CSP - %';
  SELECT count(*) INTO v_tx_csp
    FROM public.financial_transactions WHERE category LIKE 'CSP - %';

  RAISE NOTICE 'OK: % categorias e % lançamentos com prefixo CSP -; orfaos=% (base %); nenhuma categoria ativa com prefixo CMV.',
    v_cat_csp, v_tx_csp, v_orfaos, v_base;
END
$verify$;

COMMIT;
