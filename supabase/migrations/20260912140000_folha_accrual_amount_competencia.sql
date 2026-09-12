-- ============================================================================
-- Folha: valor de COMPETÊNCIA separado do valor de CAIXA (`accrual_amount`)
--
-- O DEFEITO (achado 7)
-- --------------------
-- Vale de funcionário contava DUAS VEZES no regime de Competência: o vale já é
-- uma despesa própria (saída no dia em que o dinheiro foi adiantado) e, na
-- quitação da folha, o mesmo valor voltava a pesar dentro do bruto do ciclo.
--
-- O DESENHO APROVADO (decidido fora daqui; aqui só a metade SQL)
-- -------------------------------------------------------------
--   · `amount` CONTINUA SENDO O CAIXA (líquido efetivamente pago), exatamente
--     como hoje — é o que saldo bancário, extrato, resumo e export leem CRU.
--     Nenhum desses toca em `accrual_amount`, então nenhum deles muda.
--   · o BRUTO DO CICLO vai pra coluna nova `accrual_amount`, lida SÓ pela DRE
--     em Competência, com fallback `accrual_amount ?? amount`.
--   · o vale sai da Competência pelo `payroll_kind` (corte no src).
--
-- SEM BACKFILL — medido em produção (12/09/2026), não suposto:
--   43 linhas com `payroll_kind`, TODAS `salary`; ZERO vales em toda a base;
--   1 folha já paga, 42 pendentes. Para todas elas `amount` já é o valor de
--   competência correto, e o fallback do src resolve sem escrever nada.
--   `accrual_amount` confirmado INEXISTENTE hoje (information_schema).
--
-- ⚠️ ORDEM DE DEPLOY: ESTA MIGRATION ANTES DO FRONTEND. O src tem helper
-- tolerante que refaz o write sem o campo se o PostgREST recusar (PGRST204),
-- mas isso é rede, não licença: com o frontend na frente, TODO pagamento de
-- salário cai no caminho degradado e a Competência fica errada em silêncio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) Coluna nova. Idempotente. NULL = "usar amount" (fallback do src), que é o
--     estado de 100% das linhas existentes — por isso nasce NULL e sem DEFAULT:
--     um DEFAULT 0 faria a Competência de toda linha nova valer zero até alguém
--     preencher, que é justamente o erro silencioso que este desenho evita.
-- ----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS accrual_amount numeric(10,2) NULL;

COMMENT ON COLUMN public.financial_transactions.accrual_amount IS
  'Valor de COMPETENCIA (bruto do ciclo, antes do abatimento de vales). So folha preenche. NULL = usar amount. amount continua sendo o CAIXA.';

-- ----------------------------------------------------------------------------
-- (b) pay_payroll_transaction — SEGUNDO caminho de pagamento de folha (o de
--     Contas a Pagar). Faz a mesma mutação de `amount` que a tela de Folha, e
--     por isso precisa gravar `accrual_amount` junto; senão a Competência fica
--     certa por um caminho e errada pelo outro, dependendo de por onde o
--     usuário pagou — o pior tipo de divergência, porque é intermitente.
--
-- ⚠️ RECRIADA A PARTIR DA DEFINIÇÃO VIVA (pg_get_functiondef, 12/09/2026), não
-- do arquivo 20260426010000. Mesma régua que salvou a trava de orçamento nesta
-- mesma leva: lá a assinatura viva tinha 8 params e a migration antiga 6 —
-- partir do arquivo teria criado uma SOBRECARGA e deixado o caminho real
-- intocado. Aqui a assinatura bateu, e o corpo abaixo é byte-a-byte o que está
-- rodando + a ÚNICA linha nova no UPDATE.
--
-- CREATE OR REPLACE SEM MUDAR A ASSINATURA: trocar tipos/ordem exigiria DROP, e
-- DROP FUNCTION leva os GRANTs junto.
--
-- ✅ CONFIRMADO NA DEFINIÇÃO VIVA: `p_vale_discount` era PARÂMETRO MORTO —
-- declarado na assinatura e NUNCA referenciado no corpo. O único chamador
-- (FinanceContas.tsx) já o envia corretamente, junto com
-- `p_net_amount = subtotal − valeDiscount`, de modo que
-- `effective_amount + p_vale_discount` reconstrói o bruto do ciclo
-- (salário + bônus − faltas). Esta migration é o primeiro uso real do
-- parâmetro. (`emp_company_id` também é declarado e não usado; mantido
-- byte-a-byte de propósito — limpeza cosmética não entra em migration de
-- dinheiro.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_payroll_transaction(p_transaction_id uuid, p_account_id uuid, p_paid_date date DEFAULT NULL::date, p_vale_discount numeric DEFAULT 0, p_net_amount numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_payment_method text DEFAULT 'pix'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  txn record;
  emp_company_id uuid;
  paid_d date := COALESCE(p_paid_date, CURRENT_DATE);
  effective_amount numeric;
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

  -- Garante que o usuário pertence à mesma empresa (service_role bypassa)
  IF auth.uid() IS NOT NULL
     AND public.get_user_company_id(auth.uid()) IS DISTINCT FROM txn.company_id THEN
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
$fn$;

COMMENT ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text) IS
  'Quita uma folha pendente pelo caminho de Contas a Pagar: grava amount = líquido pago (CAIXA) e accrual_amount = líquido + vales (COMPETÊNCIA), marca is_paid/paid_date/account_id e registra os movimentos de pagamento e de reset de ciclo do funcionário. accrual_amount é lido só pela DRE em Competência, com fallback para amount quando NULL.';

-- ----------------------------------------------------------------------------
-- ⚠️ ACHADO NÃO PEDIDO NO BRIEFING — GRANT desta RPC estava aberto pra `anon`.
--
-- ACL lida no banco vivo antes desta migration:
--   =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
-- ou seja PUBLIC e anon com EXECUTE, herdados do DEFAULT PRIVILEGE do schema
-- public do Supabase (grant nominal por papel — REVOKE FROM PUBLIC sozinho não
-- resolveria).
--
-- POR QUE ISSO É GRAVE AQUI ESPECIFICAMENTE: a guarda de posse do corpo é
--   `IF auth.uid() IS NOT NULL AND get_user_company_id(...) IS DISTINCT FROM ...`
-- — com `anon`, `auth.uid()` é NULL, a condição inteira é falsa e a guarda é
-- PULADA. É o padrão "guarda confunde anon com service_role": um chamador não
-- logado que acerte o UUID de uma folha marca salário como pago, define conta,
-- valor e observação, e ainda insere dois movimentos no extrato do funcionário.
--
-- Correção mínima e sem efeito em usuário legítimo: o ÚNICO chamador é
-- FinanceContas.tsx, client autenticado. `authenticated` e `service_role`
-- mantêm EXECUTE; PUBLIC e anon perdem. Assinatura completa de tipos, REVOKE
-- antes do GRANT.
--
-- (Não alterei a lógica da guarda nesta rodada — isso é decisão da 🛡️
-- Plataforma e mudaria comportamento de chamada por service_role. Fechar o
-- GRANT já elimina o caminho alcançável de fora.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (c) generate_payroll_for_employee NÃO é tocada, de propósito: a folha
--     pendente nasce com o bruto no próprio `amount` e `accrual_amount` NULL, e
--     o fallback (`accrual_amount ?? amount`) já devolve o número certo. Mexer
--     nela colocaria as 42 folhas pendentes em produção (R$ 124.364,59 em 4
--     empresas) no caminho de risco sem nenhum ganho.
-- ----------------------------------------------------------------------------
