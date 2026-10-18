-- ============================================================================
-- Fluxo de caixa PREVISTO, dia a dia — base de banco (Dominex)
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE
-- O financeiro do cliente hoje só olha PRA TRÁS (DRE e DFC realizado). O painel
-- que o BPO financeiro monta à mão no Power BI (reuniões de 17 e 18/10/2026)
-- olha PRA FRENTE: saldo de partida + entradas e saídas previstas por dia +
-- dívida vencida como ESTOQUE separado. Esta migration entrega as 5 peças de
-- banco que o motor `src/lib/cash-flow-forecast.ts` precisa e que não existiam:
--
--   1. financial_accounts.is_cash_account            — perímetro do caixa
--   2. financial_categories.dre_group += 'nao_operacional' (+ CHECK)
--   3. 4 categorias de sistema (aporte / distribuição / aplicação / resgate)
--   4. company_settings.cash_flow_overdue_window_days — janela da dívida
--   5. RPC cash_flow_opening_balances(date)          — saldo de partida
--
-- NOTA DE TIMESTAMP (2026-10-18)
-- Máximo remoto em supabase_migrations.schema_migrations ao nomear este arquivo
-- = 20261018220000 (conferido via Management API). O nome originalmente pedido,
-- 20261018190000, estava JÁ REGISTRADO (assim como 200000 e 210000-213000, de
-- sessões paralelas), e timestamp registrado faz o `db push` dizer "up to date"
-- e PULAR o arquivo pra sempre, em silêncio. Por isso se confere o REMOTO,
-- nunca o `ls` local — o worktree não vê o que as outras sessões aplicaram.
--
-- ── INVARIANTES ───────────────────────────────────────────────────────────
--
-- A. IDEMPOTENTE DO COMEÇO AO FIM. ADD COLUMN IF NOT EXISTS, CHECK criado só
--    quando não existe, seed com ON CONFLICT DO NOTHING. Rodar 2x não pode
--    mudar nada na segunda vez.
--
-- B. NADA DE DADO DO CLIENTE É REESCRITO. As 124 linhas com dre_group NULL em
--    produção FICAM NULL (o CHECK aceita NULL de propósito e o código tem
--    fallback). Categoria que a empresa já criou com um dos 4 nomes novos NÃO
--    tem dre_group/dfc_group sobrescrito: pode ser escolha dela.
--
-- C. UM SÓ MECANISMO DE SEMENTE. As 4 categorias novas entram na MESMA função
--    de gatilho que já semeia as 6 atuais (seed_system_financial_categories,
--    AFTER INSERT ON companies). Um segundo mecanismo divergiria no primeiro
--    patch — é a lição do resolvedor por papel.
--
-- D. O SALDO DE PARTIDA TEM RÉGUA PRÓPRIA E EXPLÍCITA. Hoje o saldo é
--    calculado em DOIS lugares no client, com TRÊS divergências medidas em
--    18/10/2026. Ver o comentário da RPC. O previsto não herda nenhuma.
--
-- E. `anon` NUNCA EXECUTA A RPC. No Supabase, função nova em `public` nasce com
--    EXECUTE pro `anon` por causa de ALTER DEFAULT PRIVILEGES, e
--    `REVOKE ALL FROM PUBLIC` NÃO tira isso (o grant pro anon é NOMINAL no
--    proacl). Precisa de REVOKE nominal, e a migration PROVA no fim, dentro da
--    própria transação: se `anon` escapar, o COMMIT é abortado.
--
-- F. RPC SECURITY DEFINER NÃO PASSA POR RLS. A checagem de empresa é cobrada À
--    MÃO, com o MESMO guarda de papel do resto do financeiro
--    (_reconcile_assert_company), e nunca com `auth.uid() IS NULL` como passe
--    livre — o papel `anon` também tem uid NULL.
-- ============================================================================


-- ===========================================================================
-- 1. financial_accounts.is_cash_account — o perímetro do caixa operacional
-- ===========================================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS is_cash_account boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.financial_accounts.is_cash_account IS
  'Esta flag diz se a conta compõe o CAIXA OPERACIONAL no relatório de fluxo de caixa previsto. '
  'Conta de poupança/investimento deve ficar false — assim transferir dinheiro pra ela aparece '
  'como SAÍDA do caixa, e resgatar aparece como ENTRADA. '
  'A flag é MUTÁVEL e SEM HISTÓRICO: desmarcar hoje reclassifica transferências passadas. Isso é '
  'aceitável num relatório de PREVISÃO (que é sempre uma foto do presente olhando pra frente) e é '
  'PROIBIDO no DRE e no DFC realizado, que são publicados ao cliente e precisam ser estáveis no '
  'tempo — NUNCA importe esta coluna naqueles dois. '
  'Cartão de crédito IGNORA a flag: cartão não é caixa, tem fatura. O código já trata isso '
  '(isInCashPerimeter testa type <> ''cartao'' ANTES da flag, justamente porque o DEFAULT true '
  'faria um cartão herdar true e injetar saldo falso no caixa).';


