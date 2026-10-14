-- ============================================================================
-- Programa de Afiliados — FASE 4: RPCs DE REPASSE
-- ============================================================================
-- Port de 20260723190000_pay_affiliate_balance_rpc.sql e
-- 20260902220000_pay_affiliate_month_rpc.sql do EcoSistema.
--
-- Pagar o afiliado é DESPESA da Auctus (a operadora do SaaS), então o
-- lançamento vai no ledger ADMIN (public.admin_financial_transactions).
-- NÃO toca no financeiro do tenant.
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 1 — gate de admin. O Eco usa has_role(auth.uid(),'admin'::app_role);
-- o Dominex não tem esse app_role no painel master. Aqui o gate é
-- public.is_admin_user(auth.uid()) (= is_super_admin OR tem linha em
-- admin_permissions), criada em 20260512205543_salespeople_admin_user_access.sql.
--
-- Por que is_admin_user() e NÃO can_manage_affiliates(): o gate de LEITURA das
-- tabelas (RLS) usa can_manage_affiliates(), que exclui quem é afiliado. Aqui o
-- efeito prático é o mesmo — um afiliado não tem admin_permissions —, e usar
-- is_admin_user() mantém paridade literal com o resto das RPCs de dinheiro do
-- painel master. Em DEFINER o gate é explícito de qualquer jeito (Forma A).
--
-- ----------------------------------------------------------------------------
-- CONVENÇÃO DO LEDGER — CONFIRMADA NO BANCO DO DOMINEX em 2026-10-14, não
-- herdada do Eco:
--   * admin_financial_transactions tem UM único CHECK:
--       admin_financial_transactions_type_check: type IN ('income','expense')
--     -> 'expense' passa.
--   * `category` NÃO tem CHECK, mas existe o catálogo admin_financial_categories,
--     onde há a linha is_system name='commission', label='Comissões',
--     type='expense', is_active=true.
--   * a comissão de VENDEDOR do Dominex já lança exatamente como
--     ('expense','commission') — 4 linhas com reference_type =
--     'salesperson_payment_commission'.
--   -> Ou seja: ('expense','commission') É a convenção do próprio Dominex, não
--      só a do Eco. Nenhum seed novo de categoria é necessário.
--   * reference_type = 'affiliate_payment' é novo e DISTINTO de propósito: é o
--     que impede o RecentTransactionsList de tentar parear este lançamento com
--     um 'salary' do mesmo nome (o pareamento comissão<->salário do vendedor).
--
-- ----------------------------------------------------------------------------
-- PARIDADE OBRIGATÓRIA entre pay_affiliate_balance e pay_affiliate_month.
-- Se divergirem, o DRE do admin passa a depender de QUAL botão foi clicado.
-- As duas fazem, na MESMA ordem e atomicamente:
--   1) valida admin                      -> senão RAISE 'not authorized'
--   2) resolve o nome do afiliado        -> senão RAISE 'affiliate not found'
--   3) soma commission_amount das pending no escopo -> se <= 0, RAISE 'no pending commissions'
--   4) INSERT em affiliate_payments (created_by = auth.uid()) RETURNING *
--   5) UPDATE das comissões -> status='paid' + affiliate_payment_id, NO MESMO ESCOPO da soma
--   6) INSERT da despesa em admin_financial_transactions
--   7) UPDATE affiliate_payments.admin_transaction_id de volta
--   8) RETURNS public.affiliate_payments
--
-- O passo 5 usar EXATAMENTE o mesmo predicado do passo 3 não é estilo: é o que
-- garante que o total pago == a soma das comissões marcadas como pagas. Qualquer
-- diferença de filtro vira comissão paga sem repasse (ou repasse sem comissão).
--
-- Diferenças deliberadas (só de ESCOPO):
--   * balance: saldo inteiro do afiliado, ou só as comissões de p_commission_ids;
--              reference_month é informativo e pode ser NULL.
--   * month:   só as pending DAQUELE reference_month; reference_month preenchido,
--              normalizado pro 1º dia do mês; erro 'affiliate month already paid'
--              se o mês já foi fechado (respaldado pelo índice único parcial
--              uidx_affiliate_payments_affiliate_month, já criado na 20261014160000).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. pay_affiliate_balance — paga o saldo inteiro ou uma seleção de comissões
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_affiliate_balance(
  p_affiliate_id   uuid,
  p_payment_method text DEFAULT 'pix',
  p_reference_month date DEFAULT NULL,
  p_commission_ids uuid[] DEFAULT NULL
)
RETURNS public.affiliate_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $paybal$
DECLARE
  v_total   numeric;
  v_payment public.affiliate_payments;
  v_tx_id   uuid;
  v_name    text;
