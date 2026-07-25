-- =============================================================================
-- Perfil Comportamental (DISC) — camada de dados
-- Plano: docs/planos/2026-07-24-perfil-comportamental-disc.md
-- =============================================================================
-- O QUE ENTREGA:
--   1. Tabela public.disc_assessments (uma linha por aplicacao = historico).
--   2. Coluna company_settings.disc_show_result_to_employee (visibilidade RH).
--   3. RLS: membros da empresa (isolado por company_id); anon SEM policy.
--   4. RPCs SECURITY DEFINER (fronteira anonima, allowlist rigida):
--      - get_disc_public(p_code text)      -> leitura do link publico
--      - submit_disc_assessment(...)        -> gravacao do resultado (anti-duplo)
--
-- REGRAS-LEI RESPEITADAS:
--   - RLS e seguranca; anon so via RPC SECURITY DEFINER com allowlist explicita.
--     get_disc_public NUNCA expoe salario/CPF/email/telefone nem outro tenant.
--   - short_code segue o padrao do projeto (generate_public_short_code, 12 chars,
--     UNIQUE global proposital: link anonimo precisa resolver 1 registro no banco).
--   - pgcrypto vive em `extensions` -> SET search_path = public, extensions nas
--     funcoes que geram bytes aleatorios (aqui via generate_public_short_code).
--   - Helper de tenant: get_user_company_id(_user_id uuid) (assinatura real).
--   - Permissao de escrita espelha a de Funcionarios: company_id do usuario
--     + can_manage_system(auth.uid()) (mesma regra da policy
--     "Managers can manage own company employees").
--   - Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — Coluna de visibilidade em company_settings (lado tenant).
-- POR QUE company_settings: e uma PREFERENCIA do tenant (RH decide se o
-- funcionario ve o proprio resultado). O trigger sync_company_settings_to_companies
-- espelha SO campos de identidade (name/cnpj/address/segment...) para companies;
-- nao toca colunas arbitrarias -> esta coluna nao e sincronizada nem clobbered.
-- =====================================================================
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS disc_show_result_to_employee boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_settings.disc_show_result_to_employee IS
  'Perfil Comportamental (DISC): quando true, o funcionario ve o proprio relatorio ao terminar o teste; quando false, ve so a tela de agradecimento. Preferencia do tenant (RH). Nao sincronizada com companies.';

-- =====================================================================
-- PASSO 2 — Tabela disc_assessments (uma linha por aplicacao = historico).
-- public_short_code nullable na definicao: o trigger padrao do projeto
-- (ensure_public_short_code) preenche BEFORE INSERT quando NULL. UNIQUE
-- ignora NULLs; UNIQUE global e proposital (resolucao anonima por codigo).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.disc_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  employee_id       uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  public_short_code text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  answers           jsonb,
  scores            jsonb,
  primary_type      char(1),
  secondary_type    char(1),
  profile_code      text,
  locale            text,
  completed_at      timestamptz,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disc_assessments_status_check
    CHECK (status IN ('pending', 'completed'))
);

COMMENT ON TABLE public.disc_assessments IS
  'Perfil Comportamental (DISC): uma linha por aplicacao (historico natural). O "perfil atual" de um funcionario e a linha completed mais recente do employee_id. Acesso anonimo (link publico) SO via get_disc_public/submit_disc_assessment (SECURITY DEFINER).';

-- Indices ------------------------------------------------------------------
-- UNIQUE global no short_code (mesma regra dos demais links amigaveis).
CREATE UNIQUE INDEX IF NOT EXISTS disc_assessments_public_short_code_key
  ON public.disc_assessments (public_short_code);
-- Perfil atual: ultima aplicacao completa daquele funcionario.
CREATE INDEX IF NOT EXISTS idx_disc_assessments_employee_completed
  ON public.disc_assessments (employee_id, completed_at DESC);
-- Isolamento/listagem por tenant.
CREATE INDEX IF NOT EXISTS idx_disc_assessments_company
  ON public.disc_assessments (company_id);

-- Trigger de short_code: reusa a funcao generica do projeto
-- (ensure_public_short_code, ver 20260620200000). BEFORE INSERT OR UPDATE,
-- estavel (nunca regenera). DROP antes do CREATE (idempotente).
DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.disc_assessments;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.disc_assessments
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

-- =====================================================================
-- PASSO 3 — RLS.
-- Membros da empresa: SELECT/INSERT/UPDATE/DELETE isolado por company_id,
-- com a MESMA permissao que gate-ia a gestao de Funcionarios
-- (can_manage_system, espelhando "Managers can manage own company employees").
-- Anon: NENHUMA policy (acesso so via RPC SECURITY DEFINER).
-- service_role: full access (edges/backoffice), padrao do projeto.
-- =====================================================================
ALTER TABLE public.disc_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_disc_assessments" ON public.disc_assessments;
CREATE POLICY "service_role_full_access_disc_assessments"
  ON public.disc_assessments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Leitura: qualquer membro da empresa dona (espelha "Employees visible to own company").
DROP POLICY IF EXISTS "DISC visible to own company" ON public.disc_assessments;
CREATE POLICY "DISC visible to own company"
  ON public.disc_assessments FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Escrita (INSERT/UPDATE/DELETE): membro da empresa + permissao de gestao
-- (espelha "Managers can manage own company employees").
DROP POLICY IF EXISTS "Managers can manage own company DISC" ON public.disc_assessments;
CREATE POLICY "Managers can manage own company DISC"
  ON public.disc_assessments FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

-- Super admin (backoffice Auctus): via has_role, nunca policy aberta.
DROP POLICY IF EXISTS "Super admins manage all DISC" ON public.disc_assessments;
CREATE POLICY "Super admins manage all DISC"
  ON public.disc_assessments FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)));

