-- Qualquer linha em admin_permissions antes liberava o financeiro inteiro via
-- is_admin_user(). DFC usa view SECURITY INVOKER e herda estas policies.
-- Sem backfill deliberadamente: o editor concede acesso de forma explícita.

CREATE OR REPLACE FUNCTION public.can_read_admin_financial(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'super_admin'::app_role)
    OR (
      public.has_admin_permission(_user_id, 'admin_financeiro')
      AND public.has_admin_permission(_user_id, 'admin_financeiro_totais')
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_admin_financial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_admin_financial(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_admin_financial(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR (
      public.can_read_admin_financial(_user_id)
      AND public.has_admin_permission(_user_id, 'admin_financeiro_lancamentos')
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_admin_financial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_financial(uuid) TO authenticated, service_role;

ALTER POLICY "Admin panel users view admin_financial_transactions"
  ON public.admin_financial_transactions
  USING ((SELECT public.can_read_admin_financial(auth.uid())));

ALTER POLICY "Admin panel users view ledger_asaas"
  ON public.ledger_asaas
  USING ((SELECT public.can_read_admin_financial(auth.uid())));

ALTER POLICY "Admin panel users insert admin_financial_transactions"
  ON public.admin_financial_transactions
  WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())));
ALTER POLICY "Admin panel users update admin_financial_transactions"
  ON public.admin_financial_transactions
  USING ((SELECT public.can_manage_admin_financial(auth.uid())))
  WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())));
ALTER POLICY "Admin panel users delete admin_financial_transactions"
  ON public.admin_financial_transactions
  USING ((SELECT public.can_manage_admin_financial(auth.uid())));

ALTER POLICY "Admin panel users insert ledger_asaas"
  ON public.ledger_asaas
  WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())));
ALTER POLICY "Admin panel users update ledger_asaas"
  ON public.ledger_asaas
  USING ((SELECT public.can_manage_admin_financial(auth.uid())))
  WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())));
ALTER POLICY "Admin panel users delete ledger_asaas"
  ON public.ledger_asaas
  USING ((SELECT public.can_manage_admin_financial(auth.uid())));
