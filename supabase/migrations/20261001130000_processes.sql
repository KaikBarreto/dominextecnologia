-- =============================================================================
-- processes — Processos (Fluxograma), irmã de org_charts
-- =============================================================================
-- OBJETIVO: tabela de fluxogramas de processo por tenant. Mesma natureza de dado
-- de RH que public.employees / public.org_charts, logo MESMO perfil de acesso:
-- RLS espelhada EXATAMENTE das 3 policies vigentes de public.org_charts.
--
-- MODELO: `data` guarda o grafo do React Flow ({nodes,edges}); `meta` guarda o
-- cabeçalho do processo (objetivo, escopo, gatilho, dono, entradas/saídas,
-- frequência, área, indicadores) como jsonb LIVRE — sem constraint, pra evoluir
-- o cabeçalho sem migration.
--
-- MECANISMO REUTILIZADO:
--   - update_updated_at_column()   (trigger de updated_at, já existente)
--   - ensure_public_short_code()   (trigger genérico de link amigável, já existente)
--   Sem backfill de public_short_code: a tabela nasce vazia.
--
-- ACL: neste banco a DEFAULT ACL concede privilégio a `anon` em TODA tabela nova
-- (ver memória default_acl_concede_anon_em_toda_tabela_nova). Por isso o REVOKE
-- explícito no passo 6 — não é opcional, é a mesma classe de falha que já
-- causou vazamento aqui.
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS, DROP TRIGGER/POLICY IF EXISTS
-- antes de cada CREATE.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — TABELA
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.processes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name              text        NOT NULL,
  data              jsonb       NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  meta              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status            text        NOT NULL DEFAULT 'draft',
  version           integer     NOT NULL DEFAULT 1,
  public_short_code text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processes_status_check CHECK (status IN ('draft', 'published'))
);

COMMENT ON TABLE public.processes IS
  'Fluxogramas de processo por tenant (aba Processos da tela Funcionários). Mesmo perfil de acesso que employees/org_charts.';

COMMENT ON COLUMN public.processes.data IS
  'Grafo do fluxograma no formato React Flow: {"nodes":[...],"edges":[...]}.';

COMMENT ON COLUMN public.processes.meta IS
  'Cabeçalho do processo (objetivo, escopo, gatilho, dono, entradas/saídas, frequência, área, indicadores). jsonb LIVRE, sem constraint — o cabeçalho evolui sem migration.';

COMMENT ON COLUMN public.processes.status IS
  'draft = rascunho (só o tenant vê); published = publicado. CHECK restringe aos dois valores.';

COMMENT ON COLUMN public.processes.version IS
  'Versão do processo, incrementada pela aplicação a cada publicação.';

COMMENT ON COLUMN public.processes.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor via trigger. UNIQUE global. Usado pra montar o link amigável do processo. NÃO digitado pelo usuário.';

-- =====================================================================
-- PASSO 2 — ÍNDICES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_processes_company_id ON public.processes (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS processes_public_short_code_key
  ON public.processes (public_short_code);

-- =====================================================================
-- PASSO 3 — TRIGGER DE updated_at (reutiliza função existente)
-- =====================================================================
DROP TRIGGER IF EXISTS update_processes_updated_at ON public.processes;
CREATE TRIGGER update_processes_updated_at
  BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- PASSO 4 — TRIGGER de public_short_code (função genérica já existente)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.processes;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

-- =====================================================================
-- PASSO 5 — RLS: espelho EXATO das 3 policies VIVAS de public.org_charts
-- =====================================================================
-- As chamadas de função vão embrulhadas em (SELECT ...) de propósito: é o
-- padrão de InitPlan usado em prod (avalia a função 1x por query em vez de
-- 1x por linha). Confere 1:1 com o pg_policies de org_charts.
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

-- 5a. SELECT: qualquer autenticado do mesmo tenant pode ver
DROP POLICY IF EXISTS "Processes visible to own company" ON public.processes;
CREATE POLICY "Processes visible to own company"
  ON public.processes
  FOR SELECT
  TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())));

-- 5b. ALL (gestores): apenas quem tem can_manage_system pode modificar;
--     WITH CHECK garante que company_id inserido/atualizado pertence ao tenant correto.
DROP POLICY IF EXISTS "Managers can manage own company processes" ON public.processes;
CREATE POLICY "Managers can manage own company processes"
  ON public.processes
  FOR ALL
  TO authenticated
  USING (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    AND can_manage_system(auth.uid())
  )
  WITH CHECK (company_id = (SELECT get_user_company_id(auth.uid())));

-- 5c. ALL (super_admin): acesso irrestrito para operação de plataforma;
--     WITH CHECK também força company_id correto para escrita normal.
DROP POLICY IF EXISTS "Users manage own company processes" ON public.processes;
CREATE POLICY "Users manage own company processes"
  ON public.processes
  FOR ALL
  TO authenticated
  USING (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    OR (SELECT is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    OR (SELECT is_super_admin(auth.uid()))
  );

-- =====================================================================
-- PASSO 6 — ACL explícita: anon NÃO toca nesta tabela
-- =====================================================================
-- A DEFAULT ACL deste banco concede privilégio a `anon` em toda tabela nova.
-- REVOKE explícito + GRANT só pra authenticated/service_role.
REVOKE ALL ON public.processes FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.processes TO authenticated;
GRANT ALL ON public.processes TO service_role;
