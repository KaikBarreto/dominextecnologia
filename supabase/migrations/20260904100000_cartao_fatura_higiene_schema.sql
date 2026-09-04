-- ============================================================================
-- Cartão de crédito — higiene de schema (Onda 2 do plano
-- docs/planos/2026-09-04-cartao-limite-e-pagamento-fatura.md)
--
-- POR QUÊ: o pagamento de fatura vai virar um PAR de lançamentos (saída na conta
-- que paga + entrada no cartão, que é o que devolve o limite). Pra isso o par
-- precisa de (a) um vínculo forte lançamento→fatura, (b) `paid_at` na fatura e
-- (c) a categoria 'Pagamento de Fatura' existindo em TODA empresa, não só nas
-- que já tinham cartão quando o backfill de 20260418210000 rodou.
--
-- Esta migration é 100% aditiva/idempotente e NÃO migra consumidor nenhum: a
-- leitura atual por (account_id, credit_card_bill_date) continua valendo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4d) Vínculo forte lançamento → fatura
-- Hoje o vínculo é só por (account_id, credit_card_bill_date), o que não serve
-- pras pernas de PAGAMENTO — elas nascem com credit_card_bill_date NULL de
-- propósito (se levassem data de fatura virariam "compra" da fatura seguinte e
-- deixariam o total da próxima fatura negativo).
-- ON DELETE SET NULL: apagar a fatura não pode apagar dinheiro do extrato.
-- ----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS bill_id uuid
    REFERENCES public.credit_card_bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_transactions.bill_id IS
  'Fatura de cartão a que este lançamento se refere (usado pelas duas pernas do pagamento de fatura). Coluna aditiva: o vínculo de COMPRA continua sendo (account_id, credit_card_bill_date).';

CREATE INDEX IF NOT EXISTS idx_ft_bill_id
  ON public.financial_transactions(bill_id)
  WHERE bill_id IS NOT NULL;

-- Índice de apoio pro recompute por SUM do estorno (pernas de saída da fatura).
CREATE INDEX IF NOT EXISTS idx_ft_bill_payment_legs
  ON public.financial_transactions(bill_id, transaction_type)
  WHERE bill_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4f) paid_at na fatura
-- OBSERVAÇÃO: a coluna JÁ EXISTE no banco vivo — foi criada em
-- 20260418205347_884a5086 (que criou a tabela de verdade); a migration
-- 20260418210000 que veio depois tinha um CREATE TABLE IF NOT EXISTS sem
-- `paid_at` que virou no-op. Mantido aqui como ALTER idempotente só pra deixar
-- o schema explícito e cobrir ambiente que tenha divergido.
-- ----------------------------------------------------------------------------
ALTER TABLE public.credit_card_bills
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.credit_card_bills.paid_at IS
  'Quando a fatura foi integralmente quitada. Escrito por pay_credit_card_bill(); zerado por revert_credit_card_bill_payment() quando a fatura deixa de estar paga.';

