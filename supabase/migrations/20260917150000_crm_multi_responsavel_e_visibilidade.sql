-- ============================================================================
-- Onda C do overhaul do CRM (plano 2026-09-17-crm-overhaul.md)
--
-- POR QUE: o CEO pediu (1) mais de um vendedor responsavel por oportunidade e
-- (2) que cada vendedor veja apenas as oportunidades em que ele e responsavel,
-- a menos que tenha a permissao "Gerenciar CRM" (fn:manage_crm).
--
-- O QUE ENTRA:
--   1. public.user_has_permission(_user_id, _key) -> espelho LITERAL da regra
--      de hasPermission() do src/contexts/AuthContext.tsx. Nao existia nenhuma
--      funcao de permissao no banco (so is_admin_or_gestor / can_manage_system).
--   2. public.lead_assignees -> multi-responsavel. leads.assigned_to CONTINUA
--      sendo a fonte do responsavel principal (filtros, relatorios e comissao
--      SDR/Closer leem de la); triggers bidirecionais mantem o espelho.
--   3. Policy RESTRICTIVE de visibilidade em leads. RESTRICTIVE (AND) e nao
--      permissiva (OR) porque policy permissiva ALARGA o acesso em vez de
--      estreitar. FOR ALL e nao FOR SELECT: cobrir so leitura deixaria um
--      vendedor alterar por id um lead que ele nao enxerga.
--
-- RECURSAO DE RLS (armadilha tratada): a policy de leads precisa consultar
-- lead_assignees e a policy de lead_assignees precisa consultar leads. Um EXISTS
-- direto nos dois lados faz o Postgres abortar com "infinite recursion detected
-- in policy for relation". Por isso os dois lados passam por funcao
-- SECURITY DEFINER (is_lead_assignee / can_access_lead), que roda sem RLS e
-- quebra o ciclo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_has_permission — espelho da regra do client
-- ---------------------------------------------------------------------------
-- AuthContext.hasPermission(key):
--   1. role admin ou super_admin                 -> true
--   2. POSSUI linha em user_permissions          -> is_active AND ('*' OU key)
--      (linha inativa = hasPermissionRecord true + permissions [] = sem acesso)
--   3. NAO possui linha (legado)                 -> roles.length > 0
-- O passo 3 e o que impede esta onda de trancar a base inteira: empresa cujos
-- usuarios nunca receberam permissionamento explicito continua vendo tudo.
-- NAO "melhorar" essa regra: divergir do client faz banco e tela mostrarem
-- coisas diferentes.
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('admin'::app_role, 'super_admin'::app_role)
    ) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.user_permissions up WHERE up.user_id = _user_id
    ) THEN COALESCE((
      SELECT up.is_active AND (up.permissions ? '*' OR up.permissions ? _key)
      FROM public.user_permissions up
      WHERE up.user_id = _user_id
      LIMIT 1
    ), false)
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.user_has_permission(uuid, text) IS
  'Espelho literal de hasPermission() do AuthContext: admin/super_admin => true; com registro em user_permissions => is_active AND (''*'' ou a chave); sem registro (legado) => qualquer role libera.';

