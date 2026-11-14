-- Provisiona a infraestrutura mínima do PDV quando o módulo é ativado.
--
-- Antes desta migration, liberar `company_modules.module_code = 'pdv'` só
-- mostrava o menu. A empresa continuava sem `pdv_terminals` e sem a conta do
-- cofre em `company_settings`; a tela de Caixa então apontava para uma tela de
-- Configurações que ainda é placeholder. A conta demo funcionava apenas porque
-- esses dados tinham sido montados manualmente.

BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_bootstrap_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_name text;
  v_cash_account_id uuid;
  v_stock_id uuid;
  v_account_created boolean := false;
  v_terminal_created boolean := false;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada para configurar o PDV.' USING ERRCODE = '22023';
  END IF;

  -- Serializa ativação, retry do botão e backfill da migration por empresa.
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-bootstrap:' || p_company_id::text, 0));

  SELECT c.name
    INTO v_company_name
    FROM public.companies c
   WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada para configurar o PDV.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.company_modules cm
     WHERE cm.company_id = p_company_id
       AND cm.module_code = 'pdv'
  ) THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  -- Toda empresa deveria receber settings no trigger de companies. O INSERT é
  -- um cinto para bases legadas/importadas e preserva todos os defaults atuais.
  INSERT INTO public.company_settings (company_id, name)
  VALUES (p_company_id, COALESCE(v_company_name, ''))
  ON CONFLICT (company_id) DO NOTHING;

  -- Preserva um cofre já válido. Se não houver, prefere uma conta física ativa
  -- que a empresa já cadastrou/importou; só cria "Caixa Geral" como último
  -- recurso. Nunca aponta para conta de outro tenant ou cartão de crédito.
  SELECT fa.id
    INTO v_cash_account_id
    FROM public.company_settings cs
    JOIN public.financial_accounts fa
      ON fa.id = cs.pdv_cash_account_id
     AND fa.company_id = p_company_id
     AND fa.is_active
     AND fa.type <> 'cartao'
   WHERE cs.company_id = p_company_id
   LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT fa.id
      INTO v_cash_account_id
      FROM public.financial_accounts fa
     WHERE fa.company_id = p_company_id
       AND fa.is_active
       AND fa.type = 'caixa'
     ORDER BY fa.sort_order, fa.created_at, fa.id
     LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    INSERT INTO public.financial_accounts (
      company_id,
      name,
      type,
      initial_balance,
      is_active,
      sort_order,
      color,
      icon
    ) VALUES (
      p_company_id,
      'Caixa Geral',
      'caixa',
      0,
      true,
      0,
      '#3b82f6',
      'Landmark'
    )
    RETURNING id INTO v_cash_account_id;
    v_account_created := true;
  END IF;

  UPDATE public.company_settings
     SET pdv_cash_account_id = v_cash_account_id
   WHERE company_id = p_company_id
     AND pdv_cash_account_id IS DISTINCT FROM v_cash_account_id;

  -- O terminal nasce ligado ao estoque principal já usado pela empresa. Isso
  -- evita criar um local de loja vazio e esconder, na primeira venda, todo o
  -- saldo que acabou de ser importado. O PDV aceita o local operacional com
  -- aviso até a empresa separar um estoque próprio de balcão.
  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_terminals t WHERE t.company_id = p_company_id
  ) THEN
    SELECT s.id
      INTO v_stock_id
      FROM public.stocks s
     WHERE s.company_id = p_company_id
       AND s.is_default
     ORDER BY s.created_at, s.id
     LIMIT 1;

    INSERT INTO public.pdv_terminals (
      company_id,
      name,
      stock_id,
      is_active,
      sort_order
    ) VALUES (
      p_company_id,
      'Caixa principal',
      v_stock_id,
      true,
      0
    );
    v_terminal_created := true;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'cash_account_created', v_account_created,
    'terminal_created', v_terminal_created
  );
END;
$function$;

COMMENT ON FUNCTION public.pdv_bootstrap_company(uuid) IS
  'Provisiona de forma idempotente conta de cofre e primeiro terminal para uma empresa com módulo PDV. Uso interno por trigger/backfill e pela RPC autenticada pdv_ensure_setup().';

REVOKE ALL ON FUNCTION public.pdv_bootstrap_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_bootstrap_company(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pdv_ensure_setup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_uid);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_gestor(v_uid) THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem configurar o primeiro caixa.' USING ERRCODE = '42501';
  END IF;

  RETURN public.pdv_bootstrap_company(v_company_id);
END;
$function$;

COMMENT ON FUNCTION public.pdv_ensure_setup() IS
  'Permite que admin/gestor da própria empresa refaça com segurança a configuração mínima do PDV. A empresa vem da sessão, nunca do payload.';

REVOKE ALL ON FUNCTION public.pdv_ensure_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_ensure_setup() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_bootstrap_pdv_on_module_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.module_code = 'pdv' THEN
    PERFORM public.pdv_bootstrap_company(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_bootstrap_pdv_on_module_activation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_company_modules_bootstrap_pdv ON public.company_modules;
CREATE TRIGGER tg_company_modules_bootstrap_pdv
  AFTER INSERT OR UPDATE OF module_code ON public.company_modules
  FOR EACH ROW
  WHEN (NEW.module_code = 'pdv')
  EXECUTE FUNCTION public.tg_bootstrap_pdv_on_module_activation();

COMMENT ON TRIGGER tg_company_modules_bootstrap_pdv ON public.company_modules IS
  'Ao ativar o add-on PDV, provisiona o primeiro caixa e o cofre no mesmo commit da ativação.';

-- Corrige empresas que já receberam o módulo antes da automação, incluindo a
-- cliente que revelou a falha. A função é idempotente e preserva setup válido.
DO $backfill$
DECLARE
  v_company_id uuid;
BEGIN
  FOR v_company_id IN
    SELECT cm.company_id
      FROM public.company_modules cm
     WHERE cm.module_code = 'pdv'
     ORDER BY cm.company_id
  LOOP
    PERFORM public.pdv_bootstrap_company(v_company_id);
  END LOOP;
END;
$backfill$;

COMMIT;