-- ===========================================================================
-- 2. financial_categories.dre_group ganha 'nao_operacional' + CHECK
--
--    A coluna é `text` com DEFAULT 'opex' e NUNCA teve CHECK. Distribuição
--    medida em produção em 18/10/2026, antes desta migration:
--      opex 796 · cmv 262 · impostos 126 · (NULL) 124 · outros 7
--    Nenhum valor fora da lista (provado por SELECT antes de criar o CHECK).
--
--    As 124 linhas NULL NÃO são normalizadas: o código já tem fallback pra NULL
--    (trata como 'opex'), e reescrever classificação do cliente por estética de
--    schema é exatamente o tipo de "limpeza" que já custou dado neste projeto.
-- ===========================================================================

DO $dre_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_categories'::regclass
       AND conname  = 'financial_categories_dre_group_check'
  ) THEN
    -- Trava de segurança: se existir valor fora da lista, aborta a migration
    -- inteira em vez de o ALTER falhar com mensagem genérica de violação.
    IF EXISTS (
      SELECT 1 FROM public.financial_categories
       WHERE dre_group IS NOT NULL
         AND dre_group NOT IN ('impostos', 'cmv', 'opex', 'outros', 'nao_operacional')
    ) THEN
      RAISE EXCEPTION
        'financial_categories.dre_group tem valor fora da lista permitida; normalize com decisão humana antes de travar o CHECK';
    END IF;

    ALTER TABLE public.financial_categories
      ADD CONSTRAINT financial_categories_dre_group_check
      CHECK (dre_group IS NULL OR dre_group IN ('impostos', 'cmv', 'opex', 'outros', 'nao_operacional'));
  END IF;
END
$dre_check$;

COMMENT ON COLUMN public.financial_categories.dre_group IS
  'Onde a categoria entra no resultado. Semântica (decisão do BPO financeiro, 18/10/2026): '
  '• impostos / cmv / opex — entram no cálculo do resultado (ACIMA da linha). '
  '• outros — SAI DO DRE INTEIRO e aparece só no fluxo de caixa: aporte de sócio, resgate de '
  'aplicação, empréstimo recebido. Palavras do BPO: "aporte não entra no DRE; aporte pode entrar '
  'no fluxo de caixa, mas não no DRE". '
  '• nao_operacional — aparece ABAIXO do resultado líquido, no bloco "Despesas não operacionais": '
  'distribuição de lucros, investimento, manutenção de imobilizado. Diferente de `outros` porque o '
  'BPO quer dividendo visível no DRE ("pra ter visibilidade"), só não contaminando o resultado. '
  '• NULL — tratado como `opex` pelo código. 124 linhas em produção estão NULL de propósito; não '
  'normalize.';