-- =====================================================================
-- PASSO 4 — RPC get_disc_public(p_code text) — leitura do link publico.
-- STABLE SECURITY DEFINER, search_path seguro. Allowlist RIGIDA:
-- NUNCA to_jsonb(employees.*) — so 1o nome do funcionario + branding + status.
-- Dados do perfil (scores/profile) so quando completed E visivel ao funcionario.
-- Codigo inexistente -> NULL (nao vaza que existe/nao existe alem disso).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_disc_public(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row      public.disc_assessments%ROWTYPE;
  v_emp_name text;
  v_cs       record;
  v_show     boolean;
  v_result   jsonb;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.disc_assessments
  WHERE public_short_code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nome do funcionario: SO o primeiro nome (privacidade).
  SELECT split_part(e.name, ' ', 1) INTO v_emp_name
  FROM public.employees e
  WHERE e.id = v_row.employee_id;

  -- Branding do tenant (white-label). Cor/logo: se white-label ligado usa os
  -- campos white_label_*, senao o logo padrao + verde da marca (#00C597).
  SELECT
    cs.name AS company_name,
    CASE WHEN cs.white_label_enabled AND NULLIF(btrim(cs.white_label_logo_url), '') IS NOT NULL
         THEN cs.white_label_logo_url ELSE cs.logo_url END AS logo_url,
    COALESCE(
      CASE WHEN cs.white_label_enabled THEN NULLIF(btrim(cs.white_label_primary_color), '') END,
      '#00C597'
    ) AS primary_color,
    cs.disc_show_result_to_employee AS show_result
  INTO v_cs
  FROM public.company_settings cs
  WHERE cs.company_id = v_row.company_id;

  v_show := COALESCE(v_cs.show_result, true);

  v_result := jsonb_build_object(
    'company_name',            v_cs.company_name,
    'logo_url',                v_cs.logo_url,
    'primary_color',           v_cs.primary_color,
    'employee_first_name',     v_emp_name,
    'status',                  v_row.status,
    'show_result_to_employee', v_show
  );

  -- Dados do perfil so quando completo E o RH permite o funcionario ver.
  IF v_row.status = 'completed' AND v_show = true THEN
    v_result := v_result || jsonb_build_object(
      'scores',         v_row.scores,
      'profile_code',   v_row.profile_code,
      'primary_type',   v_row.primary_type,
      'secondary_type', v_row.secondary_type,
      'completed_at',   v_row.completed_at,
      'locale',         v_row.locale
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_disc_public(text) IS
  'Payload publico do teste DISC (link /avaliacao/:token). SECURITY DEFINER: recebe so o short_code. Allowlist rigida — expoe branding + 1o nome + status; scores/profile so quando completed E visivel ao funcionario. NUNCA vaza salario/CPF/email/telefone nem outro tenant.';

GRANT EXECUTE ON FUNCTION public.get_disc_public(text) TO anon, authenticated;

-- =====================================================================
-- PASSO 5 — RPC submit_disc_assessment(...) — gravacao do resultado.
-- VOLATILE SECURITY DEFINER, search_path seguro. Anti-duplo-envio:
-- se ja completed, NAO regrava (retorna already=true). Allowlist: grava so
-- answers/scores/primary/secondary/profile_code/locale + status/completed_at;
-- ignora qualquer chave extra de p_profile.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_disc_assessment(
  p_code    text,
  p_answers jsonb,
  p_scores  jsonb,
  p_profile jsonb,
  p_locale  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row       public.disc_assessments%ROWTYPE;
  v_show      boolean;
  v_primary   char(1);
  v_secondary char(1);
  v_profile   text;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT * INTO v_row
  FROM public.disc_assessments
  WHERE public_short_code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Visibilidade configurada pelo RH (decide relatorio vs "obrigado").
  SELECT COALESCE(cs.disc_show_result_to_employee, true) INTO v_show
  FROM public.company_settings cs
  WHERE cs.company_id = v_row.company_id;
  v_show := COALESCE(v_show, true);

  -- Anti-duplo-envio: ja respondido -> nao regrava.
  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'already',                 true,
      'show_result_to_employee', v_show,
      'scores',                  v_row.scores,
      'profile_code',            v_row.profile_code,
      'primary_type',            v_row.primary_type,
      'secondary_type',          v_row.secondary_type
    );
  END IF;

  -- Allowlist de p_profile: so extrai primary/secondary/profile_code.
  v_primary   := NULLIF(btrim(p_profile->>'primary'), '');
  v_secondary := NULLIF(btrim(p_profile->>'secondary'), '');
  v_profile   := NULLIF(btrim(p_profile->>'profile_code'), '');

  UPDATE public.disc_assessments
  SET answers        = p_answers,
      scores         = p_scores,
      primary_type   = v_primary,
      secondary_type = v_secondary,
      profile_code   = v_profile,
      locale         = NULLIF(btrim(p_locale), ''),
      status         = 'completed',
      completed_at   = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'show_result_to_employee', v_show,
    'scores',                  p_scores,
    'profile_code',            v_profile,
    'primary_type',            v_primary,
    'secondary_type',          v_secondary
  );
END;
$$;

COMMENT ON FUNCTION public.submit_disc_assessment(text, jsonb, jsonb, jsonb, text) IS
  'Grava o resultado do teste DISC pelo short_code (link publico anonimo). SECURITY DEFINER. Anti-duplo-envio: se ja completed, nao regrava (retorna already=true). Allowlist: grava so answers/scores/primary/secondary/profile_code/locale; ignora chaves extras de p_profile.';

GRANT EXECUTE ON FUNCTION public.submit_disc_assessment(text, jsonb, jsonb, jsonb, text)
  TO anon, authenticated;
