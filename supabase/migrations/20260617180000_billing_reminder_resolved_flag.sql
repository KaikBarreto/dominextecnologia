-- Por quê: lembretes de cobrança de contrato aparecem na agenda como pseudo-tarefa
-- (espelhando parcelas a receber de financial_transactions, ver useFinancialScheduleEvents.ts).
-- O responsável pelas cobranças precisa poder marcar um lembrete como RESOLVIDO/CONCLUÍDO
-- (e REABRIR) SEM dar baixa no financeiro. É só um flag visual: NÃO toca is_paid, amount, etc.
-- Quando aplica: agenda → card de cobrança → ação "Concluir"/"Reabrir".

-- 1) Colunas de flag visual + auditoria (sem default, nullable, sem backfill).
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS billing_reminder_resolved_at timestamptz NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS billing_reminder_resolved_by uuid NULL;

COMMENT ON COLUMN public.financial_transactions.billing_reminder_resolved_at IS
  'Quando o lembrete de cobrança na agenda foi marcado como concluído. Flag visual; NÃO é baixa financeira.';
COMMENT ON COLUMN public.financial_transactions.billing_reminder_resolved_by IS
  'Usuário (auth.uid) que concluiu o lembrete de cobrança na agenda. Auditoria.';

-- 2+3) Helper interno de autorização (mesma empresa + caller autorizado).
-- Centraliza o predicado para as duas RPCs não divergirem.
-- Regras (TODAS exigem mesma empresa):
--   (a) transação é da MESMA empresa do caller;
--   (b) caller é: responsável de cobrança do contrato (auth.uid() ∈ contracts.billing_responsible_ids)
--       OU tem fn:view_financial_schedule (honrando o curinga '*' de Acesso Total)
--       OU é admin/gestor.
--   Cobrança avulsa (sem contract_id): cai em fn:view_financial_schedule OR admin/gestor + mesma empresa.
CREATE OR REPLACE FUNCTION public.can_manage_billing_reminder(
  p_transaction_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_txn_company_id uuid;
  v_contract_id uuid;
  v_user_company_id uuid;
  v_billing_ids uuid[];
  v_has_view_perm boolean;
BEGIN
  SELECT company_id, contract_id
    INTO v_txn_company_id, v_contract_id
  FROM public.financial_transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada.';
  END IF;

  -- (a) mesma empresa
  v_user_company_id := public.get_user_company_id(p_user_id);
  IF v_user_company_id IS NULL OR v_user_company_id IS DISTINCT FROM v_txn_company_id THEN
    RETURN false;
  END IF;

  -- (b1) admin/gestor
  IF public.is_admin_or_gestor(p_user_id) THEN
    RETURN true;
  END IF;

  -- (b2) tem fn:view_financial_schedule (ou curinga '*' de Acesso Total)
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.is_active = true
      AND (
        up.permissions ? '*'
        OR up.permissions ? 'fn:view_financial_schedule'
      )
  ) INTO v_has_view_perm;

  IF v_has_view_perm THEN
    RETURN true;
  END IF;

  -- (b3) responsável de cobrança do contrato da transação
  IF v_contract_id IS NOT NULL THEN
    SELECT billing_responsible_ids
      INTO v_billing_ids
    FROM public.contracts
    WHERE id = v_contract_id;

    IF v_billing_ids IS NOT NULL AND p_user_id = ANY (v_billing_ids) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Supabase concede EXECUTE a anon por default privilege; revogamos explicitamente.
REVOKE ALL ON FUNCTION public.can_manage_billing_reminder(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_billing_reminder(uuid, uuid) TO authenticated, service_role;

-- RPC: marcar lembrete como resolvido (idempotente).
CREATE OR REPLACE FUNCTION public.resolve_billing_reminder(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_already timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar autenticado para concluir esta cobrança.';
  END IF;

  IF NOT public.can_manage_billing_reminder(p_transaction_id, v_uid) THEN
    RAISE EXCEPTION 'Você não tem permissão para concluir esta cobrança.';
  END IF;

  SELECT billing_reminder_resolved_at
    INTO v_already
  FROM public.financial_transactions
  WHERE id = p_transaction_id;

  -- Idempotente: já resolvido → no-op.
  IF v_already IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.financial_transactions
  SET billing_reminder_resolved_at = now(),
      billing_reminder_resolved_by = v_uid
  WHERE id = p_transaction_id;
END;
$$;

-- Remove o grant implícito a PUBLIC (anon) — só logado pode executar.
REVOKE ALL ON FUNCTION public.resolve_billing_reminder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_billing_reminder(uuid) TO authenticated, service_role;

-- RPC: reabrir lembrete (idempotente).
CREATE OR REPLACE FUNCTION public.unresolve_billing_reminder(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_already timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar autenticado para reabrir esta cobrança.';
  END IF;

  IF NOT public.can_manage_billing_reminder(p_transaction_id, v_uid) THEN
    RAISE EXCEPTION 'Você não tem permissão para reabrir esta cobrança.';
  END IF;

  SELECT billing_reminder_resolved_at
    INTO v_already
  FROM public.financial_transactions
  WHERE id = p_transaction_id;

  -- Idempotente: já reaberto → no-op.
  IF v_already IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.financial_transactions
  SET billing_reminder_resolved_at = NULL,
      billing_reminder_resolved_by = NULL
  WHERE id = p_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unresolve_billing_reminder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unresolve_billing_reminder(uuid) TO authenticated, service_role;
