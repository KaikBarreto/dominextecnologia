-- =============================================================================
-- PMOC v1.9.0 — Onda A: Fundação Contrato PMOC
-- =============================================================================
-- Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md
-- Plano da onda: docs/planos/2026-05-23-pmoc-onda-A-fundacao.md
-- Regras de RLS (VINCULANTE): docs/planos/2026-05-23-pmoc-rls-rules.md
--
-- Escopo desta migration:
--   1. Tabela responsible_technicians (+ RLS, triggers, índice)
--   2. Colunas em contracts: is_pmoc, responsible_technician_id,
--      pmoc_legal_compliance_text, next_pmoc_generation_date (+ índices)
--   3. Trigger enforce_rt_same_company em contracts (anti-cross-tenant)
--   4. Índice idx_so_contract_status_date em service_orders
--   5. View contract_health_status com security_invoker = true
--   6. Bucket storage responsible-technicians-media (+ policies)
--   7. Migração de dados: pmoc_plans → contracts, pmoc_items → contract_items,
--      service_orders.contract_id, service_orders.origin
--   8. Revoke INSERT/UPDATE/DELETE em pmoc_plans e pmoc_items (somente leitura)
--   9. Drop de pmoc_contracts (legada, sem hooks/componentes vivos)
--
-- Toda a migration é UMA transação (BEGIN/COMMIT no final). Se algo falhar,
-- ROLLBACK automático devolve o banco ao estado anterior.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabela responsible_technicians
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.responsible_technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cft_crea text,
  modality text,
  registry_number text,
  signature_image_url text,
  stamp_image_url text,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.responsible_technicians IS
  'Responsável Técnico (RT) do PMOC. Papel regulatório com CFT/CREA, ART/TRT, assinatura/carimbo. '
  'Separado de team_members porque RT tem trilha regulatória (assina documentos). Multi-tenant scoped por company_id.';

COMMENT ON COLUMN public.responsible_technicians.cft_crea IS
  'Ex.: "CREA-SP 1234567". Texto livre — formato varia por estado/conselho.';

COMMENT ON COLUMN public.responsible_technicians.signature_image_url IS
  'Path no storage bucket responsible-technicians-media. Convenção: {company_id}/{rt_id}/signature-{ts}.{ext}';

COMMENT ON COLUMN public.responsible_technicians.stamp_image_url IS
  'Path no storage bucket responsible-technicians-media. Convenção: {company_id}/{rt_id}/stamp-{ts}.{ext}';

CREATE INDEX IF NOT EXISTS idx_rt_company
  ON public.responsible_technicians(company_id)
  WHERE is_active = true;

-- Trigger updated_at (reutiliza helper já existente)
DROP TRIGGER IF EXISTS update_responsible_technicians_updated_at ON public.responsible_technicians;
CREATE TRIGGER update_responsible_technicians_updated_at
  BEFORE UPDATE ON public.responsible_technicians
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger created_by automático (não confia em payload do client)
CREATE OR REPLACE FUNCTION public.set_rt_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rt_set_created_by ON public.responsible_technicians;
CREATE TRIGGER trg_rt_set_created_by
  BEFORE INSERT ON public.responsible_technicians
  FOR EACH ROW
  EXECUTE FUNCTION public.set_rt_created_by();

-- Trigger anti-tenant-jump: bloqueia UPDATE de company_id
CREATE OR REPLACE FUNCTION public.prevent_rt_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'company_id é imutável após criação do Responsável Técnico'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rt_prevent_company_change ON public.responsible_technicians;
CREATE TRIGGER trg_rt_prevent_company_change
  BEFORE UPDATE OF company_id ON public.responsible_technicians
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_rt_company_change();

-- RLS
ALTER TABLE public.responsible_technicians ENABLE ROW LEVEL SECURITY;