BEGIN
  -- 1) Gate explícito (DEFINER bypassa RLS).
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- 2) Afiliado existe?
  SELECT name INTO v_name FROM public.affiliates WHERE id = p_affiliate_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'affiliate not found';
  END IF;

  -- 3) Soma do escopo.
  SELECT COALESCE(sum(commission_amount), 0) INTO v_total
  FROM public.affiliate_commissions
  WHERE affiliate_id = p_affiliate_id
    AND status = 'pending'
    AND (p_commission_ids IS NULL OR id = ANY (p_commission_ids));

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'no pending commissions';
  END IF;

  -- 4) Repasse.
  INSERT INTO public.affiliate_payments
    (affiliate_id, total_amount, reference_month, payment_method, created_by)
  VALUES
    (p_affiliate_id, v_total, p_reference_month, p_payment_method, auth.uid())
  RETURNING * INTO v_payment;

  -- 5) Marca as comissões — MESMO predicado do passo 3.
  UPDATE public.affiliate_commissions
     SET status = 'paid',
         affiliate_payment_id = v_payment.id
   WHERE affiliate_id = p_affiliate_id
     AND status = 'pending'
     AND (p_commission_ids IS NULL OR id = ANY (p_commission_ids));

  -- 6) Despesa no ledger admin.
  INSERT INTO public.admin_financial_transactions
    (type, category, amount, description, reference_id, reference_type, transaction_date, created_by)
  VALUES
    ('expense', 'commission', v_total,
     'Comissão afiliado - ' || COALESCE(v_name, '?'),
     v_payment.id, 'affiliate_payment', now(), auth.uid())
  RETURNING id INTO v_tx_id;

  -- 7) Vínculo de volta.
  UPDATE public.affiliate_payments
     SET admin_transaction_id = v_tx_id
   WHERE id = v_payment.id;

  v_payment.admin_transaction_id := v_tx_id;

  RETURN v_payment;
END;
$paybal$;

COMMENT ON FUNCTION public.pay_affiliate_balance(uuid, text, date, uuid[]) IS
  'Repasse de comissão de afiliado por SALDO: paga todas as comissões pending do afiliado, ou só as de p_commission_ids. Atômica: cria affiliate_payments, marca as comissões como paid e lança a despesa (expense/commission/affiliate_payment) no ledger admin. Mantém paridade obrigatória com pay_affiliate_month.';

