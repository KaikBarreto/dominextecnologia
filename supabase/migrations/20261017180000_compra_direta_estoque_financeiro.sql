-- Compra direta de materiais: compra + entrada no estoque + financeiro em UMA
-- transacao. O fluxo de requisicao/cotacao/O.C. continua inalterado.
--
-- Invariantes:
--   * company_id sempre deriva de auth.uid(); nunca vem do client;
--   * total financeiro e calculado no servidor (quantidade x custo unitario);
--   * a mesma client_request_id nunca aplica estoque/financeiro duas vezes;
--   * register_inventory_movement continua sendo a unica porta de saldo;
--   * conta de cartao fica fora do MVP (exigiria materializar a fatura);
--   * a categoria chega por id, e o nome atual e copiado para a transacao.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Identidade da compra direta e vinculo financeiro do comprovante interno
-- ---------------------------------------------------------------------------

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS flow_type text NOT NULL DEFAULT 'requisicao',
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS purchase_date date;

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_flow_type_chk;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_flow_type_chk
  CHECK (flow_type IN ('requisicao', 'compra_direta'));

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_compra_direta_fields_chk;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_compra_direta_fields_chk
  CHECK (
    flow_type = 'requisicao'
    OR (
      status = 'concluida'
      AND client_request_id IS NOT NULL
      AND request_hash IS NOT NULL
      AND purchase_date IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_company_client_request
  ON public.compras (company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.compras.flow_type IS
  'requisicao = cotacao/O.C.; compra_direta = material ja comprado, recebido e lancado no financeiro atomicamente.';
COMMENT ON COLUMN public.compras.client_request_id IS
  'Chave idempotente enviada pelo client no registro de compra direta. Unica por empresa.';
COMMENT ON COLUMN public.compras.request_hash IS
  'Hash canonico do payload da compra direta. Impede reutilizar a mesma chave idempotente com dados diferentes.';
COMMENT ON COLUMN public.compras.purchase_date IS
  'Data civil em que a compra direta ocorreu. NULL nas requisicoes antigas/normais.';

ALTER TABLE public.compra_ordens
  ADD COLUMN IF NOT EXISTS financial_transaction_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_ordens_financial_transaction
  ON public.compra_ordens (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.compra_ordens.financial_transaction_id IS
  'Lancamento financeiro 1:1 gerado pela compra direta. RESTRICT impede apagar a despesa enquanto o comprovante da compra existir.';

-- O vinculo novo tambem precisa ser tenant-safe fora da RPC. A RLS filtra a
-- linha, mas uma FK simples nao garante que os dois lados sejam da mesma empresa.
CREATE OR REPLACE FUNCTION public.guard_compra_ordem_financial_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_transaction_company uuid;
  v_transaction_type public.transaction_type;
BEGIN
  IF NEW.financial_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ft.company_id, ft.transaction_type
    INTO v_transaction_company, v_transaction_type
    FROM public.financial_transactions ft
   WHERE ft.id = NEW.financial_transaction_id;

  IF NOT FOUND
     OR v_transaction_company IS DISTINCT FROM NEW.company_id
     OR v_transaction_type IS DISTINCT FROM 'saida'::public.transaction_type THEN
    RAISE EXCEPTION 'Lancamento financeiro invalido para esta compra'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_compra_ordem_financial_link ON public.compra_ordens;
CREATE TRIGGER trg_guard_compra_ordem_financial_link
  BEFORE INSERT OR UPDATE OF financial_transaction_id, company_id
  ON public.compra_ordens
  FOR EACH ROW EXECUTE FUNCTION public.guard_compra_ordem_financial_link();

REVOKE ALL ON FUNCTION public.guard_compra_ordem_financial_link() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. RPC atomica e idempotente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_compra_material_direta(
  p_client_request_id uuid,
  p_stock_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_purchase_date date,
  p_account_id uuid,
  p_category_id uuid,
  p_is_paid boolean,
  p_paid_date date,
  p_due_date date,
  p_payment_method text,
  p_description text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_can_manage boolean := false;
  v_today date;
  v_stock public.stocks%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_category public.financial_categories%ROWTYPE;
  v_normalized_items jsonb;
  v_item_count integer;
  v_total numeric(14,2);
  v_request_hash text;
  v_existing record;
  v_compra public.compras%ROWTYPE;
  v_ordem public.compra_ordens%ROWTYPE;
  v_compra_material_id uuid;
  v_ordem_item_id uuid;
  v_receipt_items jsonb := '[]'::jsonb;
  v_financial_id uuid;
  v_inventory record;
  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT (
    public.is_admin_or_gestor(v_user_id)
    OR public.is_super_admin(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = v_user_id
         AND up.is_active = true
         AND (
           up.permissions ? '*'
           OR (
             up.permissions ? 'fn:manage_inventory'
             AND up.permissions ? 'fn:manage_finance'
           )
         )
    )
  ) INTO v_can_manage;

  IF NOT COALESCE(v_can_manage, false) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar estoque e financeiro'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.tenant_subscription_allows_access(v_company_id)
     OR NOT public.company_plan_allows_product_area(v_company_id, 'finance') THEN
    RAISE EXCEPTION 'Assinatura sem acesso ao estoque e financeiro'
      USING ERRCODE = '42501';
  END IF;

  IF p_client_request_id IS NULL
     OR p_stock_id IS NULL
     OR p_supplier_id IS NULL
     OR p_purchase_date IS NULL
     OR p_account_id IS NULL
     OR p_category_id IS NULL
     OR p_is_paid IS NULL THEN
    RAISE EXCEPTION 'Informe fornecedor, local, data, conta, categoria e chave da operação'
      USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um material comprado'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Uma compra direta aceita no máximo 100 materiais'
      USING ERRCODE = '22023';
  END IF;

  -- Normaliza e ordena antes do hash, da validacao e das escritas. Assim a
  -- ordem visual das linhas nao muda a identidade do retry.
  SELECT jsonb_agg(
           jsonb_build_object(
             'inventory_id', x.inventory_id,
             'quantity', round(x.quantity, 4),
             'unit_price', round(x.unit_price, 2)
           )
           ORDER BY x.inventory_id::text
         ),
         count(*)
    INTO v_normalized_items, v_item_count
    FROM jsonb_to_recordset(p_items) AS x(
      inventory_id uuid,
      quantity numeric,
      unit_price numeric
    );

  IF v_item_count <> jsonb_array_length(p_items)
     OR EXISTS (
       SELECT 1
         FROM jsonb_to_recordset(v_normalized_items) AS x(
           inventory_id uuid,
           quantity numeric,
           unit_price numeric
         )
        WHERE x.inventory_id IS NULL
           OR x.quantity IS NULL OR x.quantity <= 0
           OR x.unit_price IS NULL OR x.unit_price < 0
     ) THEN
    RAISE EXCEPTION 'Material, quantidade positiva e custo unitário são obrigatórios'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(v_normalized_items) AS x(
        inventory_id uuid,
        quantity numeric,
        unit_price numeric
      )
     GROUP BY x.inventory_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'O mesmo material não pode aparecer duas vezes na compra'
      USING ERRCODE = '22023';
  END IF;

  SELECT round(sum(x.quantity * x.unit_price), 2)
    INTO v_total
    FROM jsonb_to_recordset(v_normalized_items) AS x(
      inventory_id uuid,
      quantity numeric,
      unit_price numeric
    );
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'O total da compra deve ser maior que zero'
      USING ERRCODE = '22023';
  END IF;

  v_today := public.company_today(v_company_id);
  IF p_purchase_date > v_today THEN
    RAISE EXCEPTION 'A data da compra não pode estar no futuro'
      USING ERRCODE = '22023';
  END IF;
  IF p_is_paid AND (p_paid_date IS NULL OR p_paid_date > v_today) THEN
    RAISE EXCEPTION 'Informe uma data de pagamento válida'
      USING ERRCODE = '22023';
  END IF;
  IF p_is_paid AND COALESCE(btrim(p_payment_method), '') = '' THEN
    RAISE EXCEPTION 'Informe a forma de pagamento'
      USING ERRCODE = '22023';
  END IF;
  IF NOT p_is_paid AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Informe o vencimento da conta a pagar'
      USING ERRCODE = '22023';
  END IF;
  IF p_payment_method IS NOT NULL
     AND p_payment_method NOT IN ('dinheiro','pix','cartao_debito','transferencia','boleto','cheque') THEN
    RAISE EXCEPTION 'Forma de pagamento não suportada na compra direta'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_stock
    FROM public.stocks s
   WHERE s.id = p_stock_id
     AND s.company_id = v_company_id
     AND s.customer_id IS NULL;
  IF NOT FOUND OR NOT public.can_access_stock(v_user_id, p_stock_id) THEN
    RAISE EXCEPTION 'Local de estoque inválido ou sem acesso'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_supplier
    FROM public.suppliers s
   WHERE s.id = p_supplier_id
     AND s.company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta empresa'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
    FROM public.financial_accounts a
   WHERE a.id = p_account_id
     AND a.company_id = v_company_id
     AND a.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira inválida para esta empresa'
      USING ERRCODE = '42501';
  END IF;
  IF v_account.type = 'cartao' THEN
    RAISE EXCEPTION 'Compra direta no cartão de crédito ainda não é suportada; lance pelo Financeiro para gerar a fatura'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_category
    FROM public.financial_categories c
   WHERE c.id = p_category_id
     AND c.company_id = v_company_id
     AND c.type = 'saida'
     AND c.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria financeira inválida para esta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(v_normalized_items) AS x(
        inventory_id uuid,
        quantity numeric,
        unit_price numeric
      )
      LEFT JOIN public.inventory i ON i.id = x.inventory_id
     WHERE i.id IS NULL
        OR i.company_id IS DISTINCT FROM v_company_id
        OR i.customer_id IS NOT NULL
        OR i.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Há material inválido, arquivado ou de outro estoque/tenant'
      USING ERRCODE = '42501';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'stock_id', p_stock_id,
    'supplier_id', p_supplier_id,
    'items', v_normalized_items,
    'purchase_date', p_purchase_date,
    'account_id', p_account_id,
    'category_id', p_category_id,
    'is_paid', p_is_paid,
    'paid_date', CASE WHEN p_is_paid THEN p_paid_date ELSE NULL END,
    'due_date', CASE WHEN p_is_paid THEN NULL ELSE p_due_date END,
    'payment_method', NULLIF(btrim(p_payment_method), ''),
    'description', NULLIF(btrim(p_description), ''),
    'notes', NULLIF(btrim(p_notes), '')
  )::text);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || p_client_request_id::text, 0)
  );

  SELECT c.id AS compra_id,
         c.numero,
         c.request_hash,
         o.id AS ordem_id,
         o.financial_transaction_id
    INTO v_existing
    FROM public.compras c
    LEFT JOIN public.compra_ordens o ON o.compra_id = c.id
   WHERE c.company_id = v_company_id
     AND c.client_request_id = p_client_request_id
   ORDER BY o.created_at
   LIMIT 1;

  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'Esta chave de operação já foi usada com outros dados'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'compra_id', v_existing.compra_id,
      'numero', v_existing.numero,
      'ordem_id', v_existing.ordem_id,
      'financial_transaction_id', v_existing.financial_transaction_id,
      'total_amount', v_total,
      'already_applied', true
    );
  END IF;

  INSERT INTO public.compras (
    company_id, title, status, notes, created_by, stock_id,
    flow_type, client_request_id, request_hash, purchase_date
  ) VALUES (
    v_company_id,
    COALESCE(NULLIF(btrim(p_description), ''), 'Compra de materiais — ' || v_supplier.name),
    'concluida',
    NULLIF(btrim(p_notes), ''),
    v_user_id,
    p_stock_id,
    'compra_direta',
    p_client_request_id,
    v_request_hash,
    p_purchase_date
  ) RETURNING * INTO v_compra;

  INSERT INTO public.compra_ordens (
    company_id, compra_id, supplier_id, status, sent_at, notes, created_by
  ) VALUES (
    v_company_id,
    v_compra.id,
    p_supplier_id,
    'enviada',
    now(),
    'Comprovante interno de compra direta',
    v_user_id
  ) RETURNING * INTO v_ordem;

  FOR r IN
    SELECT x.inventory_id, x.quantity, x.unit_price
      FROM jsonb_to_recordset(v_normalized_items) AS x(
        inventory_id uuid,
        quantity numeric,
        unit_price numeric
      )
     ORDER BY x.inventory_id::text
  LOOP
    SELECT i.id, i.name, i.unit
      INTO v_inventory
      FROM public.inventory i
     WHERE i.id = r.inventory_id
       FOR UPDATE;

    INSERT INTO public.compra_materiais (
      company_id, compra_id, inventory_id, material_name, unit, quantity
    ) VALUES (
      v_company_id,
      v_compra.id,
      v_inventory.id,
      v_inventory.name,
      COALESCE(NULLIF(btrim(v_inventory.unit), ''), 'un'),
      r.quantity
    ) RETURNING id INTO v_compra_material_id;

    INSERT INTO public.compra_ordem_itens (
      company_id, ordem_id, compra_material_id, inventory_id, material_name,
      unit, quantity_ordered, quantity_received, unit_price
    ) VALUES (
      v_company_id,
      v_ordem.id,
      v_compra_material_id,
      v_inventory.id,
      v_inventory.name,
      COALESCE(NULLIF(btrim(v_inventory.unit), ''), 'un'),
      r.quantity,
      0,
      r.unit_price
    ) RETURNING id INTO v_ordem_item_id;

    v_receipt_items := v_receipt_items || jsonb_build_array(
      jsonb_build_object('item_id', v_ordem_item_id, 'quantity', r.quantity)
    );
  END LOOP;

  -- Reusa a porta canonica do estoque. Se qualquer item ou o financeiro falhar,
  -- toda a funcao PL/pgSQL volta, inclusive os saldos ja movimentados.
  PERFORM public.receber_ordem_compra(v_ordem.id, v_receipt_items);

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, category, description, amount,
    transaction_date, due_date, paid_date, is_paid, supplier_id,
    account_id, payment_method, notes, created_by
  ) VALUES (
    v_company_id,
    'saida',
    v_category.name,
    COALESCE(NULLIF(btrim(p_description), ''), 'Compra de materiais — ' || v_supplier.name),
    v_total,
    p_purchase_date,
    CASE WHEN p_is_paid THEN NULL ELSE p_due_date END,
    CASE WHEN p_is_paid THEN p_paid_date ELSE NULL END,
    p_is_paid,
    p_supplier_id,
    p_account_id,
    NULLIF(btrim(p_payment_method), ''),
    NULLIF(btrim(p_notes), ''),
    v_user_id
  ) RETURNING id INTO v_financial_id;

  UPDATE public.compra_ordens
     SET financial_transaction_id = v_financial_id
   WHERE id = v_ordem.id;

  RETURN jsonb_build_object(
    'compra_id', v_compra.id,
    'numero', v_compra.numero,
    'ordem_id', v_ordem.id,
    'financial_transaction_id', v_financial_id,
    'total_amount', v_total,
    'already_applied', false
  );
