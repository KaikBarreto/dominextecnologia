-- ============================================================================
-- Faturar OS — origem `service_order` nas cobranças, recebível carregando a OS
-- e trava anti-contagem-dupla no BANCO.
-- Plano: docs/planos/2026-10-15-faturar-os.md (Passo 1, itens 1.1 a 1.4)
-- ============================================================================
--
-- POR QUÊ ESTA MIGRATION EXISTE
-- -----------------------------
-- A Ordem de Serviço vai ganhar uma ação OPCIONAL de faturamento: o usuário
-- escolhe LANÇAR A RECEITA (dinheiro que já entrou) ou GERAR UMA COBRANÇA
-- (link de pagamento). Hoje esses dois caminhos não se enxergam, e a MESMA
-- venda pode entrar duas vezes no financeiro — o buraco já existe no orçamento
-- e está documentado no nosso próprio código (`src/hooks/useQuoteChargedIds.ts`).
--
-- Decisão de arquitetura (já tomada): NÃO criamos objeto "fatura". O vínculo já
-- existe no schema — `financial_transactions.service_order_id`,
-- `financial_transactions.tenant_charge_id` e `tenant_charges.source_type` +
-- `source_id`. A "dobradiça" é só: origem `service_order` + o recebível nascendo
-- com `service_order_id` preenchido.
--
-- O QUE ENTRA AQUI
-- ----------------
-- 1.1  `tenant_charges.source_type` passa a aceitar 'service_order'.
-- 1.2  `create_tenant_charge_receivable` ganha `p_service_order_id` e grava o
--      vínculo no recebível (DROP+CREATE, porque parâmetro novo é função nova).
-- 1.3  `os_billing_state(uuid) RETURNS jsonb` — fonte ÚNICA do estado de
--      faturamento da OS, pra UI e pros guards.
-- 1.4  Trigger BEFORE INSERT em `financial_transactions` que recusa receita
--      MANUAL quando a OS já tem cobrança ativa. A lição do orçamento é que
--      trava só de UI não segura — esta é de integridade, e por isso vive no
--      gatilho, não em policy de RLS.
--
-- Idempotente: pode rodar 2x sem quebrar (DROP IF EXISTS antes de cada ADD).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1.1 — `tenant_charges.source_type` aceita 'service_order'
-- ----------------------------------------------------------------------------
-- CHECK não tem OR REPLACE: é DROP + ADD com o MESMO nome, na mesma migration,
-- pra nunca existir janela em que a constraint não está lá.
ALTER TABLE public.tenant_charges
  DROP CONSTRAINT IF EXISTS tenant_charges_source_type_check;

ALTER TABLE public.tenant_charges
  ADD CONSTRAINT tenant_charges_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'avulso'::text,
    'quote'::text,
    'contract_installment'::text,
    'service_order'::text
  ]));


-- ----------------------------------------------------------------------------
-- 1.2 — `create_tenant_charge_receivable` ganha `p_service_order_id`
-- ----------------------------------------------------------------------------
-- Acrescentar parâmetro NÃO é CREATE OR REPLACE: é assinatura nova, e o Postgres
-- passaria a ter DUAS funções com o mesmo nome (ambiguidade em runtime). Então:
-- DROP da assinatura antiga + CREATE da nova + RE-GRANT na MESMA migration,
-- porque DROP FUNCTION leva os GRANTs junto.
--
-- ACL de origem (conferida em pg_proc.proacl antes do drop):
--   {postgres=X/postgres,service_role=X/postgres}
-- Ou seja: só a edge (service_role) chama. NÃO é exposta a `authenticated`
-- nem a `anon`. Reproduzida idêntica no fim deste bloco — e precisa de REVOKE
-- explícito porque o default ACL deste banco (pg_default_acl, objtype 'f',
-- schema public) concede EXECUTE a anon/authenticated/service_role em TODA
-- função nova.
--
-- O corpo abaixo partiu da definição VIVA (pg_get_functiondef), não foi
-- reescrito de cabeça. A ÚNICA mudança de comportamento é o novo parâmetro
-- opcional e a coluna `service_order_id` no INSERT. Os três chamadores que já
-- existem ('avulso', 'quote', 'contract_installment') não passam nada e caem no
-- DEFAULT NULL — comportamento idêntico ao de antes.
DROP FUNCTION IF EXISTS public.create_tenant_charge_receivable(
  uuid, uuid, uuid, numeric, date, text, uuid, text, uuid
);

CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id       uuid,
  p_tenant_charge_id uuid,
  p_customer_id      uuid,
  p_amount           numeric,
  p_due_date         date,
  p_description      text,
  p_account_id       uuid DEFAULT NULL::uuid,
  p_category         text DEFAULT NULL::text,
  p_cost_center_id   uuid DEFAULT NULL::uuid,
  p_service_order_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_existing_id      uuid;
  v_new_id           uuid;
  v_charge_company   uuid;
  v_source_type      text;
  v_source_id        uuid;
  v_quote_number     integer;
  v_quote_txn_id     uuid;
  v_quote_generated  timestamptz;
BEGIN
  -- Validações mínimas de entrada
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_company_id obrigatório';
  END IF;
  IF p_tenant_charge_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_tenant_charge_id obrigatório';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_description obrigatório';
  END IF;

  -- Guard de idempotência: retorna id existente sem inserir de novo.
  -- FICA ANTES DA GUARDA DE ORÇAMENTO DE PROPÓSITO: replay da mesma cobrança
  -- (reentrega de webhook, retry da edge) tem que ser no-op silencioso, não
  -- erro. A guarda nova só vale pra recebível que AINDA NÃO EXISTE.
  --
  -- ESCOPO (2026-09-19): só o RECEBÍVEL-MÃE desta empresa conta como "já
  -- existe". Antes era qualquer linha com este tenant_charge_id, o que incluía
  -- a linha de TARIFA ('saida') e as filhas de "Recebimento parcial" — e fazia
  -- a função devolver o id errado e não criar o recebível, em silêncio.
  SELECT id INTO v_existing_id
  FROM public.financial_transactions
  WHERE tenant_charge_id      = p_tenant_charge_id
    AND company_id            = p_company_id
    AND transaction_type      = 'entrada'
    AND parent_transaction_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Posse do centro de custo: FK real, RLS não cobre SECURITY DEFINER. Sem
  -- este check, um p_cost_center_id de outra empresa gravaria FK cross-tenant
  -- silenciosa. Erro explícito, capturado como NÃO-FATAL pelos dois
  -- chamadores (edge de criação e webhook de assinatura) — mesmo tratamento
  -- que a guarda de posse da cobrança logo abaixo.
  IF p_cost_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cost_centers cc
       WHERE cc.id = p_cost_center_id
         AND cc.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] centro de custo não pertence à empresa informada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Posse da OS (2026-10-15, faturar-OS): mesmo raciocínio do centro de custo.
  -- `p_service_order_id` vem de fora (edge), e RLS não cobre SECURITY DEFINER.
  -- Sem este check, uma OS de outro tenant viraria FK cross-tenant silenciosa
  -- no recebível — e a OS alheia passaria a aparecer como "já faturada".
  IF p_service_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_orders so
       WHERE so.id = p_service_order_id
         AND so.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] ordem de serviço não pertence à empresa informada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- GUARDA DE DUPLA CONTAGEM (não desta migration, preservada)
  -- ------------------------------------------------------------------
  -- A cobrança é lida do banco, NUNCA de parâmetro: source_type/source_id
  -- vindos de fora seriam controláveis por quem chama, e a trava viraria
  -- decorativa.
  SELECT tc.company_id, tc.source_type, tc.source_id
    INTO v_charge_company, v_source_type, v_source_id
    FROM public.tenant_charges tc
   WHERE tc.id = p_tenant_charge_id;

  IF FOUND THEN
    -- Posse: a cobrança TEM que ser da empresa informada. RLS não cobre
    -- SECURITY DEFINER, então o predicado é reaplicado à mão. Sem isto, um
    -- p_company_id trocado gravaria receita no financeiro de outro tenant.
    IF v_charge_company IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] cobrança não pertence à empresa informada'
        USING ERRCODE = '42501';
    END IF;

    IF v_source_type = 'quote' AND v_source_id IS NOT NULL THEN
      SELECT q.quote_number, q.financial_transaction_id, q.financial_generated_at
        INTO v_quote_number, v_quote_txn_id, v_quote_generated
        FROM public.quotes q
       WHERE q.id = v_source_id
         AND q.company_id = p_company_id;

      -- Os DOIS carimbos, por OR: `financial_generated_at` é o que o fluxo
      -- público usa como guarda, `financial_transaction_id` é o elo que o
      -- fluxo interno grava. Exigir os dois deixaria passar um carimbo
      -- meio-feito (insert ok, update parcial).
      IF FOUND AND (v_quote_generated IS NOT NULL OR v_quote_txn_id IS NOT NULL) THEN
        RAISE EXCEPTION
          'O orçamento #% já lançou receita no Financeiro quando foi aprovado. A cobrança foi gerada normalmente, mas não criamos um segundo "a receber" para a mesma venda.',
          COALESCE(v_quote_number::text, '?')
          USING ERRCODE = '23001';
      END IF;
    END IF;
  END IF;
  -- Cobrança não encontrada (IF FOUND falso) segue o caminho antigo em vez de
  -- abortar: a edge grava tenant_charges ANTES de chamar, então não achar aqui
  -- só aconteceria em cenário anômalo — e nesse cenário recusar o recebível de
  -- uma cobrança legítima seria pior que não conseguir checar o orçamento.

  -- INSERT do recebível — predicado de posse (company_id) explícito no corpo
  -- pois RLS não cobre SECURITY DEFINER. account_id/category/cost_center_id
  -- vêm dos params (config default da conta ou escolha do usuário, resolvidos
  -- pelo chamador). NULL = sem conta/categoria/centro (mesmo comportamento
  -- anterior pra quem não usa nenhum dos três).
  --
  -- `service_order_id` (2026-10-15): é O elo que faz os dois caminhos de
  -- faturamento se enxergarem. Com ele, `os_billing_state` e o
  -- `useOsRevenueSummary` que a tela da OS JÁ LÊ passam a contar o recebível
  -- nascido de cobrança como "OS já faturada". NULL pros 3 caminhos antigos.
  --
  -- NOTA: este INSERT passa pelo trigger `trg_block_os_manual_revenue_when_charged`
  -- (1.4 desta migration) e é LIBERADO por ele, porque `tenant_charge_id` vem
  -- preenchido. É exatamente a condição que impede a trava de bloquear o próprio
  -- recebível que a cobrança acabou de gerar.
  INSERT INTO public.financial_transactions (
    company_id,
    transaction_type,
    amount,
    description,
    customer_id,
    due_date,
    tenant_charge_id,
    service_order_id,
    is_paid,
    transaction_date,
    account_id,
    category,
    cost_center_id,
    created_by
  ) VALUES (
    p_company_id,
    'entrada',
    p_amount,
    p_description,
    p_customer_id,
    p_due_date,
    p_tenant_charge_id,
    p_service_order_id,
    false,
    now()::date,
    p_account_id,
    p_category,
    p_cost_center_id,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

-- Re-GRANT idêntico à ACL de antes do DROP. O REVOKE é obrigatório: sem ele o
-- default ACL deste banco entrega EXECUTE a anon e authenticated.
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(
  uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(
  uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(
  uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(
  uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid
) TO service_role;


-- ----------------------------------------------------------------------------
-- 1.3 — `os_billing_state(uuid) RETURNS jsonb`
-- ----------------------------------------------------------------------------
-- Fonte ÚNICA do estado de faturamento de uma OS. A UI lê daqui pra mostrar
-- "já faturada" e pra desabilitar a ação correspondente COM O MOTIVO ESCRITO;
-- os guards leem daqui pra decidir. Contrato FIXO (o dev de UI coda contra ele):
--
--   {
--     "service_order_id": uuid,
--     "has_revenue":      bool,
--     "revenue_total":    numeric,
--     "revenue_count":    int,
--     "has_charge":       bool,
--     "charge_id":        uuid|null,
--     "charge_status":    text|null,
--     "charge_value":     numeric|null,
--     "charge_due_date":  date|null
--   }
--
-- `revenue_*` conta TUDO que aponta pra OS como entrada não cancelada —
-- INCLUSIVE o recebível que nasceu de cobrança. É o número que a tela mostra
-- como "já faturada". A distinção entre receita manual e recebível de cobrança
-- é feita pelo `tenant_charge_id`, e só importa na trava do 1.4.
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

  -- Receita da OS. O filtro por company_id é defesa em profundidade: a OS é
  -- única por id, mas se uma linha cross-tenant existisse ela NÃO deve inflar
  -- o número que o tenant vê.
  SELECT count(*)::integer, COALESCE(sum(ft.amount), 0)
    INTO v_revenue_count, v_revenue_total
    FROM public.financial_transactions ft
   WHERE ft.service_order_id  = _service_order_id
     AND ft.company_id        = v_os_company
     AND ft.transaction_type  = 'entrada'
     AND ft.cancelled_at IS NULL;

  -- Cobrança da OS. `status` em tenant_charges guarda o valor CRU do Asaas, em
  -- MAIÚSCULO ('PENDING', 'CONFIRMED', 'REFUNDED'...). Por isso a comparação é
  -- `upper(btrim(status))`: escrever `status <> 'refunded'` seria um filtro que
  -- nunca filtra nada (é o bug latente que existe hoje em
  -- `src/hooks/useQuoteChargedIds.ts`).
  -- Mais de uma cobrança na mesma OS → a mais recente manda.
  SELECT tc.id, tc.status, tc.value, tc.due_date
    INTO v_charge_id, v_charge_status, v_charge_value, v_charge_due_date
    FROM public.tenant_charges tc
   WHERE tc.source_type = 'service_order'
     AND tc.source_id   = _service_order_id
     AND tc.company_id  = v_os_company
     AND upper(btrim(tc.status)) <> 'REFUNDED'
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

-- Função NOVA nasce com EXECUTE pra anon por causa do default ACL deste banco
-- (pg_default_acl, schema public, objtype 'f'). Revogar é obrigatório, não
-- opcional: estado de faturamento não é dado público.
REVOKE ALL ON FUNCTION public.os_billing_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.os_billing_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.os_billing_state(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 1.4 — Trava anti-contagem-dupla, NO BANCO
-- ----------------------------------------------------------------------------
-- Recusa receita MANUAL numa OS que já tem cobrança ativa. A lição do orçamento
-- é que trava só de UI não segura: o buraco de contagem dupla sobreviveu lá
-- justamente porque os dois caminhos só se checavam na tela.
--
-- É regra de INTEGRIDADE, não de visibilidade — por isso vive no gatilho e não
-- em policy de RLS.
--
-- As QUATRO condições, juntas, pra bloquear:
--   1. NEW.service_order_id IS NOT NULL   (lançamento ligado a uma OS)
--   2. NEW.transaction_type = 'entrada'   (receita; despesa de OS é livre)
--   3. NEW.tenant_charge_id IS NULL       (receita MANUAL, não recebível de cobrança)
--   4. existe tenant_charges ativa da OS  (source_type='service_order')
--
-- A condição 3 NÃO É OPCIONAL e é o detalhe mais fácil de errar: sem ela o
-- trigger bloquearia o PRÓPRIO recebível que a cobrança acabou de gerar via
-- `create_tenant_charge_receivable`, e cobrança de OS nunca funcionaria.
--
-- SECURITY DEFINER de propósito: a leitura de `tenant_charges` não pode depender
-- da RLS de quem insere, senão a trava viraria "depende de quem está chamando".
-- O corpo só usa NEW — não depende de current_user, então o modo DEFINER é
-- seguro aqui.
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

  IF EXISTS (
    SELECT 1
      FROM public.tenant_charges tc
     WHERE tc.source_type = 'service_order'
       AND tc.source_id   = NEW.service_order_id
       AND upper(btrim(tc.status)) <> 'REFUNDED'
  ) THEN
    -- Mensagem voltada ao USUÁRIO FINAL: a tela mostra isto cru. Sem jargão,
    -- sem nome de tabela, e dizendo o que acontece em seguida.
    RAISE EXCEPTION 'Esta ordem de serviço já tem uma cobrança em aberto. A receita entra sozinha quando o cliente pagar.'
      USING ERRCODE = '23001';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Trigger function não precisa de EXECUTE pros papéis do app: o Postgres só
-- checa esse privilégio no CREATE TRIGGER, não a cada disparo. Mesma ACL do
-- `_normalize_payment_group_id`, que é BEFORE INSERT nesta mesma tabela e roda
-- em produção hoje com exatamente estes grants.
REVOKE ALL ON FUNCTION public.block_os_manual_revenue_when_charged() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_os_manual_revenue_when_charged() FROM anon;
REVOKE ALL ON FUNCTION public.block_os_manual_revenue_when_charged() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.block_os_manual_revenue_when_charged() TO service_role;

DROP TRIGGER IF EXISTS trg_block_os_manual_revenue_when_charged ON public.financial_transactions;
CREATE TRIGGER trg_block_os_manual_revenue_when_charged
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.block_os_manual_revenue_when_charged();


-- ----------------------------------------------------------------------------
-- Índice de apoio
-- ----------------------------------------------------------------------------
-- O trigger roda em TODO insert de receita ligada a OS, e `os_billing_state`
-- consulta a mesma coisa. Sem índice em (source_type, source_id) a checagem é
-- varredura em tenant_charges.
CREATE INDEX IF NOT EXISTS idx_tenant_charges_source
  ON public.tenant_charges (source_type, source_id);

COMMENT ON FUNCTION public.os_billing_state(uuid) IS
  'Estado de faturamento de uma OS (receita lançada + cobrança ativa). Fonte única pra UI e guards do fluxo "Faturar OS". Contrato de retorno fixo — ver migration 20261015190000.';

COMMENT ON FUNCTION public.block_os_manual_revenue_when_charged() IS
  'Trava anti-contagem-dupla: recusa receita MANUAL (tenant_charge_id NULL) numa OS que já tem cobrança ativa. O recebível da própria cobrança passa, porque carrega tenant_charge_id.';
