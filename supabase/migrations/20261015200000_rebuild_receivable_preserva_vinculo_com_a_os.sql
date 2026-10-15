-- ============================================================================
-- Auto-cura de recebível preserva o vínculo com a Ordem de Serviço
-- 2026-10-15 — complemento de 20261015190000 (faturar OS) e 20261015193000
-- ============================================================================
--
-- O BECO SEM SAÍDA QUE ESTA MIGRATION FECHA
--
-- 20261015190000 ensinou `create_tenant_charge_receivable` a gravar
-- `financial_transactions.service_order_id` quando a cobrança nasce de uma OS
-- (`tenant_charges.source_type = 'service_order'`). Esse elo é o que faz
-- `os_billing_state` (e o `useOsRevenueSummary` que a tela já lê) enxergar a OS
-- como "já faturada".
--
-- A auto-cura `rebuild_tenant_charge_receivable` — chamada por
-- `apply_tenant_charge_payment`, `apply_tenant_charge_installment_payment` e
-- `heal_orphan_tenant_charge_receivables` quando a cobrança foi paga mas o
-- recebível-mãe não existe — ficou de fora: ela chamava
-- `create_tenant_charge_receivable` sem o 10º parâmetro, e o recebível curado
-- nascia SEM `service_order_id`. Em cadeia:
--
--   1. Cobrança de OS é criada; o recebível falha (a edge devolve
--      `finance_warning`, por contrato não-fatal).
--   2. O cliente paga. A cura entra e recria o recebível — sem o elo com a OS.
--   3. A OS mostra "não faturada" PARA SEMPRE, mesmo paga e recebida.
--   4. O usuário tenta lançar a receita à mão; o trigger
--      `trg_block_os_manual_revenue_when_charged` recusa (a cobrança está viva).
--   5. Única saída: apagar a cobrança e refazer tudo.
--
-- A função já tem o dado na mão: `v_charge` é `tenant_charges%ROWTYPE`, então
-- `source_type`/`source_id` estão carregados — nenhuma consulta nova.
--
-- FORMA: `CREATE OR REPLACE` (sem `DROP FUNCTION`): a assinatura não muda, e os
-- GRANTs sobrevivem por construção. Partiu da definição VIVA
-- (`pg_get_functiondef`), não de reescrita — todas as guardas (0..6) seguem
-- intactas, em especial a (0), que pula `contract_installment` e impede que a
-- cura dobre o DRE do cliente.
--
-- Idempotente: `CREATE OR REPLACE`, rodar 2x é no-op.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_tenant_charge_receivable(
  p_charge_id uuid,
  p_reason    text DEFAULT 'baixa de cobrança'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_existing_id   uuid;
  v_new_id        uuid;
  v_auto_post     boolean;
  v_account_id    uuid;
  v_category      text;
  v_default_desc  text;
  v_tpa_found     boolean := false;
  v_customer_name text;
  v_description   text;
  v_note          text;
BEGIN
  IF p_charge_id IS NULL THEN
    RETURN jsonb_build_object('healed', false, 'status', 'charge_not_found');
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('healed', false, 'status', 'charge_not_found');
  END IF;

  -- (0) Parcela de contrato NUNCA e curada. A cobranca de parcela nao cria
  --     recebivel proprio: ela se LIGA a parcela que o contrato ja gerou. Curar
  --     aqui inseriria uma SEGUNDA receita e dobraria o DRE do cliente em
  --     silencio. Hoje o opt-out de post_to_finance cobre isso por acidente;
  --     esta guarda existe para o caso de qualquer caminho futuro esquecer o
  --     opt-out. Vem antes de tudo para nenhum caminho de INSERT ficar
  --     alcancavel por uma cobranca de parcela.
  IF v_charge.source_type = 'contract_installment' THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_contract_installment');
  END IF;

  -- (1) Ja existe mae? Checagem sob o lock que o chamador ja tomou em
  --     tenant_charges. Nao filtra is_paid de proposito: mae em QUALQUER
  --     estado bloqueia a cura.
  SELECT id INTO v_existing_id
    FROM public.financial_transactions
   WHERE tenant_charge_id      = v_charge.id
     AND company_id            = v_charge.company_id
     AND transaction_type      = 'entrada'
     AND parent_transaction_id IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'healed', false,
      'status', 'already_exists',
      'receivable_id', v_existing_id
    );
  END IF;

  -- (2) Intencao gravada NA COBRANCA. Cobranca criada com "nao lancar no
  --     financeiro" nunca e curada.
  IF COALESCE(v_charge.post_to_finance, true) = false THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_charge_opt_out');
  END IF;

  -- (3) Config ATUAL do tenant. Quem desligou o lancamento automatico esta
  --     dizendo hoje "meu financeiro nao e aqui" — respeita, e diz que pulou.
  SELECT COALESCE(tpa.auto_post_to_finance, true),
         tpa.default_finance_account_id,
         NULLIF(btrim(tpa.default_income_category), ''),
         NULLIF(btrim(tpa.default_description), '')
    INTO v_auto_post, v_account_id, v_category, v_default_desc
    FROM public.tenant_payment_accounts tpa
   WHERE tpa.company_id = v_charge.company_id
   LIMIT 1;

  v_tpa_found := FOUND;

  IF v_tpa_found AND v_auto_post = false THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_tenant_opt_out');
  END IF;

  -- Conta default pode ter sido apagada (o proprio "Zerar Sistema" recria a
  -- lista de contas). FK invalida abortaria o INSERT, entao valida a posse.
  IF v_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.financial_accounts fa
       WHERE fa.id = v_account_id
         AND fa.company_id = v_charge.company_id
    ) THEN
      v_account_id := NULL;
    END IF;
  END IF;

  -- (4) Descricao: mesma cascata da edge de criacao (descricao da cobranca,
  --     default da conta, "Cobranca de <cliente>"). create_tenant_charge_
  --     receivable EXIGE descricao nao vazia, e cobranca sem descricao existe
  --     de verdade em producao.
  SELECT c.name INTO v_customer_name
    FROM public.customers c
   WHERE c.id = v_charge.customer_id
     AND c.company_id = v_charge.company_id;

  v_description := COALESCE(
    NULLIF(btrim(v_charge.description), ''),
    v_default_desc,
    CASE WHEN v_customer_name IS NOT NULL
         THEN 'Cobrança de ' || v_customer_name
         ELSE NULL END,
    'Cobrança online ' || left(v_charge.id::text, 8)
  );

  -- (5) Reconstrucao propriamente dita.
  BEGIN
    v_new_id := public.create_tenant_charge_receivable(
      v_charge.company_id,
      v_charge.id,
      v_charge.customer_id,
      v_charge.value,
      COALESCE(v_charge.due_date, v_charge.created_at::date),
      left(v_description, 500),
      v_account_id,
      v_category,
      NULL,  -- centro de custo original nao e reconstruivel; fica em branco
      -- (2026-10-15) ELO COM A OS. Sem este parametro, o recebivel curado
      -- nascia sem service_order_id e a OS ficava "nao faturada" para sempre,
      -- com a receita manual bloqueada pelo trigger: beco sem saida. A origem
      -- vem de v_charge (ja carregado), nunca de parametro externo.
      CASE WHEN v_charge.source_type = 'service_order'
           THEN v_charge.source_id
           ELSE NULL END
    );
  EXCEPTION
    WHEN SQLSTATE '23001' THEN
      -- Dupla contagem: o orcamento de origem ja lancou a receita. Nao criar
      -- aqui e o comportamento CORRETO, e precisa ser dito em voz alta.
      RETURN jsonb_build_object(
        'healed', false,
        'status', 'skipped_double_count',
        'detail', SQLERRM
      );
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'healed', false,
        'status', 'heal_failed',
        'detail', SQLERRM,
        'sqlstate', SQLSTATE
      );
  END;

  IF v_new_id IS NULL THEN
    RETURN jsonb_build_object('healed', false, 'status', 'heal_failed', 'detail', 'insert sem id');
  END IF;

  -- (6) Fidelidade + rastro. `create_tenant_charge_receivable` carimba
  --     transaction_date = hoje (correto na criacao da cobranca, errado numa
  --     reconstrucao meses depois: jogaria a receita para o mes errado no
  --     regime de competencia). A data de criacao da COBRANCA e exatamente a
  --     data que a linha original tinha.
  --
  --     A nota existe para a linha nao "aparecer do nada": trocar uma omissao
  --     silenciosa por um surgimento silencioso seria o mesmo pecado.
  v_note := format(
    'Lançamento recriado automaticamente em %s porque o pagamento foi confirmado no gateway e este a receber não existia mais (%s). Valor e vencimento vieram da cobrança online (referência %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(NULLIF(btrim(p_reason), ''), 'origem não informada'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador')
  );

  UPDATE public.financial_transactions
     SET transaction_date = v_charge.created_at::date,
         notes            = btrim(COALESCE(notes || E'\n', '') || v_note),
         updated_at       = now()
   WHERE id = v_new_id
     AND company_id = v_charge.company_id;

  RETURN jsonb_build_object(
    'healed', true,
    'status', 'healed',
    'receivable_id', v_new_id,
    'company_id', v_charge.company_id,
    'amount', v_charge.value
  );
END;
$function$;

COMMENT ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) IS
  'Auto-cura do recebível-mãe de uma cobrança paga sem lançamento. Pula parcela de contrato (dobraria o DRE), respeita opt-out da cobrança e do tenant, e preserva o vínculo com a OS quando source_type = service_order (2026-10-15).';

-- GRANTs: intencionalmente NÃO re-aplicados. `CREATE OR REPLACE` mantém a ACL
-- existente ({postgres=X, service_role=X}); a função é chamada apenas por
-- outras funções SECURITY DEFINER do banco (apply_tenant_charge_payment,
-- apply_tenant_charge_installment_payment, heal_orphan_tenant_charge_receivables).
-- Conceder a `authenticated` aqui alargaria a superfície sem necessidade.
