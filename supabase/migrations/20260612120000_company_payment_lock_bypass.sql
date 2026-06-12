-- Exceção pontual ao bloqueio de pagamento pendente.
-- O guard client trava empresas com subscription_status='pending_payment' no checkout.
-- Este flag, quando ligado, libera o acesso mesmo pendente — por empresa.
-- Caso de uso (2026-06-12): CLIMATIZE teve cobrança errada por bug nosso;
-- o cartão captura sozinho em 14/06, então liberamos só ela até lá.

-- 1) Coluna idempotente
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_lock_bypass boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.payment_lock_bypass IS
  'Exceção pontual ao bloqueio de pagamento pendente (libera o acesso mesmo em pending_payment).';

-- 2) Ligar SÓ na CLIMATIZE (exceção pontual). Idempotente: rodar 2x não muda nada.
UPDATE public.companies
  SET payment_lock_bypass = true
  WHERE id = 'f62fa387-e980-4982-8099-f4ca270d9d15';

-- RLS: nenhuma policy nova. A coluna é lida pelo mesmo SELECT que já lê
-- subscription_status — a policy de companies já permite o tenant ler a própria
-- empresa (is_admin_user(auth.uid()) OR id = get_user_company_id(auth.uid())).
