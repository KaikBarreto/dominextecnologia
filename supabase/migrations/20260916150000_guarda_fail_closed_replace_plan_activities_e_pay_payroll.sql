-- ============================================================================
-- Correção de segurança: guarda de posse com caminho de NULL em duas RPCs
-- SECURITY DEFINER. Mesma classe de fragilidade da 20260916140000, dois
-- sabores diferentes.
--
-- ------------------------------------------------------------------------
-- 1) replace_contract_plan_activities(uuid, jsonb) — FURO REAL, estreito
-- ------------------------------------------------------------------------
-- Guarda viva:
--   IF NOT ( public.get_user_company_id(auth.uid()) = v_company_id
--            OR public.is_super_admin(auth.uid()) ) THEN RAISE EXCEPTION ...
--
-- Provado no próprio banco (tenant Demo, 2026-09-16, dentro de transação
-- revertida — sem residuo):
--   auth.uid()    = '00000000-0000-0000-0000-000000000099' (uuid qualquer,
--                    authenticated, SEM linha em public.profiles)
--   get_user_company_id(auth.uid()) = NULL
--   is_super_admin(auth.uid())      = false
--   NOT (NULL = v_company_id OR false)  =>  NOT NULL  =>  NULL
--   IF NULL em plpgsql PULA o bloco (não dispara o RAISE) — bloco pulado.
--   Consequência provada: replace_contract_plan_activities() rodou até o fim
--   e INSERIU a linha de teste em contract_plan_activities de um contrato do
--   tenant Demo (residuo=1 dentro da transação, antes do ROLLBACK).
--
-- Quem cai nesse caminho: usuário AUTENTICADO sem empresa (perfil órfão —
-- já aconteceu nesta base). Não é alcançável por anon (GRANT de anon já
-- revogado), mas é escrita cross-tenant: altera o plano de qualquer
-- contrato de qualquer empresa.
--
-- ------------------------------------------------------------------------
-- 2) pay_payroll_transaction(...) — LATENTE, não explorável hoje
-- ------------------------------------------------------------------------
-- Guarda viva:
--   IF auth.uid() IS NOT NULL
--      AND public.get_user_company_id(auth.uid()) IS DISTINCT FROM txn.company_id
--   THEN RAISE EXCEPTION ...
--
-- Clássico fail-open: com auth.uid() NULL (anon puro ou service_role sem
-- claim), a condição inteira é FALSE e a guarda é pulada sem checar nada.
-- Não é explorável HOJE porque anon perdeu o GRANT de EXECUTE e authenticated
-- sempre tem auth.uid() preenchido via PostgREST — mas é bomba armada pro
-- dia em que o GRANT mudar. Corrigido por precaução, sem tocar em mais nada
-- do corpo (função grava amount/accrual_amount de folha, entregue recente).
--
-- ⚠️ regenerate_contract_visits NÃO foi tocada — usa
-- `IS NOT DISTINCT FROM`, que é à prova de nulo dos dois lados, e já está
-- correta. Confirmado antes de escrever esta migration.
--
-- PADRÃO USADO (mesmo da 20260916140000): variável booleana que NASCE false
-- e só vira true por condição EXPLÍCITA e nunca-NULL. `auth.role() =
-- 'service_role'` detecta backend pelo CLAIM de papel do JWT (nunca NULL
-- numa chamada via PostgREST), não por auth.uid() ser NULL.
--
-- ⚠️ CREATE OR REPLACE SEM MUDAR ASSINATURA (DROP levaria os GRANTs junto).
-- Corpo abaixo partiu de pg_get_functiondef() da DEFINIÇÃO VIVA (conferida em
-- 2026-09-16), não de migration antiga. Único trecho alterado em cada
-- função é a guarda — resto do corpo (incluindo o UPDATE/INSERT de
-- pay_payroll_transaction que grava amount/accrual_amount) é cópia 1:1 do
-- que está em produção.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) replace_contract_plan_activities — guarda fail-closed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_contract_plan_activities(p_contract_id uuid, p_activities jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id    uuid;
  v_inserted      integer;
  v_is_authorized boolean := false;
BEGIN
  -- Contrato existe? Pega o company_id dono.
  SELECT c.company_id INTO v_company_id
  FROM public.contracts c
  WHERE c.id = p_contract_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contrato % nao encontrado', p_contract_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Guarda de posse (fail-closed): v_is_authorized nasce false, só vira true
  -- por condição explícita e nunca-NULL. Ver nota da migration no topo.
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
        AND public.get_user_company_id(auth.uid()) = v_company_id THEN
    v_is_authorized := true;
  ELSIF public.is_super_admin(auth.uid()) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Sem permissao para alterar o plano do contrato %', p_contract_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Substituição atômica: apaga tudo e reinsere. Roda como definer, então o
  -- DELETE apaga de verdade (não é filtrado pelo RLS do client).
  DELETE FROM public.contract_plan_activities
  WHERE contract_id = p_contract_id;

  IF p_activities IS NULL OR jsonb_typeof(p_activities) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (
             COALESCE(a->>'contract_item_id', ''),
             COALESCE(a->>'section', ''),
             COALESCE(a->>'component', ''),
             COALESCE(a->>'description', ''),
             COALESCE(a->>'freq_code', ''),
             COALESCE(a->>'freq_months', ''),
             COALESCE(a->>'form_template_id', '')
           )
           a
    FROM jsonb_array_elements(p_activities) AS a
    ORDER BY
      COALESCE(a->>'contract_item_id', ''),
      COALESCE(a->>'section', ''),
      COALESCE(a->>'component', ''),
      COALESCE(a->>'description', ''),
      COALESCE(a->>'freq_code', ''),
      COALESCE(a->>'freq_months', ''),
      COALESCE(a->>'form_template_id', '')
  ),
  ins AS (
    INSERT INTO public.contract_plan_activities (
      company_id,
      contract_id,
      contract_item_id,
      section,
      component,
      description,
      freq_code,
      freq_months,
      is_active,
      sort_order,
      applies_per_equipment,
      form_template_id
    )
    SELECT
      v_company_id,                                   -- FORÇADO, não confia no payload
      p_contract_id,                                  -- FORÇADO
      NULLIF(a->>'contract_item_id', '')::uuid,
      NULLIF(a->>'section', ''),
      NULLIF(a->>'component', ''),
      a->>'description',
      NULLIF(a->>'freq_code', ''),
      NULLIF(a->>'freq_months', '')::integer,
      COALESCE((a->>'is_active')::boolean, true),
      COALESCE((a->>'sort_order')::integer, 0),
      COALESCE((a->>'applies_per_equipment')::boolean, true),
      NULLIF(a->>'form_template_id', '')::uuid
    FROM src
    WHERE COALESCE(a->>'description', '') <> ''
    ON CONFLICT (
      contract_id,
      COALESCE(contract_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(section, ''),
      COALESCE(component, ''),
      description,
      COALESCE(freq_code, ''),
      COALESCE(freq_months, -1),
      COALESCE(form_template_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$function$;

COMMENT ON FUNCTION public.replace_contract_plan_activities(uuid, jsonb) IS
  'Substitui (delete+insert atômico) o plano de atividades do contrato. company_id forçado a partir do contrato, nunca do payload. Guarda de posse fail-closed: só service_role, dono da mesma empresa do contrato, ou super_admin (2026-09-16 — fechou vazamento cross-tenant explorável por usuário autenticado sem empresa/perfil órfão, provado em transação revertida no tenant Demo).';

-- ----------------------------------------------------------------------------
-- 2) pay_payroll_transaction — guarda fail-closed (só a guarda; resto do
--    corpo, incluindo amount/accrual_amount/employee_movements, intocado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_payroll_transaction(p_transaction_id uuid, p_account_id uuid, p_paid_date date DEFAULT NULL::date, p_vale_discount numeric DEFAULT 0, p_net_amount numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_payment_method text DEFAULT 'pix'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  txn record;
  emp_company_id uuid;
  paid_d date := COALESCE(p_paid_date, CURRENT_DATE);
  effective_amount numeric;
  v_is_authorized boolean := false;
BEGIN
  SELECT id, company_id, employee_id, amount, payroll_kind, is_paid
    INTO txn
    FROM public.financial_transactions
   WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada';
  END IF;

  IF txn.is_paid THEN
    RAISE EXCEPTION 'Transação já está paga';
  END IF;

  IF txn.employee_id IS NULL OR txn.payroll_kind IS NULL THEN
    RAISE EXCEPTION 'Transação não é de folha de pagamento';
  END IF;

  -- Guarda de posse (fail-closed): v_is_authorized nasce false, só vira true
  -- por condição explícita e nunca-NULL. A guarda anterior
  -- (`auth.uid() IS NOT NULL AND get_user_company_id(...) IS DISTINCT FROM
  -- txn.company_id`) era fail-open: com auth.uid() NULL a condição inteira
  -- vira FALSE e a guarda é pulada sem checar nada. Não explorável hoje
  -- (anon sem GRANT, authenticated sempre tem uid), mas latente. Mesma
  -- semântica de autorização de antes (service_role OU dono da mesma
  -- empresa da transação) — não amplia acesso, só fecha o caminho de NULL.
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
        AND public.get_user_company_id(auth.uid()) = txn.company_id THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Sem permissão para pagar esta transação';
  END IF;

  effective_amount := COALESCE(p_net_amount, txn.amount);

  UPDATE public.financial_transactions
     SET is_paid = true,
         paid_date = paid_d,
         account_id = p_account_id,
         payment_method = COALESCE(p_payment_method, payment_method),
         amount = effective_amount,
         -- ÚNICA LINHA NOVA. Caixa (`amount`) = líquido pago; Competência
         -- (`accrual_amount`) = líquido + vales abatidos = bruto do ciclo. Com
         -- vale 0 os dois valores coincidem e a DRE não muda em nada — que é o
         -- caso de 100% da base hoje (zero vales).
         accrual_amount = effective_amount + COALESCE(p_vale_discount, 0),
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = p_transaction_id;

  -- Registra movement de pagamento no extrato do funcionário
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, payment_method, created_by
  ) VALUES (
    txn.employee_id, 'pagamento', effective_amount, 0,
    'Folha quitada via Contas a Pagar',
    p_account_id::text, auth.uid()
  );

  -- Reset cycle (mesmo padrão do handlePayment existente)
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, created_by
  ) SELECT
    txn.employee_id, 'ajuste', e.salary, e.salary, 'Reset para salário base', auth.uid()
    FROM public.employees e WHERE e.id = txn.employee_id;

  RETURN jsonb_build_object(
    'transaction_id', txn.id,
    'employee_id', txn.employee_id,
    'amount', effective_amount,
    -- Chave ADITIVA (o único chamador ignora o payload, só checa `error`):
    -- serve de prova de QA sem precisar de um SELECT depois.
    'accrual_amount', effective_amount + COALESCE(p_vale_discount, 0),
    'paid_date', paid_d
  );
END
$function$;

COMMENT ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text) IS
  'Quita transação de folha (amount=líquido pago, accrual_amount=líquido+vale=bruto do ciclo), grava movements no extrato do funcionário. Guarda de posse fail-closed: só service_role ou dono da mesma empresa da transação (2026-09-16 — fechou caminho de NULL fail-open latente, não explorável hoje mas armado pra mudança futura de GRANT). Corpo de negócio intocado nesta migration.';

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (rodar manualmente):
--   SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) LIKE '%v_is_authorized%' AS tem_guarda_fail_closed
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('replace_contract_plan_activities','pay_payroll_transaction');
--   -- esperado: tem_guarda_fail_closed = true nas duas.
-- ----------------------------------------------------------------------------
