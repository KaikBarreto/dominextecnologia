-- Persiste a intenção comercial de que o plano foi definido pelo vendedor.
-- A query string `?bloqueado=1` continua aceita apenas como compatibilidade;
-- depois do cadastro o checkout usa esta coluna como fonte de verdade.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.plan_locked IS
  'True quando plano/preço foram definidos explicitamente pelo comercial e o cliente não deve escolher outro plano na primeira ativação.';

CREATE OR REPLACE FUNCTION public.prevent_tenant_plan_lock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_locked IS DISTINCT FROM OLD.plan_locked
     AND auth.role() = 'authenticated'
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'A trava comercial do plano não pode ser alterada pelo cliente.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tenant_plan_lock_change ON public.companies;
CREATE TRIGGER trg_prevent_tenant_plan_lock_change
  BEFORE UPDATE OF plan_locked ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_plan_lock_change();

