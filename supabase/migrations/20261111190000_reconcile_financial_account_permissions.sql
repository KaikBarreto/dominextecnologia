-- Acesso ao Financeiro e capacidade de criar lançamentos precisam implicar o
-- uso operacional das contas. Sem essa reconciliação, o usuário abre a tela e
-- cria uma transação, mas o catálogo de contas fica desabilitado no cliente e
-- parece vazio mesmo quando o tenant já possui contas.
--
-- A migration de 20261019170000 fez um backfill pontual. Esta revisão torna a
-- implicação parte da autorização canônica e repete o backfill para usuários e
-- cargos configurados depois daquela data.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_bank_accounts(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = _user_id
         AND up.is_active = true
         AND (
           up.permissions ? '*'
           OR up.permissions ? 'fn:manage_bank_accounts'
           OR up.permissions ? 'fn:manage_settings'
           OR up.permissions ? 'fn:view_finance_totals'
         )
    )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.can_use_bank_accounts(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (
    public.can_manage_bank_accounts(_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = _user_id
         AND up.is_active = true
         AND (
           up.permissions ? '*'
           OR up.permissions ? 'fn:use_bank_accounts'
           OR up.permissions ? 'fn:manage_finance'
           OR up.permissions ? 'screen:finance'
           OR up.permissions ? 'screen:pdv'
         )
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.user_permissions up WHERE up.user_id = _user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id
      )
    )
  )
$fn$;

REVOKE ALL ON FUNCTION public.can_manage_bank_accounts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_use_bank_accounts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_bank_accounts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_bank_accounts(uuid) TO authenticated, service_role;

UPDATE public.user_permissions
   SET permissions = permissions || '[]'::jsonb
       || CASE
            WHEN NOT (permissions ? 'fn:manage_bank_accounts')
             AND (permissions ? 'fn:manage_settings' OR permissions ? 'fn:view_finance_totals')
            THEN '["fn:manage_bank_accounts"]'::jsonb ELSE '[]'::jsonb
          END
       || CASE
            WHEN NOT (permissions ? 'fn:use_bank_accounts')
             AND (
               permissions ? 'fn:manage_bank_accounts'
               OR permissions ? 'fn:manage_settings'
               OR permissions ? 'fn:view_finance_totals'
               OR permissions ? 'fn:manage_finance'
               OR permissions ? 'screen:finance'
               OR permissions ? 'screen:pdv'
             )
            THEN '["fn:use_bank_accounts"]'::jsonb ELSE '[]'::jsonb
          END
 WHERE NOT (permissions ? '*')
   AND (
     permissions ? 'fn:manage_settings'
     OR permissions ? 'fn:view_finance_totals'
     OR permissions ? 'fn:manage_finance'
     OR permissions ? 'screen:finance'
     OR permissions ? 'screen:pdv'
   );

UPDATE public.permission_presets
   SET permissions = permissions || '[]'::jsonb
       || CASE
            WHEN NOT (permissions ? 'fn:manage_bank_accounts')
             AND (permissions ? 'fn:manage_settings' OR permissions ? 'fn:view_finance_totals')
            THEN '["fn:manage_bank_accounts"]'::jsonb ELSE '[]'::jsonb
          END
       || CASE
            WHEN NOT (permissions ? 'fn:use_bank_accounts')
             AND (
               permissions ? 'fn:manage_bank_accounts'
               OR permissions ? 'fn:manage_settings'
               OR permissions ? 'fn:view_finance_totals'
               OR permissions ? 'fn:manage_finance'
               OR permissions ? 'screen:finance'
               OR permissions ? 'screen:pdv'
             )
            THEN '["fn:use_bank_accounts"]'::jsonb ELSE '[]'::jsonb
          END
 WHERE NOT (permissions ? '*')
   AND (
     permissions ? 'fn:manage_settings'
     OR permissions ? 'fn:view_finance_totals'
     OR permissions ? 'fn:manage_finance'
     OR permissions ? 'screen:finance'
     OR permissions ? 'screen:pdv'
   );

COMMIT;
