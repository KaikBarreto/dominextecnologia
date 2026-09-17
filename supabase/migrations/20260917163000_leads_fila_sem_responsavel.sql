-- ============================================================================
-- Correcao 1 da Onda C do CRM: lead TOTALMENTE ORFAO vira FILA, nao buraco negro
--
-- POR QUE: a policy RESTRICTIVE "Leads visiveis apenas ao responsavel"
-- (20260917150000) esconde de quem nao tem fn:manage_crm todo lead em que a
-- pessoa nao e assigned_to, nem created_by, nem esta em lead_assignees.
-- A edge function crm-lead-webhook insere o lead com assigned_to = NULL E
-- created_by = NULL (roda com service_role, nao ha usuario). Resultado: TODO
-- lead vindo de formulario de captacao / webhook nascia INVISIVEL pro vendedor.
-- Lead novo que ninguem ve e cliente perdido.
--
-- DECISAO DO CEO: lead sem responsavel E sem criador funciona como FILA
-- "sem responsavel", visivel pra empresa inteira. Quem pegar, assume.
--
-- A condicao e AND entre os dois nulos, NUNCA OR:
--   assigned_to NULL + created_by PREENCHIDO  = lead do criador (segue privado)
--   assigned_to NULL + created_by NULL        = fila (todos veem)
-- Trocar por OR vazaria o lead de um vendedor pros colegas.
--
-- ISOLAMENTO ENTRE EMPRESAS: continua sendo a policy PERMISSIVA
-- "Users manage own company leads" (company_id = get_user_company_id(uid))
-- quem garante. Esta policy aqui e RESTRICTIVE: combina com AND, so ESTREITA.
-- A fila, portanto, e a fila DA EMPRESA — nao vaza entre tenants.
--
-- RECURSAO DE RLS: a clausula nova le apenas COLUNAS da propria linha de leads
-- (assigned_to / created_by). Nao introduz nenhuma referencia a outra tabela,
-- logo nao reabre o ciclo leads <-> lead_assignees que as funcoes
-- SECURITY DEFINER (is_lead_assignee / can_access_lead) quebraram.
--
-- DOIS LADOS JUNTOS: a regra vive em dois lugares e eles TEM que concordar —
--   (a) policy RESTRICTIVE de public.leads          (inline, por performance)
--   (b) public.can_access_lead(), usada pela policy de public.lead_assignees
-- Mexeu em um, mexe no outro NA MESMA MIGRATION. Se discordarem, o usuario
-- enxerga o lead da fila mas nao consegue se colocar como responsavel dele
-- (o INSERT em lead_assignees seria barrado) — a fila viraria vitrine.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) can_access_lead — regra completa usada pela policy de lead_assignees
--     CREATE OR REPLACE preserva a ACL da funcao (nao e DROP + CREATE), mas os
--     GRANTs sao reafirmados abaixo pra migration continuar auto-suficiente.
-- ---------------------------------------------------------------------------
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
        -- FILA: sem responsavel E sem criador. AND, nunca OR.
        OR (l.assigned_to IS NULL AND l.created_by IS NULL)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_lead(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_lead(uuid, uuid) IS
  'Regra COMPLETA de visibilidade de um lead (empresa + responsavel/criador/co-responsavel + fila sem dono). Tem que ficar em sincronia com a policy RESTRICTIVE "Leads visiveis apenas ao responsavel" de public.leads.';

-- ---------------------------------------------------------------------------
-- (b) policy RESTRICTIVE de leads
--
-- USING = WITH CHECK (mantido simetrico, como na Onda C). POR QUE:
--   * A alternativa (deixar a clausula de fila fora do WITH CHECK) barraria
--     QUALQUER escrita num lead da fila que nao o reivindicasse no mesmo
--     UPDATE — arrastar o card pra outra etapa, anotar um contato ou corrigir
--     o telefone durante a triagem morreriam com "new row violates row-level
--     security policy", erro opaco pro vendedor.
--   * O que a simetria abre e pequeno e intra-empresa: um usuario pode criar
--     ou devolver pra fila um lead QUE ELE JA ENXERGA. Ele nunca alcanca lead
--     de outro vendedor (o USING o barra antes) nem de outra empresa (a policy
--     permissiva de company_id barra no USING e no WITH CHECK). "Devolver pra
--     fila" e, alias, operacao legitima do fluxo.
-- FOR ALL (nao FOR SELECT) segue igual a Onda C: cobrir so leitura deixaria
-- alterar por id um lead invisivel.
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
    OR (leads.assigned_to IS NULL AND leads.created_by IS NULL)
  )
  WITH CHECK (
    public.user_has_permission((SELECT auth.uid()), 'fn:manage_crm')
    OR leads.assigned_to = (SELECT auth.uid())
    OR leads.created_by  = (SELECT auth.uid())
    OR public.is_lead_assignee(leads.id, (SELECT auth.uid()))
    OR (leads.assigned_to IS NULL AND leads.created_by IS NULL)
  );

-- Indice parcial: a fila e consultada por company_id nos quadros do CRM e, sem
-- ele, a clausula de fila vira filtro pos-scan.
CREATE INDEX IF NOT EXISTS idx_leads_fila_sem_responsavel
  ON public.leads (company_id)
  WHERE assigned_to IS NULL AND created_by IS NULL;
