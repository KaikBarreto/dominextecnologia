-- ============================================================================
-- Assinatura Asaas de contrato = fonte única do Contas a Receber
-- ============================================================================
--
-- Problema provado em produção:
--   * cada ciclo da assinatura Asaas criava um recebível sem contract_id;
--   * a cobrança contínua interna criava outra parcela do mesmo contrato;
--   * a NFS-e automática não enxergava o recebível vindo do Asaas;
--   * ativar as duas recorrências dobraria a receita.
--
-- Regra nova:
--   1. assinatura viva source_type='contract' é a recorrência canônica;
--   2. cada tenant_charge dela possui exatamente UM recebível-mãe;
--   3. parcela aberta idêntica é REUTILIZADA, nunca duplicada;
--   4. divergência vira estado de sincronização visível, nunca INSERT silencioso;
--   5. o recebível leva contract_id e passa a alimentar os três modos da NFS-e;
--   6. cobrança contínua interna e assinatura Asaas viva são mutuamente exclusivas.
--
-- Não há DELETE financeiro nesta migration. Histórico pago/cancelado permanece.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Estado explícito da sincronização cobrança -> Financeiro
-- --------------------------------------------------------------------------
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS finance_sync_status text,
  ADD COLUMN IF NOT EXISTS finance_sync_error text,
  ADD COLUMN IF NOT EXISTS finance_sync_checked_at timestamptz;

COMMENT ON COLUMN public.tenant_charges.finance_sync_status IS
  'Sincronização com o recebível: synced, skipped, conflict ou error. NULL = cobrança anterior/não aplicável.';
COMMENT ON COLUMN public.tenant_charges.finance_sync_error IS
  'Orientação operacional em PT-BR quando a cobrança não pôde ser vinculada ao Financeiro sem risco de duplicidade.';
COMMENT ON COLUMN public.tenant_charges.finance_sync_checked_at IS
  'Última vez em que o vínculo cobrança -> recebível foi conferido.';

DO $preflight_mother$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.financial_transactions ft
      JOIN public.tenant_charges tc ON tc.id = ft.tenant_charge_id
     WHERE ft.tenant_charge_id IS NOT NULL
       AND ft.transaction_type = 'entrada'
       AND ft.parent_transaction_id IS NULL
       AND ft.company_id IS DISTINCT FROM tc.company_id
  ) THEN
    RAISE EXCEPTION
      'Abortado: existe recebível-mãe ligado a cobrança de outra empresa. Corrija o vínculo cross-tenant antes de continuar.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id IS NOT NULL
       AND ft.transaction_type = 'entrada'
       AND ft.parent_transaction_id IS NULL
     GROUP BY ft.tenant_charge_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Abortado: já existem cobranças com mais de um recebível-mãe. Corrija os dados antes de criar a trava única.';
  END IF;
END
$preflight_mother$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_transactions_one_mother_per_charge
  ON public.financial_transactions (tenant_charge_id)
  WHERE tenant_charge_id IS NOT NULL
    AND transaction_type = 'entrada'
    AND parent_transaction_id IS NULL;

