-- =============================================================================
-- Formularios personalizados: perguntas proprias no formulario publico de
-- captacao + publicacao dentro do Portal do Cliente.
-- =============================================================================
-- CONTRATO (plano docs/planos/2026-11-09-formularios-personalizados.md):
--   O "formulario de captacao de cliente" (lead_capture_forms) deixa de ser so
--   um liga/desliga dos 17 campos fixos de `customers` e passa a ter PERGUNTAS
--   personalizadas (mesmo shape dos checklists), com dois propositos:
--     purpose='lead'    -> comportamento de hoje: cria/atualiza `customers`.
--     purpose='generic' -> SO coleta respostas (pesquisa, solicitacao,
--                          atualizacao cadastral). NAO toca em `customers`.
--   O mesmo formulario pode ser publicado por LINK PUBLICO (/cadastro/:code,
--   via edge lead-capture-submit) e DENTRO DO PORTAL DO CLIENTE (/portal/:token).
--
-- POR QUE TABELA PROPRIA E NAO form_questions (decisao de arquitetura do plano):
--   `form_questions` hoje tem 28 colunas e e o motor de checklist de OS/PMOC
--   (pmoc_section, freq_kind, auto_classify, require_camera_video, ...).
--   Pendurar formulario publico ali obrigaria TODA query de checklist a filtrar
--   por "kind" -- a mesma armadilha que `is_pmoc_default` ja criou. Entao:
--   tabela nova com o shape MINIMO espelhado (id/question/description/
--   question_type/options/is_required/position), pra o editor visual do
--   checklist ser reaproveitado no nivel de COMPONENTE, nao de tabela.
--
-- CAMADAS DE SEGURANCA (preservadas da migration base 20260721120000 e
-- estendidas; aqui nada e "confia no client"):
--   1. anon NUNCA le public_form_questions nem public_form_submissions direto.
--      REVOKE ALL explicito + RLS. Leitura publica so via RPC SECURITY DEFINER.
--   2. INSERT em public_form_submissions e REVOGADO de anon E authenticated.
--      So as 2 RPCs SECURITY DEFINER escrevem. Mesmo racional do submit de
--      hoje: se o client inserisse direto, `ip_hash` e `source` seriam
--      falsificaveis -- e `source` e justamente o que distingue "veio do link
--      publico" de "veio autenticado pelo portal daquele cliente".
--   3. company_id NUNCA vem do client nas RPCs: e sempre resolvido server-side
--      (do short_code, no link publico; do token do portal, no portal).
--   4. Trigger de coerencia de tenant nas DUAS tabelas novas: company_id tem
--      que bater com o company_id do form, e o customer_id da submission tem
--      que ser cliente DA MESMA empresa. Vale inclusive pra service_role --
--      e o guard que impede cruzar dado de tenant por bug de aplicacao.
--   5. Validacao de respostas e WHITELIST ESTRITA por question_id DAQUELE form
--      (nunca "aceita o que vier"), com teto de 100 respostas por envio, 4000
--      chars por resposta de texto, valor de select/multiselect obrigatoriamente
--      dentro de `options`, e photo/signature obrigatoriamente apontando pro
--      NOSSO storage publico. Ver PASSO 4.
--   6. Toda funcao nova e SECURITY DEFINER com search_path fixo, REVOKE de
--      public/anon/authenticated quando e detalhe interno, e GRANT explicito
--      quando e contrato. (anon nasce com EXECUTE em funcao nova no Supabase --
--      revogar e obrigatorio, nao cosmetico.)
--   7. Mensagem de erro = PT-BR generica, pronta pro usuario final, sem vazar
--      tenant, tabela, coluna ou stack. A edge repassa `error.message` cru.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP CONSTRAINT/TRIGGER/POLICY IF EXISTS antes do
-- CREATE, CREATE OR REPLACE FUNCTION.
--
-- DRIFT CONFERIDO ANTES DE ESCREVER: `pg_get_functiondef` de
-- get_lead_capture_form, submit_lead_capture_form e create_customer_portal_ticket
-- foi extraido do banco VIVO e comparado corpo a corpo com as migrations em
-- disco (20260919220000, 20261015233000, 20261021140000) -> ZERO divergencia.
-- Os CREATE OR REPLACE abaixo partem desse corpo vivo, nao de reescrita.
-- =============================================================================


-- =====================================================================
-- PASSO 1 -- lead_capture_forms: proposito, publicacao no portal e
-- mensagem de agradecimento.
--
-- `purpose` nasce 'lead' em TODA linha existente: quem usa o formulario hoje
-- nao sente diferenca nenhuma (lei da entrega). `show_in_customer_portal`
-- nasce false -- nenhum formulario aparece no portal sem o tenant ligar.
-- `success_message` NULL = o front usa o texto padrao traduzido.
-- =====================================================================
ALTER TABLE public.lead_capture_forms
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'lead';

ALTER TABLE public.lead_capture_forms
  ADD COLUMN IF NOT EXISTS show_in_customer_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_capture_forms
  ADD COLUMN IF NOT EXISTS success_message text;

ALTER TABLE public.lead_capture_forms
  DROP CONSTRAINT IF EXISTS lead_capture_forms_purpose_check;
ALTER TABLE public.lead_capture_forms
  ADD CONSTRAINT lead_capture_forms_purpose_check
  CHECK (purpose IN ('lead', 'generic'));

ALTER TABLE public.lead_capture_forms
  DROP CONSTRAINT IF EXISTS lead_capture_forms_success_message_len;
ALTER TABLE public.lead_capture_forms
  ADD CONSTRAINT lead_capture_forms_success_message_len
  CHECK (success_message IS NULL OR char_length(success_message) <= 2000);

COMMENT ON COLUMN public.lead_capture_forms.purpose IS
  'lead = comportamento historico (a submissao cria/atualiza customers). generic = SO coleta respostas em public_form_submissions, NUNCA toca em customers e nem exige os obrigatorios de field_config (formulario generico pode nao ter campo de cadastro ligado).';
COMMENT ON COLUMN public.lead_capture_forms.show_in_customer_portal IS
  'Quando true, o formulario aparece na secao Formularios do Portal do Cliente (/portal/:token) para os clientes DA MESMA empresa. Nasce false: publicar no portal e acao explicita do tenant.';
