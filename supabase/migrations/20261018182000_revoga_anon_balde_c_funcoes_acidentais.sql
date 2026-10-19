-- ===========================================================================
-- Tira o `anon` das 16 funcoes do public onde ele esta por ACIDENTE
-- ---------------------------------------------------------------------------
-- COMO ESTAS 16 FORAM ESCOLHIDAS
--   Das 442 funcoes do schema public, 121 eram executaveis por `anon`. Foram
--   classificadas em 4 baldes, medindo quem chama cada uma:
--
--     A  15  publica DE VERDADE, `anon` PRECISA executar. Portal do Cliente,
--            proposta publica, OS publica, avaliacao, captura de lead, auto
--            cadastro, blog e o SSR da Cloudflare. NAO SAO TOCADAS AQUI.
--     B  89  inalcancaveis ou exigidas por policy de `anon`. 83 sao
--            RETURNS trigger e 6 sao helper de policy. NAO SAO TOCADAS AQUI.
--     C  17  acidente: nem publica, nem citada por policy que alcance `anon`,
--            nem trigger. 1 delas (pdv_assert_ref_company) foi na migration
--            20261018181000, por ser vazamento ativo. As outras 16 estao aqui.
--     D   0  nao classificadas.
--
-- POR QUE O BALDE B FICA INTACTO (foi medido, nao suposto)
--   1. RETURNS trigger: o PostgREST nao expoe. Provado por HTTP real:
--      POST /rest/v1/rpc/update_updated_at_column como anon devolveu 404
--      PGRST202, "no matches found in the schema cache". E disparo de trigger
--      NAO exige EXECUTE do papel que escreve: provado em transacao revertida
--      (tabela nova + BEFORE INSERT, EXECUTE revogado de PUBLIC e anon, SET
--      ROLE anon, INSERT passou e o trigger rodou). Confirmacao independente em
--      producao: reset_quote_conversion_on_service_order_delete e
--      schedule_sync_service_order_reservations ja estavam SEM `anon` e a
--      abertura de chamado do portal funciona.
--   2. Os 6 helpers de policy TEM que manter EXECUTE, senao viram ERRO DE
--      RUNTIME em vez de deny limpo, derrubando superficie publica:
--        is_valid_portal_ticket_context  <- service_orders INSERT {anon}
--        is_customer_in_active_portal    <- form_responses INSERT {anon}
--                                           technician_locations SELECT {anon}
--        get_user_company_id             <- 7 policies {public}
--        can_manage_system               <- 4 policies {public}
--        has_role                        <- 2 policies {public}
--        is_super_admin                  <- 2 policies {public}
--      E `anon` AINDA tem GRANT de tabela nessas relacoes, entao a policy e
--      avaliada de fato, nao para antes no ACL da tabela.
--
-- POR QUE `FROM PUBLIC, anon` E NAO SO `FROM anon`
--   Esta e a lição do dia, e custou um vazamento. O Postgres concede EXECUTE a
--   PUBLIC em TODA funcao nova (entrada `=X` no proacl), e `anon` herda por
--   PUBLIC. Revogar nominalmente so remove o `anon=X` explicito e deixa o `=X`.
--   Medido: 98 das 121 funcoes tinham esse `=X`, e 6 tinham `anon` SO por
--   PUBLIC. Foi assim que as 5 funcoes pdv_* da onda 1 do PDV ficaram abertas
--   mesmo tendo `REVOKE ... FROM anon` e `FROM authenticated` escritos na
--   migration que as criou.
--
-- `authenticated` NAO E TOCADO, de proposito
--   5 destas 16 (os_media_company_ok, storage_folder_company_ok,
--   storage_insert_company_ok, storage_stamp_company_ok, time_photo_company_ok)
--   sao citadas por 28 policies de storage.objects, TODAS `TO authenticated`.
--   can_bootstrap_admin e citada por policy de user_roles `TO authenticated`.
--   Revogar `authenticated` derrubaria upload de foto de OS, de ponto e de
--   catalogo. Medido antes: as 16 tem `authenticated=X` EXPLICITO no proacl,
--   logo tirar o `=X` de PUBLIC nao as afeta.
--
-- POR QUE CADA UMA E INALCANCAVEL POR CAMINHO LEGITIMO DE `anon`
--   lead_valida_cpf / lead_valida_cnpj
--     so chamadas por submit_lead_capture_form, que e SECURITY DEFINER (logo a
--     chamada interna roda como owner e nao consulta o GRANT do chamador) e na
--     qual `anon` nem tem EXECUTE. O lead publico entra pela edge function
--     lead-capture-submit, com service_role.
--   compute_payroll_periods -> nth_business_day -> is_business_day
--     cadeia alcancada so por generate_payroll_for_employee (SECURITY DEFINER).
--   compute_next_expiration
--     chamada por apply_subscription_upgrade_payment e
--     register_manual_company_payment (ambas SECURITY DEFINER) e por edge
--     function com service_role.
--   fiscal_texto_busca / immutable_unaccent
--     usadas em coluna GENERATED de nfse_codigos_nbs, nfse_codigos_tributacao e
--     guia_chunks. `anon` nao tem privilegio NENHUM nessas 3 tabelas (medido),
--     entao nunca chega a computar a coluna.
--   storage_folder_uuid
--     chamada por 4 funcoes SECURITY DEFINER (as storage_*_ok).
--   os_media_company_ok / storage_*_ok / time_photo_company_ok
--     so em policies de storage.objects `TO authenticated`. E storage.objects e
--     de supabase_storage_admin com relforcerowsecurity = false, logo o dono
--     nem avalia policy.
--   can_bootstrap_admin
--     1 policy, em user_roles, `TO authenticated`.
--
-- O QUE ISSO FECHA NA PRATICA
--   10 destas estavam respondendo HTTP 200 pro `anon` agora (is_business_day,
--   nth_business_day, immutable_unaccent, fiscal_texto_busca,
--   compute_next_expiration, compute_payroll_periods, can_bootstrap_admin,
--   lead_valida_cpf, storage_folder_uuid, storage_stamp_company_ok). Nenhuma
--   vazava dado de tenant (as SECURITY INVOKER caem na RLS do proprio `anon`),
--   mas eram superficie de ataque viva e tranca unica.
--
-- Idempotente: REVOKE repetido nao falha.
-- ===========================================================================