-- --------------------------------------------------------------------------
-- 2) RPC transacional: deriva toda a posse do banco e garante UMA parcela
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_contract_subscription_receivable(
  p_company_id uuid,
  p_tenant_charge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge       public.tenant_charges%ROWTYPE;
  v_subscription public.tenant_subscriptions%ROWTYPE;
  v_contract     public.contracts%ROWTYPE;
  v_existing     public.financial_transactions%ROWTYPE;
  v_candidate    public.financial_transactions%ROWTYPE;
  v_due_date     date;
  v_customer_id  uuid;
  v_account_id   uuid;
  v_category     text;
  v_cost_center  uuid;
  v_description  text;
  v_auto_post    boolean := true;
  v_exact_count  integer := 0;
  v_new_id       uuid;
  v_message      text;
BEGIN
  IF p_company_id IS NULL OR p_tenant_charge_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'missing_args');
  END IF;

  -- Lock da cobrança: serializa webhook, autocura e backfill da mesma parcela.
  SELECT tc.* INTO v_charge
    FROM public.tenant_charges tc
   WHERE tc.id = p_tenant_charge_id
     AND tc.company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'charge_not_found');
  END IF;

  IF v_charge.subscription_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_contract_subscription');
  END IF;

  SELECT s.* INTO v_subscription
    FROM public.tenant_subscriptions s
   WHERE s.id = v_charge.subscription_id
     AND s.company_id = p_company_id
     AND s.source_type = 'contract'
     AND s.source_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_contract_subscription');
  END IF;

  SELECT c.* INTO v_contract
    FROM public.contracts c
   WHERE c.id = v_subscription.source_id
     AND c.company_id = p_company_id;

  IF NOT FOUND THEN
    v_message := 'O contrato vinculado à cobrança não foi encontrado nesta empresa.';
    UPDATE public.tenant_charges
       SET finance_sync_status = 'conflict', finance_sync_error = v_message,
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', false, 'status', 'conflict', 'error', v_message);
  END IF;

  -- Cliente do contrato é canônico. Assinatura com outro cliente não pode ser
  -- ligada silenciosamente: a baixa iria para a pessoa errada.
  IF v_subscription.customer_id IS NOT NULL
     AND v_contract.customer_id IS NOT NULL
     AND v_subscription.customer_id IS DISTINCT FROM v_contract.customer_id THEN
    v_message := 'O cliente da assinatura é diferente do cliente do contrato. Revise a cobrança antes de continuar.';
    UPDATE public.tenant_charges
       SET finance_sync_status = 'conflict', finance_sync_error = v_message,
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', false, 'status', 'conflict', 'error', v_message);
  END IF;

  v_due_date    := COALESCE(v_charge.due_date, v_charge.created_at::date);
  v_customer_id := COALESCE(v_contract.customer_id, v_subscription.customer_id, v_charge.customer_id);

  -- DELETED é ausência intencional no gateway. Nem backfill nem reentrega
  -- completam/criam espelho para ela; o histórico financeiro já existente
  -- permanece intocado.
  IF upper(COALESCE(v_charge.status, '')) = 'DELETED' THEN
    UPDATE public.tenant_charges
       SET finance_sync_status = 'skipped',
           finance_sync_error = 'Cobrança removida no Asaas; nenhum recebível foi alterado.',
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', true, 'status', 'skipped_deleted');
  END IF;

  -- Caso legado: a cobrança já tem mãe. Só completa o vínculo ausente; nunca
  -- troca um contract_id divergente nem regrava dinheiro/histórico.
  SELECT ft.* INTO v_existing
    FROM public.financial_transactions ft
   WHERE ft.company_id = p_company_id
     AND ft.tenant_charge_id = v_charge.id
     AND ft.transaction_type = 'entrada'
     AND ft.parent_transaction_id IS NULL
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.contract_id IS NOT NULL
       AND v_existing.contract_id IS DISTINCT FROM v_contract.id THEN
      v_message := 'A cobrança já está ligada a uma parcela de outro contrato. Nenhuma alteração foi feita.';
      UPDATE public.tenant_charges
         SET finance_sync_status = 'conflict', finance_sync_error = v_message,
             finance_sync_checked_at = now(), updated_at = now()
       WHERE id = v_charge.id AND company_id = p_company_id;
      RETURN jsonb_build_object('ok', false, 'status', 'conflict', 'error', v_message);
    END IF;

    UPDATE public.financial_transactions
       SET contract_id      = COALESCE(contract_id, v_contract.id),
           transaction_date = COALESCE(transaction_date, due_date, v_due_date),
           updated_at       = now()
     WHERE id = v_existing.id
       AND company_id = p_company_id;

    UPDATE public.tenant_charges
       SET finance_sync_status = 'synced', finance_sync_error = NULL,
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;

    RETURN jsonb_build_object(
      'ok', true, 'status', 'synced_existing',
      'receivable_id', v_existing.id, 'contract_id', v_contract.id
    );
  END IF;

  -- Opt-out gravado na cobrança ou na conta também é respeitado e fica
  -- explícito para a UI.
  IF COALESCE(v_charge.post_to_finance, true) = false THEN
    UPDATE public.tenant_charges
       SET finance_sync_status = 'skipped',
           finance_sync_error = 'Esta cobrança foi configurada para não lançar no Financeiro.',
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', true, 'status', 'skipped_charge_opt_out');
  END IF;

  SELECT COALESCE(tpa.auto_post_to_finance, true),
         tpa.default_finance_account_id,
         COALESCE(NULLIF(btrim(v_subscription.category), ''),
                  NULLIF(btrim(tpa.default_income_category), '')),
         v_subscription.cost_center_id,
         COALESCE(NULLIF(btrim(v_charge.description), ''),
                  NULLIF(btrim(v_subscription.description), ''),
                  NULLIF(btrim(tpa.default_description), ''),
                  'Contrato: ' || v_contract.name)
    INTO v_auto_post, v_account_id, v_category, v_cost_center, v_description
    FROM public.tenant_payment_accounts tpa
   WHERE tpa.company_id = p_company_id
   LIMIT 1;

  IF NOT FOUND THEN
    v_auto_post   := true;
    v_account_id  := NULL;
    v_category    := NULLIF(btrim(v_subscription.category), '');
    v_cost_center := v_subscription.cost_center_id;
    v_description := COALESCE(NULLIF(btrim(v_charge.description), ''),
                              NULLIF(btrim(v_subscription.description), ''),
                              'Contrato: ' || v_contract.name);
  END IF;

  IF v_auto_post = false THEN
    UPDATE public.tenant_charges
       SET finance_sync_status = 'skipped',
           finance_sync_error = 'O lançamento automático no Financeiro está desligado na conta Asaas.',
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', true, 'status', 'skipped_tenant_opt_out');
  END IF;

  IF v_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_accounts fa
     WHERE fa.id = v_account_id AND fa.company_id = p_company_id
  ) THEN
    v_account_id := NULL;
  END IF;

  IF v_cost_center IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers cc
     WHERE cc.id = v_cost_center AND cc.company_id = p_company_id
  ) THEN
    v_cost_center := NULL;
  END IF;

  -- Serializa TODAS as cobranças do mesmo contrato/data, não apenas reentrega
  -- da mesma tenant_charge. Sem isto duas cobranças simultâneas poderiam ler
  -- "nenhuma parcela" e inserir duas antes de enxergar a outra.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_contract.id::text || ':' || v_due_date::text, 0)
  );

  SELECT count(*) INTO v_exact_count
    FROM public.financial_transactions ft
   WHERE ft.company_id = p_company_id
     AND ft.contract_id = v_contract.id
     AND ft.transaction_type = 'entrada'
     AND ft.parent_transaction_id IS NULL
     AND ft.cancelled_at IS NULL
     AND ft.is_paid IS DISTINCT FROM true
     AND COALESCE(ft.amount_received, 0) = 0
     AND ft.tenant_charge_id IS NULL
     AND COALESCE(ft.due_date, ft.transaction_date) = v_due_date
     AND round(ft.amount, 2) = round(v_charge.value, 2)
     AND ft.customer_id IS NOT DISTINCT FROM v_customer_id;

  IF v_exact_count > 1 THEN
    v_message := 'Há mais de uma parcela compatível neste contrato. Escolha qual delas deve receber a cobrança antes de continuar.';
    UPDATE public.tenant_charges
       SET finance_sync_status = 'conflict', finance_sync_error = v_message,
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', false, 'status', 'conflict', 'error', v_message);
  END IF;

  IF v_exact_count = 1 THEN
    SELECT ft.* INTO v_candidate
      FROM public.financial_transactions ft
     WHERE ft.company_id = p_company_id
       AND ft.contract_id = v_contract.id
       AND ft.transaction_type = 'entrada'
       AND ft.parent_transaction_id IS NULL
       AND ft.cancelled_at IS NULL
       AND ft.is_paid IS DISTINCT FROM true
       AND COALESCE(ft.amount_received, 0) = 0
       AND ft.tenant_charge_id IS NULL
       AND COALESCE(ft.due_date, ft.transaction_date) = v_due_date
       AND round(ft.amount, 2) = round(v_charge.value, 2)
       AND ft.customer_id IS NOT DISTINCT FROM v_customer_id
     LIMIT 1
     FOR UPDATE;

    UPDATE public.financial_transactions
       SET tenant_charge_id = v_charge.id,
           transaction_date = COALESCE(due_date, v_due_date),
           updated_at = now()
     WHERE id = v_candidate.id
       AND company_id = p_company_id
       AND tenant_charge_id IS NULL;

    IF FOUND THEN
      UPDATE public.tenant_charges
         SET finance_sync_status = 'synced', finance_sync_error = NULL,
             finance_sync_checked_at = now(), updated_at = now()
       WHERE id = v_charge.id AND company_id = p_company_id;
      RETURN jsonb_build_object(
        'ok', true, 'status', 'linked_existing',
        'receivable_id', v_candidate.id, 'contract_id', v_contract.id
      );
    END IF;
    -- Compare-and-swap perdeu uma corrida; continua para a checagem de conflito.
  END IF;

  -- Parcela ativa da mesma competência mas incompatível = provável dupla
  -- configuração. Não cria uma segunda receita nem altera valor/cliente pago.
  IF EXISTS (
    SELECT 1
      FROM public.financial_transactions ft
     WHERE ft.company_id = p_company_id
       AND ft.contract_id = v_contract.id
       AND ft.transaction_type = 'entrada'
       AND ft.parent_transaction_id IS NULL
       AND ft.cancelled_at IS NULL
       AND COALESCE(ft.due_date, ft.transaction_date) = v_due_date
  ) THEN
    v_message := 'Já existe uma parcela deste contrato na mesma data, mas valor, cliente ou estado são diferentes da cobrança Asaas. Nenhuma segunda receita foi criada.';
    UPDATE public.tenant_charges
       SET finance_sync_status = 'conflict', finance_sync_error = v_message,
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = v_charge.id AND company_id = p_company_id;
    RETURN jsonb_build_object('ok', false, 'status', 'conflict', 'error', v_message);
  END IF;

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, amount, description, customer_id,
    due_date, transaction_date, tenant_charge_id, contract_id,
    is_paid, account_id, category, cost_center_id, created_by
  ) VALUES (
    p_company_id, 'entrada', v_charge.value, left(v_description, 500), v_customer_id,
    v_due_date, v_due_date, v_charge.id, v_contract.id,
    false, v_account_id, v_category, v_cost_center, NULL
  )
  RETURNING id INTO v_new_id;

  UPDATE public.tenant_charges
     SET finance_sync_status = 'synced', finance_sync_error = NULL,
         finance_sync_checked_at = now(), updated_at = now()
   WHERE id = v_charge.id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'created',
    'receivable_id', v_new_id, 'contract_id', v_contract.id
  );