COMMENT ON COLUMN public.lead_capture_forms.success_message IS
  'Mensagem de agradecimento exibida depois do envio. NULL = texto padrao traduzido do front. Teto de 2000 chars.';

-- Indice parcial pro listador do portal (get_customer_portal_forms): a maioria
-- esmagadora dos formularios nao esta publicada no portal.
CREATE INDEX IF NOT EXISTS lead_capture_forms_portal_idx
  ON public.lead_capture_forms (company_id)
  WHERE show_in_customer_portal;


-- =====================================================================
-- PASSO 2 -- public_form_questions: as perguntas personalizadas.
--
-- Shape MINIMO espelhando form_questions (pra o editor visual ser o mesmo
-- componente), sem nenhuma coluna do motor de OS/PMOC.
-- company_id e DENORMALIZADO (deriva de form_id) de proposito: deixa a policy
-- de RLS direta (sem subquery por linha) e e o mesmo padrao do resto do repo.
-- A coerencia entre os dois e garantida por TRIGGER, nao por confianca.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.public_form_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  form_id       uuid NOT NULL REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
  question      text NOT NULL,
  description   text,
  question_type text NOT NULL DEFAULT 'text',
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required   boolean NOT NULL DEFAULT false,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Constraints fora do CREATE TABLE: com IF NOT EXISTS, uma tabela pre-existente
-- nao receberia as constraints novas. DROP + ADD as reaplica sempre.
ALTER TABLE public.public_form_questions
  DROP CONSTRAINT IF EXISTS public_form_questions_type_check;
ALTER TABLE public.public_form_questions
  ADD CONSTRAINT public_form_questions_type_check
  CHECK (question_type IN (
    'text', 'textarea', 'number', 'boolean', 'select',
    'multiselect', 'date', 'photo', 'signature', 'rating'
  ));

-- `options` tem que ser ARRAY. O resto da regra (todo elemento e string, no
-- maximo 200 itens) fica no TRIGGER, nao aqui: CHECK nao aceita subquery, e
-- `jsonb_typeof(x)='array' AND jsonb_array_length(x)<=200` tambem nao serve --
-- o planner NAO garante curto-circuito do AND em constraint, entao um `options`
-- objeto levantaria "cannot get array length of a non-array" em vez de violar
-- a constraint com mensagem decente.
ALTER TABLE public.public_form_questions
  DROP CONSTRAINT IF EXISTS public_form_questions_options_shape;
ALTER TABLE public.public_form_questions
  ADD CONSTRAINT public_form_questions_options_shape
  CHECK (jsonb_typeof(options) = 'array');

ALTER TABLE public.public_form_questions
  DROP CONSTRAINT IF EXISTS public_form_questions_question_len;
ALTER TABLE public.public_form_questions
  ADD CONSTRAINT public_form_questions_question_len
  CHECK (
    char_length(btrim(question)) BETWEEN 1 AND 500
    AND (description IS NULL OR char_length(description) <= 1000)
  );

COMMENT ON TABLE public.public_form_questions IS
  'Perguntas personalizadas de um formulario publico (lead_capture_forms). Espelha o shape minimo de form_questions pra reaproveitar o editor do checklist SEM acoplar ao motor de OS/PMOC. anon NUNCA le direto: a leitura publica sai de get_lead_capture_form / get_customer_portal_forms.';
COMMENT ON COLUMN public.public_form_questions.company_id IS
  'Denormalizado de lead_capture_forms.company_id pra RLS direta. Trigger trg_public_form_questions_guard aborta se divergir do form.';
COMMENT ON COLUMN public.public_form_questions.options IS
  'Array de strings. Só tem sentido em question_type select/multiselect; nos outros tipos fica []. CHECK garante array de strings com no maximo 200 itens.';
COMMENT ON COLUMN public.public_form_questions.question_type IS
  'text | textarea | number | boolean | select | multiselect | date | photo | signature | rating. A validacao do VALOR enviado por tipo vive em validate_public_form_answers.';

CREATE INDEX IF NOT EXISTS public_form_questions_form_position_idx
  ON public.public_form_questions (form_id, position);
CREATE INDEX IF NOT EXISTS public_form_questions_company_idx
  ON public.public_form_questions (company_id);


-- =====================================================================
-- PASSO 3 -- public_form_submissions: as respostas.
--
-- customer_id preenchido SO quando a submissao veio do Portal do Cliente
-- (ali o cliente e conhecido pelo token). ON DELETE SET NULL: apagar o
-- cliente nao pode apagar a resposta (historico).
--
-- DESVIO DELIBERADO DO BRIEFING (coluna `fields`): o briefing descreve
-- submit_customer_portal_form recebendo `p_fields jsonb` mas nao diz onde
-- grava-lo, e proibe (corretamente) tocar em `customers` pelo portal. Sem uma
-- coluna propria, o que o cliente digitou nos campos de cadastro do formulario
-- seria ACEITO E DESCARTADO em silencio -- perda de dado disfarcada de
-- sucesso. Entao: coluna `fields jsonb NOT NULL DEFAULT '{}'`, aditiva e
-- idempotente, guardando o payload de campos de cadastro JA SANITIZADO pela
-- whitelist de field_config. `answers` continua com o contrato exato
-- { "<question_id>": <valor> }, sem chave reservada enfiada dentro.
-- O link publico tambem passa a gravar `fields` -- auditoria do que o lead
-- digitou, independente de edicao posterior no cadastro do cliente.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.public_form_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  form_id      uuid NOT NULL REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  source       text NOT NULL,
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash      text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_form_submissions
  ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.public_form_submissions
  DROP CONSTRAINT IF EXISTS public_form_submissions_source_check;
ALTER TABLE public.public_form_submissions
  ADD CONSTRAINT public_form_submissions_source_check
  CHECK (source IN ('public_link', 'customer_portal'));

ALTER TABLE public.public_form_submissions
  DROP CONSTRAINT IF EXISTS public_form_submissions_payload_shape;
ALTER TABLE public.public_form_submissions
  ADD CONSTRAINT public_form_submissions_payload_shape
  CHECK (jsonb_typeof(answers) = 'object' AND jsonb_typeof(fields) = 'object');

