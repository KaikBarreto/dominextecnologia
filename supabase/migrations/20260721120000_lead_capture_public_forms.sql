-- =============================================================================
-- Formulário público de captação de cliente (lead capture)
-- =============================================================================
-- FEATURE: dentro de Clientes, o tenant monta um formulário escolhendo quais
-- campos exibir/exigir, gera um LINK PÚBLICO com a marca do tenant, e quando um
-- cliente final preenche, o cadastro cai DIRETO como cliente na empresa dona do
-- link (decisão CEO: direto, sem fila de aprovação). Anti-abuso obrigatório.
--
-- CAMADAS DE SEGURANÇA (spec Plataforma, aprovada Tech Lead):
--   - anon NUNCA lê a tabela direto: leitura pública só via RPC SECURITY DEFINER.
--   - company_id é SEMPRE resolvido server-side a partir do short_code; NUNCA
--     aceito do client (RLS multi-tenant bloqueia INSERT sem company_id, mas aqui
--     a RPC força o valor correto — não delega pro RLS "acertar").
--   - submit é grant SÓ service_role: o edge lead-capture-submit é a fronteira
--     que lê o IP real e calcula o ip_hash. Se anon pudesse chamar a RPC direto,
--     o rate-limit por ip_hash seria falsificável (client manda hash arbitrário).
--     Ver "DECISÃO grant" no PASSO 4.
--   - whitelist estrita de campos: só as 16 colunas expostas E enabled=true no
--     field_config chegam ao customers. Colunas de sistema (company_id, origin,
--     id, coords, timestamps, is_deleted, public_short_code) NUNCA vêm do client.
--
-- REUSA (não reinventa):
--   - public.generate_public_short_code(12) + trigger genérico
--     ensure_public_short_code() (migration 20260620200000). Aplico o mesmo
--     trigger na nova tabela via coluna public_short_code... PORÉM a spec pede a
--     coluna chamada `short_code` (não public_short_code). Pra reusar o trigger
--     genérico sem duplicar geração, uso um trigger dedicado curto que chama a
--     MESMA função geradora. Ver PASSO 1/2.
--   - shape de company_settings de get_public_os (white-label + locale).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER/POLICY IF EXISTS antes de CREATE.
-- =============================================================================

-- =====================================================================
-- PASSO 0 — consentimento LGPD: coluna dedicada em customers.
-- DECISÃO (dev-database): coluna `lead_consent_at timestamptz` (recomendada
-- pela spec) em vez de registrar em notes.
-- POR QUÊ: prova de consentimento estruturada e consultável, independente do
-- texto livre de notes (que o usuário edita depois). Nullable: cadastros que
-- não vieram do formulário público simplesmente não têm o carimbo.
-- =====================================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_consent_at timestamptz;

COMMENT ON COLUMN public.customers.lead_consent_at IS
  'Momento em que o cliente final deu consentimento LGPD ao preencher o formulário público de captação. NULL = cadastro não originado do formulário público. Prova de consentimento.';

-- =====================================================================
-- PASSO 1 — tabela lead_capture_forms (tenant-root).
-- short_code: UNIQUE GLOBAL (mesmo racional de public_short_code — valor gerado
-- aleatoriamente pelo servidor, resolvido anonimamente, precisa mapear pra 1
-- registro no banco inteiro). Nullable na definição: o trigger preenche.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lead_capture_forms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  short_code       text,                                     -- trigger preenche; UNIQUE global
  title            text NOT NULL DEFAULT 'Cadastro de Cliente',
  description      text,
  field_config     jsonb NOT NULL DEFAULT '{
    "name":           {"enabled": true,  "required": true},
    "customer_type":  {"enabled": true,  "required": false},
    "document":       {"enabled": true,  "required": false},
    "email":          {"enabled": true,  "required": false},
    "phone":          {"enabled": false, "required": false},
    "celular":        {"enabled": true,  "required": true},
    "company_name":   {"enabled": false, "required": false},
    "nome_fantasia":  {"enabled": false, "required": false},
    "zip_code":       {"enabled": true,  "required": false},
    "address":        {"enabled": true,  "required": false},
    "address_number": {"enabled": true,  "required": false},
    "neighborhood":   {"enabled": false, "required": false},
    "complement":     {"enabled": false, "required": false},
    "city":           {"enabled": true,  "required": false},
    "state":          {"enabled": true,  "required": false},
    "notes":          {"enabled": false, "required": false}
  }'::jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  expires_at       timestamptz,
  require_consent  boolean NOT NULL DEFAULT true,
  consent_text     text,
  submission_count int NOT NULL DEFAULT 0,
  max_submissions  int,
  created_by       uuid NOT NULL,                            -- profiles.user_id (= auth.uid())
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_capture_forms IS
  'Formulário público de captação de cliente montado pelo tenant. short_code resolve o link público anônimo. field_config = whitelist de campos exibidos/exigidos.';
