-- Separa a permissão de OPERAR contas da permissão sensível de VER SALDOS e
-- MANTER o cadastro. A separação vale no catálogo do app, nas policies e na
-- RPC do cofre: ocultar só com CSS deixaria o saldo disponível na resposta.

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
         AND (up.permissions ? '*' OR up.permissions ? 'fn:manage_bank_accounts')
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
         AND (up.permissions ? '*' OR up.permissions ? 'fn:use_bank_accounts')
    )
    -- Mesmo fallback do AuthContext para usuários legados: sem registro de
    -- permissões explícitas, preservar o uso que já existia antes da divisão.
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

-- Catálogo operacional sem campos de saldo/limite. É SECURITY DEFINER para
-- permitir que `fn:use_bank_accounts` liste somente o necessário enquanto o
-- SELECT direto da tabela fica reservado a gestores.
CREATE OR REPLACE FUNCTION public.list_usable_financial_accounts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.can_use_bank_accounts(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para usar contas bancárias.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', fa.id,
        'company_id', fa.company_id,
        'name', fa.name,
        'type', fa.type,
        'bank_name', fa.bank_name,
        'institution_code', fa.institution_code,
        'institution_name', fa.institution_name,
        'institution_ispb', fa.institution_ispb,
        'color', fa.color,
        'icon', fa.icon,
        'is_active', fa.is_active,
        'sort_order', fa.sort_order,
        'is_cash_account', fa.is_cash_account,
        'created_at', fa.created_at,
        'updated_at', fa.updated_at
      ) ORDER BY fa.sort_order, fa.name
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM public.financial_accounts fa
  WHERE fa.company_id = v_company;

  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.list_usable_financial_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_usable_financial_accounts() TO authenticated, service_role;

-- Preserva o acesso já configurado. Quem via totais passa a poder ver saldos;
-- quem gerenciava as configurações mantém a manutenção das contas. Financeiro
-- e PDV recebem apenas o direito operacional de selecionar contas.
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

DROP POLICY IF EXISTS "Users can view own company accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Managers can manage own company accounts" ON public.financial_accounts;

CREATE POLICY "Bank managers can manage own company accounts"
  ON public.financial_accounts FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_bank_accounts(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_bank_accounts(auth.uid())
  );

-- A mesma RPC atende operador e gestor porque ambos precisam saber qual conta
-- é o cofre. Só o gestor recebe os números; para os demais o servidor devolve
-- zero, evitando que o saldo oculto continue exposto no payload da rede.
CREATE OR REPLACE FUNCTION public.pdv_cofre_balance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_company   uuid;
  v_snap      record;
  v_can_view  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);
  v_can_view := public.can_manage_bank_accounts(v_uid);

  RETURN jsonb_build_object(
    'saldo_total',       CASE WHEN v_can_view THEN round(v_snap.saldo_total, 2) ELSE 0 END,
    'reservado',         CASE WHEN v_can_view THEN round(v_snap.reservado, 2) ELSE 0 END,
    'disponivel',        CASE WHEN v_can_view THEN round(v_snap.disponivel, 2) ELSE 0 END,
    'caixas_abertos',    v_snap.caixas_abertos,
    'conta_id',          v_snap.cash_account_id,
    'conta_nome',        v_snap.cash_account_name,
    'controle_estrito',  v_snap.strict_tracking
  );
END
$fn$;

COMMENT ON FUNCTION public.pdv_cofre_balance() IS
  'Metadados do cofre do tenant. Saldos reais são retornados somente a quem possui fn:manage_bank_accounts; operadores recebem zero e seguem podendo abrir/usar o caixa.';

REVOKE ALL ON FUNCTION public.pdv_cofre_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_cofre_balance() TO authenticated, service_role;
