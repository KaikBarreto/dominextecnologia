-- =============================================================================
-- Formulário público de captação: aceita `photo_url` (foto do cliente/local).
-- =============================================================================
-- CONTEXTO: auditoria do Dev Cliente & PMOC nos 16 campos do formulário público
-- confirmou que a allowlist do client e a v_allowed da RPC batem 100% — mas a
-- FOTO não existe em nenhuma das duas pontas. Ele se recusou a montar a UI da
-- foto porque a RPC descarta silenciosamente qualquer chave fora de v_allowed:
-- adicionar o campo na tela primeiro criaria, ao vivo, o mesmo bug de descarte
-- silencioso que ele foi auditar. Este é o desbloqueio: a RPC passa a aceitar
-- `photo_url`, validando que aponta pro NOSSO storage (nunca texto livre —
-- endpoint público e anônimo). A UI (campo no form + upload na edge
-- lead-capture-submit ANTES de chamar esta RPC) fica para outro dev.
--
-- DECISÃO (Tech Lead, já tomada): a edge sobe a foto e manda `photo_url` pronta;
-- a RPC só valida e grava. NÃO devolve id do cliente pra UPDATE posterior — a
-- RPC é pública/anônima e hoje devolve {success:true} de propósito neutro;
-- devolver um id interno seria vazar informação nova a um chamador anônimo.
--
-- BUCKET: reusa `customer-photos` (já existe, RLS já permite INSERT de
-- `authenticated` — a edge escreve com service_role, que a policy não barra).
-- Path esperado (responsabilidade de quem sobe, não desta RPC): determinístico
-- por short_code + uuid, nunca Date.now() (colide sob carga concorrente).
--
-- VALIDAÇÃO CRÍTICA: `photo_url` só é aceita se for uma URL pública do NOSSO
-- projeto Supabase Storage, bucket `customer-photos` — prefixo exato, não
-- "parece uma URL". Mesmo padrão de URL já gravado em produção por outras
-- migrations (ex: equipment_models manual_url em
-- 20260620170000_equipment_models_ac_manual_type_audit_fix.sql):
--   https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/customer-photos/...
-- Qualquer coisa fora desse prefixo (URL arbitrária, outro domínio, outro
-- bucket) é REJEITADA com erro genérico — sem isso o campo vira gravação de URL
-- arbitrária num endpoint anônimo, renderizada depois nas nossas telas.
--
-- ⚠️ Recriada a partir da definição VIVA em produção (pg_get_functiondef,
-- conferida antes de escrever esta migration) — idêntica à da migration
-- original 20260721120000_lead_capture_public_forms.sql, então não há deriva
-- de corpo a reconciliar. SÓ o corpo muda aqui (novo campo na whitelist +
-- branch de validação); nada mais foi tocado.
--
-- ⚠️ GRANT: CONFERIDO o ACL vivo antes de escrever esta migration via
-- has_function_privilege + pg_proc.proacl:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--   (anon SEM EXECUTE — confirmado com has_function_privilege('anon', ..., 'EXECUTE') = false)
-- Isso DIVERGIA do comentário original da função ("grant SÓ service_role, o
-- front chama a EDGE, não a RPC" — migration 20260721120000 e o Bloco 1 de
-- 20260912150000_fecha_execute_anon_rpcs_security_definer.sql). `authenticated`
-- tinha EXECUTE direto nesta função e NENHUMA migration rastreada concedeu
-- isso explicitamente (o Bloco 1 do fechamento de 2026-09-12 só revoga de
-- `PUBLIC` e `anon`, nunca mexeu em `authenticated` — provavelmente
-- `authenticated` ganhou acesso via privilégio default do schema `public` no
-- momento da criação, e o fechamento de 2026-09-12 focou em anon).
--
-- DECISÃO (Tech Lead, revista após busca ampliada): REVOGAR `authenticated`
-- nesta mesma migration. Busca exaustiva por chamador — `grep` em `src/`
-- inteiro, em TODAS as edges (`supabase/functions/**`, não só as óbvias) e em
-- `types.ts` — encontra UM ÚNICO lugar que chama esta RPC:
-- `supabase/functions/lead-capture-submit/index.ts:135`, via `supabaseAdmin`
-- (service_role). Nenhum hook, componente ou outra edge chama
-- `submit_lead_capture_form` como usuário autenticado — `useLeadCaptureForms.ts`
-- inclusive comenta explicitamente "submissão pública vai por edge
-- (lead-capture-submit), NÃO por este hook". Pela régua fixada na varredura
-- que fechou as 82 funções (grant nasce de chamador provado, não de
-- suposição), sem chamador provado o `EXECUTE` de `authenticated` é permissão
-- morta — e pior: morta com custo de segurança real, porque um usuário
-- `authenticated` de QUALQUER tenant que chamasse a RPC direto (via
-- `supabase.rpc`, fora da edge) puraria o rate-limit por `ip_hash` que só a
-- edge aplica (a RPC só rate-limita quando `p_ip_hash` vem preenchido — um
-- chamador direto manda `p_ip_hash := NULL` e passa batido). Revogado abaixo;
-- `anon` continua sem acesso (nunca teve); só `service_role` (a edge) executa.
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
      -- ⚠️ GOTCHA (achado na verificação pós-deploy desta migration): o motor
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
  'Submissão pública do formulário de captação. SECURITY DEFINER, grant SÓ service_role -- único chamador provado é a edge lead-capture-submit (verify_jwt=false, roda com service_role); authenticated teve o EXECUTE revogado nesta migration por ser permissão morta sem chamador (e por permitir burlar o rate-limit por ip_hash que só a edge aplica). Resolve company_id do short_code (nunca do client), valida required+formato+documento server-side, whitelist estrita de campos (agora incluindo photo_url, validada contra o prefixo do nosso storage público customer-photos), insere em customers com origin=public_form e lead_consent_at, incrementa contador, loga p/ rate-limit. Retorno neutro {success:true}.';

-- Documentação: field_config agora aceita a chave opcional `photo_url` (não
-- entra no jsonb DEFAULT da tabela — formulários existentes simplesmente não
-- têm essa chave, e a RPC trata ausência de chave = desabilitado). Quem for
-- construir a UI do campo (fora do escopo desta migration) habilita
-- adicionando {"photo_url": {"enabled": true, "required": false|true}} ao
-- field_config do formulário.
COMMENT ON COLUMN public.lead_capture_forms.field_config IS
  'Objeto com uma chave por campo permitido (whitelist). Cada campo: {enabled: bool, required: bool}. Campos: name, customer_type, document, email, phone, celular, company_name, nome_fantasia, zip_code, address, address_number, neighborhood, complement, city, state, notes, photo_url (opcional — URL do nosso storage customer-photos, validada em submit_lead_capture_form; ausência de chave = desabilitado; UI ainda não expõe).';

-- =====================================================================
-- GRANT: fecha o EXECUTE em SO service_role -- unico chamador provado por
-- busca exaustiva (src/ inteiro + todas as edges): supabase/functions/
-- lead-capture-submit/index.ts:135, com supabaseAdmin (service_role).
-- `authenticated` tinha EXECUTE vivo em producao (ver nota no topo desta
-- migration) sem nenhum chamador provado -- revogado aqui. `anon` nunca teve
-- (mantido revogado). CREATE OR REPLACE com a mesma assinatura nao derruba
-- GRANT sozinho (so DROP FUNCTION faz isso), mas o REVOKE de `authenticated`
-- E a mudanca real desta migration -- nao e so re-declaracao defensiva.
-- =====================================================================
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text) TO service_role;