COMMENT ON TABLE public.public_form_submissions IS
  'Respostas de formulario publico. UMA linha por envio, tanto do link publico quanto do Portal do Cliente. INSERT e REVOGADO de anon e authenticated: so submit_lead_capture_form e submit_customer_portal_form (SECURITY DEFINER) escrevem -- se o client inserisse direto, ip_hash e source seriam falsificaveis.';
COMMENT ON COLUMN public.public_form_submissions.source IS
  'public_link = link publico anonimo (/cadastro/:code, via edge lead-capture-submit, ip_hash preenchido). customer_portal = Portal do Cliente autenticado por token (customer_id preenchido, ip_hash NULL).';
COMMENT ON COLUMN public.public_form_submissions.customer_id IS
  'Cliente que enviou, resolvido SERVER-SIDE pelo token do portal. NULL em submissao de link publico (ninguem esta identificado). ON DELETE SET NULL: apagar cliente nao apaga a resposta.';
COMMENT ON COLUMN public.public_form_submissions.answers IS
  'Mapa { "<public_form_questions.id>": <valor> } JA validado pela whitelist de perguntas daquele form. Tipos normalizados: texto -> string, number/rating -> number, boolean -> boolean, date -> "YYYY-MM-DD", select -> string de options, multiselect -> array de strings de options, photo/signature -> URL do nosso storage publico.';
COMMENT ON COLUMN public.public_form_submissions.fields IS
  'Campos de CADASTRO (os 17 de field_config) que o respondente preencheu, ja sanitizados pela whitelist. Auditoria do envio: no link publico com purpose=lead eles tambem viraram linha em customers; no portal e em purpose=generic eles existem SO aqui (o portal nunca cria nem altera cliente).';
COMMENT ON COLUMN public.public_form_submissions.ip_hash IS
  'HASH do IP (nunca o IP cru -- LGPD), calculado pela edge lead-capture-submit. NULL em submissao do Portal do Cliente.';

CREATE INDEX IF NOT EXISTS public_form_submissions_company_form_idx
  ON public.public_form_submissions (company_id, form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS public_form_submissions_customer_idx
  ON public.public_form_submissions (customer_id, submitted_at DESC);


-- =====================================================================
-- PASSO 3.1 -- triggers de coerencia de tenant.
--
-- POR QUE TRIGGER E NAO SO RLS: company_id e denormalizado nas duas tabelas.
-- RLS impede um usuario de ESCREVER com company_id de outra empresa, mas nao
-- impede escrever company_id DA PROPRIA empresa apontando pra um form de
-- OUTRA. O trigger fecha exatamente esse cruzamento -- e vale tambem pra
-- service_role / RPC SECURITY DEFINER, que passam por cima do RLS.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.public_form_questions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT f.company_id INTO v_company
    FROM public.lead_capture_forms f
   WHERE f.id = NEW.form_id;

  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Formulário inválido' USING ERRCODE = '42501';
  END IF;

  -- Shape de `options`: array de ATE 200 strings. Fica aqui e nao em CHECK
  -- porque precisa de subquery (elemento a elemento) -- CHECK nao aceita.
  IF jsonb_typeof(NEW.options) <> 'array'
     OR jsonb_array_length(NEW.options) > 200
     OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(NEW.options) e
           WHERE jsonb_typeof(e) <> 'string'
        )
  THEN
    RAISE EXCEPTION 'Opções inválidas' USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.public_form_questions_guard() IS
  'Trigger BEFORE INSERT/UPDATE de public_form_questions: aborta se company_id nao for exatamente o company_id do form (guard multi-tenant que o RLS sozinho nao cobre, porque company_id e denormalizado), valida o shape de options (array de ate 200 strings -- regra que CHECK nao suporta por exigir subquery) e carimba updated_at.';

REVOKE ALL ON FUNCTION public.public_form_questions_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_public_form_questions_guard ON public.public_form_questions;
CREATE TRIGGER trg_public_form_questions_guard
  BEFORE INSERT OR UPDATE ON public.public_form_questions
  FOR EACH ROW EXECUTE FUNCTION public.public_form_questions_guard();


CREATE OR REPLACE FUNCTION public.public_form_submissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT f.company_id INTO v_company
    FROM public.lead_capture_forms f
   WHERE f.id = NEW.form_id;

  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Formulário indisponível' USING ERRCODE = '42501';
  END IF;

  -- Cliente vinculado tem que ser cliente DA MESMA empresa do formulario.
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = NEW.customer_id AND c.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Formulário indisponível' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.public_form_submissions_guard() IS
  'Trigger BEFORE INSERT/UPDATE de public_form_submissions: company_id tem que bater com o company_id do form E o customer_id (quando houver) tem que ser cliente da MESMA empresa. Guard multi-tenant valido inclusive pra service_role e RPC SECURITY DEFINER, que nao passam por RLS.';

REVOKE ALL ON FUNCTION public.public_form_submissions_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_public_form_submissions_guard ON public.public_form_submissions;
CREATE TRIGGER trg_public_form_submissions_guard
  BEFORE INSERT OR UPDATE ON public.public_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.public_form_submissions_guard();


-- =====================================================================
-- PASSO 3.2 -- RLS + GRANTs de tabela.
--
-- Mesmo padrao de lead_capture_forms (get_user_company_id + super_admin via
-- has_role), com dois apertos:
--   - anon: REVOKE ALL nas duas tabelas e NENHUMA policy. Leitura publica so
--     por RPC. (No Supabase, tabela nova no schema public nasce com GRANT pra
--     anon/authenticated por default privileges -- revogar e obrigatorio.)
--   - public_form_submissions: authenticated tem SELECT/UPDATE/DELETE, mas
--     INSERT e revogado no nivel de GRANT **e** sem policy de INSERT. Duas
--     travas pro mesmo ponto: ip_hash e source nao podem vir do client.
-- =====================================================================
ALTER TABLE public.public_form_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_form_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_form_questions   FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.public_form_submissions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_form_questions   TO authenticated;
GRANT SELECT, UPDATE, DELETE         ON TABLE public.public_form_submissions TO authenticated;
GRANT ALL ON TABLE public.public_form_questions   TO service_role;
GRANT ALL ON TABLE public.public_form_submissions TO service_role;

