-- ============================================================================
-- CC1: fecha dois dos sete buracos do braço de centro de custo (auditoria
-- dev-financeiro-rh, 17/09/2026) — Nova Cobrança e Nova Assinatura nunca
-- carimbavam `cost_center_id` no recebível que geram, porque a criação passa
-- por RPC (`create_tenant_charge_receivable`) e não por INSERT direto do
-- client, e a RPC nunca teve esse parâmetro.
--
-- ESCOPO (só os dois, os outros cinco itens não tocam schema):
--   1. `tenant_subscriptions.cost_center_id` — mesmo padrão de
--      `20260912160000_tenant_subscriptions_category.sql`: a escolha do
--      usuário na criação da assinatura só sobrevive até o webhook
--      materializar cada ciclo se houver ONDE persistir. Cobrança avulsa não
--      precisa de coluna própria (o valor vai direto no p_cost_center_id da
--      RPC, síncrono, mesma linha do request).
--   2. `create_tenant_charge_receivable` ganha `p_cost_center_id` (nono
--      parâmetro, DEFAULT NULL — aditivo, chamada antiga continua válida).
--
-- POSSE VALIDADA DENTRO DA RPC (não no client, não no edge)
-- -----------------------------------------------------------------------
-- `p_cost_center_id`, ao contrário de `p_category` (texto livre, sem FK) e
-- `p_account_id` (sempre resolvido pelo edge a partir de tenant_payment_accounts
-- já escopado por company_id, nunca vindo direto do client), É uma FK real
-- para `cost_centers`, e a cobrança avulsa manda o valor ESCOLHIDO PELO
-- CLIENT sem volta. RPC é SECURITY DEFINER → RLS de `cost_centers` não
-- protege. Sem o check abaixo, um `cost_center_id` de outra empresa gravaria
-- silenciosamente uma FK cross-tenant em `financial_transactions` (não
-- vaza leitura pro atacante, mas quebra a garantia "financeiro de uma
-- company nunca aparece em outra" e, pior, o gatilho BEFORE DELETE de
-- `cost_centers` passaria a contar linha de OUTRA empresa como "em uso").
-- Igual ao check de posse já existente pra `tenant_charges` duas migrations
-- acima: RAISE com ERRCODE 42501, capturado como não-fatal pelos DOIS
-- chamadores (edge de criação e webhook) — cobrança/ciclo não falha, só o
-- lançamento financeiro fica pendente com aviso, igual qualquer outra falha
-- não-fatal deste fluxo.
--
-- Assinatura em uso (subscription apontando pra um centro depois excluído)
-- NÃO precisa de gatilho extra: `ON DELETE SET NULL` já limpa
-- `tenant_subscriptions.cost_center_id` sozinho — centro de custo é sempre
-- opcional, perder a referência não é corrupção, e o próximo ciclo simplesmente
-- materializa sem centro (mesmo comportamento de uma assinatura que nunca teve
-- um escolhido).
--
-- RECRIADA A PARTIR DA DEFINIÇÃO VIVA (pg_get_functiondef em 17/09/2026): a
-- assinatura viva tem OITO parâmetros (a guarda de dupla contagem do orçamento
-- entrou em 20260912120000). Partir de um arquivo antigo teria criado
-- sobrecarga nova e deixado a guarda de dupla contagem pra trás.
-- ============================================================================

-- 1) Coluna em tenant_subscriptions --------------------------------------------
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS cost_center_id uuid NULL
    REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenant_subscriptions_cost_center_idx
  ON public.tenant_subscriptions (cost_center_id);

COMMENT ON COLUMN public.tenant_subscriptions.cost_center_id IS
  'Centro de custo escolhido na criação da assinatura, aplicado a CADA ciclo que o webhook materializa (create_tenant_charge_receivable.p_cost_center_id). NULL = sem centro de custo (opcional em todo o domínio financeiro).';

-- 2) RPC create_tenant_charge_receivable — nono parâmetro ----------------------
DROP FUNCTION IF EXISTS public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text);

CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id       uuid,
  p_tenant_charge_id uuid,
  p_customer_id      uuid,
  p_amount           numeric,
  p_due_date         date,
  p_description      text,
  p_account_id       uuid DEFAULT NULL::uuid,
  p_category         text DEFAULT NULL::text,
  p_cost_center_id   uuid DEFAULT NULL::uuid
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
  SELECT id INTO v_existing_id
  FROM public.financial_transactions
  WHERE tenant_charge_id = p_tenant_charge_id
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
  INSERT INTO public.financial_transactions (
    company_id,
    transaction_type,
    amount,
    description,
    customer_id,
    due_date,
    tenant_charge_id,
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

COMMENT ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid) IS
  'Cria um "a receber" (financial_transactions, entrada, is_paid=false) vinculado a uma cobrança online do tenant (tenant_charge_id). Idempotente por tenant_charge_id. RECUSA (ERRCODE 23001) quando a cobrança tem source_type=quote e o orçamento de origem já gerou financeiro na aprovação. RECUSA (ERRCODE 42501) quando p_cost_center_id não pertence a p_company_id. Chamada pela edge tenant-asaas-create-charge e pelo webhook tenant-asaas-webhook (ambos service_role), que tratam os dois erros como não-fatais.';

-- ----------------------------------------------------------------------------
-- GRANTS — CREATE OR REPLACE preserva a ACL, mas reemitir é barato e cobre o
-- caso de a função nascer num banco novo (reset/clone), onde o DEFAULT
-- PRIVILEGE do schema public do Supabase concede EXECUTE nominalmente a anon e
-- authenticated. Grant nominal não é herdado de PUBLIC → REVOKE FROM PUBLIC
-- sozinho NÃO basta. Assinatura COMPLETA de tipos (9 params), REVOKE antes do
-- GRANT. Esta RPC é operação de SERVIDOR: só service_role.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid)
  TO service_role;
