-- Orçamento dentro da OS + geração atômica de OS a partir de orçamento.
--
-- A estimativa comercial da OS não é consumo de estoque. Os itens abaixo
-- guardam o que foi orçado; a baixa física continua sendo responsabilidade de
-- service_order_materials/register_inventory_movement durante a execução.

CREATE TABLE public.service_order_budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL
    REFERENCES public.service_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  item_type text NOT NULL DEFAULT 'servico'
    CHECK (item_type IN ('servico', 'mao_de_obra', 'material')),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  details text,
  quantity numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  source_quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A coluna service_orders.service_type_id continua como "principal" por
-- compatibilidade. Esta junction passa a ser a fonte completa dos tipos de
-- serviço executados na mesma OS.
CREATE TABLE public.service_order_service_types (
  service_order_id uuid NOT NULL
    REFERENCES public.service_orders(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL
    REFERENCES public.service_types(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_order_id, service_type_id)
);

CREATE INDEX idx_service_order_budget_items_order_position
  ON public.service_order_budget_items(service_order_id, position);
CREATE INDEX idx_service_order_budget_items_company
  ON public.service_order_budget_items(company_id);
CREATE INDEX idx_service_order_service_types_service
  ON public.service_order_service_types(service_type_id);
CREATE INDEX idx_service_order_service_types_company
  ON public.service_order_service_types(company_id);

CREATE TRIGGER set_service_order_budget_items_updated_at
  BEFORE UPDATE ON public.service_order_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A dupla de ponteiros orçamento↔OS já existia, mas sem unicidade duas abas
-- podiam criar duas OS para o mesmo orçamento antes de uma delas atualizar a
-- quote. O FOR UPDATE da RPC serializa o caminho normal; os índices são a rede
-- de segurança definitiva contra qualquer outro escritor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_orders_quote_id
  ON public.service_orders(quote_id)
  WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_converted_to_os_id
  ON public.quotes(converted_to_os_id)
  WHERE converted_to_os_id IS NOT NULL;

-- Qualquer escritor (não só a RPC abaixo) fica impedido de formar um vínculo
-- orçamento↔OS entre empresas diferentes.
CREATE OR REPLACE FUNCTION public.guard_service_order_quote_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = NEW.quote_id AND q.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'O orçamento de origem não pertence à empresa da OS.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_order_quote_same_tenant ON public.service_orders;
CREATE TRIGGER trg_service_order_quote_same_tenant
  BEFORE INSERT OR UPDATE OF quote_id, company_id ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_order_quote_same_tenant();

CREATE OR REPLACE FUNCTION public.guard_quote_converted_os_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.converted_to_os_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_orders so
     WHERE so.id = NEW.converted_to_os_id AND so.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'A OS gerada não pertence à empresa do orçamento.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_converted_os_same_tenant ON public.quotes;
CREATE TRIGGER trg_quote_converted_os_same_tenant
  BEFORE INSERT OR UPDATE OF converted_to_os_id, company_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_converted_os_same_tenant();

-- Funções de trigger não são endpoints públicos. O trigger continua podendo
-- executá-las mesmo sem privilégio EXECUTE concedido aos papéis da API.
REVOKE ALL ON FUNCTION public.guard_service_order_quote_same_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_service_order_quote_same_tenant() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_quote_converted_os_same_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_quote_converted_os_same_tenant() FROM anon, authenticated;

COMMENT ON TABLE public.service_order_budget_items IS
  'Itens comerciais previstos na OS (serviços, mão de obra e materiais). Não movimentam estoque.';
COMMENT ON COLUMN public.service_order_budget_items.source_quote_item_id IS
  'Item do orçamento que originou esta linha quando a OS foi gerada pela ação Gerar OS.';
COMMENT ON TABLE public.service_order_service_types IS
  'Tipos de serviço múltiplos da OS. service_orders.service_type_id espelha o primeiro por compatibilidade.';

ALTER TABLE public.service_order_budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_service_types ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_budget_items TO authenticated;
GRANT ALL ON public.service_order_budget_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_service_types TO authenticated;
GRANT ALL ON public.service_order_service_types TO service_role;

CREATE POLICY "service_order_budget_items_select_entitled_tenant"
  ON public.service_order_budget_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1
          FROM public.service_orders so
         WHERE so.id = service_order_budget_items.service_order_id
           AND so.company_id = service_order_budget_items.company_id
      )
    )
  );

