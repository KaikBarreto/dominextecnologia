-- ============================================================================
-- Programa de Afiliados — FASE 3: MOTOR DE COMISSÃO
-- ============================================================================
-- Port de 20260723170000_affiliate_commission_motor.sql do EcoSistema, com as
-- divergências do Dominex aplicadas e uma feature nova (cota de recorrência).
--
-- O que nasce aqui:
--   1. public.affiliate_commission_base(company_id, paid) — base canônica de cálculo
--   2. public.affiliate_commission_on_payment()  — trigger AFTER INSERT
--   3. public.affiliate_commission_on_payment_delete() — trigger BEFORE DELETE
--   4. register_manual_company_payment() — guarda "afiliado zera vendedor"
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 1 — company_payments do Dominex NÃO tem coluna `voided`.
-- Colunas confirmadas via information_schema em 2026-10-14:
--   id, company_id, amount, type, payment_method, payment_date, notes, origin,
--   created_by, created_at, asaas_payment_id
-- Logo: cai toda condição COALESCE(voided,false)=false do Eco, e o estorno
-- (que aqui é DELETE, via delete_company_payment_with_rollback) é tratado por
-- um trigger BEFORE DELETE em vez do AFTER UPDATE OF voided do Eco.
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 2 — valores REAIS de company_payments.type em produção
-- (SELECT type, count(*) FROM company_payments GROUP BY 1, em 2026-10-14):
--     renovacao      9 linhas  (2026-07-16 .. 2026-10-14)
--     primeira_venda 9 linhas  (2026-06-14 .. 2026-09-12)
--     renewal        1 linha   (2026-09-10)
-- São TRÊS valores, não dois. O default da coluna é 'renewal'; a RPC
-- register_manual_company_payment mapeia p_type='renovacao' -> 'renewal',
-- enquanto o AdminRenewalModal grava 'renovacao' direto. Ou seja: o universo de
-- "não é primeira venda" está escrito de duas formas diferentes.
--
-- >>> REGRA: SÓ 'primeira_venda' decide kind='first'. Todo o resto cai em
-- >>> 'recurring' pelo ELSE. NUNCA ramificar em 'renovacao' em lugar nenhum —
-- >>> quem fizer isso perde silenciosamente a linha gravada como 'renewal'.
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 3 — gate de admin: o Dominex usa is_admin_user(auth.uid()) /
-- has_admin_permission(), não has_role(...,'admin'::app_role) do Eco.
-- (Relevante na migration de repasse; aqui só a guarda da RPC manual.)
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 4 — o Dominex NÃO tem commission_monthly_equivalent_of_paid()
-- nem src/utils/commissionBase.ts. A base canônica nasce aqui como
-- public.affiliate_commission_base(). Ver o bloco de PROVA logo abaixo.
--
-- ----------------------------------------------------------------------------
-- FEATURE NOVA (não existe no Eco) — COTA DE RECORRÊNCIA (affiliates.recurring_months)
-- Semântica travada pelo Tech Lead (docs/planos/2026-10-14-programa-afiliados.md):
--   recurring_months = N  ->  "primeira venda + N recorrências" daquela empresa,
--                             contando PAGAMENTOS (eventos), NÃO meses de calendário.
--   recurring_months = 0  ->  só a primeira venda, nenhuma recorrência (válido).
--   recurring_months NULL ->  recorrência sem prazo.
-- Comissão estornada (status='voided') NÃO queima cota — daí o status <> 'voided'
-- na contagem. A contagem é respaldada pelo índice affiliate_commissions_quota_idx
-- (affiliate_id, company_id, kind), criado na 20261014160000.
--
-- Por que contar eventos e não janela de calendário: num plano anual a janela de
-- 12 meses zeraria o afiliado (a renovação do ano 2 cai fora dela), e um atraso
-- do cliente queimaria cota de um mês que ninguém pagou.
--
-- ============================================================================
-- PROVA — QUAL É A BASE DA COMISSÃO NO CICLO ANUAL (investigação de 2026-10-14)
-- ============================================================================
-- Regra de negócio do CEO: o afiliado ganha % da MENSALIDADE, não da fatura.
-- Então era preciso saber o que companies.subscription_value guarda quando
-- billing_cycle='yearly': o valor mensal ou a anuidade?
--
-- (a) A via empírica NÃO responde. Em 2026-10-14:
--       SELECT billing_cycle, count(*) FROM public.companies GROUP BY 1;
--       -> [{"billing_cycle":"monthly","count":59}]
--     TODAS as 59 empresas são mensais. NÃO EXISTE nenhuma empresa anual em
--     produção, logo não há dado real pra comparar subscription_value com os
--     company_payments dela. Nenhuma conclusão foi tirada de dados.
--
-- (b) A prova vem do caminho que ESCREVE o número — a reconciliação de cobrança
--     em supabase/functions/create-asaas-payment/index.ts:512-516:
--       "Esperado por método/ciclo (regra B9):
--          - Cartão: SEMPRE mensal (base).
--          - PIX/boleto anual à vista: round(base × 12 × 0,8) (−20%).
--          - PIX/boleto mensal: base."
--     e `monthlyBase` vem direto de Number(company.subscription_value) || 0
--     (mesmo arquivo, linhas 419-428, via effectiveCompanyValue).
--     Corroborado de forma independente por
--     supabase/functions/activate-subscription/index.ts:90 — "subscription_value
--     guarda o valor mensal do plano; cobrança anual aplica 20% off no momento da
--     cobrança" — e pelo header da coluna em src/components/admin/CompanyTable.tsx:168,
--     que é literalmente "Valor Mensal".
--
-- >>> CONCLUSÃO: subscription_value é SEMPRE a MENSALIDADE, nos dois ciclos.
-- >>> Base anual = subscription_value COMO ESTÁ. NÃO dividir por 12.
-- >>> A anuidade é um número derivado, calculado na hora da cobrança, e nunca
-- >>> persistido nessa coluna.
--
-- ⚠️ CONSEQUÊNCIA OPERACIONAL: como 59/59 empresas são mensais hoje, o caminho
--    ANUAL deste motor nasce SEM NENHUMA COBERTURA DE PRODUÇÃO. A primeira venda
--    anual de uma empresa com afiliado MERECE CONFERÊNCIA MANUAL da comissão
--    gerada antes do primeiro repasse.
--
-- ⚠️ ARMADILHA DE LEITURA: src/components/admin/RegisterCompanyPaymentModal.tsx:169-170
--    renderiza subscription_value com sufixo " /ano" quando billing_cycle='yearly'.
--    Pela prova acima isso é BUG DE DISPLAY (rotula um valor mensal como anual) e
--    está registrado com o Tech Lead. Não use essa tela como evidência da base.
--
-- VALOR EFETIVO (aprovado pelo Tech Lead): a base anual resolve o valor EFETIVO,
-- não o de tabela — custom_price quando a promoção ainda está ativa, senão
-- subscription_value. Sem isso, um cliente com desconto pagaria ao afiliado um
-- percentual do preço cheio. Esta é a MESMA RÉGUA de
-- getEffectiveSubscriptionValue() em src/utils/subscriptionPricing.ts:
--   >>> SÃO DOIS LUGARES COM A MESMA REGRA: mudou num, muda no outro. <<<
-- No ciclo mensal a base é o valor pago, então a promoção já se reflete sozinha.
--
-- FALLBACK ANUAL (aprovado, com ressalva registrada): quando subscription_value
-- é NULL/0 no anual, base = p_paid / 12. Isso ERRA PRA BAIXO: a fatura anual é
-- mensal × 12 × 0,8, logo p_paid/12 = mensal × 0,8 (−20%). Errar pra baixo num
-- fallback de REPASSE é a direção segura — paga-se a menos e corrige-se, em vez
-- de pagar a mais e tentar reaver.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Base canônica de cálculo da comissão de afiliado
-- ---------------------------------------------------------------------------
-- STABLE (não IMMUTABLE): lê public.companies.
-- SECURITY DEFINER: é chamada de dentro do trigger (que roda como owner) e
-- precisa ler companies independente da RLS do chamador.
CREATE OR REPLACE FUNCTION public.affiliate_commission_base(
  p_company_id uuid,
  p_paid       numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $affbase$
DECLARE
  v_cycle     text;
  v_effective numeric;
  v_found     boolean := false;
BEGIN
  SELECT true,
         lower(COALESCE(c.billing_cycle, 'monthly')),
         -- Valor EFETIVO, espelho de getEffectiveSubscriptionValue()
         -- (src/utils/subscriptionPricing.ts): promoção ativa = custom_price > 0
         -- E (permanente OU ainda não pagou todas as mensalidades do período).
         CASE
           WHEN COALESCE(c.custom_price, 0) > 0
                AND (
                  COALESCE(c.custom_price_permanent, false)
                  OR (
                    COALESCE(c.custom_price_months, 0) > 0
                    AND COALESCE(c.custom_price_payments_made, 0) < COALESCE(c.custom_price_months, 0)
                  )
                )
             THEN c.custom_price
           ELSE COALESCE(c.subscription_value, 0)
         END
    INTO v_found, v_cycle, v_effective
  FROM public.companies c
  WHERE c.id = p_company_id;

  -- Empresa inexistente: fail-safe conservador — base = o que foi pago.
  IF NOT COALESCE(v_found, false) THEN
    RETURN round(COALESCE(p_paid, 0), 2);
  END IF;

  -- CICLO ANUAL: a base é a MENSALIDADE (ver bloco PROVA no cabeçalho).
  -- subscription_value/custom_price JÁ são mensais — não dividir por 12.
  IF v_cycle IN ('yearly', 'annual', 'anual', 'year') THEN
    IF COALESCE(v_effective, 0) > 0 THEN
      RETURN round(v_effective, 2);
    END IF;
    -- Fallback: sem valor cadastrado, deriva da fatura. Erra pra baixo (ver cabeçalho).
    RETURN round(COALESCE(p_paid, 0) / 12.0, 2);
  END IF;

  -- CICLO MENSAL (default): a fatura É a mensalidade. Usa o valor pago, que já
  -- reflete promoção, pro-rata e upgrade do mês.
  RETURN round(COALESCE(p_paid, 0), 2);
END;
$affbase$;

COMMENT ON FUNCTION public.affiliate_commission_base(uuid, numeric) IS
  'Base canônica de cálculo da comissão de afiliado: o afiliado ganha % da MENSALIDADE, não da fatura. Mensal -> o valor pago. Anual -> o valor mensal EFETIVO da empresa (custom_price se a promoção está ativa, senão subscription_value), que no Dominex já é mensal nos dois ciclos (provado em create-asaas-payment/index.ts:512-516 e activate-subscription/index.ts:90); fallback p_paid/12 quando não há valor cadastrado. Mesma régua de getEffectiveSubscriptionValue() em src/utils/subscriptionPricing.ts — mudou num, muda no outro.';

-- ACL: esta função lê companies IGNORANDO RLS (SECURITY DEFINER). Se fosse
-- executável por `authenticated`, qualquer usuário de tenant passaria um
-- company_id arbitrário e leria o valor de assinatura de OUTRA empresa.
-- O trigger não precisa de GRANT: roda como owner (postgres), que já tem EXECUTE.
REVOKE ALL ON FUNCTION public.affiliate_commission_base(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_commission_base(uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Motor: AFTER INSERT ON company_payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.affiliate_commission_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $affmotor$
DECLARE
  v_aff        public.affiliates%ROWTYPE;
  v_kind       text;
  v_pct        numeric;
  v_is_first   boolean;
  v_used       integer;
  v_base       numeric;
  v_commission numeric;
  v_ref_month  date;
BEGIN
  -- (a) Resolve o afiliado da empresa. Sem afiliado ou afiliado inativo = no-op.
  SELECT a.* INTO v_aff
  FROM public.companies c
  JOIN public.affiliates a ON a.id = c.affiliate_id
  WHERE c.id = NEW.company_id;

  IF v_aff.id IS NULL OR NOT COALESCE(v_aff.is_active, false) THEN
    RETURN NEW;
  END IF;

  -- (b) kind. SÓ 'primeira_venda' decide; todo o resto é recorrência (ver
  --     DIVERGÊNCIA 2 no cabeçalho — há 'renovacao' E 'renewal' em produção).
  --     Sem filtro de `voided`: a coluna não existe no Dominex.
  v_is_first := (NEW.type = 'primeira_venda')
    OR NOT EXISTS (
      SELECT 1 FROM public.company_payments p
      WHERE p.company_id = NEW.company_id
        AND p.id <> NEW.id
    );

  IF v_is_first THEN
    v_kind := 'first';
    v_pct  := v_aff.first_payment_pct;
  ELSE
    v_kind := 'recurring';
    v_pct  := v_aff.recurring_pct;
  END IF;

  -- (c) Percentual zerado/nulo = não gera linha de R$ 0 (sujaria o extrato).
  IF COALESCE(v_pct, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- (d) COTA DE RECORRÊNCIA. Conta RECORRÊNCIAS JÁ GERADAS pra este par
  --     (afiliado, empresa). 'voided' não queima cota.
  --     recurring_months = 0 -> count(0) >= 0 é TRUE -> nenhuma recorrência.
  IF v_kind = 'recurring' AND v_aff.recurring_months IS NOT NULL THEN
    SELECT count(*) INTO v_used
    FROM public.affiliate_commissions
    WHERE affiliate_id = v_aff.id
      AND company_id   = NEW.company_id
      AND kind         = 'recurring'
      AND status      <> 'voided';

    IF v_used >= v_aff.recurring_months THEN
      RAISE NOTICE 'affiliate_commission: cota de recorrência esgotada (afiliado=%, empresa=%, usadas=%, limite=%) — sem comissão',
        v_aff.id, NEW.company_id, v_used, v_aff.recurring_months;
      RETURN NEW;
    END IF;
  END IF;

  -- (e) Base e comissão (ver bloco PROVA no cabeçalho).
  v_base       := public.affiliate_commission_base(NEW.company_id, NEW.amount);
  v_commission := round(v_base * v_pct / 100.0, 2);

  -- (f) reference_month ancorado no fuso de Brasília (UTC-3), não em UTC.
  --     date_trunc direto no timestamptz usaria o TimeZone da sessão: um
  --     pagamento de 30/09 22:00 BRT (= 01/10 01:00 UTC) cairia em OUTUBRO e
  --     entraria no fechamento mensal errado. Mesma régua BRT-aware de
  --     delete_company_payment_with_rollback e compute_next_expiration.
  --     (Divergência deliberada em relação ao Eco, que faz o date_trunc cru.)
  v_ref_month := date_trunc(
                   'month',
                   COALESCE(NEW.payment_date, now()) AT TIME ZONE 'America/Sao_Paulo'
                 )::date;

  -- (g) INSERT idempotente. O índice único parcial affiliate_commissions_payment_uidx
  --     (company_payment_id) WHERE company_payment_id IS NOT NULL é a trava
  --     financeira: no máximo 1 comissão por pagamento, mesmo em replay.
  INSERT INTO public.affiliate_commissions
    (affiliate_id, company_id, company_payment_id, kind, base_amount, pct_applied,
     commission_amount, reference_month, status)
  VALUES
    (v_aff.id, NEW.company_id, NEW.id, v_kind, v_base, v_pct,
     v_commission, v_ref_month, 'pending')
  ON CONFLICT (company_payment_id) WHERE company_payment_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$affmotor$;

COMMENT ON FUNCTION public.affiliate_commission_on_payment() IS
  'Gera a comissão do afiliado a cada company_payments inserido. kind=first só quando type=primeira_venda OU é o único pagamento da empresa (NUNCA ramificar em renovacao: produção tem renovacao E renewal). Respeita a cota affiliates.recurring_months contando recorrências já geradas (voided não queima cota). Idempotente via affiliate_commissions_payment_uidx.';

DROP TRIGGER IF EXISTS trg_affiliate_commission_on_payment ON public.company_payments;
CREATE TRIGGER trg_affiliate_commission_on_payment
  AFTER INSERT ON public.company_payments
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_commission_on_payment();

-- ---------------------------------------------------------------------------
-- 3. Estorno: BEFORE DELETE ON company_payments
-- ---------------------------------------------------------------------------
-- TEM que ser BEFORE, não AFTER. A FK affiliate_commissions.company_payment_id
-- é ON DELETE SET NULL: num AFTER DELETE o vínculo JÁ foi zerado pela FK e não
-- há mais como achar a comissão daquele pagamento.
--
-- Só 'pending' -> 'voided'. Comissão já 'paid' NÃO volta atrás: o repasse saiu
-- do caixa e virou despesa em admin_financial_transactions. Desfazer aqui
-- criaria um passivo invisível (dinheiro pago, comissão anulada). Estorno de
-- comissão já paga é decisão manual do admin — mesma régua do
-- delete_company_payment_with_rollback, que também não mexe em salesperson_sales.
CREATE OR REPLACE FUNCTION public.affiliate_commission_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $affdel$
BEGIN
  UPDATE public.affiliate_commissions
     SET status = 'voided'
   WHERE company_payment_id = OLD.id
     AND status = 'pending';

  RETURN OLD;
END;
$affdel$;

COMMENT ON FUNCTION public.affiliate_commission_on_payment_delete() IS
  'Anula (status=voided) a comissão PENDENTE do pagamento que está sendo deletado. BEFORE DELETE de propósito: a FK company_payment_id é ON DELETE SET NULL, então num AFTER DELETE o vínculo já se perdeu. Comissão já paid permanece paid — o repasse saiu do caixa.';

DROP TRIGGER IF EXISTS trg_affiliate_commission_on_payment_delete ON public.company_payments;
CREATE TRIGGER trg_affiliate_commission_on_payment_delete
  BEFORE DELETE ON public.company_payments
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_commission_on_payment_delete();

-- ---------------------------------------------------------------------------
-- 4. GUARDA "AFILIADO ZERA VENDEDOR" em register_manual_company_payment
-- ---------------------------------------------------------------------------
-- Se a empresa veio por um afiliado (companies.affiliate_id IS NOT NULL), a
-- venda é do afiliado e NÃO gera comissão de vendedor — senão a mesma venda é
-- paga duas vezes (afiliado + closer/SDR).
--
-- ⚠️ CORPO EXTRAÍDO DA DEFINIÇÃO VIVA DO BANCO em 2026-10-14
--    (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname =
--     'register_manual_company_payment'), NÃO do arquivo da migration antiga.
--    Migrations posteriores à 20260716120000 já reescreveram esta função (ex.:
--    20260911120000_register_manual_payment_ancora_venda_na_data_pagamento.sql,
--    que mudou a âncora do vencimento) — o arquivo antigo está DEFASADO e
--    recriar a partir dele reverteria correções de dinheiro.
--
-- DELTA desta migration (3 pontos, cirúrgico):
--    (i)   DECLARE v_affiliate_id uuid;
--    (ii)  atribuição a partir de v_company.affiliate_id;
--    (iii) condição da seção 7 ganha "AND v_affiliate_id IS NULL" + RAISE NOTICE.
--    Nada mais foi tocado.
--
-- CREATE OR REPLACE (nunca DROP): DROP FUNCTION leva os GRANTs junto. A ACL
-- vigente é postgres=X | authenticated=X | service_role=X (sem anon, sem PUBLIC)
-- e precisa continuar assim — revalidada no fim desta migration.
CREATE OR REPLACE FUNCTION public.register_manual_company_payment(
  p_company_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_type text,
  p_payment_method text,
  p_notes text DEFAULT NULL::text,
  p_cpf_cnpj text DEFAULT NULL::text,
  p_closer_id uuid DEFAULT NULL::uuid,
  p_sdr_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $regmanual$
DECLARE
  v_company           public.companies%ROWTYPE;
  v_payment_id        uuid;
  v_payment_type      text;
  v_billing_cycle     text;
  v_subscription_value numeric;
  v_category          text;
  v_description       text;
  -- promoção de pending / sync de módulos (espelha asaas-webhook)
  v_has_pending_plan  boolean;
  v_effective_plan    text;
  v_included          jsonb;
  v_target_modules    text[];
  -- comissão (regra espelhada de supabase/functions/asaas-webhook/index.ts)
  v_is_yearly         boolean;
  v_total_rate        numeric;
  v_commission_base   numeric;
  v_total_commission  numeric;
  v_closer_commission numeric;
  v_sdr_commission    numeric;
  -- [DELTA (i)] AFILIADO ZERA VENDEDOR
  v_affiliate_id      uuid;
BEGIN
  -- 1. Gate explícito (DEFINER bypassa RLS) — Forma A.
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  ) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  -- Validações de entrada.
  IF p_type NOT IN ('venda', 'renovacao') THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_nao_encontrada';
  END IF;

  -- [DELTA (ii)] Afiliado que indicou a empresa (NULL = venda sem afiliado).
  v_affiliate_id := v_company.affiliate_id;

  -- 2. Guarda de duplicidade: mesmo company+valor+data criado nos últimos 60s
  --    (protege contra duplo clique no salvar).
  IF EXISTS (
    SELECT 1
    FROM public.company_payments cp
    WHERE cp.company_id = p_company_id
      AND cp.amount = p_amount
      AND cp.payment_date::date = p_payment_date
      AND cp.created_at >= now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'pagamento_duplicado';
  END IF;

  -- 3. CNPJ na venda (empresa em teste sem documento): companies.cnpj +
  --    espelho em company_settings.document (identidade dual — companies é a
  --    visão admin, company_settings é a visão tenant). O UPDATE em
  --    company_settings dispara trg_sync_company_settings_to_companies, que
  --    re-escreve companies.cnpj com o mesmo valor (inócuo, sem loop).
  --    Só atualiza se a linha de company_settings existir; não cria linha.
  IF p_cpf_cnpj IS NOT NULL AND p_type = 'venda' THEN
    UPDATE public.companies SET cnpj = p_cpf_cnpj WHERE id = p_company_id;
    UPDATE public.company_settings
    SET document = p_cpf_cnpj
    WHERE company_id = p_company_id;
  END IF;

  -- 4. company_payments. Mapeamento de type: venda → 'primeira_venda'
  --    (mesmo valor que o webhook Asaas grava e que detectIsFirstSale lê);
  --    renovacao → 'renewal' (compat com o que o AdminRenewalModal já grava).
  v_payment_type := CASE WHEN p_type = 'venda' THEN 'primeira_venda' ELSE 'renewal' END;

  INSERT INTO public.company_payments (
    company_id, amount, type, payment_method, payment_date, notes, origin, created_by
  ) VALUES (
    p_company_id,
    p_amount,
    v_payment_type,
    p_payment_method,
    p_payment_date::timestamptz,
    p_notes,
    v_company.origin,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  -- 5. Ativação/LTV/vencimento. Promove pending_* ANTES de calcular a
  --    extensão (o ciclo promovido define +1 mês ou +12 meses).
  v_billing_cycle      := COALESCE(v_company.pending_billing_cycle, v_company.billing_cycle, 'monthly');
  v_subscription_value := COALESCE(v_company.pending_subscription_value, v_company.subscription_value);
  v_has_pending_plan   := v_company.pending_plan_code IS NOT NULL;
  v_effective_plan     := COALESCE(v_company.pending_plan_code, v_company.subscription_plan);

  UPDATE public.companies c
  SET ltv                        = COALESCE(c.ltv, 0) + p_amount,
      subscription_status        = 'active',
      -- compute_next_expiration soma 1 mês/1 ano BRT-aware (mesma helper do webhook).
      --
      -- ÂNCORA (espelha supabase/functions/asaas-webhook/index.ts):
      --  - PRIMEIRA VENDA (p_type = 'venda' numa empresa que ainda NÃO está active):
      --    ancora na DATA DO PAGAMENTO. Antes ancorava em subscription_expires_at,
      --    que numa empresa em teste é o FIM DO TESTE GRÁTIS — o mês pago era
      --    empilhado em cima do teste e o cliente ganhava ~1 mês de graça
      --    (incidente Predial Service 25/08 → gravou 24/10 em vez de 24/09).
      --  - RENOVAÇÃO: ancora no subscription_expires_at vigente (assim pagar
      --    adiantado NÃO perde dias — o próximo ciclo continua do vencimento atual).
      --  - GUARDA subscription_status <> 'active': se alguém registrar 'venda' numa
      --    empresa JÁ ativa (com período pago corrente), ancorar na data do pagamento
      --    ENCURTARIA o vencimento dela — nesse caso de borda mantemos o comportamento
      --    antigo (empilhar sobre o vencimento vigente).
      --  v_company foi lido ANTES deste UPDATE, então subscription_status aqui é o
      --  status PRÉ-pagamento (testing / pending_payment / inactive na 1ª venda).
      subscription_expires_at    = public.compute_next_expiration(
                                     CASE
                                       WHEN p_type = 'venda'
                                            AND COALESCE(v_company.subscription_status, '') <> 'active'
                                       THEN p_payment_date::timestamptz
                                       ELSE GREATEST(COALESCE(c.subscription_expires_at, now()), now())
                                     END,
                                     v_billing_cycle
                                   ),
      subscription_value         = COALESCE(c.pending_subscription_value, c.subscription_value),
      subscription_plan          = COALESCE(c.pending_plan_code, c.subscription_plan),
      billing_cycle              = COALESCE(c.pending_billing_cycle, c.billing_cycle),
      max_users                  = COALESCE(c.pending_max_users, c.max_users),
      pending_subscription_value = NULL,
      pending_plan_code          = NULL,
      pending_billing_cycle      = NULL,
      pending_max_users          = NULL,
      pending_modules            = NULL
  WHERE c.id = p_company_id;

  -- 5b. Sync de company_modules (espelha o webhook; best-effort como lá:
  --     falha aqui NÃO derruba o pagamento já registrado).
  BEGIN
    IF v_has_pending_plan THEN
      -- Conjunto-alvo: pending_modules explícito (jsonb array de strings),
      -- senão included_modules do plano-alvo; senão vazio.
      IF jsonb_typeof(v_company.pending_modules) = 'array' THEN
        SELECT COALESCE(array_agg(e.value #>> '{}'), '{}'::text[])
        INTO v_target_modules
        FROM jsonb_array_elements(v_company.pending_modules) e
        WHERE jsonb_typeof(e.value) = 'string';
      ELSE
        SELECT sp.included_modules INTO v_included
        FROM public.subscription_plans sp
        WHERE sp.code = v_company.pending_plan_code;

        IF jsonb_typeof(v_included) = 'array' THEN
          SELECT COALESCE(array_agg(e.value #>> '{}'), '{}'::text[])
          INTO v_target_modules
          FROM jsonb_array_elements(v_included) e
          WHERE jsonb_typeof(e.value) = 'string';
        ELSE
          v_target_modules := '{}'::text[];
        END IF;
      END IF;

      -- Sync EXATO (downgrade efetiva de verdade): remove o que sobra...
      DELETE FROM public.company_modules cm
      WHERE cm.company_id = p_company_id
        AND cm.module_code <> ALL (v_target_modules);

      -- ...e insere o que falta.
      INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
      SELECT p_company_id, t.code, 1, now()
      FROM unnest(v_target_modules) AS t(code)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_modules cm
        WHERE cm.company_id = p_company_id AND cm.module_code = t.code
      );
    ELSE
      -- Sem pending: aditivo — garante os included_modules do plano atual,
      -- NUNCA remove (preserva módulo extra comprado à la carte).
      SELECT sp.included_modules INTO v_included
      FROM public.subscription_plans sp
      WHERE sp.code = v_effective_plan;

      IF jsonb_typeof(v_included) = 'array' THEN
        INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
        SELECT p_company_id, e.value #>> '{}', 1, now()
        FROM jsonb_array_elements(v_included) e
        WHERE jsonb_typeof(e.value) = 'string'
          AND NOT EXISTS (
            SELECT 1 FROM public.company_modules cm
            WHERE cm.company_id = p_company_id
              AND cm.module_code = e.value #>> '{}'
          );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'register_manual_company_payment: sync de módulos falhou (não-fatal): %', SQLERRM;
  END;

  -- 6. Receita no financeiro admin (espelho 1:1 do pagamento).
  v_category := CASE WHEN p_type = 'venda' THEN 'sale' ELSE 'renewal' END;
  v_description := CASE WHEN p_type = 'venda'
    THEN 'Venda manual — ' || v_company.name
    ELSE 'Renovação manual — ' || v_company.name
  END;

  INSERT INTO public.admin_financial_transactions (
    type, category, amount, description, transaction_date,
    reference_type, reference_id, created_by
  ) VALUES (
    'income', v_category, p_amount, v_description, p_payment_date::timestamptz,
    'company_payment', v_payment_id, auth.uid()
  );

  -- 7. Comissão — SÓ venda, SÓ com closer, SÓ se a empresa ainda não tem
  --    venda registrada (comissão é exclusiva da 1ª venda).
  --    RÉGUA NOVA (CEO 2026-07-16), espelhada do asaas-webhook:
  --      mensal: total = base * 1.00 | anual: total = base * 0.20 (sem /12)
  --      COM SDR → closer 80% / SDR 20% (closer arredondado, SDR o resto)
  --      SEM SDR → 100% closer
  --      base = subscription_value efetivo (pós-promoção); fallback p_amount.
  --    [LEAD SELF-SERVICE] status da comissão: 'pending_work' (segurada) só
  --      quando é lead self-service ainda não trabalhado; senão 'confirmed'.
  --
  --    [DELTA (iii)] AFILIADO ZERA VENDEDOR: empresa indicada por afiliado não
  --    gera comissão de vendedor. A venda já é remunerada pelo programa de
  --    afiliados (trigger trg_affiliate_commission_on_payment, que disparou no
  --    INSERT da seção 4). Sem esta guarda, a MESMA venda sairia do caixa duas
  --    vezes. Mesma guarda no supabase/functions/asaas-webhook/index.ts.
  IF v_affiliate_id IS NOT NULL THEN
    RAISE NOTICE '[afiliado zera vendedor] empresa % tem affiliate_id=%, sem comissão de vendedor',
      p_company_id, v_affiliate_id;
  END IF;

  IF p_type = 'venda' AND p_closer_id IS NOT NULL AND v_affiliate_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.salesperson_sales ss WHERE ss.company_id = p_company_id
    ) THEN
      v_is_yearly        := lower(COALESCE(v_billing_cycle, '')) IN ('yearly', 'annual', 'anual', 'year');
      v_total_rate       := CASE WHEN v_is_yearly THEN 0.20 ELSE 1.00 END;
      v_commission_base  := COALESCE(NULLIF(v_subscription_value, 0), p_amount);
      v_total_commission := round(v_commission_base * v_total_rate, 2);

      IF p_sdr_id IS NOT NULL THEN
        -- 80/20 centavo-safe: closer leva 80% arredondado, SDR o resto.
        v_closer_commission := round(v_total_commission * 0.8, 2);
        v_sdr_commission    := round(v_total_commission - v_closer_commission, 2);
      ELSE
        v_closer_commission := v_total_commission;
        v_sdr_commission    := 0;
      END IF;

      INSERT INTO public.salesperson_sales (
        salesperson_id, sdr_id, company_id, customer_name, customer_origin,
        amount, paid_amount, commission_amount,
        closer_commission, sdr_commission, billing_cycle, created_by, status
      ) VALUES (
        p_closer_id, p_sdr_id, p_company_id, v_company.name, v_company.origin,
        v_commission_base, COALESCE(v_subscription_value, p_amount), v_total_commission,
        v_closer_commission, v_sdr_commission,
        CASE WHEN v_is_yearly THEN 'annual' ELSE 'monthly' END,
        auth.uid(),
        -- segura a comissão só quando é lead self-service ainda não trabalhado
        CASE WHEN (NOT v_company.is_self_service OR v_company.lead_worked_at IS NOT NULL)
             THEN 'confirmed' ELSE 'pending_work' END
      );
    END IF;
  END IF;

  -- 8. Id do pagamento criado.
  RETURN v_payment_id;
END;
$regmanual$;

-- Reafirma a ACL (CREATE OR REPLACE preserva, mas é barato garantir).
REVOKE ALL ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Validação pós-DDL (falha a migration se algo não ficou no ar)
-- ---------------------------------------------------------------------------
DO $validate$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.company_payments'::regclass
      AND tgname = 'trg_affiliate_commission_on_payment'
      AND NOT tgisinternal
  ) THEN
    v_missing := v_missing || ' trg_affiliate_commission_on_payment';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.company_payments'::regclass
      AND tgname = 'trg_affiliate_commission_on_payment_delete'
      AND NOT tgisinternal
  ) THEN
    v_missing := v_missing || ' trg_affiliate_commission_on_payment_delete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'affiliate_commission_base'
  ) THEN
    v_missing := v_missing || ' affiliate_commission_base';
  END IF;

  -- A guarda "afiliado zera vendedor" tem que estar MESMO no corpo publicado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_manual_company_payment'
      AND pg_get_functiondef(p.oid) LIKE '%v_affiliate_id IS NULL%'
  ) THEN
    v_missing := v_missing || ' guarda_afiliado_zera_vendedor';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Motor de comissão de afiliado incompleto, faltou:%', v_missing;
  END IF;

  RAISE NOTICE 'Motor de comissão de afiliado OK: 2 triggers + base canônica + guarda afiliado-zera-vendedor.';
END $validate$;

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — reverter NÃO apaga comissões já geradas, de propósito):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_affiliate_commission_on_payment_delete ON public.company_payments;
-- DROP TRIGGER IF EXISTS trg_affiliate_commission_on_payment ON public.company_payments;
-- DROP FUNCTION IF EXISTS public.affiliate_commission_on_payment_delete();
-- DROP FUNCTION IF EXISTS public.affiliate_commission_on_payment();
-- DROP FUNCTION IF EXISTS public.affiliate_commission_base(uuid, numeric);
-- -- register_manual_company_payment: NÃO dropar. Pra tirar só a guarda, recriar
-- -- a partir da definição viva removendo "AND v_affiliate_id IS NULL" da seção 7.
-- COMMIT;
-- ============================================================================