DROP POLICY IF EXISTS "service_role_full_access_public_form_questions" ON public.public_form_questions;
CREATE POLICY "service_role_full_access_public_form_questions"
  ON public.public_form_questions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users manage own company public_form_questions" ON public.public_form_questions;
CREATE POLICY "Users manage own company public_form_questions"
  ON public.public_form_questions FOR ALL TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  );

DROP POLICY IF EXISTS "service_role_full_access_public_form_submissions" ON public.public_form_submissions;
CREATE POLICY "service_role_full_access_public_form_submissions"
  ON public.public_form_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Sem policy de INSERT pra authenticated: de proposito. So RPC escreve.
DROP POLICY IF EXISTS "Users view own company public_form_submissions" ON public.public_form_submissions;
CREATE POLICY "Users view own company public_form_submissions"
  ON public.public_form_submissions FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  );

DROP POLICY IF EXISTS "Users update own company public_form_submissions" ON public.public_form_submissions;
CREATE POLICY "Users update own company public_form_submissions"
  ON public.public_form_submissions FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  );

DROP POLICY IF EXISTS "Users delete own company public_form_submissions" ON public.public_form_submissions;
CREATE POLICY "Users delete own company public_form_submissions"
  ON public.public_form_submissions FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'super_admin'::app_role))
  );


