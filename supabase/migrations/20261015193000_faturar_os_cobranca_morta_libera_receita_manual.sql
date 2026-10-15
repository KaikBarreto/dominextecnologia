-- ============================================================================
-- Faturar OS — cobrança MORTA libera lançar receita manual
-- Correção da 20261015190000 (aplicada mais cedo hoje). Decisão do Tech Lead.
-- Plano: docs/planos/2026-10-15-faturar-os.md
-- ============================================================================
--
-- POR QUÊ ESTA MIGRATION EXISTE
-- -----------------------------
-- A 20261015190000 tratou como "cobrança viva" tudo que não fosse REFUNDED.
-- Isso deixava as camadas DISCORDANDO entre si:
--
--   * a EDGE, diante de uma cobrança CANCELLED, deixa criar outra cobrança pra
--     mesma origem de boa (DEDUPE_DEAD_STATUSES);
--   * o TRIGGER daqui, diante da MESMA cobrança CANCELLED, travava a receita
--     manual daquela OS pra sempre.
--
-- Resultado: o usuário ficava SEM SAÍDA NENHUMA na OS — não conseguia lançar
-- receita, e a cobrança que travava já estava morta. Se cobrança morta libera
-- COBRAR de novo, tem que liberar LANÇAR RECEITA também.
--
-- O QUE MUDA
-- ----------
-- O filtro de "cobrança viva" deixa de ser "não é REFUNDED" e passa a ser
-- "não está no conjunto morto", nos DOIS lugares criados pela migration
-- anterior:
--
--   1. os_billing_state()                     -> has_charge / charge_*
--   2. block_os_manual_revenue_when_charged() -> condição que bloqueia
--
-- ⚠️ CONJUNTO MORTO — SÃO TRÊS LUGARES QUE ANDAM JUNTOS. Mexeu em um, mexa
-- nos outros dois:
--   * supabase/functions/tenant-asaas-create-charge/index.ts  -> DEDUPE_DEAD_STATUSES
--   * src/lib/contract-installment-charge.ts                  -> DEAD_CHARGE_STATUSES
--   * ESTA migration (as duas funções abaixo)
-- Conteúdo idêntico nos três: CANCELLED, CANCELED, REFUNDED, CHARGEBACK.
-- (CANCELED com um L só não é typo: é a grafia que o Asaas também devolve.)
--
-- ⚠️ O QUE **NÃO** ENTRA NO CONJUNTO MORTO
-- Os subestados de estorno EM ANDAMENTO — REFUND_REQUESTED, REFUND_IN_PROGRESS,
-- CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL (que
-- existem no REFUNDED_STATUSES de src/utils/tenantChargeStatus.ts, usado só pra
-- BADGE na UI) continuam contando como cobrança VIVA. Estorno em andamento pode
-- não se concretizar; enquanto não resolve, a cobrança segura a OS. Só estado
-- TERMINAL libera. Não alargar além dos 4.
--
-- O `upper(btrim(...))` é mantido de propósito: `tenant_charges.status` guarda o
-- valor CRU do Asaas, em MAIÚSCULO. Comparar com minúsculo é filtro que nunca
-- filtra nada.
--
-- Só CREATE OR REPLACE (assinaturas inalteradas), então os GRANTs sobrevivem —
-- este arquivo NÃO pode usar DROP FUNCTION. O trigger também não é recriado: ele
-- aponta pra função por nome e passa a usar o corpo novo automaticamente.
-- Idempotente: rodar 2x é inofensivo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- os_billing_state — `has_charge` só conta cobrança VIVA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.os_billing_state(_service_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid             uuid := auth.uid();
  v_os_company      uuid;
  v_user_company    uuid;
  v_revenue_count   integer := 0;
  v_revenue_total   numeric := 0;
  v_charge_id       uuid;
  v_charge_status   text;
  v_charge_value    numeric;
  v_charge_due_date date;
BEGIN
  IF _service_order_id IS NULL THEN
    RAISE EXCEPTION 'Ordem de serviço não informada';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Posse/tenant: a OS tem que existir e pertencer à empresa do usuário (ou o
  -- usuário ser super_admin). SECURITY DEFINER não é coberto por RLS, então o
  -- predicado é reaplicado à mão — mesmo padrão de `edit_service_order_scope`.
  SELECT so.company_id
    INTO v_os_company
    FROM public.service_orders so
   WHERE so.id = _service_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada';
  END IF;

  v_user_company := public.get_user_company_id(v_uid);

  IF NOT (public.is_super_admin(v_uid) OR v_os_company = v_user_company) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;

  -- Receita da OS. Conta TUDO que aponta pra OS como entrada não cancelada —
  -- INCLUSIVE o recebível que nasceu de cobrança. É o número que a tela mostra
  -- como "já faturada". O filtro por company_id é defesa em profundidade.
  SELECT count(*)::integer, COALESCE(sum(ft.amount), 0)
    INTO v_revenue_count, v_revenue_total
    FROM public.financial_transactions ft
   WHERE ft.service_order_id  = _service_order_id
     AND ft.company_id        = v_os_company
     AND ft.transaction_type  = 'entrada'
     AND ft.cancelled_at IS NULL;

  -- Cobrança VIVA da OS. `status` guarda o valor CRU do Asaas, em MAIÚSCULO —
  -- daí o upper(btrim(...)).
  --
  -- O conjunto morto espelha DEDUPE_DEAD_STATUSES de
  -- supabase/functions/tenant-asaas-create-charge/index.ts (e DEAD_CHARGE_STATUSES
  -- de src/lib/contract-installment-charge.ts). Se a edge deixa cobrar de novo,
  -- a OS não pode ficar travada: cobrança morta não segura mais a OS.
  -- Subestado de estorno EM ANDAMENTO (REFUND_IN_PROGRESS etc.) é cobrança
  -- VIVA de propósito — só estado terminal libera.
  -- Mais de uma cobrança viva na mesma OS → a mais recente manda.
  SELECT tc.id, tc.status, tc.value, tc.due_date
    INTO v_charge_id, v_charge_status, v_charge_value, v_charge_due_date
    FROM public.tenant_charges tc
   WHERE tc.source_type = 'service_order'
     AND tc.source_id   = _service_order_id
     AND tc.company_id  = v_os_company
     AND upper(btrim(tc.status)) NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK')
   ORDER BY tc.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'service_order_id', _service_order_id,
    'has_revenue',      (v_revenue_count > 0),
    'revenue_total',    v_revenue_total,
    'revenue_count',    v_revenue_count,
    'has_charge',       (v_charge_id IS NOT NULL),
    'charge_id',        v_charge_id,
    'charge_status',    v_charge_status,
    'charge_value',     v_charge_value,
    'charge_due_date',  v_charge_due_date
  );