COMMENT ON COLUMN public.lead_capture_forms.short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Resolve o formulário público via get_lead_capture_form. NÃO digitado pelo usuário.';
COMMENT ON COLUMN public.lead_capture_forms.field_config IS
  'Objeto com uma chave por campo permitido (whitelist). Cada campo: {enabled: bool, required: bool}. Campos: name, customer_type, document, email, phone, celular, company_name, nome_fantasia, zip_code, address, address_number, neighborhood, complement, city, state, notes.';

CREATE UNIQUE INDEX IF NOT EXISTS lead_capture_forms_short_code_key
  ON public.lead_capture_forms (short_code);
CREATE INDEX IF NOT EXISTS lead_capture_forms_company_id_idx
  ON public.lead_capture_forms (company_id);

-- =====================================================================
-- PASSO 2 — trigger de short_code (reusa a MESMA função geradora
-- generate_public_short_code, mas em coluna chamada short_code).
-- Dedicado e curto: gera quando NULL, retry contra a UNIQUE, estável em UPDATE.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_lead_form_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     text;
  v_attempts int := 0;
  v_exists   boolean;
BEGIN
  IF NEW.short_code IS NULL THEN
    LOOP
      v_code := public.generate_public_short_code(12);
      SELECT EXISTS (SELECT 1 FROM public.lead_capture_forms WHERE short_code = v_code)
        INTO v_exists;
      IF NOT v_exists THEN
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts >= 7 THEN
        RAISE EXCEPTION '[lead-form-short-code] código único não gerado após % tentativas', v_attempts;
      END IF;
    END LOOP;
    NEW.short_code := v_code;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_lead_form_short_code() IS
  'Trigger BEFORE INSERT/UPDATE de lead_capture_forms: preenche short_code (reusa generate_public_short_code(12)) quando NULL e carimba updated_at. Estável: nunca regenera código já emitido.';

DROP TRIGGER IF EXISTS trg_ensure_lead_form_short_code ON public.lead_capture_forms;
CREATE TRIGGER trg_ensure_lead_form_short_code
  BEFORE INSERT OR UPDATE ON public.lead_capture_forms
  FOR EACH ROW EXECUTE FUNCTION public.ensure_lead_form_short_code();

-- =====================================================================
-- PASSO 3 — tabela lead_capture_submissions_log (rate-limit anti-abuso).
-- ip_hash: HASH do IP (nunca o IP cru — LGPD). O edge calcula o hash.
-- Índice (short_code, created_at) pra contagem em janela.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lead_capture_submissions_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id    uuid REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
  short_code text NOT NULL,
  ip_hash    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_capture_submissions_log IS
  'Log de submissões do formulário público, para rate-limit anti-abuso. ip_hash = HASH do IP (nunca IP cru, LGPD). Populado pela RPC submit_lead_capture_form.';

CREATE INDEX IF NOT EXISTS lead_capture_log_code_created_idx
  ON public.lead_capture_submissions_log (short_code, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_capture_log_ip_created_idx
  ON public.lead_capture_submissions_log (ip_hash, created_at DESC);

-- =====================================================================
-- PASSO 4 — RLS.
-- lead_capture_forms: authenticated escopado por company_id (padrão tenant do
-- repo, get_user_company_id) + super_admin. Sem policy anon (leitura via RPC).
-- lead_capture_submissions_log: sem policy authenticated de escrita direta
-- (a RPC SECURITY DEFINER escreve); SELECT pro tenant dono ver auditoria.
-- =====================================================================
ALTER TABLE public.lead_capture_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_capture_submissions_log ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge / backend).
DROP POLICY IF EXISTS "service_role_full_access_lead_capture_forms" ON public.lead_capture_forms;
CREATE POLICY "service_role_full_access_lead_capture_forms"
  ON public.lead_capture_forms FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_lead_capture_log" ON public.lead_capture_submissions_log;
