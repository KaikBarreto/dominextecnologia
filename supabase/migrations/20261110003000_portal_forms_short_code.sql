-- =============================================================================
-- get_customer_portal_forms: devolver tambem o short_code do formulario.
-- =============================================================================
-- POR QUE (achado na review do Tech Lead da 20261109210000):
--   Pergunta de tipo `photo` / `signature` so aceita URL do NOSSO Storage
--   publico -- validate_public_form_answers rejeita data URI e URL externa, de
--   proposito (o valor e renderizado depois no painel do tenant e em PDF;
--   aceitar URL arbitraria abriria phishing/XSS armazenado e payload ilimitado
--   no jsonb).
--
--   O UNICO jeito de o visitante produzir essa URL e a edge
--   `lead-capture-upload-photo`, que exige `short_code` no body (amarracao
--   anti-abuso: nao sobe arquivo sem resolver a um formulario vivo). A pagina
--   publica /cadastro/:code tem o short_code porque ele vem na URL. O Portal do
--   Cliente NAO tem -- a 20261109210000 nao devolvia short_code no payload do
--   portal. Resultado: formulario com pergunta de foto ou assinatura era
--   IMPOSSIVEL de responder pelo portal (o upload falhava antes do envio).
--
-- O QUE MUDA: 1 chave a mais por formulario no array de retorno
--   ('short_code'). Nada mais -- mesmo conjunto de gates (portal ativo,
--   is_public ou membro da empresa, sessao quando password_enabled, assinatura,
--   modulo customer_portal), mesmo filtro de formularios
--   (show_in_customer_portal + is_active + nao expirado + max_submissions),
--   mesmo shape de `questions`, mesma assinatura (text, text) -> jsonb, mesmos
--   grants. Payload e jsonb: NAO exige regen de types.ts.
--
-- POR QUE EXPOR O short_code AQUI NAO AMPLIA SUPERFICIE:
--   o short_code E o endereco publico que o proprio tenant decidiu publicar ao
--   marcar show_in_customer_portal; quem abre o portal daquele cliente ja ve o
--   formulario inteiro (titulo, campos, perguntas) e ja pode envia-lo. O codigo
--   nao e credencial, nao e enumeravel (12 chars base32 gerados pelo servidor) e
--   so resolve formulario DA MESMA empresa do token. Nenhum dado de outro
--   tenant passa a ser alcancavel. Ver "RESSALVA" no fim deste cabecalho.
--
-- RESSALVA registrada pro Tech Lead (comportamento, nao vazamento): de posse do
--   short_code, o visitante do portal tambem consegue usar o link publico
--   anonimo do MESMO formulario. Num formulario purpose='lead' isso cria um
--   cliente NOVO em vez de vincular a submissao ao cliente logado
--   (submit_lead_capture_form grava customer_id NULL). Nao e regressao -- o
--   link publico ja existia e ja era publico -- mas e a razao pra o front usar
--   submit_customer_portal_form quando esta no portal, e reservar o short_code
--   exclusivamente pro upload de arquivo.
--
-- COMO FOI FEITA: gerada programaticamente a partir da definicao VIVA
--   (pg_get_functiondef, extraida do banco de producao), com a ancora do bloco
--   'id'/'title' assertada como UNICA antes de substituir -- nao reescrita a
--   partir do arquivo em disco. Delta real: +3 linhas (1 de codigo, 2 de
--   comentario).
--
-- IDEMPOTENTE: CREATE OR REPLACE + GRANT reafirmado. Re-executavel sem efeito
-- colateral. CREATE OR REPLACE com a MESMA assinatura preserva os GRANTs (so
-- DROP FUNCTION os derruba); o GRANT abaixo e re-afirmacao defensiva.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_portal_forms(p_token text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_portal            public.customer_portals%ROWTYPE;
  v_company_id        uuid;
  v_is_company_member boolean;
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

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',              f.id,
               -- short_code: necessario pra pergunta photo/signature no portal.
               -- Ver cabecalho desta migration.
               'short_code',      f.short_code,
               'title',           f.title,
               'description',     f.description,
               'purpose',         f.purpose,
               'success_message', f.success_message,
               'field_config',    f.field_config,
               'require_consent', f.require_consent,
               'consent_text',    f.consent_text,
               'questions',       COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'id',            q.id,
                            'question',      q.question,
                            'description',   q.description,
                            'question_type', q.question_type,
                            'options',       q.options,
                            'is_required',   q.is_required,
                            'position',      q.position
                          )
                          ORDER BY q.position, q.id
                        )
                   FROM public.public_form_questions q
                  WHERE q.form_id = f.id
               ), '[]'::jsonb)
             )
             ORDER BY f.title, f.created_at
           )
      FROM public.lead_capture_forms f
     WHERE f.company_id = v_company_id            -- escopo de tenant: do token
       AND f.show_in_customer_portal = true
       AND f.is_active = true
       AND (f.expires_at IS NULL OR f.expires_at > now())
       AND (f.max_submissions IS NULL OR f.submission_count < f.max_submissions)
  ), '[]'::jsonb);
END;
$function$;
COMMENT ON FUNCTION public.get_customer_portal_forms(text, text) IS
  'Lista os formularios publicados no Portal do Cliente (show_in_customer_portal) da empresa do cliente daquele token. Mesmos gates de create_customer_portal_ticket: portal ativo, is_public ou membro da empresa, sessao valida quando password_enabled (sem excecao de secao livre -- formularios nao tem chave em public_sections), assinatura da empresa e modulo customer_portal. company_id sai do customer do token, nunca do client: cliente da empresa A nao enxerga formulario da empresa B. Desde 2026-11-10 devolve tambem o short_code de cada formulario -- a edge lead-capture-upload-photo exige short_code no body, e sem ele pergunta de tipo photo/signature era impossivel de responder pelo portal.';

-- CREATE OR REPLACE preserva o ACL; reafirmado pra a migration ser auto-suficiente.
REVOKE ALL ON FUNCTION public.get_customer_portal_forms(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_forms(text, text)
  TO anon, authenticated, service_role;
