-- Fase 0 P0 — Isolamento multi-tenant do catálogo (service_types / os_statuses /
-- task_types e tabelas-filhas service_cost_resources / service_gifts).
--
-- Contexto: as policies SELECT authenticated dessas tabelas carregavam o ramo
-- latente `company_id IS NULL OR ...`. Hoje não vaza porque NÃO existe linha com
-- company_id NULL (a coluna é NOT NULL nas 3 tabelas), mas é porta aberta: basta
-- alguém inserir/permitir uma linha NULL no futuro pra virar vazamento global.
-- Endurecemos pra que cada usuário só veja o catálogo da PRÓPRIA empresa
-- (ou super_admin vê tudo).
--
-- ⚠️ As policies `TO anon` ("Public ... via shared OS") NÃO são tocadas — o link
-- público de OS depende delas (decisão do CEO; fica pra frente separada).
--
-- Esta migration é env-agnóstica (schema/policy + função de seed). A limpeza de
-- dados da Glacial e o backfill das empresas vazias rodam como operação one-off
-- no PROD (documentados fora da migration).

-- ============================================================================
-- A) HARDENING DAS POLICIES SELECT AUTHENTICATED — remover ramo `company_id IS NULL`
-- ============================================================================

-- service_types
DROP POLICY IF EXISTS "Users view own company service_types" ON public.service_types;
CREATE POLICY "Users view own company service_types"
  ON public.service_types FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- os_statuses
DROP POLICY IF EXISTS "Users view own company os_statuses" ON public.os_statuses;
CREATE POLICY "Users view own company os_statuses"
  ON public.os_statuses FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- task_types
DROP POLICY IF EXISTS "Users view own company task_types" ON public.task_types;
CREATE POLICY "Users view own company task_types"
  ON public.task_types FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- service_cost_resources (isolamento via service_types pai)
DROP POLICY IF EXISTS "Users view own service_cost_resources" ON public.service_cost_resources;
CREATE POLICY "Users view own service_cost_resources"
  ON public.service_cost_resources FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_types st
      WHERE st.id = service_cost_resources.service_id
        AND (
          st.company_id = public.get_user_company_id(auth.uid())
          OR public.is_super_admin(auth.uid())
        )
    )
  );

-- service_gifts (isolamento via service_types pai)
DROP POLICY IF EXISTS "Users view own service_gifts" ON public.service_gifts;
CREATE POLICY "Users view own service_gifts"
  ON public.service_gifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_types st
      WHERE st.id = service_gifts.service_id
        AND (
          st.company_id = public.get_user_company_id(auth.uid())
          OR public.is_super_admin(auth.uid())
        )
    )
  );

-- ============================================================================
-- A2) FUNÇÃO DE SEED POR-TENANT — catálogo-base canônico, idempotente
-- ============================================================================
-- Catálogo-base extraído das linhas LEGÍTIMAS da Glacial, EXCLUINDO os 4 intrusos
-- (limpeza detalhada / limpeza do dia dia / Visita Técnica duplicado / limpeza de
-- vidros e fachadas).
--
-- Idempotente: cada INSERT condicionado a NOT EXISTS por (company_id, name) em
-- service_types/task_types e por (company_id, key) em os_statuses (respeitando o
-- UNIQUE per-tenant de os_statuses). Rodar 2x não duplica nada.

CREATE OR REPLACE FUNCTION public.seed_company_catalog(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'seed_company_catalog: p_company_id não pode ser NULL';
  END IF;

  -- ----- service_types (3 legítimos) -----
  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT p_company_id, 'Manutenção Preventiva', '#27AE60', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id AND name = 'Manutenção Preventiva'
  );

  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT p_company_id, 'Visita Técnica', '#6C757D', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id AND name = 'Visita Técnica'
  );

  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT p_company_id, 'Higienização', '#F1C40F', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id AND name = 'Higienização'
  );

  -- ----- os_statuses (7 default, posições canônicas normalizadas) -----
  INSERT INTO public.os_statuses (company_id, key, label, color, position, is_default)
  SELECT p_company_id, v.key, v.label, v.color, v.position, v.is_default
  FROM (VALUES
    ('agendada',     'Agendada',     '#8b5cf6', 0, true),
    ('pendente',     'Pendente',     '#f59e0b', 1, true),
    ('a_caminho',    'A Caminho',    '#6366f1', 2, true),
    ('em_andamento', 'Em Andamento', '#3b82f6', 3, true),
    ('concluida',    'Concluída',    '#22c55e', 4, true),
    ('pausada',      'Pausada',      '#d97706', 5, false),
    ('cancelada',    'Cancelada',    '#ef4444', 6, true)
  ) AS v(key, label, color, position, is_default)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.os_statuses os
    WHERE os.company_id = p_company_id AND os.key = v.key
  );

  -- ----- task_types (conjunto neutro genérico) -----
  INSERT INTO public.task_types (company_id, name, color, description, icon, is_active)
  SELECT p_company_id, v.name, v.color, v.description, 'CheckSquare', true
  FROM (VALUES
    ('Ligação de retorno', '#5fecf7', 'Retornar contato com o cliente'),
    ('Tarefa do vendedor', '#5918f2', 'Ligar para oferecer/vender serviço ao cliente'),
    ('Tarefa do cobrador', '#8b5cf6', 'Acompanhar/cobrar cliente em atraso')
  ) AS v(name, color, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_types tt
    WHERE tt.company_id = p_company_id AND tt.name = v.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_company_catalog(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_company_catalog(uuid) IS
  'Semeia catálogo-base canônico (service_types/os_statuses/task_types) para uma empresa. Idempotente por (company_id, name/key). Fase 0 P0.';