EXCEPTION
  WHEN unique_violation THEN
    -- A trava física decide a corrida. Releitura idempotente, sem segundo INSERT.
    SELECT ft.* INTO v_existing
      FROM public.financial_transactions ft
     WHERE ft.company_id = p_company_id
       AND ft.tenant_charge_id = p_tenant_charge_id
       AND ft.transaction_type = 'entrada'
       AND ft.parent_transaction_id IS NULL
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'status', 'synced_race',
                                'receivable_id', v_existing.id,
                                'contract_id', v_existing.contract_id);
    END IF;
    UPDATE public.tenant_charges
       SET finance_sync_status = 'error',
           finance_sync_error = 'A cobrança concorreu com outro lançamento e não pôde ser vinculada automaticamente. Revise a parcela do contrato.',
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = p_tenant_charge_id AND company_id = p_company_id;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'error', 'A cobrança concorreu com outro lançamento e precisa de revisão.'
    );
  WHEN OTHERS THEN
    -- Retornar, em vez de relançar, é intencional: um RAISE reverteria também
    -- o estado operacional abaixo e esconderia a cobrança que requer revisão.
    UPDATE public.tenant_charges
       SET finance_sync_status = 'error',
           finance_sync_error = 'Não foi possível sincronizar esta cobrança com o Financeiro. Tente novamente.',
           finance_sync_checked_at = now(), updated_at = now()
     WHERE id = p_tenant_charge_id AND company_id = p_company_id;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'error', 'Não foi possível sincronizar esta cobrança com o Financeiro. Tente novamente.'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_contract_subscription_receivable(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_contract_subscription_receivable(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.ensure_contract_subscription_receivable(uuid, uuid) IS
  'Garante exatamente um recebível por ciclo de assinatura Asaas vinculada a contrato. Deriva assinatura/contrato/cliente no banco, serializa por cobrança e contrato/data, reutiliza parcela aberta idêntica, completa contract_id legado e recusa divergência sem duplicar receita. Somente service_role.';

-- --------------------------------------------------------------------------
-- 3) Defesa em profundidade: qualquer escrita com tenant_charge de assinatura
--    contratual carrega o contract_id correto e competência do vencimento.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_contract_subscription_receivable_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id  uuid;
  v_contract_id uuid;
BEGIN
  IF NEW.tenant_charge_id IS NULL OR NEW.transaction_type <> 'entrada'
     OR NEW.parent_transaction_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT tc.company_id, s.source_id
    INTO v_company_id, v_contract_id
    FROM public.tenant_charges tc
    JOIN public.tenant_subscriptions s
      ON s.id = tc.subscription_id
     AND s.company_id = tc.company_id
     AND s.source_type = 'contract'
     AND s.source_id IS NOT NULL
   WHERE tc.id = NEW.tenant_charge_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_company_id OR NOT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = v_contract_id AND c.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Vínculo cobrança/contrato inválido para esta empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.contract_id IS NOT NULL AND NEW.contract_id IS DISTINCT FROM v_contract_id THEN
    RAISE EXCEPTION 'A cobrança recorrente já pertence a outro contrato.'
      USING ERRCODE = '23001';
  END IF;

  NEW.contract_id := v_contract_id;
  NEW.transaction_date := COALESCE(NEW.due_date, NEW.transaction_date);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_contract_subscription_receivable_link
  ON public.financial_transactions;
CREATE TRIGGER trg_enforce_contract_subscription_receivable_link
  BEFORE INSERT OR UPDATE OF tenant_charge_id, contract_id, due_date, transaction_date
  ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contract_subscription_receivable_link();

REVOKE ALL ON FUNCTION public.enforce_contract_subscription_receivable_link()
  FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4) Compatibilidade com edge/autocura antigos sem copiar funções extensas.