CREATE POLICY "service_role_full_access_lead_capture_log"
  ON public.lead_capture_submissions_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated: gerencia só formulários da própria empresa (+ super_admin).
DROP POLICY IF EXISTS "Users manage own company lead_capture_forms" ON public.lead_capture_forms;
CREATE POLICY "Users manage own company lead_capture_forms"
  ON public.lead_capture_forms FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- authenticated: SELECT do log da própria empresa (auditoria de submissões).
-- Sem INSERT/UPDATE/DELETE direto: o log só é escrito pela RPC SECURITY DEFINER.
DROP POLICY IF EXISTS "Users view own company lead_capture_log" ON public.lead_capture_submissions_log;
CREATE POLICY "Users view own company lead_capture_log"
  ON public.lead_capture_submissions_log FOR SELECT TO authenticated
  USING (
    form_id IN (
      SELECT id FROM public.lead_capture_forms
      WHERE company_id = public.get_user_company_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- =====================================================================
-- PASSO 5 — RPC LEITURA get_lead_capture_form(p_short_code text).
-- Retorna { form: {...flags de disponibilidade}, company_settings: {white-label
-- + locale, mesmo shape de get_public_os} }. Nunca vaza company_id nem motivo
-- de indisponibilidade além de is_active/expired.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_lead_capture_form(p_short_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_form    public.lead_capture_forms%ROWTYPE;
  v_expired boolean;
BEGIN
  IF p_short_code IS NULL OR length(trim(p_short_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_form
  FROM public.lead_capture_forms
  WHERE short_code = p_short_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;  -- página trata como "não encontrado"
  END IF;

  v_expired := (v_form.expires_at IS NOT NULL AND v_form.expires_at <= now())
            OR (v_form.max_submissions IS NOT NULL AND v_form.submission_count >= v_form.max_submissions);

  RETURN jsonb_build_object(
    'form', jsonb_build_object(
      'title',           v_form.title,
      'description',     v_form.description,
      'field_config',    v_form.field_config,
      'require_consent', v_form.require_consent,
      'consent_text',    v_form.consent_text,
      'is_active',       v_form.is_active,
      'expired',         v_expired
    ),
    'company_settings', (
      SELECT to_jsonb(cs) || jsonb_build_object(
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
      FROM company_settings cs WHERE cs.company_id = v_form.company_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_lead_capture_form(text) IS
  'Payload público do formulário de captação (/captar/:short_code). SECURITY DEFINER: recebe só o short_code, devolve título/descrição/field_config + flags is_active/expired e o white-label/locale da empresa. Não vaza company_id nem motivo de indisponibilidade.';

GRANT EXECUTE ON FUNCTION public.get_lead_capture_form(text) TO anon, authenticated;

-- =====================================================================
-- PASSO 6 — helpers de validação de documento (CPF/CNPJ) com dígito
-- verificador. Sem dependência externa; SET search_path defensivo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lead_valida_cpf(p_doc text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
  d int[];
  i int;
  s int;
  r int;
BEGIN
  v := regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g');
  IF length(v) <> 11 THEN RETURN false; END IF;
  -- rejeita sequência repetida (00000000000, 11111111111, ...)
  IF v ~ ('^(' || substr(v,1,1) || '){11}$') THEN RETURN false; END IF;
  d := ARRAY[]::int[];
  FOR i IN 1..11 LOOP d[i] := substr(v, i, 1)::int; END LOOP;
  -- 1º DV
  s := 0;
  FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> d[10] THEN RETURN false; END IF;
  -- 2º DV
  s := 0;
  FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = d[11];
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_valida_cnpj(p_doc text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
  d int[];
  i int;
  s int;
  r int;
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  v := regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g');
  IF length(v) <> 14 THEN RETURN false; END IF;
  IF v ~ ('^(' || substr(v,1,1) || '){14}$') THEN RETURN false; END IF;
  d := ARRAY[]::int[];
  FOR i IN 1..14 LOOP d[i] := substr(v, i, 1)::int; END LOOP;
  -- 1º DV
  s := 0;
  FOR i IN 1..12 LOOP s := s + d[i] * w1[i]; END LOOP;
  r := s % 11; IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
  IF r <> d[13] THEN RETURN false; END IF;
  -- 2º DV
  s := 0;
  FOR i IN 1..13 LOOP s := s + d[i] * w2[i]; END LOOP;
  r := s % 11; IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
  RETURN r = d[14];
END;
$$;

COMMENT ON FUNCTION public.lead_valida_cpf(text)  IS 'Valida CPF (11 díg + 2 DV), rejeita sequência repetida. Usada por submit_lead_capture_form.';
COMMENT ON FUNCTION public.lead_valida_cnpj(text) IS 'Valida CNPJ (14 díg + 2 DV), rejeita sequência repetida. Usada por submit_lead_capture_form.';

-- =====================================================================
-- PASSO 7 — RPC SUBMISSÃO submit_lead_capture_form.
--
-- DECISÃO grant (dev-database): GRANT EXECUTE SÓ A service_role (NÃO anon).
-- POR QUÊ: o edge lead-capture-submit é a fronteira anti-abuso que lê o IP real
-- e calcula o ip_hash. Se anon pudesse chamar a RPC direto, o rate-limit por
-- ip_hash seria falsificável (o client mandaria hash arbitrário ou NULL,
-- burlando a janela). Com grant só a service_role, todo tráfego passa pelo edge.
-- A RPC é defensiva mesmo assim (valida tudo server-side) mas não é enumerável
-- por anon.
--
-- Comportamento: resolve company_id do short_code (NUNCA do client), valida
-- required + formato, whitelist estrita de campos, insere em customers
-- carimbando origin/company_id/consent server-side, incrementa submission_count,
-- registra no log, checa rate-limit se ip_hash informado. Retorno neutro.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_lead_capture_form(
  p_short_code text,
  p_fields     jsonb,
  p_consent    boolean,
  p_ip_hash    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_form         public.lead_capture_forms%ROWTYPE;
  v_cfg          jsonb;
  v_allowed      text[] := ARRAY[
    'name','customer_type','document','email','phone','celular',
    'company_name','nome_fantasia','zip_code','address','address_number',
    'neighborhood','complement','city','state','notes'
  ];
  v_col          text;
  v_ins          jsonb := '{}'::jsonb;   -- payload sanitizado a inserir
  v_raw          text;
  v_ctype        text;
  v_doc          text;
  v_recent       int;
  v_daily        int;
BEGIN
  -- ---- a. resolve o formulário ativo/válido pelo short_code (server-side) ----
  SELECT * INTO v_form
  FROM public.lead_capture_forms
  WHERE short_code = p_short_code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_submissions IS NULL OR submission_count < max_submissions)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formulário indisponível';  -- genérico, não vaza motivo
  END IF;

  v_cfg := v_form.field_config;

  -- ---- i. rate-limit (defensivo; só quando ip_hash informado) ----
  IF p_ip_hash IS NOT NULL AND length(trim(p_ip_hash)) > 0 THEN
    SELECT count(*) INTO v_recent
    FROM public.lead_capture_submissions_log
    WHERE short_code = p_short_code
      AND ip_hash = p_ip_hash
      AND created_at > now() - interval '10 minutes';
    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Muitas tentativas. Tente novamente mais tarde.';
    END IF;

    SELECT count(*) INTO v_daily
    FROM public.lead_capture_submissions_log
    WHERE ip_hash = p_ip_hash
      AND created_at > now() - interval '1 day';
    IF v_daily >= 30 THEN
      RAISE EXCEPTION 'Muitas tentativas. Tente novamente mais tarde.';
    END IF;
  END IF;

  -- ---- consentimento LGPD ----
  IF v_form.require_consent AND COALESCE(p_consent, false) = false THEN
    RAISE EXCEPTION 'Consentimento obrigatório';
  END IF;

  -- ---- resolve customer_type (default pf) — precisa antes de validar document ----
  v_ctype := lower(trim(COALESCE(p_fields->>'customer_type', '')));
  IF v_ctype NOT IN ('pf','pj') THEN
    v_ctype := 'pf';
  END IF;

  -- ---- b + c + sanitização: percorre a whitelist ----
  FOREACH v_col IN ARRAY v_allowed LOOP
    -- campo desabilitado no config → IGNORA (whitelist estrita), nem valida required.
    IF COALESCE((v_cfg->v_col->>'enabled')::boolean, false) = false THEN
      CONTINUE;
    END IF;

    v_raw := NULLIF(btrim(regexp_replace(COALESCE(p_fields->>v_col, ''), '[\x00-\x1F\x7F]', '', 'g')), '');

    -- required ausente/vazio → exception
    IF COALESCE((v_cfg->v_col->>'required')::boolean, false) = true AND v_raw IS NULL THEN
      RAISE EXCEPTION 'Campo obrigatório ausente: %', v_col;
    END IF;

    IF v_raw IS NULL THEN
      CONTINUE;  -- opcional não preenchido: ignora
    END IF;

    -- validação de formato + limites por campo
    IF v_col = 'email' THEN
      IF v_raw !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'E-mail inválido';
      END IF;
      v_raw := left(v_raw, 255);

    ELSIF v_col = 'document' THEN
      v_doc := regexp_replace(v_raw, '\D', '', 'g');
      IF v_ctype = 'pj' THEN
        IF NOT public.lead_valida_cnpj(v_doc) THEN
          RAISE EXCEPTION 'CNPJ inválido';
        END IF;
      ELSE
        IF NOT public.lead_valida_cpf(v_doc) THEN
          RAISE EXCEPTION 'CPF inválido';
        END IF;
      END IF;
      v_raw := v_doc;  -- guarda só dígitos

    ELSIF v_col IN ('phone','celular') THEN
      v_raw := regexp_replace(v_raw, '\D', '', 'g');
      IF length(v_raw) NOT IN (10, 11) THEN
        RAISE EXCEPTION 'Telefone inválido';
      END IF;

    ELSIF v_col = 'zip_code' THEN
      v_raw := regexp_replace(v_raw, '\D', '', 'g');
      IF length(v_raw) <> 8 THEN
        RAISE EXCEPTION 'CEP inválido';
      END IF;

    ELSIF v_col = 'customer_type' THEN
      v_raw := v_ctype;  -- normalizado

    ELSIF v_col = 'name' THEN
      v_raw := left(v_raw, 200);

    ELSIF v_col = 'notes' THEN
      v_raw := left(v_raw, 1000);

    ELSE
      v_raw := left(v_raw, 255);
    END IF;

    v_ins := v_ins || jsonb_build_object(v_col, v_raw);
  END LOOP;

  -- customer_type sempre presente no insert (coluna NOT NULL com default no enum),
  -- mesmo se o campo estiver desabilitado no form.
  IF NOT (v_ins ? 'customer_type') THEN
    v_ins := v_ins || jsonb_build_object('customer_type', v_ctype);
  END IF;

  -- name é NOT NULL em customers: se não veio (campo desabilitado), fallback.
  IF NOT (v_ins ? 'name') THEN
    v_ins := v_ins || jsonb_build_object('name', 'Cliente (formulário)');
  END IF;

  -- ---- d + e: INSERT carimbando colunas de sistema SERVER-SIDE ----
  -- Monta o INSERT dinâmico a partir de v_ins (só colunas da whitelist) +
  -- colunas forçadas. jsonb_populate_record casa as chaves com as colunas de
  -- customers; chaves ausentes ficam com o default da coluna.
  INSERT INTO public.customers
  SELECT (
    jsonb_populate_record(
      NULL::public.customers,
      v_ins
        || jsonb_build_object(
             'id',              gen_random_uuid(),
             'company_id',      v_form.company_id,
             'origin',          'public_form',
             'is_deleted',      false,
             'created_at',      now(),
             'updated_at',      now(),
             'lead_consent_at', CASE WHEN COALESCE(p_consent,false) THEN now() ELSE NULL END
           )
    )
  ).*;
  -- public_short_code: NULL no insert; o trigger trg_ensure_public_short_code
  -- de customers preenche. coords (lat/lng/latitude/longitude): não setadas.

  -- ---- f: incrementa contador ----
  UPDATE public.lead_capture_forms
    SET submission_count = submission_count + 1
    WHERE id = v_form.id;

  -- ---- registra no log (rate-limit / auditoria) ----
  INSERT INTO public.lead_capture_submissions_log (form_id, short_code, ip_hash)
  VALUES (v_form.id, p_short_code, NULLIF(trim(COALESCE(p_ip_hash,'')), ''));

  -- ---- g: retorno NEUTRO ----
  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) IS
  'Submissão pública do formulário de captação. SECURITY DEFINER, grant SÓ service_role (o edge lead-capture-submit é a fronteira anti-abuso que calcula ip_hash). Resolve company_id do short_code (nunca do client), valida required+formato+documento server-side, whitelist estrita de campos, insere em customers com origin=public_form e lead_consent_at, incrementa contador, loga p/ rate-limit. Retorno neutro {success:true}.';

-- GRANT: SÓ service_role. Ver "DECISÃO grant" acima.
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) TO service_role;