-- ===========================================================================
-- 3. Quatro categorias de sistema, por empresa
--
--    Mecanismo ÚNICO (invariante C): a MESMA função de gatilho que já semeia as
--    6 atuais. Empresa nova nasce com as 10; empresa existente recebe as 4 no
--    backfill abaixo, que reusa a MESMA lista de VALUES.
--
--    ⚠️ Existe UNIQUE INDEX financial_categories_company_id_name_key
--    (company_id, name). ON CONFLICT DO NOTHING é obrigatório e é também a
--    regra de negócio: se a empresa JÁ criou "Aporte de sócios" à mão,
--    dre_group/dfc_group dela NÃO são sobrescritos — pode ser escolha do
--    cliente. A gente só não duplica.
--
--    dfc_group respeita o CHECK já existente
--    (operacional | investimento | financiamento).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $seed$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, dfc_group, is_system, is_active)
  VALUES
    -- As 6 de sempre (inalteradas; dfc_group segue NULL como nasciam).
    (NEW.id, 'Tarifas e Taxas',            'saida',   '#f59e0b', 'Receipt',     'impostos',        NULL,            true, true),
    (NEW.id, 'CSP - Materiais',            'saida',   '#8b5cf6', 'Package',     'cmv',             NULL,            true, true),
    (NEW.id, 'CSP - Mão de Obra Avulsa',   'saida',   '#06b6d4', 'Wrench',      'cmv',             NULL,            true, true),
    (NEW.id, 'Vendas de Serviços',         'entrada', '#10b981', 'Briefcase',   'opex',            NULL,            true, true),
    (NEW.id, 'Pagamento de Fatura',        'saida',   '#6366f1', 'CreditCard',  NULL,              NULL,            true, true),
    (NEW.id, 'Transferência entre contas', 'saida',   '#64748b', 'RefreshCw',   NULL,              NULL,            true, true),
    -- As 4 do fluxo de caixa previsto.
    (NEW.id, 'Aporte de sócios',           'entrada', '#0ea5e9', 'HandCoins',   'outros',          'financiamento', true, true),
    (NEW.id, 'Distribuição de lucros',     'saida',   '#f97316', 'Handshake',   'nao_operacional', 'financiamento', true, true),
    (NEW.id, 'Aplicação financeira',       'saida',   '#0d9488', 'Landmark',    'nao_operacional', 'investimento',  true, true),
    (NEW.id, 'Resgate de aplicação',       'entrada', '#14b8a6', 'TrendingUp',  'outros',          'investimento',  true, true)
  ON CONFLICT (company_id, name) DO NOTHING;
  RETURN NEW;
END;
$seed$;

COMMENT ON FUNCTION public.seed_system_financial_categories() IS
  'Semeia as categorias financeiras de SISTEMA de uma empresa nova (AFTER INSERT ON companies). '
  'É o mecanismo ÚNICO de semente — nenhum outro caminho pode criar categoria de sistema, senão o '
  'resolvedor por papel (src/lib/finance-system-categories.ts) fica ambíguo. ON CONFLICT DO NOTHING '
  'protege a empresa que já tem uma categoria com o mesmo nome: o cadastro dela não é sobrescrito.';

-- Backfill: as 4 novas em TODA empresa existente. DML que toca todos os tenants
-- é DELIBERADO aqui (é catálogo de sistema, não dado operacional) e autorizado.
DO $backfill$
DECLARE
  v_before integer;
  v_after  integer;
BEGIN
  SELECT count(*) INTO v_before
    FROM public.financial_categories
   WHERE is_system
     AND name IN ('Aporte de sócios', 'Distribuição de lucros', 'Aplicação financeira', 'Resgate de aplicação');

  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, dfc_group, is_system, is_active)
  SELECT c.id, v.name, v.type, v.color, v.icon, v.dre_group, v.dfc_group, true, true
    FROM public.companies c
    CROSS JOIN (VALUES
      ('Aporte de sócios',       'entrada', '#0ea5e9', 'HandCoins',  'outros',          'financiamento'),
      ('Distribuição de lucros', 'saida',   '#f97316', 'Handshake',  'nao_operacional', 'financiamento'),
      ('Aplicação financeira',   'saida',   '#0d9488', 'Landmark',   'nao_operacional', 'investimento'),
      ('Resgate de aplicação',   'entrada', '#14b8a6', 'TrendingUp', 'outros',          'investimento')
    ) AS v(name, type, color, icon, dre_group, dfc_group)
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT count(*) INTO v_after
    FROM public.financial_categories
   WHERE is_system
     AND name IN ('Aporte de sócios', 'Distribuição de lucros', 'Aplicação financeira', 'Resgate de aplicação');

  RAISE NOTICE 'Categorias de sistema do fluxo previsto: % antes, % depois (+%). Empresas: %.',
    v_before, v_after, v_after - v_before, (SELECT count(*) FROM public.companies);
END
$backfill$;


-- ===========================================================================
-- 4. company_settings.cash_flow_overdue_window_days — a janela da dívida
-- ===========================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS cash_flow_overdue_window_days integer NOT NULL DEFAULT 90;

DO $window_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.company_settings'::regclass
       AND conname  = 'company_settings_cash_flow_overdue_window_days_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_cash_flow_overdue_window_days_check
      CHECK (cash_flow_overdue_window_days IN (0, 7, 15, 30, 90));
  END IF;
END
$window_check$;