END;
$fn$;


-- ----------------------------------------------------------------------------
-- block_os_manual_revenue_when_charged — só cobrança VIVA bloqueia
-- ----------------------------------------------------------------------------
-- As QUATRO condições, juntas, pra bloquear:
--   1. NEW.service_order_id IS NOT NULL   (lançamento ligado a uma OS)
--   2. NEW.transaction_type = 'entrada'   (receita; despesa de OS é livre)
--   3. NEW.tenant_charge_id IS NULL       (receita MANUAL, não recebível de cobrança)
--   4. existe tenant_charges VIVA da OS   (source_type='service_order')
--
-- A condição 3 NÃO É OPCIONAL: sem ela o trigger bloquearia o PRÓPRIO recebível
-- que a cobrança acabou de gerar via `create_tenant_charge_receivable`, e
-- cobrança de OS nunca funcionaria.
CREATE OR REPLACE FUNCTION public.block_os_manual_revenue_when_charged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Saída rápida: qualquer lançamento que não seja receita manual ligada a OS
  -- passa sem consultar nada. Mantém o custo do trigger perto de zero no
  -- caminho comum (a esmagadora maioria dos inserts não tem service_order_id).
  IF NEW.service_order_id IS NULL
     OR NEW.transaction_type <> 'entrada'
     OR NEW.tenant_charge_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  -- Conjunto morto espelha DEDUPE_DEAD_STATUSES da edge
  -- (supabase/functions/tenant-asaas-create-charge/index.ts) e
  -- DEAD_CHARGE_STATUSES de src/lib/contract-installment-charge.ts.
  -- São TRÊS lugares que andam juntos.
  IF EXISTS (
    SELECT 1
      FROM public.tenant_charges tc
     WHERE tc.source_type = 'service_order'
       AND tc.source_id   = NEW.service_order_id
       AND upper(btrim(tc.status)) NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK')
  ) THEN
    -- Mensagem voltada ao USUÁRIO FINAL: a tela mostra isto cru. Sem jargão,
    -- sem nome de tabela, e dizendo o que acontece em seguida.
    RAISE EXCEPTION 'Esta ordem de serviço já tem uma cobrança em aberto. A receita entra sozinha quando o cliente pagar.'
      USING ERRCODE = '23001';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.block_os_manual_revenue_when_charged() IS
  'Trava anti-contagem-dupla: recusa receita MANUAL (tenant_charge_id NULL) numa OS que já tem cobrança VIVA. O recebível da própria cobrança passa, porque carrega tenant_charge_id. Cobrança morta (CANCELLED/CANCELED/REFUNDED/CHARGEBACK, espelhando DEDUPE_DEAD_STATUSES da edge) libera o lançamento manual.';