-- ---------------------------------------------------------------------------
-- 2. lead_assignees — multi-responsavel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_assignees (
  lead_id     uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  is_primary  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

-- A policy restritiva de leads consulta por usuario; aqui o indice se paga.
CREATE INDEX IF NOT EXISTS idx_lead_assignees_user_id
  ON public.lead_assignees (user_id);

-- No maximo UM principal por lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_assignees_one_primary
  ON public.lead_assignees (lead_id)
  WHERE is_primary;

COMMENT ON TABLE public.lead_assignees IS
  'Responsaveis de uma oportunidade. leads.assigned_to permanece como espelho do principal (is_primary), mantido por trigger nas duas direcoes.';

-- Tabela nova em public nasce com GRANT pra anon pelo default ACL do projeto.
REVOKE ALL ON public.lead_assignees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignees TO authenticated;
GRANT ALL ON public.lead_assignees TO service_role;

-- ---------------------------------------------------------------------------
-- 2b. Funcoes SECURITY DEFINER que quebram o ciclo de RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_lead_assignee(_lead_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = _lead_id AND la.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_lead_assignee(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lead_assignee(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_lead_assignee(uuid, uuid) TO authenticated, service_role;

-- Regra COMPLETA de visibilidade de um lead, usada pela policy de
-- lead_assignees (a linha de responsavel so existe pra quem enxerga o lead).
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        l.company_id = public.get_user_company_id(_user_id)
        OR public.is_super_admin(_user_id)
      )
      AND (
        public.user_has_permission(_user_id, 'fn:manage_crm')
        OR l.assigned_to = _user_id
        OR l.created_by  = _user_id
        OR EXISTS (
          SELECT 1 FROM public.lead_assignees la
          WHERE la.lead_id = l.id AND la.user_id = _user_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2c. RLS de lead_assignees — herda o acesso do lead correspondente
-- ---------------------------------------------------------------------------
ALTER TABLE public.lead_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_lead_assignees" ON public.lead_assignees;
CREATE POLICY "service_role_full_access_lead_assignees"
  ON public.lead_assignees FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users manage lead_assignees of accessible leads" ON public.lead_assignees;
CREATE POLICY "Users manage lead_assignees of accessible leads"
  ON public.lead_assignees FOR ALL TO authenticated
  USING      (public.can_access_lead(lead_id, (SELECT auth.uid())))
  WITH CHECK (public.can_access_lead(lead_id, (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 2d. Backfill — todo assigned_to vira principal em lead_assignees
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.lead_assignees (lead_id, user_id, is_primary)
  SELECT l.id, l.assigned_to, true
  FROM public.leads l
  WHERE l.assigned_to IS NOT NULL
  ON CONFLICT (lead_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'lead_assignees backfill: % linha(s) inserida(s)', v_rows;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- 2e. Espelho bidirecional leads.assigned_to <-> lead_assignees.is_primary
--
-- DIRECAO: os DOIS lados, com guarda transacional (app.lead_assignee_sync) pra
-- nao recursar. Razao: o app hoje escreve leads.assigned_to (useLeads) e a UI
-- nova vai escrever lead_assignees; se so um lado propagasse, o outro passaria a
-- mentir na primeira escrita pelo caminho nao coberto. leads.assigned_to
-- continua sendo a FONTE CANONICA do principal.
--
-- Assimetria proposital:
--   - escrita em leads.assigned_to (modelo legado, 1 responsavel) REMOVE o
--     principal anterior: trocar o responsavel tira o acesso do antigo.
--   - escrita em lead_assignees (gestao explicita da lista) apenas REBAIXA o
--     principal anterior a co-responsavel: quem mexe na lista decide remover.
-- ---------------------------------------------------------------------------

-- (i) BEFORE em lead_assignees: garante um unico principal ANTES do indice
--     unico parcial ser checado (o indice e non-deferrable; rebaixar num
--     AFTER trigger chegaria tarde demais e daria unique_violation).
CREATE OR REPLACE FUNCTION public.lead_assignees_enforce_single_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guard text := COALESCE(current_setting('app.lead_assignee_sync', true), 'off');
BEGIN
  IF NEW.is_primary THEN
    -- Guarda durante o rebaixamento: sem isso o AFTER trigger da linha
    -- rebaixada zeraria leads.assigned_to no meio da troca de principal.
    PERFORM set_config('app.lead_assignee_sync', 'on', true);
    UPDATE public.lead_assignees
       SET is_primary = false
     WHERE lead_id = NEW.lead_id
       AND user_id <> NEW.user_id
       AND is_primary;
    PERFORM set_config('app.lead_assignee_sync', v_guard, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_assignees_single_primary ON public.lead_assignees;
CREATE TRIGGER trg_lead_assignees_single_primary
  BEFORE INSERT OR UPDATE OF is_primary, user_id ON public.lead_assignees
  FOR EACH ROW EXECUTE FUNCTION public.lead_assignees_enforce_single_primary();

-- (ii) AFTER em lead_assignees -> espelha o principal em leads.assigned_to
CREATE OR REPLACE FUNCTION public.lead_assignees_sync_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.lead_assignee_sync', true), 'off') = 'on' THEN
    RETURN NULL; -- veio do trigger de leads; nao volta
  END IF;

  PERFORM set_config('app.lead_assignee_sync', 'on', true);

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary THEN
      UPDATE public.leads SET assigned_to = NULL
       WHERE id = OLD.lead_id AND assigned_to = OLD.user_id;
    END IF;
  ELSIF NEW.is_primary THEN
    UPDATE public.leads SET assigned_to = NEW.user_id
     WHERE id = NEW.lead_id AND assigned_to IS DISTINCT FROM NEW.user_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_primary AND NOT NEW.is_primary THEN
    UPDATE public.leads SET assigned_to = NULL
     WHERE id = NEW.lead_id AND assigned_to = OLD.user_id;
  END IF;

  PERFORM set_config('app.lead_assignee_sync', 'off', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_assignees_sync_to_lead ON public.lead_assignees;
CREATE TRIGGER trg_lead_assignees_sync_to_lead
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_assignees
  FOR EACH ROW EXECUTE FUNCTION public.lead_assignees_sync_to_lead();

-- (iii) AFTER em leads.assigned_to -> espelha em lead_assignees
CREATE OR REPLACE FUNCTION public.leads_sync_primary_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.lead_assignee_sync', true), 'off') = 'on' THEN
    RETURN NULL; -- veio do trigger de lead_assignees; nao volta
  END IF;

  PERFORM set_config('app.lead_assignee_sync', 'on', true);

  -- Trocar/limpar o responsavel principal pelo caminho legado tira o antigo.
  DELETE FROM public.lead_assignees
   WHERE lead_id = NEW.id
     AND is_primary
     AND user_id IS DISTINCT FROM NEW.assigned_to;

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.lead_assignees (lead_id, user_id, is_primary)
    VALUES (NEW.id, NEW.assigned_to, true)
    ON CONFLICT (lead_id, user_id) DO UPDATE SET is_primary = true;
  END IF;

  PERFORM set_config('app.lead_assignee_sync', 'off', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_sync_primary_assignee ON public.leads;
CREATE TRIGGER trg_leads_sync_primary_assignee
  AFTER INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_sync_primary_assignee();

-- ---------------------------------------------------------------------------
-- 3. Visibilidade em leads — policy RESTRICTIVE (combina com AND)
--
-- A policy permissiva existente ("Users manage own company leads") continua
-- valendo e continua sendo quem garante o isolamento por company_id. Esta aqui
-- so ESTREITA: quem nao tem fn:manage_crm ve apenas o que e dele.
-- created_by entra na regra porque useLeads.createLead sempre preenche
-- created_by = auth.uid(); sem isso, o WITH CHECK barraria a criacao de
-- oportunidade por quem nao tem fn:manage_crm.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Leads visiveis apenas ao responsavel" ON public.leads;
CREATE POLICY "Leads visiveis apenas ao responsavel"
  ON public.leads
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.user_has_permission((SELECT auth.uid()), 'fn:manage_crm')
    OR leads.assigned_to = (SELECT auth.uid())
    OR leads.created_by  = (SELECT auth.uid())
    OR public.is_lead_assignee(leads.id, (SELECT auth.uid()))
  )
  WITH CHECK (
    public.user_has_permission((SELECT auth.uid()), 'fn:manage_crm')
    OR leads.assigned_to = (SELECT auth.uid())
    OR leads.created_by  = (SELECT auth.uid())
    OR public.is_lead_assignee(leads.id, (SELECT auth.uid()))
  );