COMMENT ON COLUMN public.company_settings.cash_flow_overdue_window_days IS
  'Limita QUANTO TEMPO PRA TRÁS o fluxo de caixa previsto procura conta VENCIDA e NÃO PAGA pra '
  'compor a dívida. Valores aceitos: 7, 15, 30, 90 e 0 — onde 0 significa SEM LIMITE, mostrar toda '
  'a dívida. Padrão 90 (3 meses). '
  'POR QUE EXISTE: sem teto, um cliente com 3 anos de recebível esquecido abre o relatório no '
  'primeiro dia e vê uma dívida gigante feita de coisa velha que ninguém vai cobrar — e perde a '
  'confiança no número inteiro. Decisão do BPO financeiro (18/10/2026): "a gente pode iniciar um '
  'padrão com três meses de dívida; passou disso, ele some. Mas não existe uma regra" — daí ser '
  'configurável por empresa e não constante no código.';


-- ===========================================================================
-- 5. RPC cash_flow_opening_balances(p_today date) — saldo de partida
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.cash_flow_opening_balances(p_today date)
RETURNS TABLE (account_id uuid, balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
  v_today   date;
BEGIN
  -- ── Guarda (invariante F) ────────────────────────────────────────────────
  -- uid NULL RECUSA (direção segura). Usar `uid IS NULL` como passe livre é
  -- como o EcoSistema entregou financeiro de 13 empresas pra visitante: o papel
  -- `anon` também tem uid NULL.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma empresa.' USING ERRCODE = '42501';
  END IF;

  -- Detecção de papel / super_admin / service_role: UMA implementação no
  -- projeto, reusada de propósito.
  PERFORM public._reconcile_assert_company(v_company);

  IF NOT public.tenant_subscription_allows_access(v_company) THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: o fluxo de caixa está bloqueado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_plan_allows_product_area(v_company, 'finance') THEN
    RAISE EXCEPTION 'O plano desta empresa não inclui o Financeiro.'
      USING ERRCODE = '42501';
  END IF;

  v_today := coalesce(p_today, current_date);

  -- ── Régua (invariante D) ─────────────────────────────────────────────────
  RETURN QUERY
  SELECT a.id,
         round(a.initial_balance + coalesce(m.delta, 0), 2)
    FROM public.financial_accounts a
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN t.transaction_type = 'entrada' THEN t.amount ELSE -t.amount END) AS delta
        FROM public.financial_transactions t
       WHERE t.account_id = a.id
         AND t.company_id = v_company
         AND t.is_paid IS TRUE               -- só o realizado mexe em saldo
         AND t.cancelled_at IS NULL          -- cancelado não moveu dinheiro
         AND t.credit_card_bill_date IS NULL -- compra de cartão não é caixa
         AND t.paid_date IS NOT NULL
         AND t.paid_date <= v_today          -- pago com data FUTURA não entra
    ) m ON TRUE
   WHERE a.company_id = v_company
     AND a.type <> 'cartao';
END;
$fn$;

COMMENT ON FUNCTION public.cash_flow_opening_balances(date) IS
$doc$Saldo de PARTIDA do fluxo de caixa previsto, por conta, no fim de p_today.

Existe porque hoje o saldo é calculado em DOIS lugares no client, com TRÊS
divergências entre si (medidas em 18/10/2026):

  |   | balancesQuery (useFinancialAccounts) | walkAccountBalance (finance-balance) |
  |---|---|---|
  | 1 | NÃO exclui credit_card_bill_date     | exclui                               |
  | 2 | EXCLUI cancelled_at                  | NÃO exclui                           |
  | 3 | sem corte de paid_date (conta pagamento com data FUTURA) | idem          |

E FinanceMovimentacoes ancora a segunda na primeira, propagando as duas. O
previsto não pode herdar essa confusão, então tem régua PRÓPRIA e EXPLÍCITA, e
só ela — a MESMA de deriveForecastOpeningBalances em
src/lib/cash-flow-forecast-sources.ts, pra servidor e client nunca discordarem:

  initial_balance + Σ(entrada − saida) das transações com
    is_paid = true
    AND cancelled_at IS NULL
    AND credit_card_bill_date IS NULL
    AND paid_date IS NOT NULL AND paid_date <= p_today

paid_date NULL fica FORA: é o que o client faz, e manter as duas pontas
idênticas vale mais do que a diferença (medido em 18/10/2026: 0 de 476
transações pagas com conta tinham paid_date NULL — a tela já exige a data).
Se isso mudar, mude NAS DUAS PONTAS na mesma leva.

Ajuste de saldo (categoria reservada) nasce is_paid e ENTRA — é justamente o
lançamento que faz o saldo do sistema bater com o do banco. Nada é excluído por
`category`, que é texto livre; o corte é todo ESTRUTURAL.