CREATE POLICY "service_order_budget_items_manage_entitled_tenant"
  ON public.service_order_budget_items
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1
          FROM public.service_orders so
         WHERE so.id = service_order_budget_items.service_order_id
           AND so.company_id = service_order_budget_items.company_id
      )
      AND (
        public.can_edit_os(auth.uid())
        OR public.is_admin_or_gestor(auth.uid())
        OR public.has_full_permissions(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:edit_os')
        OR public.user_has_permission(auth.uid(), 'fn:create_os')
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1
          FROM public.service_orders so
         WHERE so.id = service_order_budget_items.service_order_id
           AND so.company_id = service_order_budget_items.company_id
      )
      AND (
        service_type_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.service_types st
           WHERE st.id = service_order_budget_items.service_type_id
             AND st.company_id = service_order_budget_items.company_id
        )
      )
      AND (
        inventory_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.inventory i
           WHERE i.id = service_order_budget_items.inventory_id
             AND i.company_id = service_order_budget_items.company_id
        )
      )
      AND (
        source_quote_item_id IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.quote_items qi
            JOIN public.quotes q ON q.id = qi.quote_id
           WHERE qi.id = service_order_budget_items.source_quote_item_id
             AND q.company_id = service_order_budget_items.company_id
        )
      )
      AND (
        public.can_edit_os(auth.uid())
        OR public.is_admin_or_gestor(auth.uid())
        OR public.has_full_permissions(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:edit_os')
        OR public.user_has_permission(auth.uid(), 'fn:create_os')
      )
    )
  );

CREATE POLICY "service_order_service_types_select_entitled_tenant"
  ON public.service_order_service_types
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_service_types.service_order_id
           AND so.company_id = service_order_service_types.company_id
      )
    )
  );

CREATE POLICY "service_order_service_types_manage_entitled_tenant"
  ON public.service_order_service_types
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_service_types.service_order_id
           AND so.company_id = service_order_service_types.company_id
      )
      AND (
        public.can_edit_os(auth.uid())
        OR public.is_admin_or_gestor(auth.uid())
        OR public.has_full_permissions(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:edit_os')
        OR public.user_has_permission(auth.uid(), 'fn:create_os')
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_service_types.service_order_id
           AND so.company_id = service_order_service_types.company_id
      )
      AND EXISTS (
        SELECT 1 FROM public.service_types st
         WHERE st.id = service_order_service_types.service_type_id
           AND st.company_id = service_order_service_types.company_id
      )
      AND (
        public.can_edit_os(auth.uid())
        OR public.is_admin_or_gestor(auth.uid())
        OR public.has_full_permissions(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:edit_os')
        OR public.user_has_permission(auth.uid(), 'fn:create_os')
      )
    )
  );

-- Migra o tipo principal das OS existentes para a nova relação múltipla.
INSERT INTO public.service_order_service_types (
  service_order_id, service_type_id, company_id, position
)
SELECT so.id, so.service_type_id, so.company_id, 0
  FROM public.service_orders so
 WHERE so.service_type_id IS NOT NULL