-- service_role full access (padrão do projeto pra integrações server-side / cron / edge functions).
-- service_role já bypassa RLS por design no Supabase, mas a policy explícita deixa o intent claro
-- e é o padrão usado em outras tabelas (ex: financial_transaction_attachments).
DROP POLICY IF EXISTS "service_role_full_access_responsible_technicians" ON public.responsible_technicians;
CREATE POLICY "service_role_full_access_responsible_technicians"
  ON public.responsible_technicians FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view RTs of own company" ON public.responsible_technicians;
CREATE POLICY "Users can view RTs of own company"
  ON public.responsible_technicians FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin/gestor can insert RTs" ON public.responsible_technicians;
CREATE POLICY "Admin/gestor can insert RTs"
  ON public.responsible_technicians FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin/gestor can update RTs" ON public.responsible_technicians;
CREATE POLICY "Admin/gestor can update RTs"
  ON public.responsible_technicians FOR UPDATE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin can delete RTs" ON public.responsible_technicians;
CREATE POLICY "Admin can delete RTs"
  ON public.responsible_technicians FOR DELETE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- -----------------------------------------------------------------------------
-- 2. Colunas novas em contracts
-- -----------------------------------------------------------------------------

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS is_pmoc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsible_technician_id uuid REFERENCES public.responsible_technicians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pmoc_legal_compliance_text text DEFAULT 'Conforme Lei Federal 13.589/2018',
  ADD COLUMN IF NOT EXISTS next_pmoc_generation_date date;

COMMENT ON COLUMN public.contracts.is_pmoc IS
  'Marca o contrato como PMOC (Plano de Manutenção, Operação e Controle — Lei 13.589/2018). '
  'Quando true, exige responsible_technician_id e next_pmoc_generation_date para o cron de geração.';

COMMENT ON COLUMN public.contracts.next_pmoc_generation_date IS
  'Sucessor de pmoc_plans.next_generation_date. Usado pela edge function generate-pmoc-orders. '
  'Atualizado automaticamente pela edge a cada ciclo (+= frequency_value months).';

CREATE INDEX IF NOT EXISTS idx_contracts_pmoc_active
  ON public.contracts(company_id, is_pmoc, status)
  WHERE is_pmoc = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_contracts_pmoc_next_gen
  ON public.contracts(next_pmoc_generation_date)
  WHERE is_pmoc = true AND status = 'active' AND next_pmoc_generation_date IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Trigger enforce_rt_same_company (RLS rules §2.2)
--    Bloqueia vínculo cross-tenant de RT em contracts.
--    SECURITY DEFINER pra enxergar responsible_technicians.company_id
--    independente de RLS da sessão atual (mensagem de erro fica clara).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_rt_same_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rt_company uuid;
BEGIN
  IF NEW.responsible_technician_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO rt_company
    FROM public.responsible_technicians
    WHERE id = NEW.responsible_technician_id;

  IF rt_company IS NULL THEN
    RAISE EXCEPTION 'Responsável Técnico % não encontrado', NEW.responsible_technician_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF rt_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Responsável Técnico pertence a outra empresa (cross-tenant blocked)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_enforce_rt_same_company ON public.contracts;
CREATE TRIGGER trg_contracts_enforce_rt_same_company
  BEFORE INSERT OR UPDATE OF responsible_technician_id, company_id
  ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_rt_same_company();

-- -----------------------------------------------------------------------------
-- 4. Índice de suporte à view contract_health_status
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_so_contract_status_date
  ON public.service_orders(contract_id, status, scheduled_date)
  WHERE contract_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. View contract_health_status — security_invoker = true (OBRIGATÓRIO)
--    Sem essa opção, a view roda como owner e ignora RLS das tabelas-mãe.
--    Esse é o cenário do incidente 1.8.4. Não negociável.
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.contract_health_status;

