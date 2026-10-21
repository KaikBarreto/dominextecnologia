-- Portal do Contrato/PMOC (/contrato/unidade/:token): 3 estados por secao
-- (Livre / Com senha / Oculto).
--
-- Caso de uso real (KGIE, administradora de condominios): o MESMO link vai pra
-- portaria (cronograma, historico, abrir ocorrencia) e pro sindico (digita a
-- senha e ve cobrancas e documentos).
--
-- LEI DESTA ENTREGA — retrocompatibilidade total. Os links do portal de contrato
-- estao em QR code IMPRESSO e em conversa de WhatsApp: eles abrem pra sempre.
-- Por isso o default aqui e o INVERSO do Portal do Cliente:
--   chave ausente em `portal_sections` = 'free' = LIVRE, igual a hoje.
-- Portal do Cliente nasce fail-closed porque lah o estado anterior era "portal
-- inteiro atras da senha"; aqui o estado anterior era "portal inteiro aberto".
--
-- Senha: NAO existe credencial nova. A senha do portal de contrato E a senha do
-- Portal do Cliente DONO do contrato (contracts.customer_id -> customer_portals
-- -> customer_portal_credentials) e a sessao e a mesma customer_portal_sessions.
-- Uma senha por cliente, valida nos dois portais. Consequencia aceita e
-- deliberada: lockout e sessao sao compartilhados entre os dois portais.

-- 1. Coluna -------------------------------------------------------------------

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS portal_sections jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contracts.portal_sections IS
  'Estado por secao do Portal do Contrato/PMOC: free (livre) | password (exige senha do Portal do Cliente dono) | hidden (oculto). Chave AUSENTE = free = livre, pra nao regredir link/QR code ja compartilhado. {} = portal inteiro livre, comportamento anterior a esta coluna.';

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_portal_sections_shape;

-- CHECK nao aceita subquery: as 8 chaves sao enumeradas a mao, igual ao
-- customer_portals_public_sections_shape.
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_portal_sections_shape CHECK (
    jsonb_typeof(portal_sections) = 'object'
    AND (portal_sections - ARRAY[
      'visao_geral', 'equipamentos', 'cronograma', 'ocorrencias',
      'documentos', 'historico', 'historico_pmoc', 'cobrancas'
    ]::text[]) = '{}'::jsonb
    AND (NOT (portal_sections ? 'visao_geral') OR (jsonb_typeof(portal_sections->'visao_geral') = 'string' AND portal_sections->>'visao_geral' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'equipamentos') OR (jsonb_typeof(portal_sections->'equipamentos') = 'string' AND portal_sections->>'equipamentos' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'cronograma') OR (jsonb_typeof(portal_sections->'cronograma') = 'string' AND portal_sections->>'cronograma' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'ocorrencias') OR (jsonb_typeof(portal_sections->'ocorrencias') = 'string' AND portal_sections->>'ocorrencias' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'documentos') OR (jsonb_typeof(portal_sections->'documentos') = 'string' AND portal_sections->>'documentos' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'historico') OR (jsonb_typeof(portal_sections->'historico') = 'string' AND portal_sections->>'historico' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'historico_pmoc') OR (jsonb_typeof(portal_sections->'historico_pmoc') = 'string' AND portal_sections->>'historico_pmoc' IN ('free', 'password', 'hidden')))
    AND (NOT (portal_sections ? 'cobrancas') OR (jsonb_typeof(portal_sections->'cobrancas') = 'string' AND portal_sections->>'cobrancas' IN ('free', 'password', 'hidden')))
  );

