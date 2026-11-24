-- A conciliação pode criar, quitar, desfazer e alterar lançamentos. A guarda
-- privilegiada já validava tenant, assinatura e módulo, mas ainda não repetia
-- a autorização exigida pelas policies de financial_transactions. Como as
-- RPCs são SECURITY DEFINER, esse gate precisa existir dentro da própria
-- função e não pode depender apenas da interface.

BEGIN;

CREATE OR REPLACE FUNCTION public._reconcile_assert_write(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public._reconcile_assert_company(p_company_id);

  -- Backend confiável segue liberado. A guarda de empresa já validou que uma
  -- sessão sem auth.uid() é realmente service_role/conexão administrativa.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.tenant_subscription_allows_access(p_company_id) THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: a conciliação bancária está bloqueada.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_plan_allows_product_area(p_company_id, 'finance') THEN
    RAISE EXCEPTION 'O plano desta empresa não inclui o Financeiro.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_admin_or_gestor(auth.uid())
    OR public.pdv_has_explicit_action_permission_v2(auth.uid(), 'fn:manage_finance')
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar lançamentos financeiros.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._reconcile_assert_write(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reconcile_assert_write(uuid)
  TO service_role;

COMMENT ON FUNCTION public._reconcile_assert_write(uuid) IS
  'Gate canônico de escrita da conciliação: tenant, assinatura, área Financeiro e admin/gestor ou fn:manage_finance. As RPCs SECURITY DEFINER chamam esta função internamente.';

COMMIT;