CREATE VIEW public.contract_health_status
WITH (security_invoker = true)
AS
SELECT
  c.id AS contract_id,
  c.company_id,
  COUNT(so.id) FILTER (
    WHERE so.scheduled_date < CURRENT_DATE
      AND so.status NOT IN ('concluida', 'cancelada')
  )::int AS overdue_count,
  CASE
    WHEN COUNT(so.id) FILTER (
      WHERE so.scheduled_date < CURRENT_DATE
        AND so.status NOT IN ('concluida', 'cancelada')
    ) = 0 THEN 'em_dia'
    WHEN COUNT(so.id) FILTER (
      WHERE so.scheduled_date < CURRENT_DATE
        AND so.status NOT IN ('concluida', 'cancelada')
    ) = 1 THEN 'manutencao_pendente'
    ELSE 'necessita_atencao'
  END AS health_status
FROM public.contracts c
LEFT JOIN public.service_orders so ON so.contract_id = c.id
GROUP BY c.id, c.company_id;

COMMENT ON VIEW public.contract_health_status IS
  'Semáforo de saúde do contrato (em_dia / manutencao_pendente / necessita_atencao). '
  'security_invoker = true: herda RLS de contracts e service_orders. '
  'Modificar para definer = VAZAMENTO ENTRE TENANTS (lição incidente 1.8.4).';

GRANT SELECT ON public.contract_health_status TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Bucket storage responsible-technicians-media + policies
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'responsible-technicians-media',
  'responsible-technicians-media',
  false,
  2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Convenção de path: {company_id}/{rt_id}/{kind}-{ts}.{ext}
-- Primeira pasta = company_id (storage.foldername(name)[1]).