-- ----------------------------------------------------------------------------
-- 4c) Seed de categorias de sistema
--
-- Recriada a partir da definição VIVA da função (só existe UMA definição no
-- histórico — 20260418195512_3d86466b, sem nenhum CREATE OR REPLACE posterior;
-- conferido com grep em supabase/migrations/**). As 4 categorias originais
-- estão preservadas na íntegra (nome, tipo, cor, ícone, dre_group) e as duas
-- novas foram ACRESCENTADAS ao final.
--
-- POR QUÊ: 'Pagamento de Fatura' nunca esteve no seed — entrou só por backfill
-- (20260418210000) pras empresas que já tinham conta do tipo 'cartao'. Empresa
-- nova nascia sem ela, e agora ela é obrigatória (a RPC de pagamento carimba
-- essa categoria nas duas pernas). 'Transferência entre contas' é a categoria
-- que useFinancialAccounts.ts já usa em transferência e também nunca foi
-- semeada.
--
-- Ambas: type 'saida', is_system true, dre_group NULL (dre_group NULL = fora
-- da DRE; par de transferência não é receita nem despesa).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_system_financial_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active)
  VALUES
    (NEW.id, 'Tarifas e Taxas', 'saida', '#f59e0b', 'Receipt', 'impostos', true, true),
    (NEW.id, 'CMV - Materiais', 'saida', '#8b5cf6', 'Package', 'cmv', true, true),
    (NEW.id, 'CMV - Mão de Obra Avulsa', 'saida', '#06b6d4', 'Wrench', 'cmv', true, true),
    (NEW.id, 'Vendas de Serviços', 'entrada', '#10b981', 'Briefcase', 'opex', true, true),
    (NEW.id, 'Pagamento de Fatura', 'saida', '#6366f1', 'CreditCard', NULL, true, true),
    (NEW.id, 'Transferência entre contas', 'saida', '#64748b', 'RefreshCw', NULL, true, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_system_financial_categories ON public.companies;
CREATE TRIGGER trg_seed_system_financial_categories
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_system_financial_categories();

-- ----------------------------------------------------------------------------
-- Backfill das duas categorias pras empresas EXISTENTES que não as tenham.
--
-- ATENÇÃO: public.financial_categories NÃO tem UNIQUE(company_id, name)
-- (conferido em 20260308052208 + todo o histórico). Logo `ON CONFLICT DO
-- NOTHING` aqui só cobriria a PK e NÃO evitaria duplicata — a idempotência real
-- vem do NOT EXISTS abaixo. Rodar 2x não duplica.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fatura  integer := 0;
  v_transf  integer := 0;
  v_icone   integer := 0;
BEGIN
  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active, sort_order)
  SELECT c.id, 'Pagamento de Fatura', 'saida', '#6366f1', 'CreditCard', NULL, true, true, 99
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_categories fc
    WHERE fc.company_id = c.id AND fc.name = 'Pagamento de Fatura'
  );
  GET DIAGNOSTICS v_fatura = ROW_COUNT;

  INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system, is_active, sort_order)
  SELECT c.id, 'Transferência entre contas', 'saida', '#64748b', 'RefreshCw', NULL, true, true, 99
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_categories fc
    WHERE fc.company_id = c.id AND fc.name = 'Transferência entre contas'
  );
  GET DIAGNOSTICS v_transf = ROW_COUNT;

  -- Normaliza o ícone das linhas antigas. O backfill de 20260418210000:40
  -- gravou 'credit-card' (kebab-case) — é a ÚNICA ocorrência desse formato no
  -- repo inteiro. A chave real vem de CATEGORY_ICONS
  -- (src/components/financial/categoryIcons.ts), que é PascalCase, então
  -- 'credit-card' não resolve e a categoria cai no ícone genérico de fallback.
  -- Cosmético e pré-existente, mas é a mesma linha que esta migration está
  -- semeando corretamente agora — deixar as duas convivendo seria criar
  -- divergência entre empresa nova e empresa antiga.
  UPDATE public.financial_categories
     SET icon = 'CreditCard'
   WHERE name = 'Pagamento de Fatura'
     AND icon = 'credit-card';
  GET DIAGNOSTICS v_icone = ROW_COUNT;

  RAISE NOTICE 'seed categorias: % empresas ganharam "Pagamento de Fatura", % ganharam "Transferência entre contas", % ícones normalizados', v_fatura, v_transf, v_icone;
END $$;

-- ----------------------------------------------------------------------------
-- 4g) Consolidação das policies duplicadas de credit_card_bills
--
-- Regra definida pelo 🛡️ dev-plataforma-multitenant em
-- docs/planos/2026-09-04-cartao-seguranca-rpc.md §3.2/§3.3. Aqui só implemento.
--
-- ESTADO VIVO: 5 policies. Duas migrations criaram a mesma tabela no mesmo dia.
-- 20260418205347 roda primeiro (tabela + 4 granulares, TO authenticated);
-- 20260418210000 roda depois — o CREATE TABLE IF NOT EXISTS vira no-op, mas o
-- CREATE POLICY não é condicional e acrescenta a quinta, uma FOR ALL.
--
-- DECISÃO: ficam as 4 GRANULARES, cai a FOR ALL. Motivos:
--   1. A FOR ALL não tem cláusula TO → vale pro papel `public`, incluindo anon.
--      Hoje não vaza (predicado dá NULL pra anon e company_id é NOT NULL), mas é
--      superfície oferecida a visitante não autenticado apoiada num acidente
--      feliz de tipagem.
--   2. Policy permissiva soma por OR: enquanto a FOR ALL existir, QUALQUER
--      restrição granular futura (ex.: exigir gestor pro DELETE) é letra morta.
--      Não é hipótese — é o que já acontece em financial_transactions hoje.
--   3. As 4 granulares TO authenticated são o padrão dominante do repo.
--
-- ⚠️ NÃO REGREDIR O INITPLAN: as 5 policies já foram embrulhadas em
-- (SELECT get_user_company_id(auth.uid())) por 20260826161618_rls_wrap_auth_initplan
-- (linhas 1306-1360). Recriar com a chamada CRUA jogaria fora um ganho medido de
-- 800ms→17ms (buffers 176k→551): chamada crua de função de auth é reavaliada
-- POR LINHA mesmo sendo STABLE; embrulhada vira InitPlan, 1x por query.
-- As 4 recriadas abaixo nascem embrulhadas.
--
-- A UPDATE ganha WITH CHECK EXPLÍCITO. O Postgres reusa o USING quando o
-- WITH CHECK é omitido (estado atual, seguro), mas deixar implícito num
-- predicado de tenant é convite a alguém "otimizar" o USING um dia e abrir
-- UPDATE ... SET company_id = '<outro tenant>'.
--
-- Sem OR is_super_admin: preserva o comportamento atual desta tabela (spec §1.6).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their company credit card bills"        ON public.credit_card_bills;  -- 205347
DROP POLICY IF EXISTS "Users can create credit card bills for their company"  ON public.credit_card_bills;  -- 205347
DROP POLICY IF EXISTS "Users can update their company credit card bills"      ON public.credit_card_bills;  -- 205347
DROP POLICY IF EXISTS "Users can delete their company credit card bills"      ON public.credit_card_bills;  -- 205347
DROP POLICY IF EXISTS "Users can manage their company credit card bills"      ON public.credit_card_bills;  -- 210000 (FOR ALL, sem TO)

ALTER TABLE public.credit_card_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company credit card bills"
  ON public.credit_card_bills FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

CREATE POLICY "Users can create credit card bills for their company"
  ON public.credit_card_bills FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.get_user_company_id(auth.uid())));

CREATE POLICY "Users can update their company credit card bills"
  ON public.credit_card_bills FOR UPDATE TO authenticated
  USING      (company_id = (SELECT public.get_user_company_id(auth.uid())))
  WITH CHECK (company_id = (SELECT public.get_user_company_id(auth.uid())));

CREATE POLICY "Users can delete their company credit card bills"
  ON public.credit_card_bills FOR DELETE TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

-- ----------------------------------------------------------------------------
-- CONFERIR ANTES DE APLICAR (spec §5.6) — divergência de tipo entre as duas
-- migrations de origem: `amount_paid`/`credit_limit` estão como `numeric` numa e
-- `DECIMAL(10,2)` na outra, e ADD COLUMN IF NOT EXISTS NÃO corrige tipo de
-- coluna já existente. DECIMAL(10,2) estoura acima de ~99 milhões. Rodar:
--
--   SELECT c.relname, a.attname,
--          format_type(a.atttypid, a.atttypmod) AS tipo_vivo
--     FROM pg_attribute a
--     JOIN pg_class c ON c.oid = a.attrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND ( (c.relname = 'credit_card_bills'  AND a.attname IN ('amount_paid'))
--         OR (c.relname = 'financial_accounts' AND a.attname IN ('credit_limit')) )
--      AND a.attnum > 0 AND NOT a.attisdropped;
--
-- Esperado (a tabela foi criada por 20260418205347): `numeric` sem precisão nos
-- dois. Se vier `numeric(10,2)`, abrir ticket separado pra ALTER TYPE — NÃO
-- corrigir junto com um hotfix financeiro.
-- ----------------------------------------------------------------------------
