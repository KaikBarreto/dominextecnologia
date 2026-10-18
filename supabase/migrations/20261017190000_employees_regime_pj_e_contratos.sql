-- =============================================================================
-- Regime PJ/MEI em public.employees + public.employee_contracts
-- Plano: docs/planos/2026-10-17-pj-mei-funcionarios.md  (aprovado pelo CEO)
-- =============================================================================
-- POR QUE: o RH hoje só conhece dois regimes ('informal','clt'). Quase toda
-- empresa do ICP tem técnicos PJ/MEI, que hoje entram como "Informal" e herdam
-- ficha de CLT (ponto, VT, dependentes). Esta migration abre o terceiro regime
-- e cria a tabela de contrato de prestação de serviço com HISTÓRICO
-- (renovar = nova linha; a antiga continua lá, por isso tabela e não coluna
-- na ficha — coluna apagaria o histórico a cada reajuste).
--
-- ADITIVO POR DESIGN: 'informal' e 'clt' NÃO são renomeados nem removidos.
-- Nenhuma linha existente muda (46 employees em prod, todos informal/clt).
-- Sem backfill.
--
-- FORA DE ESCOPO (não tocado aqui): employee_movements, financial_transactions,
-- time_records / ponto eletrônico. Nenhuma RPC nova — o CRUD de contrato vai
-- por supabase.from(...) no hook do front, protegido por RLS.
--
-- MECANISMO REUTILIZADO: update_updated_at_column() (trigger de updated_at já
-- existente no banco; nenhuma função nova foi criada).
--
-- ACL: a DEFAULT ACL deste banco concede privilégio a `anon` em TODA tabela
-- nova (ver processes/20261001130000). Por isso o REVOKE explícito do passo 7 —
-- não é opcional. Contrato de PJ nunca aparece em superfície pública.
--
-- IDEMPOTENTE: ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT EXISTS,
-- DROP CONSTRAINT/TRIGGER/POLICY IF EXISTS antes de cada CREATE. Rodar 2x não
-- quebra.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — TERCEIRO REGIME (aditivo): 'informal' | 'clt' | 'pj'
-- =====================================================================
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employment_regime_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_employment_regime_check
  CHECK (employment_regime IN ('informal', 'clt', 'pj'));

COMMENT ON COLUMN public.employees.employment_regime IS
  'Regime de contratação: informal | clt | pj. "pj" cobre PJ e MEI (MEI é sinalizado por pj_is_mei) e NÃO usa folha, encargos nem ponto eletrônico.';

-- =====================================================================
-- PASSO 2 — COLUNAS PJ NA FICHA (nullable / default não destrutivo)
-- =====================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pj_cnpj       text,
  ADD COLUMN IF NOT EXISTS pj_legal_name text,
  ADD COLUMN IF NOT EXISTS pj_is_mei     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.pj_cnpj IS
  'CNPJ do prestador PJ/MEI. Guardado como digitado/normalizado pelo front; validação de dígito é no client. Só faz sentido quando employment_regime = ''pj''.';

COMMENT ON COLUMN public.employees.pj_legal_name IS
  'Razão social do prestador PJ/MEI (o nome fantasia/pessoal continua em employees.name).';

COMMENT ON COLUMN public.employees.pj_is_mei IS
  'true = o prestador é MEI (muda só rótulo/recibo; nenhum cálculo fiscal é feito aqui). false para PJ comum e para quem não é pj.';

-- =====================================================================
-- PASSO 3 — TABELA DE CONTRATO DE PRESTAÇÃO DE SERVIÇO (com histórico)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES public.companies(id)  ON DELETE RESTRICT,
  employee_id          uuid        NOT NULL REFERENCES public.employees(id)  ON DELETE CASCADE,
  start_date           date        NOT NULL,
  end_date             date,
  billing_type         text        NOT NULL,
  amount               numeric     NOT NULL DEFAULT 0,
  payment_day          int,
  readjustment_percent numeric,
  status               text        NOT NULL DEFAULT 'active',
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_contracts_billing_type_check
    CHECK (billing_type IN ('monthly', 'per_order', 'hourly', 'daily')),
  CONSTRAINT employee_contracts_status_check
    CHECK (status IN ('active', 'ended')),
  CONSTRAINT employee_contracts_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT employee_contracts_payment_day_check
    CHECK (payment_day IS NULL OR (payment_day >= 1 AND payment_day <= 31))
);

