-- =============================================================================
-- submit_customer_portal_form: o Portal do Cliente NAO exige os obrigatorios
-- de field_config.
-- =============================================================================
-- BUG CORRIGIDO (review do Tech Lead; introduzido na 20261109210000):
--   formulario com purpose='lead' publicado no Portal do Cliente era
--   IMPOSSIVEL de enviar. A chamada era
--
--     v_fields := public.sanitize_public_form_fields(
--                   v_form.field_config, p_fields, v_form.purpose = 'lead');
--
--   e o 3o argumento (p_enforce_required) ligava a exigencia dos campos
--   obrigatorios de field_config justamente no caminho do portal. Mas o portal,
--   POR DECISAO DE PRODUTO, nao renderiza nenhum campo de cadastro e manda
--   p_fields = '{}' -- o cliente ja esta identificado pelo token, pedir o
--   cadastro dele de novo ali nao faz sentido, e esta funcao nunca escreve em
--   `customers` (ver o COMMENT: "NUNCA cria nem altera cliente, mesmo em
--   formulario purpose=lead").
--
--   O default de field_config ja nasce com `name` e `celular` obrigatorios.
--   Logo, bastava o tenant marcar "mostrar no Portal do Cliente" num formulario
--   `lead` -- o caso mais comum -- pra TODO envio pelo portal morrer em
--   "Campo obrigatório ausente: name". Erro de borda que so aparece em runtime,
--   com mensagem que culpa o cliente final por um campo que a tela nem mostrou.
--
--   A condicao era coerente no OUTRO caminho (submit_lead_capture_form, link
--   publico, onde a pagina REALMENTE renderiza os campos e o cadastro e criado)
--   e foi copiada pro portal por simetria -- onde a premissa nao vale.
--
-- CORRECAO: 3o argumento FIXO em `false` no caminho do portal.
--
-- O QUE NAO MUDA (nem um bit): a sanitizacao continua acontecendo -- o que vier
--   em p_fields segue passando pela whitelist dos 17 campos (strip de
--   caracteres de controle, caps de tamanho, e-mail por regex, CPF/CNPJ com
--   digito verificador, telefone, CEP) antes de ir pra coluna `fields` da
--   submissao. `false` desliga SO a exigencia de presenca; nao abre a porta pra
--   dado nao validado. Gates do portal, resolucao do formulario, rate-limit,
--   validacao de respostas, shape de retorno, assinatura
--   (text, text, uuid, jsonb, jsonb) -> jsonb e grants: todos intactos.
--
-- LADO QUE CONTINUA EXIGINDO: submit_lead_capture_form (link publico) NAO e
--   tocada por esta migration e segue chamando o sanitizador com
--   `v_form.purpose = 'lead'` -- la o obrigatorio continua obrigatorio e o
--   cliente continua sendo criado. Provado por teste antes de aplicar.
--
-- COMO FOI FEITA: gerada programaticamente a partir da definicao VIVA
--   (pg_get_functiondef do banco de producao), com a ancora da chamada
--   assertada como UNICA antes de substituir e assercao de que a condicao
--   antiga nao sobrou no corpo. Delta real: +2 linhas (1 de codigo alterada,
--   2 de comentario).
--
-- IDEMPOTENTE: CREATE OR REPLACE + GRANT reafirmado. CREATE OR REPLACE com a
-- MESMA assinatura preserva os GRANTs (so DROP FUNCTION os derruba).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_customer_portal_form(p_token text, p_session_token text, p_form_id uuid, p_fields jsonb DEFAULT '{}'::jsonb, p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_portal            public.customer_portals%ROWTYPE;
  v_company_id        uuid;
  v_is_company_member boolean;
  v_form              public.lead_capture_forms%ROWTYPE;
  v_answers           jsonb;
  v_fields            jsonb;
  v_recent            int;
  v_id                uuid;
BEGIN
  SELECT cp.* INTO v_portal
    FROM public.customer_portals cp
   WHERE cp.token = p_token AND cp.is_active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal indisponível' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id INTO v_company_id
    FROM public.customers c
   WHERE c.id = v_portal.customer_id AND COALESCE(c.is_deleted, false) = false;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Portal indisponível' USING ERRCODE = '42501';
  END IF;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.company_id = v_company_id AND p.is_active
    );

  IF NOT v_portal.is_public AND NOT v_is_company_member THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF v_portal.password_enabled
     AND NOT v_is_company_member
     AND NOT public.customer_portal_session_is_valid(v_portal.id, p_session_token)
  THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_company_id
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
  ) OR NOT public.company_has_module(v_company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portal indisponível' USING ERRCODE = '42501';
  END IF;

  -- Formulario: tem que ser DAQUELA empresa, publicado no portal, ativo e
  -- dentro dos limites. Mensagem unica pra qualquer motivo (anti-enumeracao).
  SELECT f.* INTO v_form
    FROM public.lead_capture_forms f
   WHERE f.id = p_form_id
     AND f.company_id = v_company_id
     AND f.show_in_customer_portal = true
     AND f.is_active = true
     AND (f.expires_at IS NULL OR f.expires_at > now())
     AND (f.max_submissions IS NULL OR f.submission_count < f.max_submissions)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formulário indisponível' USING ERRCODE = '42501';
  END IF;

  -- Rate-limit por cliente+formulario (o GRANT aqui inclui anon).
  SELECT count(*) INTO v_recent
    FROM public.public_form_submissions s
   WHERE s.form_id = v_form.id
     AND s.customer_id = v_portal.customer_id
     AND s.submitted_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente novamente mais tarde.' USING ERRCODE = '22023';
  END IF;

  -- Mesma regua do link publico, mesma funcao.
  v_answers := public.validate_public_form_answers(v_form.id, p_answers);
  -- Terceiro argumento FIXO em false: o portal NAO exige os obrigatorios de
  -- field_config. Ver cabecalho desta migration (bug corrigido em 2026-11-10).
  v_fields  := public.sanitize_public_form_fields(
                 v_form.field_config, p_fields, false
               );

  -- customer_id resolvido pelo TOKEN (nunca do client). ip_hash NULL: o portal
  -- nao passa por edge e o cliente ja esta identificado -- hash vindo do client
  -- seria falsificavel e nao serviria de rate-limit.
  INSERT INTO public.public_form_submissions
    (company_id, form_id, customer_id, source, answers, fields, ip_hash)
  VALUES (
    v_company_id, v_form.id, v_portal.customer_id, 'customer_portal',
    v_answers, v_fields, NULL
  )
  RETURNING id INTO v_id;

  UPDATE public.lead_capture_forms
     SET submission_count = submission_count + 1
   WHERE id = v_form.id;

  RETURN jsonb_build_object('ok', true, 'submission_id', v_id);
END;
$function$;
COMMENT ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb) IS
  'Envia um formulario publicado no Portal do Cliente. Mesmos gates de create_customer_portal_ticket (portal ativo, is_public ou membro, sessao quando password_enabled, assinatura, modulo customer_portal) + o formulario tem que ser da empresa daquele cliente, publicado no portal, ativo e dentro de expires_at/max_submissions (mensagem unica pra qualquer motivo, anti-enumeracao). Valida respostas pela regua unica validate_public_form_answers e sanitiza os campos de cadastro por sanitize_public_form_fields. Grava public_form_submissions com source=customer_portal, customer_id resolvido pelo TOKEN e ip_hash NULL, e incrementa submission_count. NUNCA cria nem altera cliente, mesmo em formulario purpose=lead. Rate-limit de 5 envios por cliente/formulario em 10 minutos. >>> O PORTAL NAO EXIGE OS CAMPOS OBRIGATORIOS DE field_config (p_enforce_required=false, fixo desde 20261110013000): o portal nao renderiza campo de cadastro nenhum e manda p_fields={} -- o cliente ja esta identificado pelo token e esta funcao nao escreve em customers, entao exigir name/celular aqui so produzia "Campo obrigatório ausente" em todo envio de formulario purpose=lead publicado no portal (era o default de field_config). A SANITIZACAO continua valendo pro que vier em p_fields; `false` desliga so a exigencia de PRESENCA. Quem exige obrigatorio e o link publico (submit_lead_capture_form), onde a pagina renderiza os campos e o cliente e criado de fato.';

-- CREATE OR REPLACE preserva o ACL; reafirmado pra a migration ser auto-suficiente.
REVOKE ALL ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb)
  TO anon, authenticated, service_role;
