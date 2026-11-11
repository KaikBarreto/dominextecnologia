-- Configuracao segura da conta que representa o dinheiro em especie do PDV.
--
-- A conta e unica por empresa. Os caixas abertos nao criam outro saldo: apenas
-- separam parte desse dinheiro em custodia. Por isso a troca fica bloqueada
-- enquanto existir qualquer sessao aberta.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_guard_cash_account_setting_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_authorized jsonb;
BEGIN
  IF OLD.pdv_cash_account_id IS NOT DISTINCT FROM NEW.pdv_cash_account_id THEN
    RETURN NEW;
  END IF;

  -- Funcoes administrativas SECURITY DEFINER e service_role continuam aptas a
  -- executar manutencoes internas. O cliente autenticado, mesmo gestor, precisa
  -- passar pela RPC abaixo para nao contornar a trava de caixas abertos.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_authorized := NULLIF(
      current_setting('app.pdv_cash_account_setting_change', true),
      ''
    )::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_authorized := NULL;
  END;

  IF v_authorized IS NULL
     OR v_authorized->>'company_id' IS DISTINCT FROM NEW.company_id::text
     OR v_authorized->>'account_id' IS DISTINCT FROM COALESCE(NEW.pdv_cash_account_id::text, '')
  THEN
    RAISE EXCEPTION 'Altere a conta de dinheiro pelas Configuracoes do PDV.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_cash_account_direct_change_denied';
  END IF;

  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_guard_cash_account_setting_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_guard_cash_account_setting_change()
  TO service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_cash_account_setting_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2(
      'screen:pdv_settings',
      NULL,
      false
    );

  RETURN jsonb_build_object(
    'selected_account', (
      SELECT jsonb_build_object('id', account.id, 'name', account.name)
        FROM public.company_settings settings
        JOIN public.financial_accounts account
          ON account.id = settings.pdv_cash_account_id
         AND account.company_id = settings.company_id
         AND account.type = 'caixa'
         AND account.is_active IS TRUE
       WHERE settings.company_id = v_context.company_id
    ),
    'accounts', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('id', account.id, 'name', account.name)
          ORDER BY account.sort_order, account.name, account.id
        ),
        '[]'::jsonb
      )
        FROM public.financial_accounts account
       WHERE account.company_id = v_context.company_id
         AND account.type = 'caixa'
         AND account.is_active IS TRUE
    ),
    'open_sessions', (
      SELECT count(*)
        FROM public.pdv_cash_sessions session
       WHERE session.company_id = v_context.company_id
         AND session.status = 'aberta'
    )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_get_cash_account_setting_v2()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_cash_account_setting_v2()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_save_cash_account_setting_v2(
  p_cash_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_account record;
  v_updated integer;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2(
      'screen:pdv_settings',
      'fn:manage_pdv_settings',
      false
    );

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta de dinheiro do PDV.'
      USING ERRCODE = '23502', DETAIL = 'code=pdv_cash_account_required';
  END IF;

  -- A resposta e a mesma para conta inexistente, inativa ou de outra empresa:
  -- a RPC nao funciona como oraculo cross-tenant.
  SELECT account.id, account.name
    INTO v_account
    FROM public.financial_accounts account
   WHERE account.id = p_cash_account_id
     AND account.company_id = v_context.company_id
     AND account.type = 'caixa'
     AND account.is_active IS TRUE
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta selecionada nao esta disponivel para o PDV.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_cash_account_unavailable';
  END IF;

  -- Congela a configuracao antes de conferir sessoes. Assim duas alteracoes
  -- simultaneas nao atravessam a validacao com estados diferentes.
  PERFORM 1
    FROM public.company_settings settings
   WHERE settings.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configuracoes da empresa nao foram encontradas.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_company_settings_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Feche todos os caixas antes de trocar a conta de dinheiro.'
      USING ERRCODE = '23514', DETAIL = 'code=pdv_cash_account_open_session';
  END IF;

  PERFORM set_config(
    'app.pdv_cash_account_setting_change',
    jsonb_build_object(
      'company_id', v_context.company_id,
      'account_id', v_account.id
    )::text,
    true
  );

  UPDATE public.company_settings settings
     SET pdv_cash_account_id = v_account.id
   WHERE settings.company_id = v_context.company_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.pdv_cash_account_setting_change', '', true);
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Nao foi possivel salvar a conta de dinheiro do PDV.'
      USING ERRCODE = '55000', DETAIL = 'code=pdv_cash_account_save_failed';
  END IF;

  RETURN jsonb_build_object(
    'id', v_account.id,
    'name', v_account.name
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_save_cash_account_setting_v2(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_cash_account_setting_v2(uuid)
  TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_pdv_cash_account_setting
  ON public.company_settings;
CREATE TRIGGER trg_guard_pdv_cash_account_setting
  BEFORE UPDATE OF pdv_cash_account_id ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.pdv_guard_cash_account_setting_change();

COMMENT ON FUNCTION public.pdv_get_cash_account_setting_v2() IS
  'Lista somente contas Caixa ativas do tenant e a conta de dinheiro escolhida para o PDV.';
COMMENT ON FUNCTION public.pdv_save_cash_account_setting_v2(uuid) IS
  'Troca a conta de dinheiro do PDV com permissao explicita e somente quando todos os caixas estao fechados.';
COMMENT ON FUNCTION public.pdv_guard_cash_account_setting_change() IS
  'Impede cliente autenticado de contornar a RPC ao trocar diretamente a conta de dinheiro do PDV.';

COMMIT;
