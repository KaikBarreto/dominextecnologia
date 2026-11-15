-- Preparação inicial do PDV, sem backfill global nem alteração de gates/allowlists.
-- Reutiliza a estrutura revisada do onboarding, separada do rollout avançado.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_company_access_entitled_internal(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.companies company
     WHERE company.id = p_company_id
       AND (
         (company.subscription_status = 'pending_payment'
           AND company.payment_lock_bypass IS TRUE)
         OR (
           company.subscription_status = 'testing'
           AND company.subscription_expires_at IS NOT NULL
           AND (company.subscription_expires_at AT TIME ZONE 'UTC')::date
               >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           company.subscription_status = 'active'
           AND (
             company.subscription_expires_at IS NULL
             OR (company.subscription_expires_at AT TIME ZONE 'UTC')::date + 1
                >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  )
$function$;

COMMENT ON FUNCTION public.pdv_company_access_entitled_internal(uuid) IS
  'Helper owner-only para provisionamento: espelha a vigencia canonica sem aceitar company_id do cliente. A RPC publica sempre deriva a empresa da sessao.';

REVOKE ALL ON FUNCTION public.pdv_company_access_entitled_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_bootstrap_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_name text;
  v_current_account_id uuid;
  v_cash_account_id uuid;
  v_stock_id uuid;
  v_account_created boolean := false;
  v_cash_account_deferred boolean := false;
  v_has_open_cash boolean := false;
  v_stock_promoted boolean := false;
  v_terminal_created boolean := false;
  v_terminals_repaired integer := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa nao informada para configurar o PDV.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_setup_company_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pdv-bootstrap:' || p_company_id::text, 0)
  );

  SELECT company.name
    INTO v_company_name
    FROM public.companies company
   WHERE company.id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa nao encontrada para configurar o PDV.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_setup_company_not_found';
  END IF;

  IF public.pdv_company_access_entitled_internal(p_company_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso desta empresa esta indisponivel.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_subscription_denied';
  END IF;

  IF public.company_has_module(p_company_id, 'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O modulo PDV e Loja nao esta ativo nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_module_denied';
  END IF;

  -- Serializa com as duas geracoes de abertura/fechamento. O writer v2 usa o
  -- lock de tesouraria e o legado usa pdv-cofre; adquirir ambos antes de ler a
  -- configuracao impede trocar a conta no intervalo em que um turno abre.
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pdv-treasury-company:' || p_company_id::text, 0
    )
  );
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pdv-cofre:' || p_company_id::text, 0)
  );

  INSERT INTO public.company_settings (company_id, name)
  VALUES (p_company_id, COALESCE(v_company_name, ''))
  ON CONFLICT (company_id) DO NOTHING;

  SELECT settings.pdv_cash_account_id
    INTO v_current_account_id
    FROM public.company_settings settings
   WHERE settings.company_id = p_company_id
   FOR UPDATE;

  -- Vale para sessao legada e v2: filtrar por contract_version aqui faria o
  -- backfill trocar o cofre de um turno antigo ainda em andamento.
  SELECT EXISTS (
    SELECT 1
      FROM public.pdv_cash_sessions session
     WHERE session.company_id = p_company_id
       AND session.status = 'aberta'
  ) INTO v_has_open_cash;

  IF v_has_open_cash THEN
    -- Durante um turno aberto, a conta congelada pela operacao prevalece. Uma
    -- conta Banco/Carteira configurada continua apontada ate o fechamento; a
    -- normalizacao para Caixa fica adiada para um novo setup seguro.
    SELECT account.id
      INTO v_cash_account_id
      FROM public.financial_accounts account
     WHERE account.id = v_current_account_id
       AND account.company_id = p_company_id;

    v_cash_account_deferred := true;

    IF v_cash_account_id IS NULL THEN
      -- Nao existe conta valida para preservar. Criar ou apontar outra no meio
      -- do turno seria pior: o administrador fecha/concilia e repete o setup.
      RETURN jsonb_build_object(
        'configured', false,
        'cash_account_created', false,
        'cash_account_deferred', true,
        'needs_cash_close', true,
        'terminal_created', false,
        'terminals_repaired', 0,
        'needs_stock', false
      );
    END IF;
  ELSE
    -- Sem turno aberto, normaliza a configuracao para uma conta Caixa ativa,
    -- que e o conjunto editavel pela UI atual.
    SELECT account.id
      INTO v_cash_account_id
      FROM public.financial_accounts account
     WHERE account.id = v_current_account_id
       AND account.company_id = p_company_id
       AND account.is_active
       AND account.type = 'caixa';

    IF v_cash_account_id IS NULL THEN
      SELECT account.id
        INTO v_cash_account_id
        FROM public.financial_accounts account
       WHERE account.company_id = p_company_id
         AND account.is_active
         AND account.type = 'caixa'
       ORDER BY account.sort_order, account.created_at, account.id
       LIMIT 1;
    END IF;

    IF v_cash_account_id IS NULL THEN
      INSERT INTO public.financial_accounts (
        company_id, name, type, initial_balance, is_active, sort_order, color, icon
      ) VALUES (
        p_company_id, 'Caixa Geral', 'caixa', 0, true, 0, '#3b82f6', 'Landmark'
      )
      RETURNING id INTO v_cash_account_id;
      v_account_created := true;
    END IF;

    UPDATE public.company_settings
       SET pdv_cash_account_id = v_cash_account_id
     WHERE company_id = p_company_id
       AND pdv_cash_account_id IS DISTINCT FROM v_cash_account_id;
  END IF;

  -- Nunca associa o PDV a estoque segregado de cliente. Primeiro usa o geral
  -- principal; em base legada sem principal, promove um geral existente. Se
  -- nao houver estoque geral, nao inventa local nem cria terminal invalido: a
  -- UI orienta o responsavel a cadastrar o primeiro local e repetir o setup.
  SELECT stock.id
    INTO v_stock_id
    FROM public.stocks stock
   WHERE stock.company_id = p_company_id
     AND stock.customer_id IS NULL
     AND stock.is_default
   ORDER BY stock.sort_order, stock.created_at, stock.id
   LIMIT 1;

  IF v_stock_id IS NULL THEN
    SELECT stock.id
      INTO v_stock_id
      FROM public.stocks stock
     WHERE stock.company_id = p_company_id
       AND stock.customer_id IS NULL
     ORDER BY stock.sort_order, stock.created_at, stock.id
     LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stocks
         SET is_default = true
       WHERE id = v_stock_id
         AND is_default IS DISTINCT FROM true;
      v_stock_promoted := true;
    END IF;
  END IF;

  IF v_stock_id IS NULL THEN
    RETURN jsonb_build_object(
      'configured', true,
      'cash_account_created', v_account_created,
      'cash_account_deferred', v_cash_account_deferred,
      'needs_cash_close', false,
      'terminal_created', false,
      'terminals_repaired', 0,
      'needs_stock', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = p_company_id
  ) THEN
    INSERT INTO public.pdv_terminals (
      company_id, name, stock_id, is_active, sort_order
    ) VALUES (
      p_company_id, 'Caixa principal', v_stock_id, true, 0
    );
    v_terminal_created := true;
  ELSE
    UPDATE public.pdv_terminals terminal
       SET stock_id = v_stock_id
     WHERE terminal.company_id = p_company_id
       AND (
         terminal.stock_id IS NULL
         OR NOT EXISTS (
           SELECT 1
             FROM public.stocks stock
            WHERE stock.id = terminal.stock_id
              AND stock.company_id = p_company_id
              AND stock.customer_id IS NULL
         )
       );
    GET DIAGNOSTICS v_terminals_repaired = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'cash_account_created', v_account_created,
    'cash_account_deferred', v_cash_account_deferred,
    'needs_cash_close', false,
    'stock_promoted', v_stock_promoted,
    'terminal_created', v_terminal_created,
    'terminals_repaired', v_terminals_repaired,
    'needs_stock', false
  );