--    Injeta delegação na definição viva e aborta se o molde mudar.
-- --------------------------------------------------------------------------
DO $patch_create_receivable$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid,uuid)'::regprocedure
  ) INTO v_def;

  v_new := regexp_replace(
    v_def,
    E'(v_quote_generated[[:space:]]+timestamptz;[[:space:]]*BEGIN)',
    E'v_quote_generated  timestamptz;\n  v_contract_sync   jsonb;\nBEGIN\n  v_contract_sync := public.ensure_contract_subscription_receivable(p_company_id, p_tenant_charge_id);\n  IF COALESCE(v_contract_sync->>''status'', '''') <> ''not_contract_subscription''\n     AND COALESCE(v_contract_sync->>''status'', '''') <> ''charge_not_found''\n     AND COALESCE(v_contract_sync->>''status'', '''') <> ''missing_args'' THEN\n    IF v_contract_sync ? ''receivable_id'' THEN\n      RETURN (v_contract_sync->>''receivable_id'')::uuid;\n    END IF;\n    -- Não relança conflito/erro: isso reverteria finance_sync_status/error,\n    -- justamente o rastro operacional usado para resolver a divergência.\n    RAISE WARNING ''[create_tenant_charge_receivable] %'', COALESCE(v_contract_sync->>''error'', ''Cobrança contratual sem recebível; revise a sincronização financeira.'');\n    RETURN NULL;\n  END IF;',
    'n'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'Abortado: molde de create_tenant_charge_receivable mudou; delegação contratual não foi instalada.';
  END IF;
  EXECUTE v_new;
END
$patch_create_receivable$;

DO $patch_rebuild$
DECLARE
  v_def text;
  v_new text;
  v_marker text := E'\n  -- (0) Parcela de contrato NUNCA e curada.';
  v_injection text := E'\n  -- Assinatura Asaas de contrato usa a RPC canônica: cura sem duplicar e com contract_id.\n  v_contract_sync := public.ensure_contract_subscription_receivable(v_charge.company_id, v_charge.id);\n  IF COALESCE(v_contract_sync->>''status'', '''') <> ''not_contract_subscription'' THEN\n    RETURN jsonb_build_object(\n      ''healed'', (v_contract_sync ? ''receivable_id''),\n      ''status'', COALESCE(v_contract_sync->>''status'', ''heal_failed''),\n      ''receivable_id'', v_contract_sync->>''receivable_id'',\n      ''company_id'', v_charge.company_id,\n      ''amount'', v_charge.value,\n      ''detail'', v_contract_sync->>''error''\n    );\n  END IF;\n';
BEGIN
  SELECT pg_get_functiondef(
    'public.rebuild_tenant_charge_receivable(uuid,text)'::regprocedure
  ) INTO v_def;

  v_new := regexp_replace(
    v_def,
    E'(v_note[[:space:]]+text;)',
    E'\\1\n  v_contract_sync jsonb;',
    'n'
  );
  IF v_new = v_def OR position(v_marker IN v_new) = 0 THEN
    RAISE EXCEPTION 'Abortado: molde de rebuild_tenant_charge_receivable mudou; delegação contratual não foi instalada.';
  END IF;
  v_new := replace(v_new, v_marker, v_injection || v_marker);
  EXECUTE v_new;
END
$patch_rebuild$;

-- CREATE OR REPLACE preserva ACL, mas reafirmamos o menor privilégio.
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.rebuild_tenant_charge_receivable(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_tenant_charge_receivable(uuid,text)
  TO service_role;

-- --------------------------------------------------------------------------
-- 5) Fonte única: assinatura viva desliga e bloqueia recorrência interna.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_subscription_is_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_type = 'contract'
     AND NEW.source_id IS NOT NULL
     AND NEW.deleted_at IS NULL
     AND NEW.status <> 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = NEW.source_id AND c.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'O contrato da assinatura não pertence a esta empresa.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.contracts
       SET finance_indeterminate = false,
           updated_at = now()
     WHERE id = NEW.source_id
       AND company_id = NEW.company_id
       AND finance_indeterminate = true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contract_subscription_is_canonical
  ON public.tenant_subscriptions;
CREATE TRIGGER trg_contract_subscription_is_canonical
  BEFORE INSERT OR UPDATE OF source_type, source_id, status, deleted_at
  ON public.tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.contract_subscription_is_canonical();

CREATE OR REPLACE FUNCTION public.block_internal_recurrence_with_live_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.finance_indeterminate = true
     AND OLD.finance_indeterminate IS DISTINCT FROM true
     AND EXISTS (
       SELECT 1
         FROM public.tenant_subscriptions s
        WHERE s.company_id = NEW.company_id
          AND s.source_type = 'contract'
          AND s.source_id = NEW.id
          AND s.deleted_at IS NULL
          AND s.status <> 'cancelled'
     ) THEN
    RAISE EXCEPTION 'Este contrato já possui cobrança automática via Asaas. Não ative outra recorrência no Financeiro, pois isso duplicaria as contas a receber.'
      USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_internal_recurrence_with_live_subscription
  ON public.contracts;
CREATE TRIGGER trg_block_internal_recurrence_with_live_subscription
  BEFORE UPDATE OF finance_indeterminate
  ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.block_internal_recurrence_with_live_subscription();

REVOKE ALL ON FUNCTION public.contract_subscription_is_canonical()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_internal_recurrence_with_live_subscription()
  FROM PUBLIC, anon, authenticated;

-- Estado já existente: Asaas vence a disputa sem apagar parcela/histórico.
UPDATE public.contracts c
   SET finance_indeterminate = false,
       updated_at = now()
 WHERE c.finance_indeterminate = true
   AND EXISTS (
     SELECT 1 FROM public.tenant_subscriptions s
      WHERE s.company_id = c.company_id
        AND s.source_type = 'contract'
        AND s.source_id = c.id
        AND s.deleted_at IS NULL
        AND s.status <> 'cancelled'
   );

-- --------------------------------------------------------------------------
-- 6) Status canônicos de NFS-e usados pelo backfill e pelos enfileiradores
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nfse_auto_emission_blocks(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO 'public'
AS $function$
  SELECT p_status = ANY (ARRAY[
    'pendente', 'confirmacao_pendente', 'processando', 'autorizada',
    'falhou', 'cancelamento_pendente', 'cancelada'
  ]::text[])
$function$;

REVOKE ALL ON FUNCTION public.nfse_auto_emission_blocks(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfse_auto_emission_blocks(text)
  TO service_role;

-- --------------------------------------------------------------------------
-- 7) Backfill genérico e idempotente
-- --------------------------------------------------------------------------
DO $backfill_contract_subscriptions$
DECLARE
  v_charge record;
  v_result jsonb;
  v_payment jsonb;
BEGIN
  FOR v_charge IN
    SELECT tc.id, tc.company_id, tc.asaas_payment_id, tc.payment_date,
           tc.net_value, tc.status
      FROM public.tenant_charges tc
      JOIN public.tenant_subscriptions s
        ON s.id = tc.subscription_id
       AND s.company_id = tc.company_id
       AND s.source_type = 'contract'
       AND s.source_id IS NOT NULL
     ORDER BY tc.created_at, tc.id
  LOOP
    -- Cobrança paga sem mãe: deixe apply_tenant_charge_payment criar/vincular
    -- pela autocura canônica e baixar a MESMA parcela. Nunca INSERT paralelo.
    IF upper(COALESCE(v_charge.status, '')) IN ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
       AND v_charge.asaas_payment_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_transactions ft
          WHERE ft.company_id = v_charge.company_id
            AND ft.tenant_charge_id = v_charge.id
            AND ft.transaction_type = 'entrada'
            AND ft.parent_transaction_id IS NULL
       ) THEN
      v_payment := public.apply_tenant_charge_payment(
        v_charge.asaas_payment_id,
        COALESCE(v_charge.payment_date, now()),
        v_charge.net_value
      );
    ELSE
      v_result := public.ensure_contract_subscription_receivable(
        v_charge.company_id, v_charge.id
      );
    END IF;
  END LOOP;