REVOKE ALL ON FUNCTION public.can_bootstrap_admin()                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_next_expiration(timestamptz, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_payroll_periods(uuid, date, date)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiscal_texto_busca(text)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.immutable_unaccent(text)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.immutable_unaccent(text[])                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_day(date, uuid)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_valida_cnpj(text)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_valida_cpf(text)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nth_business_day(integer, integer, integer, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.os_media_company_ok(text)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_folder_company_ok(text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_folder_uuid(text)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_insert_company_ok(jsonb, text)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_stamp_company_ok(jsonb)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.time_photo_company_ok(text)                            FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- VERIFICACAO: a migration aborta em vez de subir com furo aberto.
--
-- Checa por has_function_privilege, NUNCA por inspecao de proacl. O furo das
-- funcoes pdv_* era exatamente um privilegio que NAO aparece como `anon=X`
-- (vinha do `=X` de PUBLIC), entao ler o proacl passa verde com o furo aberto.
--
-- Checa as TRES coisas: (1) anon saiu do balde C; (2) authenticated e
-- service_role CONTINUAM, senao storage e folha quebram; (3) o balde A continua
-- executavel por anon, senao os portais pagos caem.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_balde_c text[] := ARRAY[
    'public.can_bootstrap_admin()',
    'public.compute_next_expiration(timestamptz,text)',
    'public.compute_payroll_periods(uuid,date,date)',
    'public.fiscal_texto_busca(text)',
    'public.immutable_unaccent(text)',
    'public.immutable_unaccent(text[])',
    'public.is_business_day(date,uuid)',
    'public.lead_valida_cnpj(text)',
    'public.lead_valida_cpf(text)',
    'public.nth_business_day(integer,integer,integer,uuid)',
    'public.os_media_company_ok(text)',
    'public.storage_folder_company_ok(text)',
    'public.storage_folder_uuid(text)',
    'public.storage_insert_company_ok(jsonb,text)',
    'public.storage_stamp_company_ok(jsonb)',
    'public.time_photo_company_ok(text)'
  ];
  -- Balde A: as 15 superficies publicas de verdade. Se alguma perder o EXECUTE
  -- de anon, Portal do Cliente, proposta publica, OS publica, avaliacao,
  -- captura de lead, auto cadastro, blog ou o preview OG da Cloudflare caem.
  v_balde_a text[] := ARRAY[
    'public.get_portal_data(text)',
    'public.get_quote_public_payload(text)',
    'public.record_quote_view(text,text,text)',
    'public.respond_quote_public(text,text)',
    'public.get_public_os(uuid)',
    'public.get_public_os_by_code(text)',
    'public.get_public_os_social_meta(text)',
    'public.submit_public_os_rating(uuid,integer,text,text,jsonb)',
    'public.get_disc_public(text)',
    'public.submit_disc_assessment(text,jsonb,jsonb,jsonb,text)',
    'public.get_lead_capture_form(text)',
    'public.check_email_available(text)',
    'public.get_public_registration_modules(text[])',
    'public.get_signup_origins()',
    'public.increment_blog_post_views(text)'
  ];
  -- Balde B: os 6 helpers que policy de anon/public exige. Perder EXECUTE aqui
  -- troca deny limpo por erro de runtime no INSERT de chamado do portal.
  v_balde_b text[] := ARRAY[
    'public.is_valid_portal_ticket_context(uuid,uuid,uuid)',
    'public.is_customer_in_active_portal(uuid)',
    'public.get_user_company_id(uuid)',
    'public.can_manage_system(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.is_super_admin(uuid)'
  ];
  v_sig       text;
  v_abertas   text := '';
  v_perdidas  text := '';
  v_quebradas text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'role anon nao existe neste ambiente; nada a verificar';
    RETURN;
  END IF;

  -- 1) anon tem que ter saido de TODAS as 16
  FOREACH v_sig IN ARRAY v_balde_c LOOP
    IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE') THEN
      v_abertas := v_abertas || v_sig || ' ';
    END IF;
    -- 2) authenticated e service_role NAO podem ter sido levados no caminho
    IF NOT has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      v_perdidas := v_perdidas || v_sig || ' (authenticated) ';
    END IF;
    IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
      v_perdidas := v_perdidas || v_sig || ' (service_role) ';
    END IF;
  END LOOP;

  -- 3) balde A e balde B tem que CONTINUAR executaveis por anon
  FOREACH v_sig IN ARRAY (v_balde_a || v_balde_b) LOOP
    IF NOT has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE') THEN
      v_quebradas := v_quebradas || v_sig || ' ';
    END IF;
  END LOOP;

  IF v_abertas <> '' THEN
    RAISE EXCEPTION 'balde C AINDA executavel por anon: %', v_abertas;
  END IF;
  IF v_perdidas <> '' THEN
    RAISE EXCEPTION 'revoke foi longe demais, papel do app perdeu EXECUTE: %', v_perdidas;
  END IF;
  IF v_quebradas <> '' THEN
    RAISE EXCEPTION 'superficie publica/policy PERDEU o EXECUTE de anon (portal pago cairia): %', v_quebradas;
  END IF;

  RAISE NOTICE 'verificado: 16 funcoes fechadas pra anon, authenticated e service_role intactos, 15 do balde A e 6 do balde B ainda executaveis por anon';
END $$;