Devolve TODAS as contas da empresa com type <> 'cartao', dentro E fora do
perímetro (is_cash_account true ou false) e ativas ou não: quem recorta o
perímetro é a tela, que precisa mostrar a poupança separada do caixa. Cartão
fica fora porque não tem saldo de conta, tem fatura.

SECURITY DEFINER, logo NÃO passa por RLS: company_id vem SEMPRE de
get_user_company_id(auth.uid()), nunca do client, e a guarda de papel +
assinatura + área do plano é cobrada À MÃO aqui dentro.$doc$;


-- ===========================================================================
-- 6. GRANTS
--     `anon` revogado NOMINALMENTE (invariante E): o ALTER DEFAULT PRIVILEGES
--     do Supabase concede EXECUTE a ele EXPLICITAMENTE no proacl, e
--     `REVOKE ALL ... FROM PUBLIC` não tira grant nominal.
-- ===========================================================================

REVOKE ALL ON FUNCTION public.cash_flow_opening_balances(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cash_flow_opening_balances(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.cash_flow_opening_balances(date) TO authenticated, service_role;


-- ===========================================================================
-- 7. PROVA, dentro da própria transação.
--     Se qualquer peça faltar ou `anon` escapar, a migration NÃO COMMITA.
-- ===========================================================================

DO $proof$
DECLARE
  v_sig text := 'public.cash_flow_opening_balances(date)';
  v_n   integer;
BEGIN
  -- 1. Colunas novas, com o NOT NULL e o DEFAULT certos.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'financial_accounts'
       AND column_name = 'is_cash_account' AND is_nullable = 'NO'
       AND column_default = 'true'
  ) THEN
    RAISE EXCEPTION 'financial_accounts.is_cash_account nao esta como boolean NOT NULL DEFAULT true';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'company_settings'
       AND column_name = 'cash_flow_overdue_window_days' AND is_nullable = 'NO'
       AND column_default = '90'
  ) THEN
    RAISE EXCEPTION 'company_settings.cash_flow_overdue_window_days nao esta como integer NOT NULL DEFAULT 90';
  END IF;

  -- 2. Os dois CHECKs.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_categories'::regclass
       AND conname = 'financial_categories_dre_group_check'
  ) THEN
    RAISE EXCEPTION 'falta o CHECK de financial_categories.dre_group';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.company_settings'::regclass
       AND conname = 'company_settings_cash_flow_overdue_window_days_check'
  ) THEN
    RAISE EXCEPTION 'falta o CHECK de company_settings.cash_flow_overdue_window_days';
  END IF;

  -- 3. As 4 categorias de sistema existem em TODA empresa.
  SELECT count(*) INTO v_n
    FROM public.companies c
   WHERE (
     SELECT count(*) FROM public.financial_categories fc
      WHERE fc.company_id = c.id
        AND fc.name IN ('Aporte de sócios', 'Distribuição de lucros',
                        'Aplicação financeira', 'Resgate de aplicação')
   ) <> 4;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% empresa(s) ficaram sem alguma das 4 categorias do fluxo previsto', v_n;
  END IF;

  -- 4. A RPC existe com a assinatura e os atributos certos.
  IF to_regprocedure(v_sig) IS NULL THEN
    RAISE EXCEPTION 'RPC % nao existe', v_sig;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.oid = to_regprocedure(v_sig)
     AND p.prosecdef                       -- SECURITY DEFINER
     AND p.provolatile = 's'               -- STABLE
     AND p.proconfig @> ARRAY['search_path=public'];
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'RPC % nao esta SECURITY DEFINER + STABLE + SET search_path = public', v_sig;
  END IF;

  -- 5. INVARIANTE E: `anon` nao executa.
  IF has_function_privilege('anon', to_regprocedure(v_sig), 'EXECUTE') THEN
    RAISE EXCEPTION 'anon AINDA executa % — o REVOKE nominal nao pegou', v_sig;
  END IF;
  IF NOT has_function_privilege('authenticated', to_regprocedure(v_sig), 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated NAO executa % — o app quebraria em runtime', v_sig;
  END IF;
  IF NOT has_function_privilege('service_role', to_regprocedure(v_sig), 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role NAO executa %', v_sig;
  END IF;

  -- 6. O gatilho de semente continua armado (o CREATE OR REPLACE nao o recria).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.companies'::regclass
       AND tgname = 'trg_seed_system_financial_categories'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_seed_system_financial_categories nao esta mais em public.companies';
  END IF;

  RAISE NOTICE 'Fluxo de caixa previsto: base conferida — 2 colunas, 2 CHECKs, 4 categorias por empresa, 1 RPC sem anon.';
END
$proof$;