END
$backfill_contract_subscriptions$;

-- Pagamentos legados posteriores à ativação da NFS-e em modo pagamento não
-- podem ficar invisíveis só porque o contract_id foi completado depois da baixa.
INSERT INTO public.nfse_auto_jobs (
  company_id, contract_id, financial_transaction_id,
  competencia, trigger_reason, scheduled_for
)
SELECT ft.company_id,
       ft.contract_id,
       ft.id,
       date_trunc('month', COALESCE(ft.due_date, ft.transaction_date)::timestamp)::date,
       'pagamento',
       COALESCE(ft.paid_date, public.company_today(ft.company_id))
  FROM public.financial_transactions ft
  JOIN public.contracts c
    ON c.id = ft.contract_id
   AND c.company_id = ft.company_id
   AND c.nfse_auto_enabled = true
   AND c.nfse_auto_trigger = 'pagamento'
 WHERE ft.transaction_type = 'entrada'
   AND ft.parent_transaction_id IS NULL
   AND ft.cancelled_at IS NULL
   AND ft.is_paid = true
   AND ft.amount > 0
   AND ft.paid_date IS NOT NULL
   AND ft.paid_date >= (c.nfse_auto_enabled_at AT TIME ZONE 'America/Sao_Paulo')::date
   AND NOT EXISTS (
     SELECT 1 FROM public.nfse_emissions e
      WHERE e.company_id = ft.company_id
        AND e.financial_transaction_id = ft.id
        AND public.nfse_auto_emission_blocks(e.status)
   )