END;
$function$;

COMMENT ON FUNCTION public.pdv_bootstrap_company(uuid) IS
  'Provisiona de forma idempotente conta Caixa e primeiro terminal sobre estoque geral valido; preserva a conta configurada durante sessao aberta e, quando falta estoque, retorna needs_stock sem criar terminal invalido.';

REVOKE ALL ON FUNCTION public.pdv_bootstrap_company(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_bootstrap_company(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pdv_ensure_setup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Entre de novo para continuar.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_auth_required';
  END IF;

  v_company_id := public.get_user_company_id(v_uid);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Seu usuario nao esta vinculado a nenhuma empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_company_denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles profile
    WHERE profile.user_id = v_uid AND profile.company_id = v_company_id
      AND profile.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Seu acesso esta desativado.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_user_inactive';
  END IF;

  IF NOT public.is_admin_or_gestor(v_uid) THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem configurar o primeiro caixa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_permission_denied';
  END IF;

  IF public.tenant_subscription_allows_access(v_company_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso desta empresa esta indisponivel.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_subscription_denied';
  END IF;

  IF public.company_has_module(v_company_id, 'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O modulo PDV e Loja nao esta ativo nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_setup_module_denied';
  END IF;

  RETURN public.pdv_bootstrap_company(v_company_id);
END;
$function$;

COMMENT ON FUNCTION public.pdv_ensure_setup() IS
  'Onboarding lazy do PDV: admin/gestor configura somente a empresa da propria sessao; retry e concorrencia sao idempotentes.';

REVOKE ALL ON FUNCTION public.pdv_ensure_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_ensure_setup() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_bootstrap_pdv_on_module_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.module_code = 'pdv'
     AND public.pdv_company_access_entitled_internal(NEW.company_id)
     AND public.company_has_module(NEW.company_id, 'pdv') THEN
    PERFORM public.pdv_bootstrap_company(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_bootstrap_pdv_on_module_activation()
  FROM PUBLIC, anon, authenticated, service_role;


-- Reparo estreito para a anomalia legada: cadastrar um estoque geral pode
-- corrigir terminal que JA EXISTIA sem local valido. Nao chama bootstrap, nao
-- cria conta/terminal e, portanto, nao ativa PDV silenciosamente para trial ou
-- plano implicito que nunca iniciou o onboarding.
CREATE OR REPLACE FUNCTION public.tg_repair_pdv_terminal_on_general_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_target_stock_id uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL
     OR public.pdv_company_access_entitled_internal(NEW.company_id) IS DISTINCT FROM TRUE
     OR public.company_has_module(NEW.company_id, 'pdv') IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- O estoque recem-inserido pode ser apenas um local secundario. Repara para
  -- o geral principal da empresa; NEW naturalmente e o fallback quando for o
  -- primeiro e unico estoque geral.
  SELECT stock.id
    INTO v_target_stock_id
    FROM public.stocks stock
   WHERE stock.company_id = NEW.company_id
     AND stock.customer_id IS NULL
   ORDER BY stock.is_default DESC,
            stock.sort_order,
            stock.created_at,
            stock.id
   LIMIT 1;

  IF v_target_stock_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pdv_terminals terminal
     SET stock_id = v_target_stock_id
   WHERE terminal.company_id = NEW.company_id
     AND (
       terminal.stock_id IS NULL
       OR NOT EXISTS (
         SELECT 1
           FROM public.stocks current_stock
          WHERE current_stock.id = terminal.stock_id
            AND current_stock.company_id = NEW.company_id
            AND current_stock.customer_id IS NULL
       )
     );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_repair_pdv_terminal_on_general_stock()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tg_stocks_repair_pdv_terminal ON public.stocks;
CREATE TRIGGER tg_stocks_repair_pdv_terminal
  AFTER INSERT ON public.stocks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_repair_pdv_terminal_on_general_stock();

COMMENT ON TRIGGER tg_stocks_repair_pdv_terminal ON public.stocks IS
  'Repara somente terminal PDV preexistente sem estoque geral valido; nunca cria estrutura nova.';


COMMIT;