ON CONFLICT (service_order_id, service_type_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_service_order_service_types(
  p_service_order_id uuid,
  p_service_type_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_ids uuid[] := COALESCE(p_service_type_ids, '{}'::uuid[]);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.can_edit_os(v_user_id)
    OR public.is_admin_or_gestor(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:edit_os')
    OR public.user_has_permission(v_user_id, 'fn:create_os')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar os serviços desta OS.' USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_ids) > 50 THEN
    RAISE EXCEPTION 'Uma OS aceita no máximo 50 tipos de serviço.';
  END IF;

  SELECT so.company_id
    INTO v_company_id
    FROM public.service_orders so
   WHERE so.id = p_service_order_id
     AND (
       public.is_super_admin(v_user_id)
       OR (
         so.company_id = public.get_user_company_id(v_user_id)
         AND public.tenant_subscription_allows_access(so.company_id)
       )
     )
   FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada ou sem permissão.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.service_types st
        WHERE st.id = id AND st.company_id = v_company_id AND st.is_active
     )
  ) THEN
    RAISE EXCEPTION 'Um dos tipos de serviço não pertence a esta empresa ou está inativo.';
  END IF;

  DELETE FROM public.service_order_service_types
   WHERE service_order_id = p_service_order_id;

  INSERT INTO public.service_order_service_types (
    service_order_id, service_type_id, company_id, position
  )
  SELECT p_service_order_id, id, v_company_id, MIN(ordinality)::integer - 1
    FROM unnest(v_ids) WITH ORDINALITY AS rows(id, ordinality)
   GROUP BY id
  ON CONFLICT (service_order_id, service_type_id) DO UPDATE
    SET position = EXCLUDED.position;

  UPDATE public.service_orders
     SET service_type_id = v_ids[1]
   WHERE id = p_service_order_id;

  RETURN jsonb_build_object(
    'service_order_id', p_service_order_id,
    'service_type_ids', to_jsonb(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_service_order_service_types(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_service_order_service_types(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_service_types(uuid, uuid[]) TO authenticated;

-- Substitui o orçamento de uma OS e reconcilia os totais no servidor. O total
-- enviado pelo browser nunca é confiado: cada linha é quantity * unit_price.
CREATE OR REPLACE FUNCTION public.sync_service_order_budget(
  p_service_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_services numeric(14, 2) := 0;
  v_materials numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.can_edit_os(v_user_id)
    OR public.is_admin_or_gestor(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:edit_os')
    OR public.user_has_permission(v_user_id, 'fn:create_os')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta ordem de serviço.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'Os itens do orçamento devem ser uma lista.';
  END IF;

  IF jsonb_array_length(v_items) > 200 THEN
    RAISE EXCEPTION 'O orçamento da OS aceita no máximo 200 itens.';
  END IF;

  SELECT so.company_id
    INTO v_company_id
    FROM public.service_orders so
   WHERE so.id = p_service_order_id
     AND (
       (SELECT public.is_super_admin(auth.uid()))
       OR (
         so.company_id = (SELECT public.get_user_company_id(auth.uid()))
         AND public.tenant_subscription_allows_access(so.company_id)
       )
     )
   FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada ou sem permissão.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_items) AS x(item)
     WHERE COALESCE(btrim(x.item->>'description'), '') = ''
        OR COALESCE((x.item->>'quantity')::numeric, 0) <= 0
        OR COALESCE((x.item->>'unit_price')::numeric, 0) < 0
        OR COALESCE(x.item->>'item_type', 'servico') NOT IN ('servico', 'mao_de_obra', 'material')
  ) THEN
    RAISE EXCEPTION 'Revise descrição, quantidade, tipo e valor dos itens do orçamento.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_items) AS x(item)
     WHERE NULLIF(x.item->>'service_type_id', '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.service_types st
          WHERE st.id = (x.item->>'service_type_id')::uuid
            AND st.company_id = v_company_id
       )
  ) THEN
    RAISE EXCEPTION 'Um dos tipos de serviço não pertence a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_items) AS x(item)
     WHERE NULLIF(x.item->>'inventory_id', '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory i
          WHERE i.id = (x.item->>'inventory_id')::uuid
            AND i.company_id = v_company_id
       )
  ) THEN
    RAISE EXCEPTION 'Um dos materiais não pertence a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_items) AS x(item)
     WHERE NULLIF(x.item->>'source_quote_item_id', '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.quote_items qi
           JOIN public.quotes q ON q.id = qi.quote_id
          WHERE qi.id = (x.item->>'source_quote_item_id')::uuid
            AND q.company_id = v_company_id
       )
  ) THEN
    RAISE EXCEPTION 'Um dos itens de orçamento de origem não pertence a esta empresa.';
  END IF;

  DELETE FROM public.service_order_budget_items
   WHERE service_order_id = p_service_order_id;

  INSERT INTO public.service_order_budget_items (
    service_order_id,
    company_id,
    position,
    item_type,
    description,
    details,
    quantity,
    unit_price,
    total_price,
    inventory_id,
    service_type_id,
    source_quote_item_id
  )
  SELECT
    p_service_order_id,
    v_company_id,
    ordinality::integer - 1,
    COALESCE(item->>'item_type', 'servico'),
    btrim(item->>'description'),
    NULLIF(item->>'details', ''),
    (item->>'quantity')::numeric,
    ROUND((item->>'unit_price')::numeric, 2),
    ROUND((item->>'quantity')::numeric * (item->>'unit_price')::numeric, 2),
    NULLIF(item->>'inventory_id', '')::uuid,
    NULLIF(item->>'service_type_id', '')::uuid,
    NULLIF(item->>'source_quote_item_id', '')::uuid
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS rows(item, ordinality);

  SELECT
    COALESCE(SUM(total_price) FILTER (WHERE item_type IN ('servico', 'mao_de_obra')), 0),
    COALESCE(SUM(total_price) FILTER (WHERE item_type = 'material'), 0),
    COALESCE(SUM(total_price), 0)
    INTO v_services, v_materials, v_total
    FROM public.service_order_budget_items
   WHERE service_order_id = p_service_order_id;

  UPDATE public.service_orders
     SET labor_value = v_services,
         parts_value = v_materials,
         total_value = v_total
   WHERE id = p_service_order_id;

  RETURN jsonb_build_object(
    'labor_value', v_services,
    'parts_value', v_materials,
    'total_value', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_service_order_budget(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_service_order_budget(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_budget(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.sync_service_order_budget(uuid, jsonb) IS
  'Substitui atomicamente os itens orçados da OS e recalcula labor_value, parts_value e total_value no servidor.';

-- Gera a OS e clona os itens em uma única transação. Repetir a chamada é
-- idempotente: se o orçamento já tiver OS, devolve a mesma linha.
CREATE OR REPLACE FUNCTION public.generate_service_order_from_quote(
  p_quote_id uuid
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_quote public.quotes%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_service_type_id uuid;
  v_services numeric(14, 2) := 0;
  v_materials numeric(14, 2) := 0;
  v_items_total numeric(14, 2) := 0;
  v_final_total numeric(14, 2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.is_admin_or_gestor(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:create_os')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar uma ordem de serviço.' USING ERRCODE = '42501';
  END IF;

  SELECT q.*
    INTO v_quote
    FROM public.quotes q
   WHERE q.id = p_quote_id
     AND (
       (SELECT public.is_super_admin(auth.uid()))
       OR (
         q.company_id = (SELECT public.get_user_company_id(auth.uid()))
         AND public.tenant_subscription_allows_access(q.company_id)
       )
     )
   FOR UPDATE;

  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado ou sem permissão.';
  END IF;

  IF v_quote.converted_to_os_id IS NOT NULL THEN
    SELECT so.* INTO v_order
      FROM public.service_orders so
     WHERE so.id = v_quote.converted_to_os_id;
    IF v_order.id IS NOT NULL THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status <> 'aprovado' THEN
    RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar uma OS.';
  END IF;

  IF v_quote.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = v_quote.customer_id AND c.company_id = v_quote.company_id
  ) THEN
    RAISE EXCEPTION 'O cliente do orçamento não pertence a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quote_items qi
     WHERE qi.quote_id = v_quote.id
       AND qi.service_type_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.service_types st
          WHERE st.id = qi.service_type_id AND st.company_id = v_quote.company_id
       )
  ) THEN
    RAISE EXCEPTION 'Um dos serviços do orçamento não pertence a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quote_items qi
     WHERE qi.quote_id = v_quote.id
       AND qi.inventory_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory i
          WHERE i.id = qi.inventory_id AND i.company_id = v_quote.company_id
       )
  ) THEN
    RAISE EXCEPTION 'Um dos materiais do orçamento não pertence a esta empresa.';
  END IF;

  SELECT qi.service_type_id
    INTO v_service_type_id
    FROM public.quote_items qi
   WHERE qi.quote_id = v_quote.id
     AND qi.service_type_id IS NOT NULL
   ORDER BY qi.position, qi.created_at
   LIMIT 1;

  SELECT
    COALESCE(SUM(qi.total_price) FILTER (WHERE qi.item_type IN ('servico', 'mao_de_obra')), 0),
    COALESCE(SUM(qi.total_price) FILTER (WHERE qi.item_type = 'material'), 0),
    COALESCE(SUM(qi.total_price), 0)
    INTO v_services, v_materials, v_items_total
    FROM public.quote_items qi
   WHERE qi.quote_id = v_quote.id;

  v_final_total := COALESCE(v_quote.final_price, v_quote.total_value, v_items_total, 0);

  INSERT INTO public.service_orders (
    company_id,
    customer_id,
    service_type_id,
    status,
    labor_value,
    parts_value,
    total_value,
    description,
    notes,
    quote_id,
    created_by
  ) VALUES (
    v_quote.company_id,
    v_quote.customer_id,
    v_service_type_id,
    'agendada',
    v_services,
    v_materials,
    v_final_total,
    format('Gerada do Orçamento #%s', v_quote.quote_number),
    v_quote.notes,
    v_quote.id,
    v_user_id
  )
  RETURNING * INTO v_order;

  INSERT INTO public.service_order_budget_items (
    service_order_id,
    company_id,
    position,
    item_type,
    description,
    details,
    quantity,
    unit_price,
    total_price,
    inventory_id,
    service_type_id,
    source_quote_item_id
  )
  SELECT
    v_order.id,
    v_quote.company_id,
    qi.position,
    CASE
      WHEN qi.item_type IN ('servico', 'mao_de_obra', 'material') THEN qi.item_type
      ELSE 'servico'
    END,
    qi.description,
    qi.details,
    qi.quantity,
    qi.unit_price,
    ROUND(qi.quantity * qi.unit_price, 2),
    qi.inventory_id,
    qi.service_type_id,
    qi.id
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote.id
  ORDER BY qi.position, qi.created_at;

  INSERT INTO public.service_order_service_types (
    service_order_id, service_type_id, company_id, position
  )
  SELECT
    v_order.id,
    qi.service_type_id,
    v_quote.company_id,
    ROW_NUMBER() OVER (ORDER BY MIN(qi.position), qi.service_type_id)::integer - 1
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote.id
    AND qi.service_type_id IS NOT NULL
  GROUP BY qi.service_type_id
  ORDER BY MIN(qi.position), qi.service_type_id;

  UPDATE public.quotes
     SET converted_to_os_id = v_order.id,
         status = 'convertido'
   WHERE id = v_quote.id;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_service_order_from_quote(uuid) IS
  'Gera uma OS idempotente a partir de orçamento aprovado, clona seus itens e não movimenta estoque.';