-- 2. Login publico do Portal do Contrato --------------------------------------
--
-- Mesma mecanica de customer_portal_login: bcrypt via extensions.crypt, lockout
-- de 5 tentativas / 15 minutos na MESMA linha de customer_portal_credentials,
-- session_token de 32 bytes aleatorios com apenas o SHA-256 em
-- customer_portal_sessions, validade de 30 dias.
--
-- O retorno NUNCA distingue "contrato inexistente", "cliente sem portal",
-- "cliente sem senha" e "senha errada": tudo vira EXATAMENTE
-- {"ok":false,"error":"invalid"}, byte a byte.
--
-- Diferenca deliberada em relacao a customer_portal_login: aqui NAO devolvemos
-- `attempts_left`. Lah o visitante ja sabe que o portal tem senha (o portal
-- inteiro esta bloqueado); aqui a existencia de senha no cliente DONO e
-- justamente o que nao pode ser sondado por quem tem um token de contrato — e
-- `attempts_left` so aparece quando existe credencial, o que entregaria o jogo.
CREATE OR REPLACE FUNCTION public.contract_portal_login(p_token text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $login$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_lookup_value text;
  v_is_company_member boolean;
  v_portal_id uuid;
  v_password_enabled boolean;
  v_credential public.customer_portal_credentials%ROWTYPE;
  v_raw_session text;
  v_failed integer;
BEGIN
  -- Deteccao de token IDENTICA a de create_contract_portal_ticket: 32 hex em
  -- public_pmoc_token OU short code de 12 chars no ULTIMO segmento depois do
  -- '-'. Retrocompatibilidade de link e invariante.
  v_lookup_value := lower(COALESCE(NULLIF(split_part(reverse(p_token), '-', 1), ''), ''));
  v_lookup_value := reverse(v_lookup_value);

  SELECT c.* INTO v_contract
    FROM public.contracts c
   WHERE (
          (p_token ~ '^[0-9a-f]{32}$' AND c.public_pmoc_token = p_token)
          OR (v_lookup_value ~ '^[a-hj-np-z2-9]{12}$' AND c.public_short_code = v_lookup_value)
         )
     AND c.status NOT IN ('cancelled', 'inactive')
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_contract.company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND p.company_id = v_contract.company_id
         AND p.is_active
    );

  IF NOT v_contract.portal_is_public AND NOT v_is_company_member THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- Vigencia canonica inline (tenant_subscription_allows_access recusa anon
  -- antes de avaliar a assinatura), igual ao gate da RPC de ocorrencia. Fora de
  -- vigencia nao se tenta senha nenhuma.
  --
  -- Modulo: 'contracts', que e o gate DESTE portal (edge pmoc-portal-share,
  -- "este portal e gateado por 'contracts'"). NAO 'customer_portal' (que a RPC
  -- de ocorrencia usa por heranca): senao um tenant com 'contracts' e sem
  -- 'customer_portal' veria a tela pedir senha e o login falhar pra sempre.
  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_contract.company_id
       AND (
         (co.subscription_status = 'pending_payment' AND co.payment_lock_bypass IS TRUE)
         OR (
           co.subscription_status = 'testing'
           AND co.subscription_expires_at IS NOT NULL
           AND (co.subscription_expires_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           co.subscription_status = 'active'
           AND (
             co.subscription_expires_at IS NULL
             OR (co.subscription_expires_at AT TIME ZONE 'UTC')::date + 1 >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  ) OR NOT public.company_has_module(v_contract.company_id, 'contracts') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- Senha do CLIENTE dono do contrato. Nao exigimos is_active/is_public do
  -- Portal do Cliente: sao gates do outro portal, e o tenant que so usa o
  -- portal de contrato pode ter deixado o do cliente desligado. O que manda
  -- aqui e existir credencial.
  SELECT cp.id, cp.password_enabled INTO v_portal_id, v_password_enabled
    FROM public.customer_portals cp
    JOIN public.customers cu ON cu.id = cp.customer_id
   WHERE cp.customer_id = v_contract.customer_id
     AND cu.company_id = v_contract.company_id
     AND COALESCE(cu.is_deleted, false) = false
   LIMIT 1;

  IF v_portal_id IS NULL OR NOT COALESCE(v_password_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT * INTO v_credential
    FROM public.customer_portal_credentials pc
   WHERE pc.portal_id = v_portal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF v_credential.locked_until IS NOT NULL AND v_credential.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'locked',
      'locked_until', v_credential.locked_until
    );
  END IF;

  IF p_password IS NOT NULL
     AND extensions.crypt(p_password, v_credential.password_hash) = v_credential.password_hash
  THEN
    UPDATE public.customer_portal_credentials
       SET failed_attempts = 0, locked_until = NULL
     WHERE portal_id = v_portal_id;

    DELETE FROM public.customer_portal_sessions
     WHERE portal_id = v_portal_id AND expires_at <= now();

    v_raw_session := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.customer_portal_sessions (portal_id, token_hash, expires_at)
    VALUES (
      v_portal_id,
      encode(extensions.digest(v_raw_session, 'sha256'), 'hex'),
      now() + interval '30 days'
    );

    RETURN jsonb_build_object(
      'ok', true,
      'session_token', v_raw_session,
      'expires_at', now() + interval '30 days'
    );
  END IF;

  v_failed := LEAST(COALESCE(v_credential.failed_attempts, 0) + 1, 5);
  UPDATE public.customer_portal_credentials
     SET failed_attempts = CASE WHEN v_failed >= 5 THEN 0 ELSE v_failed END,
         locked_until = CASE WHEN v_failed >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE portal_id = v_portal_id;

  IF v_failed >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'locked',
      'locked_until', now() + interval '15 minutes'
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid');
END;
$login$;

COMMENT ON FUNCTION public.contract_portal_login(text, text) IS
  'Login publico do Portal do Contrato/PMOC. A senha e a do Portal do Cliente dono do contrato (customer_portal_credentials) e a sessao e a mesma customer_portal_sessions (30 dias). Bcrypt, lockout de 5 erros / 15 min, retorno generico que nao distingue "sem senha" de "senha errada".';

REVOKE ALL ON FUNCTION public.contract_portal_login(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.contract_portal_login(text, text)
  TO anon, authenticated, service_role;

-- 3. Validacao de sessao (consumida pela edge pmoc-portal-share) --------------
--
-- Resolve contrato -> cliente -> portal e delega pra customer_portal_session_is_valid.
-- NAO e gate de acesso: quem decide o que aparece e a edge/RPC chamadora. Por
-- isso nao reavalia portal_is_public nem assinatura, so a validade da sessao.
-- Grant APENAS service_role: quem chama e a edge pmoc-portal-share.
CREATE OR REPLACE FUNCTION public.contract_portal_session_is_valid(
  p_token text,
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $sess$
DECLARE
  v_lookup_value text;
  v_portal_id uuid;
BEGIN
  IF p_session_token IS NULL OR p_session_token = '' THEN
    RETURN false;
  END IF;

  v_lookup_value := lower(COALESCE(NULLIF(split_part(reverse(p_token), '-', 1), ''), ''));
  v_lookup_value := reverse(v_lookup_value);

  SELECT cp.id INTO v_portal_id
    FROM public.contracts c
    JOIN public.customers cu
      ON cu.id = c.customer_id
     AND cu.company_id = c.company_id
     AND COALESCE(cu.is_deleted, false) = false
    JOIN public.customer_portals cp ON cp.customer_id = c.customer_id
   WHERE (
          (p_token ~ '^[0-9a-f]{32}$' AND c.public_pmoc_token = p_token)
          OR (v_lookup_value ~ '^[a-hj-np-z2-9]{12}$' AND c.public_short_code = v_lookup_value)
         )
     AND c.status NOT IN ('cancelled', 'inactive')
   LIMIT 1;

  IF v_portal_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.customer_portal_session_is_valid(v_portal_id, p_session_token);
END;
$sess$;

COMMENT ON FUNCTION public.contract_portal_session_is_valid(text, text) IS
  'Valida a sessao do Portal do Contrato/PMOC (sessao do Portal do Cliente dono do contrato). Executavel apenas por service_role: quem chama e a edge pmoc-portal-share.';

REVOKE ALL ON FUNCTION public.contract_portal_session_is_valid(text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_portal_session_is_valid(text, text)
  TO service_role;

-- 4. Ocorrencia: exige sessao SO quando a secao esta 'password' ----------------
--
-- Recriada a partir da definicao VIVA (pg_get_functiondef), nao da migration em
-- disco. Conferido nesta entrega: a def viva de create_contract_portal_ticket
-- era BYTE A BYTE igual a de 20261018234000 (nenhum campo somado depois), mas a
-- checagem foi feita antes de escrever, nao presumida.
--
-- Assinatura nova com p_session_token no FIM e DEFAULT NULL. O overload de 2
-- argumentos e REMOVIDO em vez de coexistir: dois candidatos deixariam a
-- chamada antiga ambigua ("function is not unique"). Com o DEFAULT, a chamada
-- de 2 argumentos (o front atual) continua resolvendo pra esta funcao.
DROP FUNCTION IF EXISTS public.create_contract_portal_ticket(text, text);

CREATE OR REPLACE FUNCTION public.create_contract_portal_ticket(
  p_token text,
  p_description text,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $ticket$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_lookup_value text;
  v_is_company_member boolean;
  v_order_id uuid;
  v_section_state text;
BEGIN
  v_lookup_value := lower(COALESCE(NULLIF(split_part(reverse(p_token), '-', 1), ''), ''));
  v_lookup_value := reverse(v_lookup_value);

  SELECT c.* INTO v_contract
    FROM public.contracts c
   WHERE (
          (p_token ~ '^[0-9a-f]{32}$' AND c.public_pmoc_token = p_token)
          OR (v_lookup_value ~ '^[a-hj-np-z2-9]{12}$' AND c.public_short_code = v_lookup_value)
         )
     AND c.status NOT IN ('cancelled', 'inactive')
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_contract.company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND p.company_id = v_contract.company_id
         AND p.is_active
    );

  IF NOT v_contract.portal_is_public AND NOT v_is_company_member THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_contract.company_id
       AND (
         (co.subscription_status = 'pending_payment' AND co.payment_lock_bypass IS TRUE)
         OR (
           co.subscription_status = 'testing'
           AND co.subscription_expires_at IS NOT NULL
           AND (co.subscription_expires_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           co.subscription_status = 'active'
           AND (
             co.subscription_expires_at IS NULL
             OR (co.subscription_expires_at AT TIME ZONE 'UTC')::date + 1 >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  ) OR NOT public.company_has_module(v_contract.company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  -- Chave AUSENTE (e tambem string vazia) = 'free': link antigo, sem nenhuma
  -- configuracao, abre chamado sem sessao EXATAMENTE como antes desta migration.
  v_section_state := COALESCE(
    NULLIF(btrim(COALESCE(v_contract.portal_sections, '{}'::jsonb)->>'ocorrencias'), ''),
    'free'
  );

  IF v_section_state = 'hidden' AND NOT v_is_company_member THEN
    RAISE EXCEPTION 'Abertura de ocorrencias desativada neste portal'
      USING ERRCODE = '42501';
  END IF;

  IF v_section_state = 'password'
     AND NOT v_is_company_member
     AND NOT public.contract_portal_session_is_valid(p_token, p_session_token)
  THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_description IS NULL OR char_length(btrim(p_description)) < 10
     OR char_length(btrim(p_description)) > 2000 THEN
    RAISE EXCEPTION 'A descricao precisa ter entre 10 e 2000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_orders (
    customer_id, contract_id, description, os_type, status, origin, company_id
  ) VALUES (
    v_contract.customer_id, v_contract.id, btrim(p_description),
    'manutencao_corretiva', 'pendente', 'portal', v_contract.company_id
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('ok', true, 'service_order_id', v_order_id);
END;
$ticket$;

COMMENT ON FUNCTION public.create_contract_portal_ticket(text, text, text) IS
  'Abre ocorrencia pelo Portal do Contrato/PMOC validando o token e derivando tenant, cliente e contrato no servidor. Exige sessao valida quando portal_sections->>''ocorrencias'' = ''password''; recusa quando ''hidden''; aceita sem sessao quando ''free'' ou ausente (retrocompat dos links ja compartilhados).';

-- O DROP do overload de 2 argumentos levou os GRANTs: refazer na assinatura nova.
REVOKE ALL ON FUNCTION public.create_contract_portal_ticket(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_contract_portal_ticket(text, text, text)
  TO anon, authenticated, service_role;

-- 5. Guardas de instalacao ----------------------------------------------------

DO $guard$
BEGIN
  -- Segredo e sessao continuam invisiveis pra client role (guarda herdada).
  IF has_table_privilege('anon', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('anon', 'public.customer_portal_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_sessions', 'SELECT')
  THEN
    RAISE EXCEPTION 'Credenciais/sessoes do portal expostas a client role';
  END IF;

  IF has_table_privilege('anon', 'public.service_orders', 'INSERT') THEN
    RAISE EXCEPTION 'INSERT anon direto em service_orders ainda aberto';
  END IF;

  -- A configuracao das secoes e salva pela tela interna via UPDATE em contracts
  -- (RLS tenant-scoped). anon nao pode ler nem escrever a tabela.
  IF has_table_privilege('anon', 'public.contracts', 'UPDATE')
     OR has_table_privilege('anon', 'public.contracts', 'SELECT')
  THEN
    RAISE EXCEPTION 'anon tem acesso direto a contracts';
  END IF;

  IF NOT has_function_privilege('anon', 'public.contract_portal_login(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'contract_portal_login nao e executavel por anon';
  END IF;

  IF NOT has_function_privilege('anon',
       'public.create_contract_portal_ticket(text, text, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'create_contract_portal_ticket perdeu o GRANT para anon';
  END IF;

  -- Validacao de sessao e so pra edge (service role).
  IF has_function_privilege('anon', 'public.contract_portal_session_is_valid(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.contract_portal_session_is_valid(text, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'contract_portal_session_is_valid exposto a client role';
  END IF;

  -- Nenhum overload antigo sobrando (chamada de 2 args ficaria ambigua).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_contract_portal_ticket') <> 1
  THEN
    RAISE EXCEPTION 'create_contract_portal_ticket ficou com mais de uma assinatura';
  END IF;

  -- Nao-regressao dos links ja compartilhados: todo contrato que nunca foi
  -- configurado tem que continuar com '{}' = portal inteiro livre. A garantia
  -- estrutural e o DEFAULT da coluna; checamos o DEFAULT (e nao "todo contrato
  -- esta em {}") pra esta guarda continuar valida numa reexecucao, depois de os
  -- tenants terem configurado secoes de verdade.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'contracts'
       AND column_name = 'portal_sections'
       AND is_nullable = 'NO'
       AND column_default = '''{}''::jsonb'
  ) THEN
    RAISE EXCEPTION 'contracts.portal_sections nao esta NOT NULL DEFAULT ''{}''::jsonb (contrato nao configurado deixaria de ser livre)';
  END IF;

  -- Na instalacao original (2026-10-21) isto era 0 de 45 contratos: a migration
  -- nao configurou nada, so criou a coluna.
  RAISE NOTICE 'contratos com portal_sections configurado: % de %',
    (SELECT count(*) FROM public.contracts WHERE portal_sections <> '{}'::jsonb),
    (SELECT count(*) FROM public.contracts);
END
$guard$;