REVOKE ALL ON FUNCTION public.pay_affiliate_balance(uuid, text, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_affiliate_balance(uuid, text, date, uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. pay_affiliate_month — fechamento mensal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_affiliate_month(
  p_affiliate_id    uuid,
  p_reference_month date,
  p_payment_method  text DEFAULT 'pix'
)
RETURNS public.affiliate_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $paymonth$
DECLARE
  v_month   date;
  v_total   numeric;
  v_payment public.affiliate_payments;
  v_tx_id   uuid;
  v_name    text;
BEGIN
  -- 1) Gate explícito (DEFINER bypassa RLS).
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_reference_month IS NULL THEN
    RAISE EXCEPTION 'reference_month required';
  END IF;

  -- Normaliza pro 1º dia do mês, igual ao reference_month gravado pelo motor.
  v_month := date_trunc('month', p_reference_month)::date;

  -- 2) Afiliado existe?
  SELECT name INTO v_name FROM public.affiliates WHERE id = p_affiliate_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'affiliate not found';
  END IF;

  -- Idempotência de negócio: mês já fechado? (erro amigável antes de bater no
  -- índice único uidx_affiliate_payments_affiliate_month)
  IF EXISTS (
    SELECT 1 FROM public.affiliate_payments
    WHERE affiliate_id = p_affiliate_id
      AND reference_month = v_month
  ) THEN
    RAISE EXCEPTION 'affiliate month already paid';
  END IF;

  -- 3) Soma do escopo (só pending daquele mês; nunca paid/voided).
  SELECT COALESCE(sum(commission_amount), 0) INTO v_total
  FROM public.affiliate_commissions
  WHERE affiliate_id = p_affiliate_id
    AND reference_month = v_month
    AND status = 'pending';

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'no pending commissions';
  END IF;

  -- 4) Repasse.
  INSERT INTO public.affiliate_payments
    (affiliate_id, total_amount, reference_month, payment_method, created_by)
  VALUES
    (p_affiliate_id, v_total, v_month, p_payment_method, auth.uid())
  RETURNING * INTO v_payment;

  -- 5) Marca as comissões — MESMO predicado do passo 3.
  UPDATE public.affiliate_commissions
     SET status = 'paid',
         affiliate_payment_id = v_payment.id
   WHERE affiliate_id = p_affiliate_id
     AND reference_month = v_month
     AND status = 'pending';

  -- 6) Despesa no ledger admin (idêntica à da balance).
  INSERT INTO public.admin_financial_transactions
    (type, category, amount, description, reference_id, reference_type, transaction_date, created_by)
  VALUES
    ('expense', 'commission', v_total,
     'Comissão afiliado - ' || COALESCE(v_name, '?'),
     v_payment.id, 'affiliate_payment', now(), auth.uid())
  RETURNING id INTO v_tx_id;

  -- 7) Vínculo de volta.
  UPDATE public.affiliate_payments
     SET admin_transaction_id = v_tx_id
   WHERE id = v_payment.id;

  v_payment.admin_transaction_id := v_tx_id;

  RETURN v_payment;
END;
$paymonth$;

COMMENT ON FUNCTION public.pay_affiliate_month(uuid, date, text) IS
  'Fechamento MENSAL de comissão de afiliado: paga só as comissões pending do reference_month informado (normalizado pro 1º dia do mês). Lança RAISE "affiliate month already paid" se o mês já tem repasse. Mantém paridade obrigatória com pay_affiliate_balance — mesma despesa expense/commission/affiliate_payment no ledger admin.';

REVOKE ALL ON FUNCTION public.pay_affiliate_month(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_affiliate_month(uuid, date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Validação pós-DDL
-- ---------------------------------------------------------------------------
DO $validate$
DECLARE
  v_bad text := '';
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           array_to_string(p.proacl::text[], ' | ') AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('pay_affiliate_balance','pay_affiliate_month')
  LOOP
    IF r.acl IS NULL OR r.acl NOT LIKE '%authenticated=X%' THEN
      v_bad := v_bad || ' ' || r.sig || '(sem GRANT authenticated)';
    END IF;
    IF r.acl LIKE '%anon=X%' THEN
      v_bad := v_bad || ' ' || r.sig || '(anon tem EXECUTE!)';
    END IF;
    IF r.acl LIKE '%=X/postgres%' AND r.acl LIKE '%PUBLIC%' THEN
      v_bad := v_bad || ' ' || r.sig || '(PUBLIC tem EXECUTE!)';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('pay_affiliate_balance','pay_affiliate_month')) <> 2 THEN
    v_bad := v_bad || ' (faltou uma das 2 RPCs)';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'RPCs de repasse de afiliado com problema:%', v_bad;
  END IF;

  RAISE NOTICE 'RPCs de repasse de afiliado OK: pay_affiliate_balance + pay_affiliate_month, GRANT só authenticated/service_role.';
END $validate$;

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — NÃO desfaz repasses já pagos nem os lançamentos do ledger):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.pay_affiliate_month(uuid, date, text);
-- DROP FUNCTION IF EXISTS public.pay_affiliate_balance(uuid, text, date, uuid[]);
-- COMMIT;
-- ============================================================================