END;
$fn$;

COMMENT ON FUNCTION public.registrar_compra_material_direta(
  uuid, uuid, uuid, jsonb, date, uuid, uuid, boolean, date, date, text, text, text
) IS
  'Registra uma compra direta de materiais atomicamente: cabecalho concluido, comprovante interno recebido, entradas via register_inventory_movement e uma saida no Financeiro. Retry por client_request_id retorna o mesmo resultado; payload divergente e rejeitado.';

REVOKE ALL ON FUNCTION public.registrar_compra_material_direta(
  uuid, uuid, uuid, jsonb, date, uuid, uuid, boolean, date, date, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_material_direta(
  uuid, uuid, uuid, jsonb, date, uuid, uuid, boolean, date, date, text, text, text
) TO authenticated, service_role;

-- Compras diretas e seus comprovantes formam um unico fato de estoque +
-- financeiro. Mutacoes avulsas deixariam os dois livros divergentes.
CREATE OR REPLACE FUNCTION public.guard_direct_purchase_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $guard$
BEGIN
  IF OLD.flow_type = 'compra_direta' AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'direct_purchase_is_immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_direct_purchase_immutable ON public.compras;
CREATE TRIGGER guard_direct_purchase_immutable
  BEFORE UPDATE OR DELETE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_purchase_immutable();

CREATE OR REPLACE FUNCTION public.guard_direct_purchase_child_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $guard$
DECLARE
  v_compra_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'compra_materiais' THEN
    v_compra_id := OLD.compra_id;
  ELSIF TG_TABLE_NAME = 'compra_ordens' THEN
    v_compra_id := OLD.compra_id;
  ELSE
    SELECT o.compra_id INTO v_compra_id
      FROM public.compra_ordens o
     WHERE o.id = OLD.ordem_id;
  END IF;

  IF current_user NOT IN ('postgres', 'service_role') AND EXISTS (
    SELECT 1 FROM public.compras c
     WHERE c.id = v_compra_id AND c.flow_type = 'compra_direta'
  ) THEN
    RAISE EXCEPTION 'direct_purchase_is_immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_direct_purchase_material_immutable ON public.compra_materiais;
CREATE TRIGGER guard_direct_purchase_material_immutable
  BEFORE UPDATE OR DELETE ON public.compra_materiais
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_purchase_child_immutable();

DROP TRIGGER IF EXISTS guard_direct_purchase_order_immutable ON public.compra_ordens;
CREATE TRIGGER guard_direct_purchase_order_immutable
  BEFORE UPDATE OR DELETE ON public.compra_ordens
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_purchase_child_immutable();

DROP TRIGGER IF EXISTS guard_direct_purchase_order_item_immutable ON public.compra_ordem_itens;
CREATE TRIGGER guard_direct_purchase_order_item_immutable
  BEFORE UPDATE OR DELETE ON public.compra_ordem_itens
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_purchase_child_immutable();

CREATE OR REPLACE FUNCTION public.guard_direct_purchase_financial_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.compra_ordens o
      JOIN public.compras c ON c.id = o.compra_id
     WHERE o.financial_transaction_id = OLD.id
       AND c.flow_type = 'compra_direta'
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'direct_purchase_financial_is_immutable'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Baixa posterior continua permitida (conta, forma, vencimento, pago/data
    -- e observações). Identidade, fornecedor, valor e data comercial não.
    IF ROW(OLD.company_id, OLD.transaction_type, OLD.amount, OLD.transaction_date, OLD.supplier_id)
       IS DISTINCT FROM
       ROW(NEW.company_id, NEW.transaction_type, NEW.amount, NEW.transaction_date, NEW.supplier_id) THEN
      RAISE EXCEPTION 'direct_purchase_financial_is_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_direct_purchase_financial_immutable ON public.financial_transactions;
CREATE TRIGGER guard_direct_purchase_financial_immutable
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_purchase_financial_immutable();

REVOKE ALL ON FUNCTION public.guard_direct_purchase_financial_immutable() FROM PUBLIC, anon;

-- Relatorio agregado por material. Usa a quantidade efetivamente recebida e o
-- preco congelado no item da O.C.; portanto representa media historica paga,
-- nao custo medio contabil do saldo remanescente.
CREATE OR REPLACE FUNCTION public.get_material_purchase_report(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_stock_ids uuid[] DEFAULT NULL,
  p_supplier_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_created_by_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  inventory_id uuid,
  sku text,
  material_name text,
  unit text,
  group_id uuid,
  group_name text,
  group_color text,
  current_balance numeric,
  registered_sale_price numeric,
  purchased_quantity numeric,
  priced_quantity numeric,
  unpriced_quantity numeric,
  purchased_total numeric,
  average_paid numeric,
  purchase_count bigint,
  last_purchase_date date,
  history jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $report$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'subscription_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_has_permission(v_user_id, 'screen:inventory') THEN
    RAISE EXCEPTION 'inventory_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_stock_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_stock_ids) filter_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.stocks s
        WHERE s.id = filter_id AND s.company_id = v_company_id
          AND s.customer_id IS NULL AND public.can_access_stock(v_user_id, s.id)
     )
  ) THEN
    RAISE EXCEPTION 'invalid_stock_filter' USING ERRCODE = '42501';
  END IF;
  IF p_supplier_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_supplier_ids) filter_id
     WHERE NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = filter_id AND s.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION 'invalid_supplier_filter' USING ERRCODE = '42501';
  END IF;
  IF p_group_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_group_ids) filter_id
     WHERE NOT EXISTS (SELECT 1 FROM public.material_groups g WHERE g.id = filter_id AND g.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION 'invalid_group_filter' USING ERRCODE = '42501';
  END IF;
  IF p_created_by_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_created_by_ids) filter_id
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = filter_id AND p.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION 'invalid_user_filter' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH accessible_stocks AS MATERIALIZED (
    SELECT s.id
      FROM public.stocks s
     WHERE s.company_id = v_company_id
       AND s.customer_id IS NULL
       AND public.can_access_stock(v_user_id, s.id)
       AND (p_stock_ids IS NULL OR s.id = ANY(p_stock_ids))
  ),
  eligible_inventory AS (
    SELECT
      i.id AS inventory_id,
      i.sku,
      i.name AS material_name,
      COALESCE(NULLIF(i.unit, ''), 'un') AS unit,
      i.group_id,
      g.name AS group_name,
      g.color AS group_color,
      COALESCE(sum(isl.quantity) FILTER (WHERE ast.id IS NOT NULL), 0)::numeric AS current_balance,
      COALESCE(i.sale_price, 0)::numeric AS registered_sale_price
    FROM public.inventory i
    LEFT JOIN public.material_groups g ON g.id = i.group_id AND g.company_id = v_company_id
    LEFT JOIN public.inventory_stock_levels isl ON isl.inventory_id = i.id
    LEFT JOIN accessible_stocks ast ON ast.id = isl.stock_id
    WHERE i.company_id = v_company_id
      AND i.customer_id IS NULL
      AND i.archived_at IS NULL
      AND (p_group_ids IS NULL OR i.group_id = ANY(p_group_ids))
      AND (
        p_stock_ids IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.inventory_stock_levels scoped_level
            JOIN accessible_stocks scoped_stock ON scoped_stock.id = scoped_level.stock_id
           WHERE scoped_level.inventory_id = i.id
        )
      )
    GROUP BY i.id, i.sku, i.name, i.unit, i.group_id, g.name, g.color, i.sale_price
  ),
  received AS (
    SELECT
      oi.inventory_id,
      COALESCE(NULLIF(oi.material_name, ''), i.name) AS material_name,
      COALESCE(NULLIF(oi.unit, ''), i.unit, 'un') AS unit,
      i.sku,
      oi.quantity_received::numeric AS quantity,
      oi.unit_price::numeric AS unit_price,
      CASE WHEN oi.unit_price IS NULL THEN NULL ELSE (oi.quantity_received * oi.unit_price)::numeric END AS total,
      o.id AS order_id,
      o.numero AS order_number,
      o.supplier_id,
      s.name AS supplier_name,
      c.stock_id,
      st.name AS stock_name,
      COALESCE(c.purchase_date, o.received_at::date, o.updated_at::date) AS business_date,
      o.created_by,
      COALESCE(NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Sistema') AS created_by_name,
      ft.id AS financial_transaction_id,
      ft.payment_method,
      ft.is_paid,
      CASE
        WHEN ft.id IS NULL THEN 'nao_vinculado'
        WHEN ft.is_paid = false THEN 'pendente'
        WHEN ft.payment_method IS NULL THEN 'nao_informado'
        ELSE 'pago'
      END AS payment_status,
      c.flow_type
    FROM public.compra_ordem_itens oi
    JOIN public.compra_ordens o ON o.id = oi.ordem_id
    JOIN public.compras c ON c.id = o.compra_id
    LEFT JOIN public.inventory i ON i.id = oi.inventory_id
    JOIN public.suppliers s ON s.id = o.supplier_id
    LEFT JOIN public.stocks st ON st.id = c.stock_id
    LEFT JOIN public.profiles p ON p.user_id = o.created_by AND p.company_id = v_company_id
    LEFT JOIN public.financial_transactions ft
      ON ft.id = o.financial_transaction_id
     AND ft.company_id = v_company_id
     AND ft.transaction_type = 'saida'
    WHERE oi.company_id = v_company_id
      AND o.company_id = v_company_id
      AND c.company_id = v_company_id
      AND oi.inventory_id IS NOT NULL
      AND oi.quantity_received > 0
      AND o.status IN ('recebida', 'recebida_parcial')
      AND c.status <> 'cancelada'
      AND c.stock_id IS NOT NULL
      AND public.can_access_stock(v_user_id, c.stock_id)
      AND (p_stock_ids IS NULL OR c.stock_id = ANY(p_stock_ids))
      AND (p_supplier_ids IS NULL OR o.supplier_id = ANY(p_supplier_ids))
      AND (p_created_by_ids IS NULL OR o.created_by = ANY(p_created_by_ids))
      AND (p_start_date IS NULL OR COALESCE(c.purchase_date, o.received_at::date, o.updated_at::date) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(c.purchase_date, o.received_at::date, o.updated_at::date) <= p_end_date)
  ),
  rolled_up AS (
    SELECT
      r.inventory_id,
      sum(r.quantity)::numeric AS purchased_quantity,
      COALESCE(sum(r.quantity) FILTER (WHERE r.unit_price IS NOT NULL), 0)::numeric AS priced_quantity,
      COALESCE(sum(r.quantity) FILTER (WHERE r.unit_price IS NULL), 0)::numeric AS unpriced_quantity,
      COALESCE(sum(r.total), 0)::numeric AS purchased_total,
      CASE
        WHEN sum(r.quantity) FILTER (WHERE r.unit_price IS NOT NULL) > 0
        THEN (sum(r.total) / (sum(r.quantity) FILTER (WHERE r.unit_price IS NOT NULL)))::numeric
        ELSE NULL
      END AS average_paid,
      count(DISTINCT r.order_id)::bigint AS purchase_count,
      max(r.business_date)::date AS last_purchase_date,
      jsonb_agg(
        jsonb_build_object(
          'date', r.business_date,
          'order_id', r.order_id,
          'order_number', r.order_number,
          'supplier_id', r.supplier_id,
          'supplier_name', r.supplier_name,
          'stock_id', r.stock_id,
          'stock_name', r.stock_name,
          'created_by', r.created_by,
          'created_by_name', r.created_by_name,
          'financial_transaction_id', r.financial_transaction_id,
          'payment_method', r.payment_method,
          'is_paid', r.is_paid,
          'payment_status', r.payment_status,
          'flow_type', r.flow_type,
          'unit', r.unit,
          'quantity', r.quantity,
          'unit_price', r.unit_price,
          'total', r.total,
          'kind', 'compra'
        ) ORDER BY r.business_date DESC, r.order_number DESC
      ) AS history
    FROM received r
    GROUP BY r.inventory_id
  )
  SELECT
    e.inventory_id,
    COALESCE(e.sku, '')::text,
    e.material_name::text,
    e.unit::text,
    e.group_id,
    e.group_name::text,
    e.group_color::text,
    e.current_balance,
    e.registered_sale_price,
    COALESCE(r.purchased_quantity, 0)::numeric,
    COALESCE(r.priced_quantity, 0)::numeric,
    COALESCE(r.unpriced_quantity, 0)::numeric,
    COALESCE(r.purchased_total, 0)::numeric,
    r.average_paid,
    COALESCE(r.purchase_count, 0)::bigint,
    r.last_purchase_date,
    COALESCE(r.history, '[]'::jsonb)
  FROM eligible_inventory e
  LEFT JOIN rolled_up r ON r.inventory_id = e.inventory_id
  ORDER BY e.material_name;
END;
$report$;

REVOKE ALL ON FUNCTION public.get_material_purchase_report(date, date, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_material_purchase_report(date, date, uuid[], uuid[], uuid[], uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_material_purchase_report(date, date, uuid[], uuid[], uuid[], uuid[]) IS
  'Relatorio de compras recebidas por material com media historica ponderada paga e historico comercial; respeita tenant e ACL de estoque.';

COMMIT;