ON CONFLICT (company_id, financial_transaction_id) DO NOTHING;

-- Remove o literal legado dos três produtores/reprocessadores de NFS-e.
DO $patch_nfse_live_status$
DECLARE
  v_signature text;
  v_def text;
  v_new text;
  v_signatures text[] := ARRAY[
    'public.trg_nfse_auto_enqueue_on_payment()',
    'public.nfse_auto_enqueue_due_jobs()',
    'public.nfse_auto_enfileirar(uuid,text)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_def;
    v_new := regexp_replace(
      v_def,
      E'e\\.status[[:space:]]+IN[[:space:]]*\\([[:space:]]*''pending''[[:space:]]*,[[:space:]]*''processando''[[:space:]]*,[[:space:]]*''autorizada''[[:space:]]*,[[:space:]]*''cancelada''[[:space:]]*\\)',
      'public.nfse_auto_emission_blocks(e.status)',
      'gni'
    );
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Abortado: lista fiscal legada não encontrada em %. Revise a definição antes de alterar status vivos.', v_signature;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$patch_nfse_live_status$;

-- ACLs das funções recriadas dinamicamente.
REVOKE ALL ON FUNCTION public.trg_nfse_auto_enqueue_on_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_nfse_auto_enqueue_on_payment() TO service_role;
REVOKE ALL ON FUNCTION public.nfse_auto_enqueue_due_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfse_auto_enqueue_due_jobs() TO service_role;
REVOKE ALL ON FUNCTION public.nfse_auto_enfileirar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nfse_auto_enfileirar(uuid,text) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 8) Auditoria fail-closed da própria migration
-- --------------------------------------------------------------------------
DO $audit$
DECLARE
  v_src text;
  v_signature text;
  v_acl integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uq_financial_transactions_one_mother_per_charge'
  ) THEN
    RAISE EXCEPTION 'Auditoria: índice de uma mãe por cobrança ausente.';
  END IF;

  SELECT regexp_replace(prosrc, E'--[^\\n]*', '', 'g') INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ensure_contract_subscription_receivable';
  IF position('FOR UPDATE' IN v_src) = 0
     OR position('pg_advisory_xact_lock' IN v_src) = 0
     OR position('source_type = ''contract''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Auditoria: RPC contratual sem lock ou derivação canônica.';
  END IF;

  IF has_function_privilege('anon', 'public.ensure_contract_subscription_receivable(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ensure_contract_subscription_receivable(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.ensure_contract_subscription_receivable(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Auditoria: ACL da RPC contratual incorreta.';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.trg_nfse_auto_enqueue_on_payment()',
    'public.nfse_auto_enqueue_due_jobs()',
    'public.nfse_auto_enfileirar(uuid,text)'
  ] LOOP
    SELECT regexp_replace(p.prosrc, E'--[^\\n]*', '', 'g') INTO v_src
      FROM pg_proc p
     WHERE p.oid = v_signature::regprocedure;
    IF position('''pending''' IN v_src) > 0
       OR position('nfse_auto_emission_blocks' IN v_src) = 0 THEN
      RAISE EXCEPTION 'Auditoria: % ainda usa status fiscal legado ou não chama a allowlist canônica.', v_signature;
    END IF;
  END LOOP;
END
$audit$;