-- =====================================================================
-- PASSO 4 -- validate_public_form_answers: a REGUA UNICA das respostas.
--
-- Usada pelas DUAS RPCs de submissao (link publico e portal) -- a regra de
-- aceite nao pode divergir entre os dois caminhos, senao um deles vira a porta
-- de entrada frouxa.
--
-- WHITELIST ESTRITA, nunca "aceita o que vier":
--   - teto de 100 chaves por envio;
--   - TODA chave tem que ser o id de uma pergunta DAQUELE form_id -- chave
--     desconhecida aborta o envio inteiro (payload forjado ou formulario
--     editado durante o preenchimento);
--   - toda pergunta is_required tem que vir presente e nao-vazia ("" e []
--     contam como vazio);
--   - por tipo: texto <= 4000 chars com caracteres de controle removidos
--     (\n \r \t preservados pro textarea); number/rating numericos (aceita
--     virgula decimal, padrao pt-BR); boolean booleano; date normalizada pra
--     YYYY-MM-DD; select/multiselect obrigatoriamente DENTRO de `options`;
--     photo/signature obrigatoriamente URL do NOSSO storage publico.
--   - o retorno e o payload NORMALIZADO -- e ele que vai pro banco, nunca o
--     jsonb cru do client.
--
-- POR QUE photo/signature so aceitam o nosso storage: o valor e renderizado
-- depois no painel do tenant (e em PDF). Aceitar URL arbitraria ou data: URI
-- abriria phishing/XSS armazenado no painel de quem recebeu o formulario, e
-- payload ilimitado no jsonb. Mesma disciplina do photo_url de
-- submit_lead_capture_form (20260916180000).
--
-- GOTCHA preservado: o motor de regex do Postgres tem DUPMAX=255 pro contador
-- de `{m,n}` -- `{0,599}` levanta "invalid repetition count(s)" e derruba a
-- submissao inteira. Por isso o teto de tamanho de URL e `length()`, nunca
-- bound na regex. Isso ja quebrou producao uma vez.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.validate_public_form_answers(
  p_form_id uuid,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_in      jsonb := COALESCE(p_answers, '{}'::jsonb);
  v_out     jsonb := '{}'::jsonb;
  v_known   text[];
  v_key     text;
  v_q       record;
  v_val     jsonb;
  v_opts    jsonb;
  v_present boolean;
  v_txt     text;
  v_num     numeric;
  v_dt      date;
  v_el      jsonb;
  v_nkeys   int;
  v_label   text;
  v_path    text;
BEGIN
  IF jsonb_typeof(v_in) <> 'object' THEN
    RAISE EXCEPTION 'Respostas inválidas' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_nkeys FROM jsonb_object_keys(v_in);
  IF v_nkeys > 100 THEN
    RAISE EXCEPTION 'Respostas inválidas' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(q.id::text), ARRAY[]::text[]) INTO v_known
    FROM public.public_form_questions q
   WHERE q.form_id = p_form_id;

  -- Chave que nao e pergunta DESTE formulario: aborta. Comparacao em TEXTO
  -- de proposito -- cast pra uuid de uma chave arbitraria levantaria 22P02
  -- (erro tecnico vazando pro usuario) em vez da mensagem PT-BR.
  FOR v_key IN SELECT jsonb_object_keys(v_in) LOOP
    IF NOT (v_key = ANY (v_known)) THEN
      RAISE EXCEPTION 'Formulário desatualizado. Recarregue a página e tente novamente.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_q IN
    SELECT q.id, q.question, q.question_type, q.options, q.is_required
      FROM public.public_form_questions q
     WHERE q.form_id = p_form_id
     ORDER BY q.position, q.id
  LOOP
    v_val   := v_in -> (v_q.id::text);
    v_label := left(btrim(v_q.question), 80);
    v_opts  := CASE WHEN jsonb_typeof(v_q.options) = 'array' THEN v_q.options ELSE '[]'::jsonb END;

    -- Presenca: ausente, null JSON, string vazia e array vazio = nao respondida.
    v_present := v_val IS NOT NULL AND jsonb_typeof(v_val) <> 'null';
    IF v_present AND jsonb_typeof(v_val) = 'string' THEN
      v_present := btrim(v_val #>> '{}') <> '';
    ELSIF v_present AND jsonb_typeof(v_val) = 'array' THEN
      v_present := jsonb_array_length(v_val) > 0;
    END IF;

    IF NOT v_present THEN
      IF v_q.is_required THEN
        RAISE EXCEPTION 'Pergunta obrigatória não respondida: %', v_label
          USING ERRCODE = '22023';
      END IF;
      CONTINUE;   -- opcional em branco: nao entra no payload gravado
    END IF;

    IF v_q.question_type IN ('text', 'textarea') THEN
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      -- Remove caracteres de controle MENOS \t \n \r (textarea tem linha).
      v_txt := btrim(regexp_replace(v_val #>> '{}', '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
      IF length(v_txt) > 4000 THEN
        RAISE EXCEPTION 'Resposta muito longa em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_q.id::text, to_jsonb(v_txt));

    ELSIF v_q.question_type IN ('number', 'rating') THEN
      IF jsonb_typeof(v_val) = 'number' THEN
        v_num := (v_val #>> '{}')::numeric;
      ELSIF jsonb_typeof(v_val) = 'string' THEN
        -- Virgula decimal: padrao pt-BR digitado no celular.
        v_txt := replace(btrim(v_val #>> '{}'), ',', '.');
        IF v_txt !~ '^-?[0-9]{1,15}(\.[0-9]{1,6})?$' THEN
          RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
        END IF;
        v_num := v_txt::numeric;
      ELSE
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;

      IF v_q.question_type = 'rating' THEN
        IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 10 THEN
          RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
        END IF;
      ELSIF abs(v_num) > 1000000000000 THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_q.id::text, to_jsonb(v_num));

    ELSIF v_q.question_type = 'boolean' THEN
      IF jsonb_typeof(v_val) = 'boolean' THEN
        v_out := v_out || jsonb_build_object(v_q.id::text, v_val);
      ELSIF jsonb_typeof(v_val) = 'string'
            AND lower(btrim(v_val #>> '{}')) IN ('true', 'false', 'sim', 'nao', 'não') THEN
        v_out := v_out || jsonb_build_object(
          v_q.id::text,
          to_jsonb(lower(btrim(v_val #>> '{}')) IN ('true', 'sim'))
        );
      ELSE
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;

    ELSIF v_q.question_type = 'date' THEN
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_txt := btrim(v_val #>> '{}');
      BEGIN
        IF v_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
          v_dt := left(v_txt, 10)::date;
        ELSIF v_txt ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN
          v_dt := to_date(v_txt, 'DD/MM/YYYY');
        ELSE
          RAISE EXCEPTION 'formato';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Data inválida em: %', v_label USING ERRCODE = '22023';
      END;
      v_out := v_out || jsonb_build_object(v_q.id::text, to_jsonb(to_char(v_dt, 'YYYY-MM-DD')));

    ELSIF v_q.question_type = 'select' THEN
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_txt := btrim(v_val #>> '{}');
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_opts) o WHERE o = v_txt
      ) THEN
        RAISE EXCEPTION 'Opção inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_q.id::text, to_jsonb(v_txt));

    ELSIF v_q.question_type = 'multiselect' THEN
      IF jsonb_typeof(v_val) <> 'array' THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_val) > 200 THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      FOR v_el IN SELECT e FROM jsonb_array_elements(v_val) e LOOP
        IF jsonb_typeof(v_el) <> 'string' THEN
          RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_opts) o WHERE o = btrim(v_el #>> '{}')
        ) THEN
          RAISE EXCEPTION 'Opção inválida em: %', v_label USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_out := v_out || jsonb_build_object(
        v_q.id::text,
        (SELECT COALESCE(jsonb_agg(btrim(e)), '[]'::jsonb) FROM jsonb_array_elements_text(v_val) e)
      );

    ELSIF v_q.question_type IN ('photo', 'signature') THEN
      IF jsonb_typeof(v_val) <> 'string' THEN
        RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_txt := btrim(v_val #>> '{}');
      -- Só o NOSSO storage publico. O front sobe o arquivo ANTES de enviar o
      -- formulario e manda aqui a publicUrl pronta.
      v_path := substring(
        v_txt FROM '^https://byqldosixshhuiuarszp\.supabase\.co/storage/v1/object/public/([A-Za-z0-9][A-Za-z0-9/_.-]*)$'
      );
      IF v_path IS NULL OR length(v_txt) > 600 OR v_path ~ '\.\.' THEN
        RAISE EXCEPTION 'Arquivo inválido em: %', v_label USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_q.id::text, to_jsonb(v_txt));

    ELSE
      -- question_type fora da lista conhecida: o CHECK da tabela impede, mas se
      -- um tipo novo entrar sem regra aqui, FALHA FECHADO em vez de gravar cru.
      RAISE EXCEPTION 'Resposta inválida em: %', v_label USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.validate_public_form_answers(uuid, jsonb) IS
  'Regua UNICA de validacao/normalizacao das respostas de formulario publico, compartilhada por submit_lead_capture_form e submit_customer_portal_form. Whitelist estrita por question_id daquele form (chave desconhecida aborta), obrigatorios, teto de 100 respostas por envio e 4000 chars por texto, select/multiselect so com valor de `options`, photo/signature so com URL do nosso storage publico. Retorna o payload NORMALIZADO -- e ele que e gravado, nunca o jsonb cru do client. Detalhe interno: sem EXECUTE pra anon/authenticated.';

-- anon nasce com EXECUTE em funcao nova no Supabase; isto aqui e detalhe
-- interno das RPCs, nao contrato publico.
REVOKE ALL ON FUNCTION public.validate_public_form_answers(uuid, jsonb)
  FROM public, anon, authenticated;


-- =====================================================================
-- PASSO 5 -- sanitize_public_form_fields: a whitelist dos 17 campos de
-- cadastro, EXTRAIDA de submit_lead_capture_form sem mudar uma regra.
--
-- POR QUE EXTRAIR: o Portal do Cliente tambem renderiza os campos de
-- field_config. Duplicar o loop seria manter duas reguas de aceite pro mesmo
-- payload -- exatamente o que o briefing proibe pras respostas, e o mesmo
-- risco aqui.
--
-- SEMANTICA PRESERVADA BYTE A BYTE da versao viva (20261015233000):
--   campo desabilitado no field_config -> ignorado (nem valida required);
--   strip de caracteres de controle + btrim + NULLIF('');
--   required ausente -> 'Campo obrigatório ausente: %';
--   email por regex, documento com DV (lead_valida_cpf/cnpj conforme o
--   customer_type resolvido), telefone/celular 10-11 digitos, CEP 8 digitos,
--   customer_type normalizado, name <= 200, notes <= 1000, demais <= 255,
--   photo_url so do nosso bucket customer-photos (com o cap por length(),
--   nao por bound de regex -- gotcha DUPMAX=255 do Postgres).
--
-- p_enforce_required=false e usado por formulario purpose='generic': formulario
-- generico pode nao ter nenhum campo de cadastro ligado, e exigir os
-- obrigatorios de field_config travaria o envio sem motivo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sanitize_public_form_fields(
  p_field_config     jsonb,
  p_fields           jsonb,
  p_enforce_required boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg        jsonb := COALESCE(p_field_config, '{}'::jsonb);
  v_fields     jsonb := COALESCE(p_fields, '{}'::jsonb);
  v_allowed    text[] := ARRAY[
    'name','customer_type','document','email','phone','celular',
    'company_name','nome_fantasia','zip_code','address','address_number',
    'neighborhood','complement','city','state','notes','photo_url'
  ];
  v_col        text;
  v_out        jsonb := '{}'::jsonb;
  v_raw        text;
  v_ctype      text;
  v_doc        text;
  v_photo_path text;
BEGIN
  IF jsonb_typeof(v_fields) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos' USING ERRCODE = '22023';
  END IF;

  -- customer_type resolvido ANTES do loop: a validacao de `document` depende
  -- dele (CPF x CNPJ). Default 'pf' quando ausente/invalido.
  v_ctype := lower(trim(COALESCE(v_fields->>'customer_type', '')));
  IF v_ctype NOT IN ('pf','pj') THEN
    v_ctype := 'pf';
  END IF;

  FOREACH v_col IN ARRAY v_allowed LOOP
    -- campo desabilitado no config -> IGNORA (whitelist estrita), nem valida required.
    IF COALESCE((v_cfg->v_col->>'enabled')::boolean, false) = false THEN
      CONTINUE;
    END IF;

    v_raw := NULLIF(btrim(regexp_replace(COALESCE(v_fields->>v_col, ''), '[\x00-\x1F\x7F]', '', 'g')), '');

    IF COALESCE((v_cfg->v_col->>'required')::boolean, false) = true
       AND COALESCE(p_enforce_required, true)
       AND v_raw IS NULL THEN
      RAISE EXCEPTION 'Campo obrigatório ausente: %', v_col;
    END IF;

    IF v_raw IS NULL THEN
      CONTINUE;  -- opcional nao preenchido: ignora
    END IF;

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
      v_raw := v_doc;  -- guarda so digitos

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
      -- Endpoint publico/anonimo: so o NOSSO storage publico, bucket
      -- customer-photos. Cap de 300 chars por length() e NAO por bound de
      -- regex -- `{0,299}` estoura o DUPMAX=255 do motor de regex do Postgres
      -- (ERROR 2201B) e derruba 100% das submissoes com foto.
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

    v_out := v_out || jsonb_build_object(v_col, v_raw);
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.sanitize_public_form_fields(jsonb, jsonb, boolean) IS
  'Whitelist estrita dos 17 campos de cadastro de field_config, extraida de submit_lead_capture_form (20261015233000) com a semantica preservada regra por regra: campo desabilitado e ignorado, strip de controle + btrim, required, email por regex, CPF/CNPJ com DV conforme customer_type, telefone 10-11 digitos, CEP 8 digitos, caps de tamanho, photo_url so do bucket customer-photos. Retorna o jsonb sanitizado (nunca o do client). p_enforce_required=false para formulario purpose=generic. Detalhe interno: sem EXECUTE pra anon/authenticated.';

REVOKE ALL ON FUNCTION public.sanitize_public_form_fields(jsonb, jsonb, boolean)
  FROM public, anon, authenticated;


-- =====================================================================
-- PASSO 6 -- get_lead_capture_form: + purpose, success_message, questions.
--
-- Partindo do corpo VIVO (allowlist de 9 chaves de company_settings da
-- 20260919220000, conferida contra pg_get_functiondef). Nada mais muda:
-- mesma assinatura (text)->jsonb, mesma allowlist de company_settings, mesmo
-- RETURN NULL de "nao encontrado", mesmo calculo de `expired`, mesmos grants.
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
      'expired',         v_expired,
      -- Novos em 2026-11-09. `purpose` diz se a pagina mostra o bloco de
      -- cadastro; `success_message` e a tela de agradecimento; `questions` sao
      -- as perguntas personalizadas. NENHUM dado interno do tenant aqui.
      'purpose',         v_form.purpose,
      'success_message', v_form.success_message,
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
         WHERE q.form_id = v_form.id
      ), '[]'::jsonb)
    ),
    'company_settings', (
      SELECT jsonb_build_object(
        -- Identidade visual do dono do link. E TUDO que a pagina publica le:
        --   PublicLeadCapture.tsx  brandName  = cs.name        (alt da <img>)
        --   PublicLeadCapture.tsx  brandLogo  = (white_label_enabled && white_label_logo_url) || logo_url
        --   PublicLeadCapture.tsx  white_label_enabled
        --   PublicLeadCapture.tsx  white_label_primary_color   (hexToHsl -> --primary)
        'name',                      cs.name,
        'logo_url',                  cs.logo_url,
        'white_label_enabled',       cs.white_label_enabled,
        'white_label_primary_color', cs.white_label_primary_color,
        'white_label_logo_url',      cs.white_label_logo_url,
        'white_label_icon_url',      cs.white_label_icon_url,
        -- Locale. `language` alimenta normalizeLang() e escolhe o dicionario UI.
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
  'Formulario publico de captacao por short_code. company_settings e ALLOWLIST de 9 chaves (identidade visual + locale) desde 2026-09-19: a linha inteira vazava CNPJ, e-mail, telefone e endereco da prestadora pra qualquer anonimo com o codigo. Desde 2026-11-09 o bloco `form` tambem devolve purpose, success_message e `questions` (perguntas personalizadas ordenadas por position, id) -- allowlist de 7 campos por pergunta, nada de company_id.';

GRANT EXECUTE ON FUNCTION public.get_lead_capture_form(text) TO anon, authenticated;


-- =====================================================================
-- PASSO 7 -- submit_lead_capture_form: + p_answers, + submissao gravada,
-- + purpose.
--
-- ⚠️ DROP + CREATE em vez de CREATE OR REPLACE, de proposito. Acrescentar
-- `p_answers jsonb DEFAULT '{}'` cria uma SOBRECARGA (4 args + 5 args) e o
-- PostgREST passaria a ver DUAS candidatas pra chamada da edge (que manda os 4
-- nomes antigos) -> "Could not choose the best candidate function" e o
-- formulario publico de TODOS os tenants quebraria. Derrubando a de 4 args
-- sobra uma unica candidata, e a edge atual (p_short_code, p_fields,
-- p_consent, p_ip_hash) continua funcionando pelo DEFAULT de p_answers --
-- requisito de backward-compatibility: servidor sobe antes do front.
--
-- ⚠️ DROP FUNCTION LEVA OS GRANTS. ACL vivo conferido antes desta migration:
--     {postgres=X/postgres, service_role=X/postgres}  (anon e authenticated
--     SEM execute desde 20260912150000 / 20260916180000).
-- Os REVOKE/GRANT no fim deste passo REPÕEM exatamente esse ACL -- nao
-- alargam nada. Se eu esquecesse, a edge quebraria com "permission denied".
--
-- O QUE MUDA DE COMPORTAMENTO:
--   1. p_answers validado pela regua unica ANTES de qualquer escrita.
--   2. SEMPRE grava 1 linha em public_form_submissions (source='public_link',
--      ip_hash recebido, customer_id NULL) -- inclusive quando purpose='lead'.
--   3. O bloco de `customers` (e os obrigatorios de field_config) roda SO
--      quando purpose='lead'.
-- O QUE NAO MUDA: resolucao do form pelo short_code, rate-limit por ip_hash,
--   max_submissions/expires_at/is_active, consentimento, sanitizacao dos 17
--   campos, INSERT dinamico por catalogo, incremento do contador, log de
--   rate-limit, retorno neutro {success:true}.
-- =====================================================================
DROP FUNCTION IF EXISTS public.submit_lead_capture_form(text, jsonb, boolean, text);

CREATE OR REPLACE FUNCTION public.submit_lead_capture_form(
  p_short_code text,
  p_fields     jsonb,
  p_consent    boolean,
  p_ip_hash    text DEFAULT NULL,
  p_answers    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_form      public.lead_capture_forms%ROWTYPE;
  v_cfg       jsonb;
  v_ins       jsonb;      -- campos de cadastro sanitizados
  v_answers   jsonb;      -- respostas validadas/normalizadas
  v_ctype     text;
  v_recent    int;
  v_daily     int;
  v_payload   jsonb;      -- v_ins + colunas de sistema
  v_col_list  text;       -- "a", "b", ... (do catalogo)
  v_sel_list  text;       -- r."a", r."b", ...
  v_ncols     int;
  v_nkeys     int;
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

  -- ---- perguntas personalizadas: whitelist estrita por question_id ----
  -- Antes de qualquer escrita: resposta invalida nao deixa meio cadastro atras.
  v_answers := public.validate_public_form_answers(v_form.id, p_answers);

  -- ---- campos de cadastro: whitelist dos 17 de field_config ----
  -- purpose='generic' nao exige os obrigatorios de field_config (o formulario
  -- pode nao ter nenhum campo de cadastro ligado), mas o que vier ainda e
  -- sanitizado e guardado na submissao.
  v_ins := public.sanitize_public_form_fields(v_cfg, p_fields, v_form.purpose = 'lead');

  -- =========================================================
  -- Bloco de `customers`: SO para purpose='lead'.
  -- purpose='generic' nunca cria nem altera cliente.
  -- =========================================================
  IF v_form.purpose = 'lead' THEN
    v_ctype := lower(trim(COALESCE(p_fields->>'customer_type', '')));
    IF v_ctype NOT IN ('pf','pj') THEN
      v_ctype := 'pf';
    END IF;

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
    -- que uma coluna `NOT NULL DEFAULT` nova volte a receber NULL explícito e
    -- derrube o formulário público de todos os tenants.
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
    -- ABORTA em vez de gravar cadastro incompleto em silêncio.
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
  END IF;

  -- ---- registra a submissao (perguntas + campos) ----
  -- SEMPRE, inclusive em purpose='lead': e a aba "Respostas" do formulario e a
  -- unica prova do que foi enviado. company_id vem do form, nunca do client.
  INSERT INTO public.public_form_submissions
    (company_id, form_id, customer_id, source, answers, fields, ip_hash)
  VALUES (
    v_form.company_id, v_form.id, NULL, 'public_link',
    v_answers, v_ins, NULLIF(trim(COALESCE(p_ip_hash,'')), '')
  );

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

COMMENT ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb) IS
  'Submissao publica do formulario de captacao. SECURITY DEFINER, grant SO service_role -- unico chamador e a edge lead-capture-submit (verify_jwt=false, roda com service_role), que e a fronteira que le o IP real e calcula o ip_hash; chamador direto burlaria o rate-limit. Resolve company_id do short_code (nunca do client). Valida respostas personalizadas pela whitelist de perguntas daquele form (validate_public_form_answers) ANTES de escrever e sanitiza os 17 campos de cadastro (sanitize_public_form_fields). Grava SEMPRE 1 linha em public_form_submissions (source=public_link, ip_hash, customer_id NULL) e so toca em customers quando purpose=lead -- purpose=generic nao cria cliente nem exige os obrigatorios de field_config. INSERT em customers e DINAMICO por catalogo (hotfix 20261015233000: o padrao antigo gravava NULL explicito em coluna ausente e anulava o DEFAULT). p_answers tem DEFAULT para a edge de 4 argumentos continuar funcionando enquanto o front novo nao sobe. Retorno neutro {success:true}.';

-- DROP FUNCTION levou o ACL: REPOSICAO exata do que estava vivo
-- ({postgres, service_role}; anon/authenticated sem EXECUTE).
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb) TO service_role;


-- =====================================================================
-- PASSO 8 -- get_customer_portal_forms(p_token, p_session_token).
--
-- Molde: create_customer_portal_ticket (20261021140000), copiado gate por
-- gate -- portal ativo, is_public/membro da empresa, sessao de senha quando
-- password_enabled, assinatura da empresa e modulo customer_portal. Nada aqui
-- aceita company_id do client: a empresa sai do customer do token.
--
-- DIFERENCA DELIBERADA vs o ticket: o ticket tem a excecao `v_ticket_free`
-- (secao livre em public_sections dispensa a senha). Formularios NAO tem chave
-- em public_sections -- o CHECK customer_portals_public_sections_shape so
-- aceita as 7 chaves conhecidas, e `forms` nao e uma delas. Logo: portal com
-- senha exige sessao, sem excecao. Fail-closed por construcao.
--
-- FILTRO: is_active, nao expirado, show_in_customer_portal. Incluo tambem
-- max_submissions (nao pedido no briefing) porque submit_customer_portal_form
-- recusa form estourado -- listar o que o submit rejeita seria mostrar um
-- formulario que da erro ao enviar.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_customer_portal_forms(
  p_token text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

COMMENT ON FUNCTION public.get_customer_portal_forms(text, text) IS
  'Lista os formularios publicados no Portal do Cliente (show_in_customer_portal) da empresa do cliente daquele token. Mesmos gates de create_customer_portal_ticket: portal ativo, is_public ou membro da empresa, sessao valida quando password_enabled (sem excecao de secao livre -- formularios nao tem chave em public_sections), assinatura da empresa e modulo customer_portal. company_id sai do customer do token, nunca do client: cliente da empresa A nao enxerga formulario da empresa B. Nao devolve short_code nem contadores.';

REVOKE ALL ON FUNCTION public.get_customer_portal_forms(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_forms(text, text)
  TO anon, authenticated, service_role;


-- =====================================================================
-- PASSO 9 -- submit_customer_portal_form(p_token, p_session_token,
--            p_form_id, p_fields, p_answers).
--
-- Mesmos gates do PASSO 8, mais: o p_form_id tem que pertencer A EMPRESA
-- DAQUELE CLIENTE e estar publicado/ativo/nao-expirado -- senao erro generico
-- (nao distingue "nao existe" de "e de outra empresa": nao da pra enumerar
-- formulario de outro tenant por diferenca de mensagem).
--
-- ⚠️ NUNCA cria nem altera cliente, mesmo com purpose='lead'. O portal e um
-- canal de COLETA; promover resposta de portal a cadastro novo duplicaria o
-- cliente que ja esta logado ali.
--
-- Rate-limit proprio (nao pedido no briefing, mas o endpoint tem GRANT pra
-- anon): 5 envios do mesmo cliente no mesmo formulario em 10 minutos. Sem
-- isso, quem tem o link do portal poderia inflar submission_count e lotar a
-- aba Respostas do tenant. Mensagem reusa o texto de rate-limit de hoje.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_customer_portal_form(
  p_token         text,
  p_session_token text,
  p_form_id       uuid,
  p_fields        jsonb DEFAULT '{}'::jsonb,
  p_answers       jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
  v_fields  := public.sanitize_public_form_fields(
                 v_form.field_config, p_fields, v_form.purpose = 'lead'
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
$$;

COMMENT ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb) IS
  'Envia um formulario publicado no Portal do Cliente. Mesmos gates de create_customer_portal_ticket (portal ativo, is_public ou membro, sessao quando password_enabled, assinatura, modulo customer_portal) + o formulario tem que ser da empresa daquele cliente, publicado no portal, ativo e dentro de expires_at/max_submissions (mensagem unica pra qualquer motivo, anti-enumeracao). Valida respostas pela regua unica validate_public_form_answers e sanitiza os campos de cadastro por sanitize_public_form_fields. Grava public_form_submissions com source=customer_portal, customer_id resolvido pelo TOKEN e ip_hash NULL, e incrementa submission_count. NUNCA cria nem altera cliente, mesmo em formulario purpose=lead. Rate-limit de 5 envios por cliente/formulario em 10 minutos.';

REVOKE ALL ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_customer_portal_form(text, text, uuid, jsonb, jsonb)
  TO anon, authenticated, service_role;


-- =====================================================================
-- PASSO 10 -- guardas de instalacao.
-- Se qualquer uma falhar, a migration ABORTA inteira em vez de deixar a
-- feature no ar com o isolamento furado.
-- =====================================================================
DO $guard$
BEGIN
  -- anon nao toca nas tabelas novas (leitura publica so por RPC).
  IF has_table_privilege('anon', 'public.public_form_questions', 'SELECT')
     OR has_table_privilege('anon', 'public.public_form_questions', 'INSERT')
     OR has_table_privilege('anon', 'public.public_form_submissions', 'SELECT')
     OR has_table_privilege('anon', 'public.public_form_submissions', 'INSERT')
  THEN
    RAISE EXCEPTION 'anon com privilegio direto nas tabelas de formulario personalizado';
  END IF;

  -- authenticated NUNCA insere submissao (ip_hash/source seriam falsificaveis).
  IF has_table_privilege('authenticated', 'public.public_form_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated com INSERT em public_form_submissions';
  END IF;

  -- RLS ligada nas duas.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_form_questions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_form_submissions'::regclass)
  THEN
    RAISE EXCEPTION 'RLS desligada em tabela de formulario personalizado';
  END IF;

  -- submit_lead_capture_form segue fechada pro client (so a edge, service_role).
  IF has_function_privilege('anon', 'public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'submit_lead_capture_form exposta a client role';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.submit_lead_capture_form(text, jsonb, boolean, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'submit_lead_capture_form sem EXECUTE pra service_role (edge quebraria)';
  END IF;

  -- Nenhuma sobrecarga de 4 argumentos sobrando (ambiguidade no PostgREST).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'submit_lead_capture_form') <> 1 THEN
    RAISE EXCEPTION 'submit_lead_capture_form com sobrecarga: PostgREST nao consegue escolher a candidata';
  END IF;

  -- Helpers internos nao viraram endpoint publico.
  IF has_function_privilege('anon', 'public.validate_public_form_answers(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sanitize_public_form_fields(jsonb, jsonb, boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'helper interno de formulario exposto a anon';
  END IF;

  RAISE NOTICE '[formularios-personalizados] guardas OK';
END
$guard$;