COMMENT ON TABLE public.employee_contracts IS
  'Contrato de prestação de serviço do funcionário PJ/MEI (aba PJ do RH). HISTÓRICO: renovar = INSERT de nova linha e a anterior vira status=ended; nada é sobrescrito. Mesmo perfil de acesso de public.employees.';

COMMENT ON COLUMN public.employee_contracts.end_date IS
  'Fim da vigência. NULL = prazo indeterminado. O cálculo de "vence em N dias" é no client; vigência é mês CALENDÁRIO (regra-lei 17), nunca 30 dias.';

COMMENT ON COLUMN public.employee_contracts.billing_type IS
  'Como o prestador cobra: monthly (mensal fixo) | per_order (por OS) | hourly (por hora) | daily (por diária).';

COMMENT ON COLUMN public.employee_contracts.amount IS
  'Valor combinado na unidade do billing_type (mensal, por OS, por hora ou por diária). Sem imposto/encargo — PJ não tem folha.';

COMMENT ON COLUMN public.employee_contracts.payment_day IS
  'Dia do mês combinado para pagamento (1..31). NULL = sem dia fixo.';

COMMENT ON COLUMN public.employee_contracts.readjustment_percent IS
  'Reajuste anual acordado, em %. Informativo nesta entrega — nenhum reajuste é aplicado automaticamente pelo banco.';

COMMENT ON COLUMN public.employee_contracts.status IS
  'active = contrato vigente; ended = encerrado/substituído. Encerrar é mudança de status, NUNCA DELETE (preserva histórico).';

-- =====================================================================
-- PASSO 4 — ÍNDICE de acesso (lista da aba PJ e contrato vigente do funcionário)
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_employee_status
  ON public.employee_contracts (company_id, employee_id, status);

-- =====================================================================
-- PASSO 5 — TRIGGER de updated_at (reutiliza função existente)
-- =====================================================================
DROP TRIGGER IF EXISTS update_employee_contracts_updated_at ON public.employee_contracts;
CREATE TRIGGER update_employee_contracts_updated_at
  BEFORE UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- PASSO 6 — RLS: espelho das policies de tenant de public.employees
-- =====================================================================
-- get_user_company_id(auth.uid()) vai embrulhado em (SELECT ...) de propósito:
-- é o padrão de InitPlan vigente em prod (avalia 1x por query, não 1x por
-- linha) e confere 1:1 com o pg_policies de employees.
-- can_manage_system(auth.uid()) fica SEM embrulho, igual ao vivo em employees.
ALTER TABLE public.employee_contracts ENABLE ROW LEVEL SECURITY;

-- 6a. SELECT: qualquer autenticado do mesmo tenant pode ver
DROP POLICY IF EXISTS "Employee contracts visible to own company" ON public.employee_contracts;
CREATE POLICY "Employee contracts visible to own company"
  ON public.employee_contracts
  FOR SELECT
  TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())));

-- 6b. ALL (gestores): só quem tem can_manage_system escreve;
--     WITH CHECK garante que o company_id gravado é o do próprio tenant.
DROP POLICY IF EXISTS "Managers can manage own company employee contracts" ON public.employee_contracts;
CREATE POLICY "Managers can manage own company employee contracts"
  ON public.employee_contracts
  FOR ALL
  TO authenticated
  USING (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    AND can_manage_system(auth.uid())
  )
  WITH CHECK (company_id = (SELECT get_user_company_id(auth.uid())));

-- `anon` = ZERO policies, de propósito. Contrato de PJ não tem superfície pública.

-- =====================================================================
-- PASSO 7 — ACL explícita: anon NÃO toca nesta tabela
-- =====================================================================
REVOKE ALL ON public.employee_contracts FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_contracts TO authenticated;
GRANT ALL ON public.employee_contracts TO service_role;
