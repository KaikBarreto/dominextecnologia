-- Garante que a conta de demonstração tenha acesso explícito a todos os
-- módulos funcionais ativos. O catálogo continua sendo a fonte canônica;
-- `extra_user` fica fora porque quantidade de usuários é controlada pelos
-- limites da empresa, não por um entitlement em `company_modules`.

DO $grant_demo_modules$
DECLARE
  v_profile_matches integer;
  v_company_matches integer;
  v_company_id uuid;
  v_catalog_count integer;
  v_inserted integer;
  v_missing integer;
BEGIN
  SELECT
    count(*),
    count(DISTINCT p.company_id) FILTER (WHERE p.company_id IS NOT NULL)
  INTO
    v_profile_matches,
    v_company_matches
  FROM auth.users AS u
  JOIN public.profiles AS p
    ON p.user_id = u.id
  WHERE lower(u.email) = lower('demo@dominex.app');

  IF v_profile_matches <> 1 OR v_company_matches <> 1 THEN
    RAISE NOTICE
      'grant_demo_modules: conta de demonstração indisponível ou ambígua; nenhuma alteração aplicada';
    RETURN;
  END IF;

  SELECT p.company_id
  INTO STRICT v_company_id
  FROM auth.users AS u
  JOIN public.profiles AS p
    ON p.user_id = u.id
  WHERE lower(u.email) = lower('demo@dominex.app')
    AND p.company_id IS NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies AS c
    WHERE c.id = v_company_id
  ) THEN
    RAISE EXCEPTION 'grant_demo_modules: empresa vinculada inexistente';
  END IF;

  SELECT count(*)
  INTO v_catalog_count
  FROM public.subscription_modules AS sm
  WHERE sm.is_active IS TRUE
    AND sm.code <> 'extra_user';

  IF v_catalog_count = 0 THEN
    RAISE EXCEPTION 'grant_demo_modules: catálogo ativo vazio';
  END IF;

  INSERT INTO public.company_modules (company_id, module_code, quantity)
  SELECT v_company_id, sm.code, 1
  FROM public.subscription_modules AS sm
  WHERE sm.is_active IS TRUE
    AND sm.code <> 'extra_user'
  ON CONFLICT (company_id, module_code) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT count(*)
  INTO v_missing
  FROM public.subscription_modules AS sm
  WHERE sm.is_active IS TRUE
    AND sm.code <> 'extra_user'
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_modules AS cm
      WHERE cm.company_id = v_company_id
        AND cm.module_code = sm.code
    );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION
      'grant_demo_modules: pós-condição falhou; % módulos continuam ausentes',
      v_missing;
  END IF;

  RAISE NOTICE
    'grant_demo_modules: catálogo %, inseridos %, ausentes %',
    v_catalog_count,
    v_inserted,
    v_missing;
END
$grant_demo_modules$;
