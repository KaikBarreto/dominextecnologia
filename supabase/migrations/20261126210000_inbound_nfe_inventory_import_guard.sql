-- Uma NF-e recebida pode originar UMA única entrada de estoque.
--
-- Existem dois fluxos legítimos:
--   * xml: entrada avulsa, sem compra/financeiro;
--   * purchase: compra + financeiro + entrada no estoque.
--
-- Antes desta migration os dois botões executavam movimentos independentes e
-- podiam duplicar o saldo. As RPCs abaixo travam a própria inbound_nfe com
-- FOR UPDATE e registram a origem na mesma transação das movimentações.

ALTER TABLE public.inbound_nfe
  ADD COLUMN IF NOT EXISTS inventory_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_import_source text,
  ADD COLUMN IF NOT EXISTS inventory_import_request_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_import_item_count integer;

ALTER TABLE public.inbound_nfe
  DROP CONSTRAINT IF EXISTS inbound_nfe_inventory_import_source_check,
  ADD CONSTRAINT inbound_nfe_inventory_import_source_check
    CHECK (inventory_import_source IS NULL OR inventory_import_source IN ('xml', 'purchase')),
  DROP CONSTRAINT IF EXISTS inbound_nfe_inventory_import_consistency_check,
  ADD CONSTRAINT inbound_nfe_inventory_import_consistency_check
    CHECK (
      (inventory_imported_at IS NULL
       AND inventory_import_source IS NULL
       AND inventory_import_request_id IS NULL
       AND inventory_import_item_count IS NULL)
      OR
      (inventory_imported_at IS NOT NULL
       AND inventory_import_source IS NOT NULL
       AND inventory_import_request_id IS NOT NULL
       AND inventory_import_item_count IS NOT NULL
       AND inventory_import_item_count > 0)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_nfe_financial_transaction
  ON public.inbound_nfe (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.inbound_nfe.inventory_imported_at IS
  'Instante em que esta NF-e gerou sua única entrada de estoque.';
COMMENT ON COLUMN public.inbound_nfe.inventory_import_source IS
  'Fluxo que gerou a entrada: xml (avulsa) ou purchase (compra + financeiro).';
COMMENT ON COLUMN public.inbound_nfe.inventory_import_request_id IS
  'Chave idempotente do fluxo que gerou a entrada; permite reconciliar retry após resposta perdida.';
COMMENT ON COLUMN public.inbound_nfe.inventory_import_item_count IS
  'Quantidade de linhas de material movimentadas pela entrada.';

-- Compatibilidade com entradas feitas pelo importador de XML antes desta
-- trava existir. Se a mesma chave já consta no log do tenant, a nota recebida
-- não pode voltar a movimentar o saldo por um dos novos atalhos.
WITH previous AS (
  SELECT DISTINCT ON (imported.company_id, imported.access_key)
         imported.company_id, imported.access_key, imported.created_at, imported.item_count
    FROM public.nfe_imports imported
   WHERE COALESCE(imported.item_count, 0) > 0
   ORDER BY imported.company_id, imported.access_key, imported.created_at DESC
)
UPDATE public.inbound_nfe note
   SET inventory_imported_at = previous.created_at,
       inventory_import_source = 'xml',
       inventory_import_request_id = gen_random_uuid(),
       inventory_import_item_count = previous.item_count
  FROM previous
 WHERE note.inventory_imported_at IS NULL
   AND previous.company_id = note.company_id
   AND previous.access_key = note.chave;

CREATE OR REPLACE FUNCTION public.import_inbound_nfe_inventory(
  p_inbound_nfe_id uuid,
  p_client_request_id uuid,
  p_stock_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_note public.inbound_nfe%ROWTYPE;
  v_supplier_id uuid;
  v_supplier_name text;
  v_inventory_id uuid;
  v_created integer := 0;
  v_imported integer := 0;
  v_existing_result jsonb;
  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin_or_gestor(v_user_id)
    OR public.is_super_admin(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:manage_inventory')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar estoque.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'Assinatura sem acesso ao estoque.' USING ERRCODE = '42501';
  END IF;

  IF p_inbound_nfe_id IS NULL OR p_client_request_id IS NULL OR p_stock_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar a nota, a operação e o local de estoque.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um item para dar entrada.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Uma entrada aceita no máximo 100 itens.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_note
    FROM public.inbound_nfe
   WHERE id = p_inbound_nfe_id
     AND company_id = v_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota recebida não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_note.inventory_imported_at IS NOT NULL THEN
    IF v_note.inventory_import_source = 'xml'
       AND v_note.inventory_import_request_id = p_client_request_id THEN
      v_existing_result := jsonb_build_object(
        'imported', v_note.inventory_import_item_count,
        'created', 0,
        'failed', 0,
        'replayed', true
      );
      RETURN v_existing_result;
    END IF;
    RAISE EXCEPTION 'Esta nota já gerou uma entrada de estoque.'
      USING ERRCODE = '23505', DETAIL = 'inbound_nfe_inventory_already_imported';
  END IF;

  IF v_note.fin_nfe = 4 THEN
    RAISE EXCEPTION 'Nota de devolução não pode gerar compra ou entrada por este fluxo.'
      USING ERRCODE = '23514';
  END IF;
  IF v_note.situacao_sefaz IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'Somente uma NF-e autorizada pode gerar entrada no estoque.'
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_supplier_id
    FROM public.suppliers
   WHERE company_id = v_company_id
     AND regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') =
         regexp_replace(COALESCE(v_note.emitente_cnpj, ''), '[^0-9]', '', 'g')
     AND length(regexp_replace(COALESCE(v_note.emitente_cnpj, ''), '[^0-9]', '', 'g')) IN (11, 14)
   ORDER BY created_at
   LIMIT 1;

  v_supplier_name := NULLIF(btrim(COALESCE(v_note.emitente_nome, '')), '');
  IF v_supplier_id IS NULL AND v_supplier_name IS NOT NULL THEN
    INSERT INTO public.suppliers (name, cpf_cnpj, company_id, created_by)
    VALUES (v_supplier_name, v_note.emitente_cnpj, v_company_id, v_user_id)
    RETURNING id INTO v_supplier_id;
  END IF;

  FOR r IN
    SELECT *
      FROM jsonb_to_recordset(p_items) AS x(
        inventory_id uuid,
        name text,
        unit text,
        quantity numeric,
        unit_cost numeric,
        fiscal_ncm text,
        fiscal_cest text,
        fiscal_gtin text,
        fiscal_origin text
      )
  LOOP
    IF r.quantity IS NULL OR r.quantity <= 0 THEN
      RAISE EXCEPTION 'Revise as quantidades dos itens da nota.' USING ERRCODE = '22023';
    END IF;
    IF r.unit_cost IS NULL OR r.unit_cost < 0 THEN
      RAISE EXCEPTION 'Revise os custos dos itens da nota.' USING ERRCODE = '22023';
    END IF;
    IF (r.fiscal_ncm IS NOT NULL AND btrim(r.fiscal_ncm) !~ '^[0-9]{8}$')
       OR (r.fiscal_cest IS NOT NULL AND btrim(r.fiscal_cest) !~ '^[0-9]{7}$')
       OR (r.fiscal_gtin IS NOT NULL AND btrim(r.fiscal_gtin) !~ '^([0-9]{8}|[0-9]{12,14})$')
       OR (r.fiscal_origin IS NOT NULL AND btrim(r.fiscal_origin) !~ '^[0-8]$') THEN
      RAISE EXCEPTION 'O XML contém uma classificação fiscal inválida para o material.'
        USING ERRCODE = '22023', DETAIL = 'inbound_nfe_invalid_fiscal_data';
    END IF;

    v_inventory_id := r.inventory_id;
    IF v_inventory_id IS NULL THEN
      IF NULLIF(btrim(COALESCE(r.name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Todo novo material precisa de um nome.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.inventory (
        name, unit, cost_price, quantity, supplier, company_id,
        fiscal_ncm, fiscal_cest, fiscal_gtin, fiscal_origin
      ) VALUES (
        btrim(r.name), COALESCE(NULLIF(btrim(r.unit), ''), 'un'),
        r.unit_cost, 0, v_supplier_name, v_company_id,
        NULLIF(btrim(r.fiscal_ncm), ''), NULLIF(btrim(r.fiscal_cest), ''),
        NULLIF(btrim(r.fiscal_gtin), ''), NULLIF(btrim(r.fiscal_origin), '')
      )
      RETURNING id INTO v_inventory_id;
      v_created := v_created + 1;
    ELSE
      PERFORM 1
        FROM public.inventory
       WHERE id = v_inventory_id
         AND company_id = v_company_id
         AND customer_id IS NULL
         AND archived_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um material selecionado não pertence ao estoque da empresa.'
          USING ERRCODE = '42501';
      END IF;

      -- O XML pode completar cadastro incompleto, mas nunca substitui uma
      -- classificação fiscal já revisada pela empresa/contabilidade.
      UPDATE public.inventory
         SET fiscal_ncm = COALESCE(NULLIF(btrim(fiscal_ncm), ''), NULLIF(btrim(r.fiscal_ncm), '')),
             fiscal_cest = COALESCE(NULLIF(btrim(fiscal_cest), ''), NULLIF(btrim(r.fiscal_cest), '')),
             fiscal_gtin = COALESCE(NULLIF(btrim(fiscal_gtin), ''), NULLIF(btrim(r.fiscal_gtin), '')),
             fiscal_origin = COALESCE(NULLIF(btrim(fiscal_origin), ''), NULLIF(btrim(r.fiscal_origin), ''))
       WHERE id = v_inventory_id
         AND company_id = v_company_id;
    END IF;

    PERFORM public.register_inventory_movement(
      p_inventory_id => v_inventory_id,
      p_movement_type => 'entrada',
      p_quantity => r.quantity,
      p_supplier_id => v_supplier_id,
      p_unit_cost => r.unit_cost,
      p_notes => 'Entrada avulsa pela NF-e recebida ' || v_note.chave,
      p_stock_id => p_stock_id
    );
    v_imported := v_imported + 1;
  END LOOP;

  IF v_imported <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Não foi possível validar todos os itens da nota.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.nfe_imports (
    company_id, access_key, supplier_id, supplier_name,
    total, item_count, created_by
  ) VALUES (
    v_company_id, v_note.chave, v_supplier_id, v_supplier_name,
    v_note.valor, v_imported, v_user_id
  );

  UPDATE public.inbound_nfe
     SET supplier_id = COALESCE(supplier_id, v_supplier_id),
         inventory_imported_at = now(),
         inventory_import_source = 'xml',
         inventory_import_request_id = p_client_request_id,
         inventory_import_item_count = v_imported
   WHERE id = v_note.id;

  RETURN jsonb_build_object(
    'imported', v_imported,
    'created', v_created,
    'failed', 0,
    'replayed', false
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.registrar_compra_material_direta_from_inbound_nfe(
  p_inbound_nfe_id uuid,
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
  p_notes text,
  p_financial_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_note public.inbound_nfe%ROWTYPE;
  v_result jsonb;
  v_financial_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_items_total numeric(14,2);
  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada.' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);

  SELECT * INTO v_note
    FROM public.inbound_nfe
   WHERE id = p_inbound_nfe_id
     AND company_id = v_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota recebida não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_note.inventory_imported_at IS NOT NULL
     AND NOT (
       v_note.inventory_import_source = 'purchase'
       AND v_note.inventory_import_request_id = p_client_request_id
     ) THEN
    RAISE EXCEPTION 'Esta nota já gerou uma entrada de estoque.'
      USING ERRCODE = '23505', DETAIL = 'inbound_nfe_inventory_already_imported';
  END IF;

  IF v_note.inventory_imported_at IS NULL AND v_note.financial_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta nota já possui um lançamento financeiro.'
      USING ERRCODE = '23505', DETAIL = 'inbound_nfe_financial_already_linked';
  END IF;

  IF v_note.fin_nfe = 4 THEN
    RAISE EXCEPTION 'Nota de devolução não pode gerar compra por este fluxo.' USING ERRCODE = '23514';
  END IF;
  IF v_note.situacao_sefaz IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'Somente uma NF-e autorizada pode gerar compra e entrada.' USING ERRCODE = '23514';
  END IF;
  IF p_financial_total IS NULL OR p_financial_total <= 0
     OR v_note.valor IS NULL
     OR round(p_financial_total, 2) IS DISTINCT FROM round(v_note.valor, 2) THEN
    RAISE EXCEPTION 'O total financeiro deve corresponder ao valor oficial da NF-e.'
      USING ERRCODE = '22023', DETAIL = 'inbound_nfe_financial_total_invalid';
  END IF;

  v_result := public.registrar_compra_material_direta(
    p_client_request_id,
    p_stock_id,
    p_supplier_id,
    p_items,
    p_purchase_date,
    p_account_id,
    p_category_id,
    p_is_paid,
    p_paid_date,
    p_due_date,
    p_payment_method,
    p_description,
    p_notes
  );
  v_financial_id := NULLIF(v_result->>'financial_transaction_id', '')::uuid;
  v_order_id := NULLIF(v_result->>'ordem_id', '')::uuid;
  IF v_financial_id IS NULL THEN
    RAISE EXCEPTION 'A compra não gerou o lançamento financeiro esperado.'
      USING ERRCODE = '23514', DETAIL = 'inbound_nfe_financial_missing';
  END IF;

  SELECT round(sum(round(x.quantity, 4) * x.unit_price), 2)
    INTO v_items_total
    FROM jsonb_to_recordset(p_items) AS x(quantity numeric, unit_price numeric);

  SELECT purchase_order.numero
    INTO v_order_number
    FROM public.compra_ordens purchase_order
   WHERE purchase_order.id = v_order_id
     AND purchase_order.company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A compra não gerou a ordem esperada.'
      USING ERRCODE = '23514', DETAIL = 'inbound_nfe_purchase_order_missing';
  END IF;

  -- O núcleo de compra direta continua limitado a duas casas para digitação
  -- manual. No caminho fiscal, restauramos a escala exata do vUnCom após a
  -- validação atômica do núcleo. A O.C. e o ledger preservam o documento; o
  -- total financeiro continua sendo o vNF em duas casas.
  FOR r IN
    SELECT inventory_id, unit_price
      FROM jsonb_to_recordset(p_items) AS x(
        inventory_id uuid,
        unit_price numeric
      )
  LOOP
    IF r.unit_price IS NULL OR r.unit_price < 0 OR scale(r.unit_price) > 10 THEN
      RAISE EXCEPTION 'Revise os custos unitários dos itens da nota.'
        USING ERRCODE = '22023', DETAIL = 'inbound_nfe_unit_cost_invalid';
    END IF;

    UPDATE public.compra_ordem_itens purchase_item
       SET unit_price = r.unit_price
     WHERE purchase_item.ordem_id = v_order_id
       AND purchase_item.company_id = v_company_id
       AND purchase_item.inventory_id = r.inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um item da NF-e não foi localizado na ordem de compra.'
        USING ERRCODE = '23514', DETAIL = 'inbound_nfe_purchase_item_missing';
    END IF;

    UPDATE public.inventory_movements movement
       SET unit_cost = r.unit_price
     WHERE movement.company_id = v_company_id
       AND movement.inventory_id = r.inventory_id
       AND movement.stock_id = p_stock_id
       AND movement.supplier_id = p_supplier_id
       AND movement.movement_type = 'entrada'
       AND movement.notes = 'Recebimento da O.C. #' || v_order_number::text;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O movimento de entrada de um item da NF-e não foi localizado.'
        USING ERRCODE = '23514', DETAIL = 'inbound_nfe_inventory_movement_missing';
    END IF;
  END LOOP;

  -- A compra direta exige materiais já cadastrados. Depois que o núcleo
  -- validou tenant, itens e estoque, o XML apenas completa campos fiscais
  -- ainda vazios dentro da mesma transação da compra e da entrada.
  FOR r IN
    SELECT *
      FROM jsonb_to_recordset(p_items) AS x(
        inventory_id uuid,
        fiscal_ncm text,
        fiscal_cest text,
        fiscal_gtin text,
        fiscal_origin text
      )
  LOOP
    IF (r.fiscal_ncm IS NOT NULL AND btrim(r.fiscal_ncm) !~ '^[0-9]{8}$')
       OR (r.fiscal_cest IS NOT NULL AND btrim(r.fiscal_cest) !~ '^[0-9]{7}$')
       OR (r.fiscal_gtin IS NOT NULL AND btrim(r.fiscal_gtin) !~ '^([0-9]{8}|[0-9]{12,14})$')
       OR (r.fiscal_origin IS NOT NULL AND btrim(r.fiscal_origin) !~ '^[0-8]$') THEN
      RAISE EXCEPTION 'O XML contém uma classificação fiscal inválida para o material.'
        USING ERRCODE = '22023', DETAIL = 'inbound_nfe_invalid_fiscal_data';
    END IF;

    UPDATE public.inventory
       SET fiscal_ncm = COALESCE(NULLIF(btrim(fiscal_ncm), ''), NULLIF(btrim(r.fiscal_ncm), '')),
           fiscal_cest = COALESCE(NULLIF(btrim(fiscal_cest), ''), NULLIF(btrim(r.fiscal_cest), '')),
           fiscal_gtin = COALESCE(NULLIF(btrim(fiscal_gtin), ''), NULLIF(btrim(r.fiscal_gtin), '')),
           fiscal_origin = COALESCE(NULLIF(btrim(fiscal_origin), ''), NULLIF(btrim(r.fiscal_origin), ''))
     WHERE id = r.inventory_id
       AND company_id = v_company_id
       AND customer_id IS NULL
       AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um material selecionado não pertence ao estoque da empresa.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  UPDATE public.inbound_nfe
     SET supplier_id = COALESCE(supplier_id, p_supplier_id),
         financial_transaction_id = COALESCE(
           financial_transaction_id,
           v_financial_id
         ),
         inventory_imported_at = COALESCE(inventory_imported_at, now()),
         inventory_import_source = COALESCE(inventory_import_source, 'purchase'),
         inventory_import_request_id = COALESCE(inventory_import_request_id, p_client_request_id),
         inventory_import_item_count = COALESCE(inventory_import_item_count, jsonb_array_length(p_items))
   WHERE id = v_note.id;

  -- O custo unitário e o histórico dos itens permanecem os do XML. O título
  -- financeiro, porém, precisa refletir o vNF canônico (produtos + frete +
  -- impostos - descontos + outros ajustes). A trava do Financeiro permite
  -- esta correção somente quando o lançamento já está vinculado à própria
  -- NF-e e o novo valor coincide exatamente com inbound_nfe.valor.
  UPDATE public.financial_transactions
     SET amount = round(p_financial_total, 2)
   WHERE id = v_financial_id
     AND company_id = v_company_id
     AND amount IS DISTINCT FROM round(p_financial_total, 2);
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1
      FROM public.financial_transactions transaction
     WHERE transaction.id = v_financial_id
       AND transaction.company_id = v_company_id
       AND transaction.amount = round(p_financial_total, 2)
  ) THEN
    RAISE EXCEPTION 'Não foi possível reconciliar o total financeiro da NF-e.'
      USING ERRCODE = '23514', DETAIL = 'inbound_nfe_financial_total_not_applied';
  END IF;

  RETURN v_result || jsonb_build_object(
    'items_total', v_items_total,
    'acquisition_charges', round(p_financial_total, 2) - v_items_total,
    'total_amount', round(p_financial_total, 2)
  );
END;
$fn$;

-- A compra direta continua imutável. A única exceção possível é reconciliar o
-- valor do lançamento com o total de uma NF-e já vinculada ao mesmo registro.
-- Não existe permissão para definir um valor arbitrário nem para alterar
-- empresa, tipo, data comercial ou fornecedor junto com essa reconciliação.
CREATE OR REPLACE FUNCTION public.guard_direct_purchase_financial_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.compra_ordens purchase_order
      JOIN public.compras purchase ON purchase.id = purchase_order.compra_id
     WHERE purchase_order.financial_transaction_id = OLD.id
       AND purchase.flow_type = 'compra_direta'
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'direct_purchase_financial_is_immutable'
        USING ERRCODE = 'check_violation';
    END IF;

    IF ROW(OLD.company_id, OLD.transaction_type, OLD.transaction_date, OLD.supplier_id)
       IS DISTINCT FROM
       ROW(NEW.company_id, NEW.transaction_type, NEW.transaction_date, NEW.supplier_id) THEN
      RAISE EXCEPTION 'direct_purchase_financial_is_immutable'
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.amount IS DISTINCT FROM NEW.amount AND NOT EXISTS (
      SELECT 1
        FROM public.inbound_nfe note
       WHERE note.financial_transaction_id = OLD.id
         AND note.company_id = OLD.company_id
         AND note.inventory_import_source = 'purchase'
         AND round(note.valor, 2) = round(NEW.amount, 2)
    ) THEN
      RAISE EXCEPTION 'direct_purchase_financial_is_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

REVOKE ALL ON FUNCTION public.guard_direct_purchase_financial_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.import_inbound_nfe_inventory(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_inbound_nfe_inventory(uuid, uuid, uuid, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.registrar_compra_material_direta_from_inbound_nfe(
  uuid, uuid, uuid, uuid, jsonb, date, uuid, uuid, boolean, date, date, text, text, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_material_direta_from_inbound_nfe(
  uuid, uuid, uuid, uuid, jsonb, date, uuid, uuid, boolean, date, date, text, text, text, numeric
) TO authenticated, service_role;