DROP POLICY IF EXISTS "RT media SELECT own company" ON storage.objects;
CREATE POLICY "RT media SELECT own company"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'responsible-technicians-media'
    AND (
      (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "RT media INSERT admin/gestor own company" ON storage.objects;
CREATE POLICY "RT media INSERT admin/gestor own company"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'responsible-technicians-media'
    AND (
      (
        (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'gestor'::app_role)
        )
      )
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "RT media UPDATE admin/gestor own company" ON storage.objects;
CREATE POLICY "RT media UPDATE admin/gestor own company"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'responsible-technicians-media'
    AND (
      (
        (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'gestor'::app_role)
        )
      )
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'responsible-technicians-media'
    AND (
      (
        (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'gestor'::app_role)
        )
      )
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "RT media DELETE admin own company" ON storage.objects;
CREATE POLICY "RT media DELETE admin own company"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'responsible-technicians-media'
    AND (
      (
        (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
        AND public.has_role(auth.uid(), 'admin'::app_role)
      )
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- -----------------------------------------------------------------------------
-- 7. Migração de dados (idempotente)
--    pmoc_plans  → contracts (is_pmoc=true)
--    pmoc_items  → contract_items
--    service_orders.contract_id atualizado a partir de pmoc_generated_os
--    Audit obrigatório no fim. RAISE EXCEPTION se contagem não bate.
--
--    OBS: pmoc_plans NÃO tem company_id direto — herda via customers.company_id.
--    Status mapping: 'ativo' → 'active', 'pausado' → 'paused'.
-- -----------------------------------------------------------------------------

DO $migracao$
DECLARE
  v_plans_to_migrate int;
  v_contracts_created int;
  v_items_to_migrate int;
  v_items_created int;
  v_so_to_update int;
  v_so_updated int;
  v_plans_active_after int;
  v_contracts_pmoc_after int;
BEGIN
  -- Baseline (antes da migração)
  SELECT COUNT(*) INTO v_plans_to_migrate
    FROM public.pmoc_plans p
    INNER JOIN public.customers c ON c.id = p.customer_id
    WHERE p.status IN ('ativo', 'pausado');

  RAISE NOTICE '[PMOC migração] Baseline: % plano(s) PMOC ativo/pausado a migrar', v_plans_to_migrate;

  -- 7.1. Migrar pmoc_plans → contracts (is_pmoc=true)
  -- Critério de idempotência: chave composta (company_id, customer_id, name).
  -- Se contrato PMOC com mesmo nome já existe pro mesmo cliente, NÃO duplica.
  WITH inserted AS (
    INSERT INTO public.contracts (
      id, company_id, name, customer_id, technician_id,
      service_type_id, form_template_id,
      status, frequency_type, frequency_value, start_date, horizon_months,
      is_pmoc, next_pmoc_generation_date,
      notes, created_at, updated_at, created_by
    )
    SELECT
      gen_random_uuid(),
      cu.company_id,
      COALESCE(NULLIF(p.name, ''), 'PMOC - ' || COALESCE(cu.name, 'Sem nome')),
      p.customer_id,
      p.technician_id,
      p.service_type_id,
      p.form_template_id,
      CASE p.status
        WHEN 'ativo'    THEN 'active'
        WHEN 'pausado'  THEN 'paused'
        ELSE 'active'
      END,
      'months',
      GREATEST(p.frequency_months, 1),
      COALESCE(
        (p.next_generation_date - (p.frequency_months || ' months')::interval)::date,
        CURRENT_DATE
      ),
      12,
      true,
      p.next_generation_date,
      p.notes,
      now(),
      now(),
      p.created_by
    FROM public.pmoc_plans p
    INNER JOIN public.customers cu ON cu.id = p.customer_id
    WHERE p.status IN ('ativo', 'pausado')
      AND NOT EXISTS (
        SELECT 1
          FROM public.contracts ct
         WHERE ct.is_pmoc = true
           AND ct.customer_id = p.customer_id
           AND ct.company_id = cu.company_id
           AND ct.name = COALESCE(NULLIF(p.name, ''), 'PMOC - ' || COALESCE(cu.name, 'Sem nome'))
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_contracts_created FROM inserted;

  RAISE NOTICE '[PMOC migração] Contratos PMOC criados nesta execução: %', v_contracts_created;

  -- 7.2. Migrar pmoc_items → contract_items
  -- Match por (customer_id, name) → contract_id. Idempotente por (contract_id, equipment_id).
  SELECT COUNT(*) INTO v_items_to_migrate
    FROM public.pmoc_items pi
    INNER JOIN public.pmoc_plans p ON p.id = pi.plan_id
    INNER JOIN public.customers cu ON cu.id = p.customer_id
   WHERE p.status IN ('ativo', 'pausado');

  WITH inserted_items AS (
    INSERT INTO public.contract_items (
      id, contract_id, equipment_id, item_name, item_description, sort_order, created_at
    )
    SELECT
      gen_random_uuid(),
      ct.id,
      pi.equipment_id,
      COALESCE(e.name, 'Equipamento'),
      e.notes,
      ROW_NUMBER() OVER (PARTITION BY ct.id ORDER BY pi.created_at),
      now()
    FROM public.pmoc_items pi
    INNER JOIN public.pmoc_plans p ON p.id = pi.plan_id
    INNER JOIN public.customers cu ON cu.id = p.customer_id
    INNER JOIN public.contracts ct
      ON ct.is_pmoc = true
     AND ct.customer_id = p.customer_id
     AND ct.company_id = cu.company_id
     AND ct.name = COALESCE(NULLIF(p.name, ''), 'PMOC - ' || COALESCE(cu.name, 'Sem nome'))
    LEFT JOIN public.equipment e ON e.id = pi.equipment_id
    WHERE p.status IN ('ativo', 'pausado')
      AND NOT EXISTS (
        SELECT 1 FROM public.contract_items ci
         WHERE ci.contract_id = ct.id
           AND ci.equipment_id = pi.equipment_id
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_items_created FROM inserted_items;

  RAISE NOTICE '[PMOC migração] Contract_items criados nesta execução: % (de % itens elegíveis)',
    v_items_created, v_items_to_migrate;

  -- 7.3. Atualizar service_orders.contract_id e origin
  -- Para OSs já geradas via pmoc_generated_os, vinculá-las ao novo contract.
  SELECT COUNT(*) INTO v_so_to_update
    FROM public.service_orders so
    INNER JOIN public.pmoc_generated_os pgo ON pgo.service_order_id = so.id
    INNER JOIN public.pmoc_plans p ON p.id = pgo.plan_id
    INNER JOIN public.customers cu ON cu.id = p.customer_id
   WHERE so.contract_id IS NULL;

  WITH updated_so AS (
    UPDATE public.service_orders so
       SET contract_id = ct.id,
           origin = 'contract'
      FROM public.pmoc_generated_os pgo
      INNER JOIN public.pmoc_plans p ON p.id = pgo.plan_id
      INNER JOIN public.customers cu ON cu.id = p.customer_id
      INNER JOIN public.contracts ct
        ON ct.is_pmoc = true
       AND ct.customer_id = p.customer_id
       AND ct.company_id = cu.company_id
       AND ct.name = COALESCE(NULLIF(p.name, ''), 'PMOC - ' || COALESCE(cu.name, 'Sem nome'))
     WHERE pgo.service_order_id = so.id
       AND so.contract_id IS NULL
    RETURNING so.id
  )
  SELECT COUNT(*) INTO v_so_updated FROM updated_so;

  RAISE NOTICE '[PMOC migração] Service_orders vinculadas a contract_id nesta execução: % (de % candidatas)',
    v_so_updated, v_so_to_update;

  -- 7.4. Audit obrigatório
  SELECT COUNT(*) INTO v_plans_active_after
    FROM public.pmoc_plans
    WHERE status IN ('ativo', 'pausado');

  -- Total de contratos PMOC criados nesta migração (filtra só os que vieram de plano)
  SELECT COUNT(DISTINCT ct.id) INTO v_contracts_pmoc_after
    FROM public.contracts ct
    INNER JOIN public.pmoc_plans p
      ON p.customer_id = ct.customer_id
     AND ct.name = COALESCE(NULLIF(p.name, ''), 'PMOC - ' || COALESCE((
       SELECT cu.name FROM public.customers cu WHERE cu.id = p.customer_id
     ), 'Sem nome'))
     AND p.status IN ('ativo', 'pausado')
   WHERE ct.is_pmoc = true;

  RAISE NOTICE '[PMOC migração] AUDIT FINAL: % planos ativos/pausados ↔ % contratos PMOC migrados',
    v_plans_active_after, v_contracts_pmoc_after;

  IF v_contracts_pmoc_after < v_plans_active_after THEN
    RAISE EXCEPTION '[PMOC migração] Migração incompleta: % planos vs % contratos. ROLLBACK.',
      v_plans_active_after, v_contracts_pmoc_after;
  END IF;

  RAISE NOTICE '[PMOC migração] OK — auditoria passou.';
END
$migracao$;

-- -----------------------------------------------------------------------------
-- 8. pmoc_plans e pmoc_items viram somente-leitura
-- -----------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.pmoc_plans FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pmoc_items FROM authenticated;

COMMENT ON TABLE public.pmoc_plans IS
  'DEPRECATED desde v1.9.0. Migrado para contracts (is_pmoc=true). Somente-leitura. Drop final na Onda D (1.9.3).';

COMMENT ON TABLE public.pmoc_items IS
  'DEPRECATED desde v1.9.0. Migrado para contract_items. Somente-leitura. Drop final na Onda D (1.9.3).';

-- -----------------------------------------------------------------------------
-- 9. Drop de pmoc_contracts (legada, sem hooks/componentes vivos)
--    Confirmado via rg: aparece apenas em migrations antigas e em types.ts.
--    cascade lida com a FK pmoc_plans.contract_id (que apontava pra cá).
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.pmoc_contracts CASCADE;

COMMIT;

-- =============================================================================
-- FIM da migration PMOC v1.9.0 — Onda A.
--
-- Próximos passos (não-SQL, fora desta migration):
--   1. Regenerar src/integrations/supabase/types.ts
--      → supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   2. Deploy edge function adaptada:
--      → supabase functions deploy generate-pmoc-orders
--   3. Cenários cross-tenant em staging (RLS rules §5):
--      Tech Lead/Database executa 8 cenários antes de release.
-- =============================================================================
