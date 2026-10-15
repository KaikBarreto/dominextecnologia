-- =============================================================================
-- HOTFIX (produção, 2026-10-15 23:13): formulário público de captação quebrado
-- em TODOS os tenants — `null value in column "whatsapp_notifications_enabled"
-- of relation "customers" violates not-null constraint`.
-- =============================================================================
-- SINTOMA: o cliente "Natura Ar Climatização" não conseguia cadastrar cliente
-- pelo formulário público (`PublicLeadCapture.tsx` → edge `lead-capture-submit`
-- → RPC `submit_lead_capture_form`). Erro desde o deploy do release 1.32.0
-- (migration 20261015120000_whatsapp_automation_ui_preferences.sql), que
-- adicionou em `customers`:
--     whatsapp_notifications_enabled boolean NOT NULL DEFAULT false
--
-- CAUSA RAIZ (classe de bug, não caso isolado): o INSERT da RPC era
--
--     INSERT INTO public.customers
--     SELECT (jsonb_populate_record(NULL::public.customers, v_payload)).*;
--
-- e o comentário que acompanhava esse bloco ("chaves ausentes ficam com o
-- default da coluna") estava ERRADO. São dois efeitos somados:
--   1. `jsonb_populate_record` sobre uma base `NULL::public.customers` devolve
--      NULL em TODA coluna que não existe como chave no jsonb;
--   2. `INSERT INTO t SELECT (rec).*` — sem lista de colunas — expande para
--      TODAS as colunas da tabela, na ordem física.
-- Resultado: a coluna ausente NÃO cai no `DEFAULT`; ela recebe um NULL
-- EXPLÍCITO. Enquanto toda coluna nova for nullable, passa batido. No dia em
-- que alguém adiciona uma coluna `NOT NULL DEFAULT ...` em `customers` — algo
-- perfeitamente seguro e idempotente do ponto de vista de quem escreve a
-- migration —, o formulário público de TODOS os tenants quebra 100%, sem
-- ninguém tocar nesta RPC. Foi exatamente o que aconteceu hoje.
--
-- Esse bug já havia mordido antes e foi remendado COLUNA A COLUNA dentro da
-- própria função (`customer_type`, `name`, `is_deleted` ganharam patch manual).
-- Remendo por coluna não escala: a próxima coluna `NOT NULL DEFAULT` quebra
-- produção de novo. Esta migration corrige a CLASSE do bug.
--
-- CORREÇÃO: INSERT dinâmico que lista APENAS as colunas presentes no jsonb
-- final. Coluna ausente do payload não entra no comando → o Postgres aplica o
-- `DEFAULT` da coluna de verdade. `whatsapp_notifications_enabled` (e qualquer
-- coluna `NOT NULL DEFAULT` futura) passa a nascer com o default, sem precisar
-- de patch nesta função.
--
-- ⚠️ SEGURANÇA DO SQL DINÂMICO (função SECURITY DEFINER exposta ao público via
-- service_role — o rigor aqui não é opcional). Três camadas:
--   1. As chaves de `v_ins` vêm de `v_allowed`, whitelist ESTRITA hardcoded no
--      corpo da função. O payload do chamador (`p_fields`) é lido por
--      `p_fields->>v_col`, ou seja, o cliente controla VALORES, nunca NOMES de
--      coluna — chave fora da whitelist é descartada antes de chegar aqui. As
--      colunas de sistema (`id`, `company_id`, `origin`, ...) são literais.
--   2. Os nomes de coluna usados no `format()` NÃO saem do jsonb: saem do
--      CATÁLOGO (`pg_attribute` de `public.customers`), filtrados por
--      `attname = ANY(jsonb_object_keys(payload))`. Mesmo que uma chave
--      arbitrária chegasse ao payload, ela não casaria com nenhuma linha do
--      catálogo e simplesmente não entraria no comando.
--   3. `quote_ident()` em cada nome + guarda que compara a contagem de chaves
--      do payload com a contagem de colunas reconhecidas: divergência aborta a
--      submissão (RAISE) em vez de gravar um cadastro silenciosamente
--      incompleto. Isso também protege o caso "chave da whitelist deixou de
--      ser coluna de customers" — antes virava descarte silencioso, agora é
--      erro ruidoso.
--   4. O payload vai por `USING $1` (parâmetro), nunca interpolado no texto do
--      comando.
--
-- COLUNAS NOT NULL de `public.customers` conferidas no catálogo VIVO antes de
-- escrever esta migration (38 colunas no total):
--   • NOT NULL **sem** default (2): `name`, `company_id`
--       → ambas garantidas no payload: `company_id` é carimbada server-side a
--         partir de `v_form.company_id`, e `name` tem o fallback
--         'Cliente (formulário)' que CONTINUA necessário e foi preservado.
--   • NOT NULL **com** default (6): `id`, `customer_type`, `created_at`,
--     `updated_at`, `is_deleted`, `whatsapp_notifications_enabled`.
--
-- ⚠️ O remendo de `customer_type` FICA, e não por precaução: o default da
-- coluna no banco é `'pj'::customer_type`, mas a regra desta RPC é cair em
-- 'pf' quando o campo está desabilitado no formulário (v_ctype). Deixar o
-- default da tabela agir aqui MUDARIA comportamento de negócio (todo lead sem
-- o campo viraria PJ). O de `is_deleted` também fica — é redundante com o
-- default `false`, porém explícito e sem custo.
--
-- ⚠️ CREATE OR REPLACE, assinatura IDÊNTICA — **sem DROP FUNCTION**, porque
-- DROP leva os GRANTs junto. ACL vivo conferido antes desta migration via
-- pg_proc.proacl + has_function_privilege:
--     {postgres=X/postgres, service_role=X/postgres}
--     anon=false, authenticated=false, service_role=true
-- Ou seja: o fechamento feito em 20260916180000 (que revogou `authenticated`)
-- está de pé. Único chamador provado continua sendo
-- `supabase/functions/lead-capture-submit/index.ts:135`, via supabaseAdmin
-- (service_role). Os REVOKE/GRANT no fim desta migration são apenas
-- re-afirmação defensiva e idempotente — não alargam nada.
--
-- ⚠️ DIFF contra a definição VIVA: `pg_get_functiondef` foi extraído do banco
-- de produção e comparado linha a linha com o corpo de
-- 20260916180000_lead_capture_form_photo_url.sql → ZERO divergências (200
-- linhas de corpo idênticas). Não há deriva a reconciliar; o único delta desta
-- migration é o bloco do INSERT (+ as novas variáveis que ele usa).
-- =============================================================================

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
    'neighborhood','complement','city','state','notes','photo_url'
  ];
  v_col          text;
  v_ins          jsonb := '{}'::jsonb;   -- payload sanitizado a inserir
  v_raw          text;
  v_ctype        text;
  v_doc          text;
  v_recent       int;
  v_daily        int;
  v_photo_path   text;
  v_payload      jsonb;                  -- v_ins + colunas de sistema
  v_col_list     text;                   -- "a", "b", ... (do catálogo)
  v_sel_list     text;                   -- r."a", r."b", ...
  v_ncols        int;                    -- colunas reconhecidas no catálogo
  v_nkeys        int;                    -- chaves do payload
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

    ELSIF v_col = 'photo_url' THEN
      -- ⚠️ CRÍTICO: endpoint público/anônimo. `photo_url` só é aceita se apontar
      -- pro NOSSO storage público, bucket customer-photos — prefixo EXATO do
      -- domínio do projeto Supabase, não "parece uma URL". A edge deve subir a
      -- foto e mandar a publicUrl pronta ANTES de chamar esta RPC; aqui só
      -- validamos e gravamos. Path após o bucket: qualquer coisa exceto barra
      -- dupla/".."/espaço, capado em 300 chars.
      --
      -- ⚠️ GOTCHA (achado na verificação pós-deploy de 20260916180000): o motor
      -- de regex do Postgres tem limite rígido de DUPMAX=255 para o contador
      -- em `{m,n}` — `{0,299}` estourava esse limite e lançava
      -- `ERROR 2201B: invalid repetition count(s)` em TODA chamada com
      -- photo_url preenchida (válida ou inválida), quebrando a submissão
      -- inteira. Por isso o cap de 300 chars vira `length()` em vez de bound
      -- na regex — sem essa mudança o campo era 100% inutilizável assim que
      -- alguém habilitasse `photo_url` no field_config.
      v_photo_path := substring(v_raw FROM '^https://byqldosixshhuiuarszp\.supabase\.co/storage/v1/object/public/customer-photos/(.*)$');
      IF v_photo_path IS NULL
         OR v_photo_path !~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$'
         OR length(v_photo_path) > 300
         OR v_photo_path ~ '\.\.'
      THEN
        RAISE EXCEPTION 'Foto inválida';
      END IF;

    ELSE
      v_raw := left(v_raw, 255);
    END IF;

    v_ins := v_ins || jsonb_build_object(v_col, v_raw);
  END LOOP;

  -- customer_type sempre presente no insert: o DEFAULT da coluna no banco é
  -- 'pj', mas a regra desta RPC é 'pf' quando o campo está desabilitado no
  -- formulário. Deixar o default da tabela agir mudaria regra de negócio.
  IF NOT (v_ins ? 'customer_type') THEN
    v_ins := v_ins || jsonb_build_object('customer_type', v_ctype);
  END IF;

  -- name é NOT NULL **sem default** em customers: se não veio (campo
  -- desabilitado no form), fallback — obrigatório, não dá pra remover.
  IF NOT (v_ins ? 'name') THEN
    v_ins := v_ins || jsonb_build_object('name', 'Cliente (formulário)');
  END IF;

  -- ---- d + e: INSERT carimbando colunas de sistema SERVER-SIDE ----
  v_payload := v_ins || jsonb_build_object(
    'id',              gen_random_uuid(),
    'company_id',      v_form.company_id,
    'origin',          'public_form',
    'is_deleted',      false,
    'created_at',      now(),
    'updated_at',      now(),
    'lead_consent_at', CASE WHEN COALESCE(p_consent,false) THEN now() ELSE NULL END
  );

  -- Monta a lista de colunas a partir do CATÁLOGO (não do jsonb) intersectado
  -- com as chaves do payload. Só o que está presente entra no comando; todo o
  -- resto fica de fora e recebe o DEFAULT real da coluna — é isso que impede
  -- que uma coluna `NOT NULL DEFAULT` nova (ex:
  -- whatsapp_notifications_enabled) volte a receber NULL explícito e derrube o
  -- formulário público de todos os tenants.
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attname),
         string_agg('r.' || quote_ident(a.attname), ', ' ORDER BY a.attname),
         count(*)
    INTO v_col_list, v_sel_list, v_ncols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.customers'::regclass
    AND a.attnum   > 0
    AND NOT a.attisdropped
    AND a.attname  = ANY (ARRAY(SELECT jsonb_object_keys(v_payload)));

  SELECT count(*) INTO v_nkeys FROM jsonb_object_keys(v_payload);

  -- Guarda: se alguma chave do payload não casa com coluna real de customers,
  -- ABORTA em vez de gravar cadastro incompleto em silêncio (o comportamento
  -- antigo de jsonb_populate_record era descartar sem avisar).
  IF v_col_list IS NULL OR v_ncols IS DISTINCT FROM v_nkeys THEN
    RAISE EXCEPTION 'Não foi possível registrar o cadastro.';
  END IF;

  EXECUTE format(
    'INSERT INTO public.customers (%s) SELECT %s '
    'FROM jsonb_populate_record(NULL::public.customers, $1) AS r',
    v_col_list, v_sel_list
  ) USING v_payload;
  -- public_short_code: fora do payload; o trigger trg_ensure_public_short_code
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
  'Submissão pública do formulário de captação. SECURITY DEFINER, grant SÓ service_role -- único chamador provado é a edge lead-capture-submit (verify_jwt=false, roda com service_role); anon e authenticated estão sem EXECUTE (fechado em 20260912150000 / 20260916180000) -- chamador direto burlaria o rate-limit por ip_hash que só a edge aplica. Resolve company_id do short_code (nunca do client), valida required+formato+documento server-side, whitelist estrita de campos (incluindo photo_url, validada contra o prefixo do nosso storage público customer-photos), insere em customers com origin=public_form e lead_consent_at, incrementa contador, loga p/ rate-limit. Retorno neutro {success:true}. GRAVAÇÃO (hotfix 20261015233000): o INSERT é DINÂMICO e lista APENAS as colunas presentes no payload, montadas a partir do catálogo (pg_attribute de customers) + quote_ident, com o jsonb passado por parâmetro ($1). O padrão antigo -- INSERT INTO customers SELECT (jsonb_populate_record(NULL::customers, payload)).* -- expandia TODAS as colunas da tabela e gravava NULL EXPLÍCITO em cada coluna ausente, anulando o DEFAULT: bastou o release 1.32.0 adicionar whatsapp_notifications_enabled boolean NOT NULL DEFAULT false para o formulário público quebrar 100% em todos os tenants. Com o insert dinâmico, coluna ausente recebe o DEFAULT de verdade e coluna NOT NULL DEFAULT nova não exige mais patch aqui. Só name e company_id são NOT NULL SEM default em customers -- as duas sempre entram no payload (name via fallback, company_id carimbado do form).';

-- =====================================================================
-- GRANT: re-afirmação defensiva e idempotente. CREATE OR REPLACE com a mesma
-- assinatura NÃO derruba GRANT (só DROP FUNCTION faz isso) e o ACL vivo foi
-- conferido antes desta migration ({postgres, service_role}; anon e
-- authenticated sem EXECUTE). Nada aqui alarga permissão.
-- =====================================================================
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) TO service_role;
