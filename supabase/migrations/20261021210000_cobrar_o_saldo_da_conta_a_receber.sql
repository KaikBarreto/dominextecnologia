-- 20261021210000_cobrar_o_saldo_da_conta_a_receber.sql
-- ============================================================================
-- COBRAR O SALDO DE UMA CONTA A RECEBER (Asaas BYO) — Etapa 1 (motor)
--
-- Por quê (chamado KGIE Tecnologia, 21/10/2026): o cliente final pagou parte de
-- uma conta de R$ 352,60 e NÃO havia como emitir boleto só do saldo ligado
-- àquela conta. Nasceram três cobranças paralelas e o MESMO pagamento acabou
-- contado duas vezes no Financeiro.
--
-- A causa raiz é dupla:
--   (a) `tenant-asaas-create-charge` só sabia CRIAR recebível novo (avulso /
--       quote / service_order) ou LIGAR exigindo valor cheio e amount_received
--       = 0 (contract_installment). "Cobrar o que falta" não existia.
--   (b) `apply_tenant_charge_payment` marcava `is_paid = true` SEM COMPARAR
--       VALOR — um boleto de R$ 99,00 quitava uma conta de R$ 352,60.
--
-- O que esta migration faz:
--   1. Aceita `source_type = 'receivable'` em tenant_charges (CHECK estendido).
--   2. Régua única de espelho (tenant_charge_mirror_classification) ganha a
--      guarda `r_receivable`: a conta a receber que a cobrança apenas LIGOU é
--      preexistente e NUNCA pode ser apagada quando a cobrança é cancelada.
--      Mesma lógica do `r_contract`, mesma razão.
--   3. `rebuild_tenant_charge_receivable` (auto-cura) passa a PULAR cobrança
--      de origem 'receivable'. Cinto e suspensória: a edge já grava
--      post_to_finance = false, mas a guarda dentro da RPC vale
--      independentemente disso (igual ao que 20260919110000 fez pro contrato).
--   4. `apply_tenant_charge_payment` decide PELO VALOR:
--        · cobrança >= saldo em aberto  -> quitação total (comportamento
--          histórico, SEM gravar amount_received — incidente Aldebaran,
--          20260917140000);
--        · cobrança <  saldo em aberto  -> INSERT da filha "Recebimento
--          parcial" e NADA na mãe. Quem fecha a mãe é o gatilho
--          `recalc_amount_received`. Dois caminhos gravando o mesmo fato foi
--          exatamente a causa do Aldebaran; aqui só um grava.
--   5. Nova RPC `revert_tenant_charge_payment` para o ramo de estorno/
--      chargeback do webhook: APAGA as filhas de recebimento parcial da
--      cobrança e deixa o gatilho reabrir a mãe. O caminho antigo (UPDATE
--      amount_received = 0 em TODAS as linhas 'entrada' da cobrança) era
--      duplamente errado: zerava recebimento parcial legítimo que não veio
--      desta cobrança, e NÃO removia a filha — então o gatilho recolocava o
--      dinheiro estornado em `amount_received` na próxima recalculação.
--
-- Tudo recriado a partir da DEFINIÇÃO VIVA em produção (pg_get_functiondef),
-- nunca do arquivo de migration — os arquivos já divergiram do banco antes.
-- CREATE OR REPLACE em tudo o que não muda de assinatura (DROP levaria GRANT).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Nova origem de cobrança: 'receivable' (conta a receber que já existe).
--    source_id = financial_transactions.id da linha-MÃE. A cobrança se LIGA
--    (financial_transactions.tenant_charge_id) e NUNCA cria lançamento novo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_charges
  DROP CONSTRAINT IF EXISTS tenant_charges_source_type_check;

ALTER TABLE public.tenant_charges
  ADD CONSTRAINT tenant_charges_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'avulso'::text,
    'quote'::text,
    'contract_installment'::text,
    'service_order'::text,
    'receivable'::text
  ]));


-- ---------------------------------------------------------------------------
-- 2) Régua única de espelho + guarda `r_receivable`.
--    DROP + CREATE (e não CREATE OR REPLACE) porque o TIPO DE RETORNO muda —
--    o Postgres não substitui RETURNS TABLE com colunas novas. O DROP leva os
--    GRANTs junto, então eles são reaplicados logo abaixo (ACL original:
--    {postgres=X/postgres, service_role=X/postgres}).
--    Os dois chamadores (delete_tenant_charge_local e
--    cleanup_tenant_charge_mirror_on_delete) são recriados na MESMA transação,
--    logo em seguida, para nunca existir janela com a régua fora de sincronia.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tenant_charge_mirror_classification(uuid, uuid);


CREATE FUNCTION public.tenant_charge_mirror_classification(p_company_id uuid, p_charge_id uuid)
RETURNS TABLE (
  id               uuid,
  transaction_type text,
  contract_id      uuid,
  r_paid           boolean,
  r_partial        boolean,
  r_nfse           boolean,
  r_quote          boolean,
  r_contract       boolean,
  -- NOVO: a linha É a conta a receber preexistente que esta cobrança apenas
  -- LIGOU (source_type = 'receivable', source_id = esta linha). Ela não é
  -- espelho da cobrança: ela veio ANTES. Apagá-la ao cancelar o boleto
  -- destruiria uma conta a receber legítima do cliente.
  r_receivable     boolean,
  keep_it          boolean
)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH mirror AS (
    SELECT ft.id,
           ft.transaction_type::text             AS transaction_type,
           ft.contract_id,
           (ft.is_paid IS TRUE)                  AS r_paid,
           (COALESCE(ft.amount_received, 0) > 0) AS r_partial,
           EXISTS (SELECT 1 FROM public.nfse_emissions ne WHERE ne.financial_transaction_id = ft.id) AS r_nfse,
           EXISTS (SELECT 1 FROM public.quotes q        WHERE q.financial_transaction_id  = ft.id)   AS r_quote,
           (ft.contract_id IS NOT NULL)          AS r_contract,
           EXISTS (
             SELECT 1 FROM public.tenant_charges tc
              WHERE tc.id          = p_charge_id
                AND tc.company_id  = p_company_id
                AND tc.source_type = 'receivable'
                AND tc.source_id   = ft.id
           )                                      AS r_receivable
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
  )
  SELECT m.id,
         m.transaction_type,
         m.contract_id,
         m.r_paid,
         m.r_partial,
         m.r_nfse,
         m.r_quote,
         m.r_contract,
         m.r_receivable,
         (m.r_paid OR m.r_partial OR m.r_nfse OR m.r_quote OR m.r_contract
            OR m.r_receivable) AS keep_it
    FROM mirror m;
$function$

;

REVOKE ALL ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 3) delete_tenant_charge_local (cancelar a cobrança PELO SISTEMA).
--    Recriada da definição viva; a ÚNICA mudança é reconhecer a razão nova
--    'receivable' (carimbo próprio + razão devolvida pra UI). A régua em si
--    mora na função compartilhada e já foi atualizada acima.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tenant_charge_local(p_company_id uuid, p_charge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge         public.tenant_charges%ROWTYPE;
  v_mirror_total   integer := 0;
  v_mirror_deleted integer := 0;
  v_mirror_kept    integer := 0;
  v_reasons        text[]  := ARRAY[]::text[];
  v_note_base      text;
  v_note_contract  text;
  v_note_default   text;
  v_has_paid       boolean := false;
  v_has_partial    boolean := false;
  v_has_nfse       boolean := false;
  v_has_quote      boolean := false;
  v_has_contract   boolean := false;
  v_has_receivable boolean := false;
  v_note_receivable text;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL THEN
    RAISE EXCEPTION '[delete_tenant_charge_local] company_id e charge_id são obrigatórios';
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF upper(COALESCE(v_charge.status, '')) = ANY (
       ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','REFUNDED','CHARGEBACK']
     ) THEN
    RAISE EXCEPTION
      '[delete_tenant_charge_local] cobrança % consta como paga/estornada no nosso banco (status %) — exclusão abortada',
      p_charge_id, v_charge.status
      USING ERRCODE = '23001';
  END IF;

  -- Cabeçalho comum às duas frases: data, referência e valor formatados uma vez só.
  v_note_base := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );

  -- Único motivo é ser parcela de contrato: afirma o que aconteceu, sem falar em baixa.
  v_note_contract := v_note_base || ' A parcela do contrato continua no Financeiro.';

  -- Único motivo é ser a conta a receber que esta cobrança apenas LIGOU
  -- (origem 'receivable'): a conta é preexistente e continua lá. Mesma forma
  -- da frase do contrato, pelo mesmo motivo — o gestor não precisa saber que
  -- existia um elo técnico, só que a conta dele não sumiu.
  v_note_receivable := v_note_base || ' A conta a receber continua no Financeiro.';

  -- Demais casos: texto que já existia, inalterado.
  v_note_default  := v_note_base || ' Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.';

  -- Classifica cada espelho (régua compartilhada) e resolve tudo num statement só:
  -- quem tem dinheiro ou vínculo em cima recebe o carimbo e FICA; o resto é apagado.
  -- Os dois conjuntos são disjuntos (keep_it / NOT keep_it), então não brigam.
  -- MATERIALIZED explícito: `classified` é lida 3x e o conjunto não pode mudar
  -- entre as leituras (as próprias CTEs escrevem nas linhas classificadas).
  WITH classified AS MATERIALIZED (
    SELECT * FROM public.tenant_charge_mirror_classification(p_company_id, p_charge_id)
  ), stamped AS (
    -- Carimbo por linha: o motivo da preservação varia entre os espelhos da MESMA
    -- cobrança, então o texto não pode ser global.
    UPDATE public.financial_transactions ft
       SET notes = btrim(
             COALESCE(ft.notes || E'\n', '')
             || CASE
                  WHEN c.r_contract
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_contract
                  WHEN c.r_receivable
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_receivable
                  ELSE v_note_default
                END
           )
      FROM classified c
     WHERE ft.id = c.id
       AND c.keep_it
    RETURNING ft.id
  ), del AS (
    DELETE FROM public.financial_transactions ft
     USING classified c
     WHERE ft.id = c.id
       AND c.keep_it = false
    RETURNING ft.id
  )
  SELECT count(*),
         (SELECT count(*) FROM del),
         count(*) FILTER (WHERE c.keep_it),
         COALESCE(bool_or(c.r_paid), false),
         COALESCE(bool_or(c.r_partial), false),
         COALESCE(bool_or(c.r_nfse), false),
         COALESCE(bool_or(c.r_quote), false),
         COALESCE(bool_or(c.r_contract), false),
         COALESCE(bool_or(c.r_receivable), false)
    INTO v_mirror_total, v_mirror_deleted, v_mirror_kept,
         v_has_paid, v_has_partial, v_has_nfse, v_has_quote, v_has_contract,
         v_has_receivable
    FROM classified c;

  IF v_has_paid     THEN v_reasons := v_reasons || 'paid'::text;     END IF;
  IF v_has_partial  THEN v_reasons := v_reasons || 'partial'::text;  END IF;
  IF v_has_nfse     THEN v_reasons := v_reasons || 'nfse'::text;     END IF;
  IF v_has_quote    THEN v_reasons := v_reasons || 'quote'::text;    END IF;
  IF v_has_contract THEN v_reasons := v_reasons || 'contract'::text; END IF;
  IF v_has_receivable THEN v_reasons := v_reasons || 'receivable'::text; END IF;

  DELETE FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'found', true,
    'deleted', true,
    'mirror_total',   v_mirror_total,
    'mirror_deleted', v_mirror_deleted,
    'mirror_kept',    v_mirror_kept,
    'mirror_reasons', to_jsonb(v_reasons)
  );
END;
$function$

;

REVOKE ALL ON FUNCTION public.delete_tenant_charge_local(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tenant_charge_local(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_charge_local(uuid, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 4) cleanup_tenant_charge_mirror_on_delete (cobrança excluída NO PAINEL DO
--    ASAAS -> webhook PAYMENT_DELETED). Mesma mudança do item 3, pela mesma
--    razão: os dois caminhos de exclusão não podem divergir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_tenant_charge_mirror_on_delete(p_company_id uuid, p_asaas_payment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge   public.tenant_charges%ROWTYPE;
  v_total    integer := 0;
  v_deleted  integer := 0;
  v_kept     integer := 0;
  v_skipped  integer := 0;
  v_reasons  text[]  := ARRAY[]::text[];
  v_note_base     text;
  v_note_contract text;
  v_note_default  text;
  v_paid     boolean := false;
  v_partial  boolean := false;
  v_nfse     boolean := false;
  v_quote    boolean := false;
  v_contract boolean := false;
  v_receivable boolean := false;
  v_note_receivable text;
BEGIN
  IF p_company_id IS NULL OR COALESCE(btrim(p_asaas_payment_id), '') = '' THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'missing_args',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY[]::text[])
    );
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE asaas_payment_id = btrim(p_asaas_payment_id)
     AND company_id       = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'charge_not_found',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY[]::text[])
    );
  END IF;

  IF v_charge.payment_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', true, 'charge_id', v_charge.id, 'reason', 'charge_settled',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY['paid']::text[])
    );
  END IF;

  -- Mesmas frases do caminho local (copy PT-BR idêntica, de propósito: o gestor
  -- não precisa saber por qual porta a exclusão entrou).
  v_note_base := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );
  v_note_contract := v_note_base || ' A parcela do contrato continua no Financeiro.';
  v_note_receivable := v_note_base || ' A conta a receber continua no Financeiro.';
  v_note_default  := v_note_base || ' Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.';

  WITH classified AS MATERIALIZED (
    SELECT * FROM public.tenant_charge_mirror_classification(p_company_id, v_charge.id)
  ), stamped AS (
    UPDATE public.financial_transactions ft
       SET notes = btrim(
             COALESCE(ft.notes || E'\n', '')
             || CASE
                  WHEN c.r_contract
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_contract
                  WHEN c.r_receivable
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_receivable
                  ELSE v_note_default
                END
           )
      FROM classified c
     WHERE ft.id = c.id
       AND c.keep_it
       AND c.transaction_type = 'entrada'
       -- Idempotência do carimbo: reentrega do webhook não duplica a frase.
       AND COALESCE(ft.notes, '') NOT LIKE '%Cobrança online removida em%'
    RETURNING ft.id
  ), del AS (
    DELETE FROM public.financial_transactions ft
     USING classified c
     WHERE ft.id = c.id
       AND c.keep_it = false
       AND c.transaction_type = 'entrada'   -- nunca a despesa de tarifa (saída)
       AND c.contract_id IS NULL            -- redundante com r_contract, de propósito
    RETURNING ft.id
  )
  SELECT count(*) FILTER (WHERE c.transaction_type = 'entrada'),
         (SELECT count(*) FROM del),
         count(*) FILTER (WHERE c.transaction_type = 'entrada' AND c.keep_it),
         count(*) FILTER (WHERE c.transaction_type <> 'entrada'),
         COALESCE(bool_or(c.r_paid     AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_partial  AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_nfse     AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_quote    AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_contract AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_receivable AND c.transaction_type = 'entrada'), false)
    INTO v_total, v_deleted, v_kept, v_skipped,
         v_paid, v_partial, v_nfse, v_quote, v_contract, v_receivable
    FROM classified c;

  IF v_paid     THEN v_reasons := v_reasons || 'paid'::text;     END IF;
  IF v_partial  THEN v_reasons := v_reasons || 'partial'::text;  END IF;
  IF v_nfse     THEN v_reasons := v_reasons || 'nfse'::text;     END IF;
  IF v_quote    THEN v_reasons := v_reasons || 'quote'::text;    END IF;
  IF v_contract THEN v_reasons := v_reasons || 'contract'::text; END IF;
  IF v_receivable THEN v_reasons := v_reasons || 'receivable'::text; END IF;

  RETURN jsonb_build_object(
    'found',        true,
    'charge_id',    v_charge.id,
    'reason',       'processed',
    'mirror_total', v_total,
    'deleted',      v_deleted,
    'kept',         v_kept,
    'skipped',      v_skipped,
    'reasons',      to_jsonb(v_reasons)
  );
END;
$function$

;

REVOKE ALL ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 5) Auto-cura NÃO pode inserir receita para cobrança de origem 'receivable'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rebuild_tenant_charge_receivable(p_charge_id uuid, p_reason text DEFAULT 'baixa de cobrança'::text)
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

  -- (0-b) 2026-10-21. MESMA razao, origem nova: cobranca de origem
  --       'receivable' tambem NAO cria recebivel proprio — ela se LIGA a conta
  --       a receber que ja existia no Financeiro (source_id = aquela linha).
  --       Curar aqui inseriria uma SEGUNDA receita pelo mesmo servico e
  --       dobraria o DRE em silencio, que e exatamente o buraco do chamado
  --       KGIE (tres cobrancas paralelas, o mesmo dinheiro contado duas vezes).
  --
  --       Cinto E suspensoria: a edge de criacao ja grava post_to_finance =
  --       false nesta cobranca (o item (2) abaixo ja pularia), mas a guarda
  --       aqui vale INDEPENDENTEMENTE de post_to_finance — se qualquer caminho
  --       futuro esquecer o opt-out, a cura continua se recusando a inventar
  --       receita. Igual ao que 20260919110000 fez pela parcela de contrato.
  IF v_charge.source_type = 'receivable' THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_linked_receivable');
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
$function$

;

REVOKE ALL ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 6) BAIXA COM COMPARAÇÃO DE VALOR.
--    Recriada da definição viva. A única mudança é o bloco (d).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_tenant_charge_payment(p_asaas_payment_id text, p_paid_at timestamp with time zone DEFAULT now(), p_net numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_receivables   int     := 0;
  v_auto_fees     boolean := false;
  v_fee_category  text    := 'Tarifas e Taxas';
  v_fee           numeric;
  v_fee_exists    boolean := false;
  v_fee_posted    boolean := false;
  v_mother_id     uuid;
  v_heal          jsonb   := NULL;
  v_recv_status   text;
  -- Baixa com comparação de valor (2026-10-21).
  v_amount        numeric;
  v_received      numeric;
  v_balance       numeric;
  v_child_id      uuid;
  v_settlement    text    := 'none';
  v_mother_desc   text;
  v_mother_cust   uuid;
  v_mother_cc     uuid;
  v_mother_due    date;
BEGIN
  IF p_asaas_payment_id IS NULL OR length(trim(p_asaas_payment_id)) = 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_payment] asaas_payment_id obrigatório';
  END IF;

  -- (a) acha a cobrança; lock pra serializar reentregas concorrentes do webhook
  SELECT * INTO v_charge
  FROM public.tenant_charges
  WHERE asaas_payment_id = p_asaas_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'charge_not_found',
      'asaas_payment_id', p_asaas_payment_id
    );
  END IF;

  -- (b) idempotência: já pago.
  --     ANTES: return-cedo puro. Isso era exatamente o que impedia a
  --     recuperação do buraco — cobrança já marcada CONFIRMED cujo recebível
  --     foi apagado depois NUNCA mais era olhada por ninguém.
  --     AGORA: continua no-op para tudo, MENOS para o recebível ausente.
  IF v_charge.payment_date IS NOT NULL THEN
    SELECT id INTO v_mother_id
      FROM public.financial_transactions
     WHERE tenant_charge_id      = v_charge.id
       AND company_id            = v_charge.company_id
       AND transaction_type      = 'entrada'
       AND parent_transaction_id IS NULL
     LIMIT 1;

    IF v_mother_id IS NULL THEN
      v_heal := public.rebuild_tenant_charge_receivable(
        v_charge.id,
        'reentrega de pagamento já confirmado'
      );

      IF COALESCE((v_heal->>'healed')::boolean, false) THEN
        v_mother_id := (v_heal->>'receivable_id')::uuid;
        -- Quita SÓ a linha recém-criada. Escopo mínimo de propósito: não
        -- mexe em recebível preexistente que alguém tenha reaberto à mão.
        UPDATE public.financial_transactions
           SET is_paid    = true,
               paid_date  = p_paid_at::date,
               updated_at = now()
         WHERE id         = v_mother_id
           AND company_id = v_charge.company_id;
        v_receivables := 1;
      END IF;
    END IF;

    v_recv_status := CASE
      WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
      WHEN v_mother_id IS NOT NULL                        THEN 'ok'
      ELSE COALESCE(v_heal->>'status', 'missing')
    END;

    IF v_mother_id IS NULL THEN
      RAISE WARNING '[apply_tenant_charge_payment] cobrança % (empresa %) está paga e SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
        v_charge.id, v_charge.company_id, v_recv_status;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_paid',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'fee_posted', null,
      'receivables_settled', v_receivables,
      'receivable_status', v_recv_status,
      'settlement', 'already_applied',
      'heal', v_heal
    );
  END IF;

  -- (c) marca a cobrança como confirmada
  UPDATE public.tenant_charges
  SET status       = 'CONFIRMED',
      payment_date = p_paid_at,
      net_value    = COALESCE(p_net, net_value),
      updated_at   = now()
  WHERE id = v_charge.id;

  -- (c2) AUTO-CURA. Roda depois do FOR UPDATE de (a), então entregas
  --      concorrentes da mesma cobrança serializam aqui e só uma cria.
  SELECT id INTO v_mother_id
    FROM public.financial_transactions
   WHERE tenant_charge_id      = v_charge.id
     AND company_id            = v_charge.company_id
     AND transaction_type      = 'entrada'
     AND parent_transaction_id IS NULL
   LIMIT 1;

  IF v_mother_id IS NULL THEN
    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'baixa automática de cobrança online'
    );
    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      v_mother_id := (v_heal->>'receivable_id')::uuid;
    END IF;
  END IF;

  -- (d) baixa no recebível vinculado — predicado de posse reaplicado
  --     (company_id da row TEM que bater com a company da cobrança).
  --     Só baixa o que ainda está pendente (is_paid distinto de true),
  --     tornando a operação idempotente também do lado do recebível.
  --     NÃO grava `amount_received`: esta é uma quitação TOTAL, de uma
  --     vez só, sem filha de "Recebimento parcial" — mesmo contrato do
  --     fluxo legado de baixa manual (useFinancial.ts). Gravar
  --     `amount_received = amount` aqui, sem criar a filha que o
  --     contrato da coluna exige, foi a causa do incidente Aldebaran
  --     (cobrança paga sumindo do DRE em Regime de Caixa).
  --     2026-10-21 — A DECISÃO PASSOU A SER PELO VALOR.
  --     ANTES: UPDATE cego em TODA linha 'entrada' da cobrança, sem comparar
  --     nada. Um boleto de R$ 99,00 quitava uma conta de R$ 352,60 (chamado
  --     KGIE Tecnologia, 21/10/2026).
  --     AGORA: compara o valor da cobrança com o SALDO EM ABERTO da mãe.
  --       · cobrança >= saldo -> quitação TOTAL (idêntico ao histórico,
  --         inclusive em NÃO gravar amount_received);
  --       · cobrança <  saldo -> INSERT da filha 'Recebimento parcial' e
  --         NADA na mãe. Quem fecha a mãe (amount_received / is_paid /
  --         paid_date) é o gatilho trg_recalc_amount_received, dono único
  --         desse fato. Gravar aqui TAMBÉM criaria dois caminhos escrevendo o
  --         mesmo dado — foi exatamente a causa do incidente Aldebaran.
  --     Tolerância de 1 centavo: numeric de 2 casas do gateway e soma de
  --     parciais não fecham ao bit.
  IF v_mother_id IS NULL THEN
    -- Sem mãe (cura não aplicada / recusada): mantém o caminho histórico, que
    -- neste cenário não encontra linha nenhuma. Preserva o retorno antigo.
    UPDATE public.financial_transactions ft
    SET is_paid         = true,
        paid_date       = p_paid_at::date,
        updated_at      = now()
    WHERE ft.tenant_charge_id = v_charge.id
      AND ft.company_id       = v_charge.company_id
      AND ft.transaction_type = 'entrada'
      AND ft.is_paid IS DISTINCT FROM true;

    GET DIAGNOSTICS v_receivables = ROW_COUNT;
    v_settlement := 'no_mother';
  ELSE
    -- FOR UPDATE na mãe: serializa com uma baixa manual simultânea na mesma
    -- conta (dois recebimentos parciais concorrentes não podem ler o mesmo
    -- saldo e ambos acharem que são o último).
    SELECT ft.amount,
           COALESCE(ft.amount_received, 0),
           ft.description,
           ft.customer_id,
           ft.cost_center_id,
           ft.due_date
      INTO v_amount, v_received, v_mother_desc, v_mother_cust, v_mother_cc, v_mother_due
      FROM public.financial_transactions ft
     WHERE ft.id         = v_mother_id
       AND ft.company_id = v_charge.company_id
     FOR UPDATE;

    v_balance := round(COALESCE(v_amount, 0) - COALESCE(v_received, 0), 2);

    -- A DECISÃO:
    --  (i)  mãe JÁ FATIADA (amount_received > 0): o livro-razão dela é a SOMA
    --       DAS FILHAS. Todo recebimento novo TEM que ser uma filha. Marcar
    --       is_paid direto deixaria is_paid = true convivendo com
    --       amount_received < amount — e o gatilho REABRIRIA a conta sozinho na
    --       próxima recalculação (dinheiro recebido virando conta em aberto do
    --       nada). Vale inclusive quando a cobrança cobre o saldo INTEIRO: é
    --       exatamente o caso "cobrar o saldo" (R$ 99,00 numa conta de
    --       R$ 352,60 com R$ 253,60 já recebidos). Nasce a filha; o gatilho
    --       fecha a mãe.
    --  (ii) mãe LIMPA e cobrança menor que a conta: também é parcial.
    --  (iii) resto (mãe limpa e cobrança cobrindo a conta): quitação TOTAL,
    --       idêntica ao histórico e SEM gravar amount_received (Aldebaran).
    IF v_received > 0.005
       OR round(COALESCE(v_charge.value, 0), 2)
            < round(COALESCE(v_amount, 0), 2) - 0.005 THEN
      -- ---------------- RECEBIMENTO PARCIAL ----------------
      v_settlement := 'partial';

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, amount, description, category,
        customer_id, cost_center_id, transaction_date, due_date, paid_date,
        is_paid, parent_transaction_id, tenant_charge_id, asaas_payment_id,
        account_id, created_by
      ) VALUES (
        v_charge.company_id,
        'entrada',
        v_charge.value,
        'Recebimento parcial — ' || COALESCE(NULLIF(btrim(v_mother_desc), ''),
                                             'cobrança #' || v_charge.id::text),
        -- EXATAMENTE 'Recebimento parcial': é o literal que
        -- trg_recalc_amount_received_fn exige pra reconhecer a filha. Qualquer
        -- outra categoria e a mãe nunca fecha — dinheiro entra e não aparece.
        'Recebimento parcial',
        v_mother_cust,
        v_mother_cc,
        p_paid_at::date,
        v_mother_due,
        p_paid_at::date,
        true,
        v_mother_id,
        v_charge.id,
        -- IDEMPOTÊNCIA DA FILHA: uq_financial_transactions_asaas_payment_id
        -- (UNIQUE parcial). Reentrega do mesmo evento cai no DO NOTHING, sem
        -- depender do dedupe por event_id nem da guarda de payment_date.
        p_asaas_payment_id,
        NULL,   -- account_id: NULL (mesmo padrão do recebível e da tarifa)
        NULL    -- created_by: ação automática de sistema
      )
      ON CONFLICT (asaas_payment_id) WHERE (asaas_payment_id IS NOT NULL) DO NOTHING
      RETURNING id INTO v_child_id;

      IF v_child_id IS NULL THEN
        -- Reentrega: a filha desta cobrança já existe. No-op idempotente.
        SELECT ft.id INTO v_child_id
          FROM public.financial_transactions ft
         WHERE ft.asaas_payment_id = p_asaas_payment_id
           AND ft.company_id       = v_charge.company_id
         LIMIT 1;
        v_settlement := 'partial_already_applied';
      END IF;

      -- A MÃE NÃO É TOCADA AQUI. De propósito. Ver cabeçalho do bloco.
      v_receivables := 0;
    ELSE
      -- ---------------- QUITAÇÃO TOTAL (caminho histórico) ----------------
      -- Escopo estreitado para a MÃE (antes era "toda linha 'entrada' da
      -- cobrança"): as filhas nascem is_paid = true e já eram excluídas pelo
      -- predicado is_paid IS DISTINCT FROM true, então o conjunto afetado é o
      -- mesmo. A diferença é só não deixar margem pra ambiguidade.
      v_settlement := 'full';

      UPDATE public.financial_transactions ft
      SET is_paid         = true,
          paid_date       = p_paid_at::date,
          updated_at      = now()
      WHERE ft.id         = v_mother_id
        AND ft.company_id = v_charge.company_id
        AND ft.is_paid IS DISTINCT FROM true;

      GET DIAGNOSTICS v_receivables = ROW_COUNT;
    END IF;
  END IF;

  v_recv_status := CASE
    WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
    WHEN v_mother_id IS NOT NULL                        THEN 'ok'
    ELSE COALESCE(v_heal->>'status', 'missing')
  END;

  IF v_mother_id IS NULL THEN
    RAISE WARNING '[apply_tenant_charge_payment] baixa aplicada na cobrança % (empresa %) SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
      v_charge.id, v_charge.company_id, v_recv_status;
  END IF;

  -- [TARIFA] (e) ler config auto_post_fees + categoria da despesa da tarifa
  SELECT COALESCE(tpa.auto_post_fees, true),
         COALESCE(NULLIF(trim(tpa.default_fee_category), ''), 'Tarifas e Taxas')
    INTO v_auto_fees, v_fee_category
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  -- Se não achou conta de pagamento, mantém os defaults das variáveis
  -- (v_auto_fees=false, v_fee_category='Tarifas e Taxas').
  IF NOT FOUND THEN
    v_auto_fees := false;
    v_fee_category := 'Tarifas e Taxas';
  END IF;

  -- [TARIFA] (f) lançar tarifa como despesa se configurado e houver diferença
  IF v_auto_fees
     AND p_net IS NOT NULL
     AND p_net < v_charge.value
  THEN
    v_fee := v_charge.value - p_net;

    -- Idempotência: se já existe despesa vinculada a esta cobrança, pula
    SELECT EXISTS (
      SELECT 1
      FROM public.financial_transactions
      WHERE tenant_charge_id  = v_charge.id
        AND company_id        = v_charge.company_id
        AND transaction_type  = 'saida'
    ) INTO v_fee_exists;

    IF NOT v_fee_exists THEN
      INSERT INTO public.financial_transactions (
        company_id,
        transaction_type,
        amount,
        description,
        category,
        is_paid,
        paid_date,
        transaction_date,
        tenant_charge_id,
        account_id,
        customer_id,
        created_by
      ) VALUES (
        v_charge.company_id,
        'saida',
        v_fee,
        'Tarifa de recebimento (Asaas) — cobrança #' || v_charge.id::text,
        v_fee_category,
        true,
        p_paid_at::date,
        p_paid_at::date,
        v_charge.id,
        NULL,   -- account_id: NULL (mesmo padrão do recebível de entrada)
        NULL,   -- customer_id: tarifa é custo da plataforma, não do cliente
        NULL    -- created_by: NULL (ação automática de sistema)
      );
      v_fee_posted := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'receivables_settled', v_receivables,
    'fee_posted', v_fee_posted,
    'receivable_status', v_recv_status,
    -- Contrato novo (2026-10-21) pro webhook/observabilidade:
    --   'full'                    quitação total
    --   'partial'                 nasceu filha de recebimento parcial
    --   'partial_already_applied' reentrega; a filha já existia
    --   'no_mother'               cobrança paga sem recebível (alarme acima)
    'settlement', v_settlement,
    'child_id', v_child_id,
    'balance_before', v_balance,
    'heal', v_heal
  );
END;
$function$

;

REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;


-- ---------------------------------------------------------------------------
-- 7) ESTORNO / CHARGEBACK — RPC transacional nova.
--
--    O ramo PAYMENT_REFUNDED / PAYMENT_REFUND_IN_PROGRESS / PAYMENT_CHARGEBACK*
--    do webhook fazia, em DOIS writes soltos:
--      (a) UPDATE tenant_charges SET status=..., payment_date=NULL;
--      (b) UPDATE financial_transactions SET is_paid=false, paid_date=NULL,
--          amount_received=0 WHERE tenant_charge_id=<cobrança> AND
--          transaction_type='entrada';
--
--    (b) está errado de duas maneiras, e as duas custam dinheiro de verdade:
--
--      1. NÃO REMOVE A FILHA de recebimento parcial. `amount_received` é
--         DERIVADO (gatilho recalc_amount_received soma as filhas), então
--         zerá-lo é cosmético: a próxima recalculação — qualquer insert,
--         update ou delete de filha daquela mãe — recoloca o dinheiro
--         estornado em `amount_received` e pode fechar a conta de novo. O
--         dinheiro voltou pro cliente e continua contado como recebido.
--      2. ZERA RECEBIMENTO PARCIAL LEGÍTIMO que não veio desta cobrança: a
--         mesma conta pode ter um parcial lançado à mão antes. O UPDATE cego
--         apagava esse fato.
--
--    Esta RPC faz o certo: APAGA as filhas DESTA cobrança e deixa o gatilho,
--    dono único de `amount_received`, reabrir a mãe pela soma do que SOBROU.
--    Um fato, um dono.
--
--    NÃO toca na despesa de tarifa ('saida'): a tarifa do gateway foi cobrada
--    de verdade e não volta com o estorno. Removê-la inventaria receita.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_tenant_charge_payment(
  p_company_id       uuid,
  p_asaas_payment_id text,
  p_status           text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge       public.tenant_charges%ROWTYPE;
  v_status       text;
  v_mother_id    uuid;
  v_parents      uuid[] := ARRAY[]::uuid[];
  v_parent       uuid;
  v_deleted      int    := 0;
  v_blocked      text   := NULL;
  v_marker       text;
  v_note         text;
  v_was_paid     boolean := false;
  v_mother_paid  boolean;
  v_mother_recv  numeric;
BEGIN
  IF p_company_id IS NULL OR COALESCE(btrim(p_asaas_payment_id), '') = '' THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'missing_args', 'children_deleted', 0
    );
  END IF;

  -- Allowlist de status. O valor vem da edge (mapeado do NOME do evento),
  -- nunca do corpo cru da Asaas. Fora da lista é bug de chamador.
  v_status := upper(btrim(COALESCE(p_status, '')));
  IF v_status NOT IN ('REFUNDED', 'REFUND_IN_PROGRESS', 'CHARGEBACK') THEN
    RAISE EXCEPTION '[revert_tenant_charge_payment] status inválido: %', p_status
      USING ERRCODE = '22023';
  END IF;

  -- Posse por company_id (RLS não cobre SECURITY DEFINER) + lock que serializa
  -- reentregas do mesmo estorno.
  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE asaas_payment_id = btrim(p_asaas_payment_id)
     AND company_id       = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'charge_not_found', 'children_deleted', 0
    );
  END IF;

  -- Snapshot ANTES do UPDATE: é o que diz se esta cobrança tinha baixa.
  v_was_paid := v_charge.payment_date IS NOT NULL;

  UPDATE public.tenant_charges
     SET status       = v_status,
         payment_date = NULL,
         updated_at   = now()
   WHERE id         = v_charge.id
     AND company_id = p_company_id;

  -- (1) A MÃE desta cobrança. Pode ser o espelho que a cobrança criou
  --     (avulso/quote/service_order) OU a conta a receber PREEXISTENTE que a
  --     cobrança apenas ligou (contract_installment / receivable). Nos dois
  --     casos o elo é o mesmo e a reabertura é a mesma.
  SELECT ft.id INTO v_mother_id
    FROM public.financial_transactions ft
   WHERE ft.tenant_charge_id      = v_charge.id
     AND ft.company_id            = p_company_id
     AND ft.transaction_type      = 'entrada'
     AND ft.parent_transaction_id IS NULL
   LIMIT 1;

  -- (2) APAGA as filhas de recebimento parcial DESTA cobrança. Elas só nascem
  --     de um pagamento desta cobrança (apply_tenant_charge_payment no ramo
  --     parcial, apply_tenant_charge_installment_payment por parcela), então
  --     estornar a cobrança é sempre motivo de apagá-las.
  --
  --     Sub-bloco com EXCEPTION (savepoint): se uma filha estiver CONCILIADA
  --     com o extrato bancário, o gatilho _guard_reconciled_transaction_delete
  --     recusa o DELETE. Deixar a exceção subir marcaria o evento 'error' e a
  --     Asaas reentregaria para sempre sem nunca conseguir. Aqui o status da
  --     cobrança (já gravado acima) sobrevive, a RPC devolve o bloqueio e quem
  --     chama registra o aviso para uma pessoa resolver.
  BEGIN
    WITH del AS (
      DELETE FROM public.financial_transactions ft
       WHERE ft.tenant_charge_id       = v_charge.id
         AND ft.company_id             = p_company_id
         AND ft.transaction_type       = 'entrada'
         AND ft.parent_transaction_id IS NOT NULL
         AND ft.category               = 'Recebimento parcial'
      RETURNING ft.id, ft.parent_transaction_id
    )
    SELECT count(*)::int,
           COALESCE(
             array_agg(DISTINCT d.parent_transaction_id)
               FILTER (WHERE d.parent_transaction_id IS NOT NULL),
             ARRAY[]::uuid[]
           )
      INTO v_deleted, v_parents
      FROM del d;
  EXCEPTION
    WHEN OTHERS THEN
      v_blocked := SQLERRM;
      v_deleted := 0;
      v_parents := ARRAY[]::uuid[];
  END;

  -- (3) Reabertura da mãe pela ÚNICA fonte de verdade de amount_received: a
  --     soma das filhas vivas. recalc_amount_received devolve amount_received,
  --     is_paid e paid_date coerentes com o que SOBROU — sem filha nenhuma dá
  --     exatamente o resultado do caminho antigo (0 / false / NULL), e com
  --     filha legítima remanescente PRESERVA o que o caminho antigo apagava.
  --
  --     O gatilho já recalculou no DELETE acima; repetir aqui é de propósito
  --     (cinto e suspensória) e cobre a mãe que foi quitada por BAIXA TOTAL,
  --     caso em que nunca houve filha e o gatilho nunca dispararia.
  IF v_mother_id IS NOT NULL
     AND v_was_paid
     AND NOT (v_mother_id = ANY (v_parents)) THEN
    v_parents := v_parents || v_mother_id;
  END IF;

  FOREACH v_parent IN ARRAY v_parents LOOP
    PERFORM public.recalc_amount_received(v_parent);
  END LOOP;

  -- (4) Rastro na mãe. Dinheiro que volta não pode "desaparecer em silêncio"
  --     da conta do cliente: o gestor abre o lançamento e lê o que aconteceu.
  --     Idempotente por referência da cobrança (reentrega não duplica a frase).
  IF v_mother_id IS NOT NULL AND (v_was_paid OR v_deleted > 0) THEN
    v_marker := format(
      'Estorno da cobrança online (referência %s)',
      COALESCE(v_charge.asaas_payment_id, 'sem identificador')
    );
    v_note := format(
      '%s em %s, valor R$ %s. O recebimento foi desfeito e esta conta voltou a ficar em aberto.',
      v_marker,
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
    );

    UPDATE public.financial_transactions ft
       SET notes      = btrim(COALESCE(ft.notes || E'\n', '') || v_note),
           updated_at = now()
     WHERE ft.id         = v_mother_id
       AND ft.company_id = p_company_id
       AND position(v_marker in COALESCE(ft.notes, '')) = 0;
  END IF;

  IF v_mother_id IS NOT NULL THEN
    SELECT ft.is_paid, COALESCE(ft.amount_received, 0)
      INTO v_mother_paid, v_mother_recv
      FROM public.financial_transactions ft
     WHERE ft.id = v_mother_id;
  END IF;

  RETURN jsonb_build_object(
    'found',                 true,
    'charge_id',             v_charge.id,
    'company_id',            p_company_id,
    'status',                v_status,
    'source_type',           v_charge.source_type,
    'was_paid',              v_was_paid,
    'mother_id',             v_mother_id,
    'children_deleted',      v_deleted,
    'mother_is_paid',        v_mother_paid,
    'mother_amount_received', v_mother_recv,
    -- Não-nulo = o DELETE da filha foi recusado (conciliação bancária).
    -- Quem chama DEVE registrar isso: o estorno ficou pela metade.
    'blocked_reason',        v_blocked
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.revert_tenant_charge_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_tenant_charge_payment(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_tenant_charge_payment(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.revert_tenant_charge_payment(uuid, text, text) IS
  'Estorno/chargeback de cobrança do tenant: marca o status, apaga as filhas de "Recebimento parcial" DESTA cobrança e deixa recalc_amount_received reabrir a mãe pela soma do que sobrou. Não toca na despesa de tarifa. Idempotente.';


-- ---------------------------------------------------------------------------
-- 8) Editar a cobrança NÃO pode reescrever a conta a receber que ela ligou.
--
--    update_tenant_charge_local sincroniza o espelho no Financeiro quando a
--    linha não tem dinheiro em cima. Com a origem 'receivable' isso deixou de
--    ser seguro: a linha ligada NÃO é espelho da cobrança, ela EXISTIA ANTES.
--    Editar o valor do boleto do saldo reescreveria o valor da conta do
--    cliente, e o valor original se perderia sem rastro nenhum.
--
--    Mesma trava do is_contract, mesma razão. Recriada da definição viva; a
--    única mudança é a coluna is_receivable na CTE `mirror`, o predicado novo
--    no UPDATE e a contagem `mirror_locked_receivable` no retorno (a edge
--    tenant-asaas-update-charge usa pra avisar o usuário).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_tenant_charge_local(p_company_id uuid, p_charge_id uuid, p_value numeric, p_due_date date, p_description text, p_status text, p_invoice_url text, p_boleto_url text, p_pix_copy_paste text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge         public.tenant_charges%ROWTYPE;
  v_mirror_total   integer := 0;
  v_mirror_updated integer := 0;
  v_mirror_locked  integer := 0;
  v_mirror_nfse    integer := 0;
  v_mirror_locked_contract integer := 0;
  v_mirror_locked_receivable integer := 0;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL THEN
    RAISE EXCEPTION '[update_tenant_charge_local] company_id e charge_id são obrigatórios';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION '[update_tenant_charge_local] valor precisa ser positivo (recebido: %)', p_value;
  END IF;

  -- Posse + trava da linha até o fim da transação.
  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Guarda de estado (defesa em profundidade; a edge já checou o gateway).
  IF upper(COALESCE(v_charge.status, '')) = ANY (
       ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','REFUNDED','CHARGEBACK']
     ) THEN
    RAISE EXCEPTION
      '[update_tenant_charge_local] cobrança % consta como paga/estornada no nosso banco (status %) — alteração abortada',
      p_charge_id, v_charge.status
      USING ERRCODE = '23001';
  END IF;

  UPDATE public.tenant_charges
     SET value          = p_value,
         due_date       = COALESCE(p_due_date, due_date),
         description    = COALESCE(NULLIF(btrim(p_description), ''), description),
         status         = COALESCE(NULLIF(btrim(upper(p_status)), ''), status),
         invoice_url    = p_invoice_url,
         boleto_url     = p_boleto_url,
         pix_copy_paste = p_pix_copy_paste,
         updated_at     = now()
   WHERE id = p_charge_id
     AND company_id = p_company_id
  RETURNING * INTO v_charge;

  -- ---- Espelho no Financeiro ("a receber" criado por
  --      create_tenant_charge_receivable). Só mexe em linha SEM dinheiro em cima
  --      E que não seja parcela de contrato: a parcela é do contrato do cliente,
  --      não é reflexo da cobrança, e não pode mudar de valor nem de vencimento
  --      porque alguém editou a cobrança online.
  WITH mirror AS (
    SELECT ft.id,
           (ft.is_paid IS TRUE OR COALESCE(ft.amount_received, 0) > 0) AS has_money,
           (ft.contract_id IS NOT NULL) AS is_contract,
           -- 2026-10-21. A conta a receber PREEXISTENTE que esta cobrança
           -- apenas ligou (source_type = 'receivable'). Mesma razão do
           -- is_contract: quem manda no valor e no vencimento dela é o
           -- Financeiro do cliente, NÃO a cobrança online. Sem esta trava,
           -- editar o boleto do saldo REESCREVIA o valor de uma conta a
           -- receber que existia antes da cobrança — e o valor original se
           -- perdia sem rastro. A trava só pega a conta ainda limpa
           -- (has_money = false); com recebimento parcial em cima o
           -- has_money já segurava.
           EXISTS (
             SELECT 1 FROM public.tenant_charges tc
              WHERE tc.id          = p_charge_id
                AND tc.company_id  = p_company_id
                AND tc.source_type = 'receivable'
                AND tc.source_id   = ft.id
           ) AS is_receivable,
           EXISTS (
             SELECT 1 FROM public.nfse_emissions ne
              WHERE ne.financial_transaction_id = ft.id
           ) AS has_nfse
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
       AND ft.transaction_type = 'entrada'
  ), upd AS (
    UPDATE public.financial_transactions ft
       SET amount      = p_value,
           due_date    = COALESCE(p_due_date, ft.due_date),
           description = COALESCE(NULLIF(btrim(p_description), ''), ft.description)
      FROM mirror m
     WHERE ft.id = m.id
       AND m.has_money    = false
       AND m.is_contract  = false
       AND m.is_receivable = false
    RETURNING ft.id
  )
  SELECT (SELECT count(*) FROM mirror),
         (SELECT count(*) FROM upd),
         (SELECT count(*) FROM mirror WHERE has_money),
         (SELECT count(*) FROM mirror WHERE has_nfse),
         (SELECT count(*) FROM mirror WHERE is_contract AND NOT has_money),
         (SELECT count(*) FROM mirror
           WHERE is_receivable AND NOT has_money AND NOT is_contract)
    INTO v_mirror_total, v_mirror_updated, v_mirror_locked, v_mirror_nfse,
         v_mirror_locked_contract, v_mirror_locked_receivable;

  RETURN jsonb_build_object(
    'found', true,
    'charge', jsonb_build_object(
      'id',          v_charge.id,
      'value',       v_charge.value,
      'due_date',    v_charge.due_date,
      'description', v_charge.description,
      'status',      v_charge.status,
      'invoice_url', v_charge.invoice_url
    ),
    'mirror_total',   v_mirror_total,
    'mirror_updated', v_mirror_updated,
    'mirror_locked',  v_mirror_locked,
    'mirror_nfse',    v_mirror_nfse,
    'mirror_locked_contract', v_mirror_locked_contract,
    'mirror_locked_receivable', v_mirror_locked_receivable
  );
END;
$function$

;

REVOKE ALL ON FUNCTION public.update_tenant_charge_local(uuid, uuid, numeric, date, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_charge_local(uuid, uuid, numeric, date, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_charge_local(uuid, uuid, numeric, date, text, text, text, text, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 9) VALIDAÇÃO DA CONTA A RECEBER COBRÁVEL (chamada pela edge ANTES da Asaas).
--
--    Por que em SQL e não só na edge: a régua ("o valor TEM que ser o saldo",
--    "não pode haver cobrança viva", "a linha tem que ser a mãe em aberto da
--    minha empresa") é o que sustenta a baixa parcial lá em
--    apply_tenant_charge_payment. Régua que mora só no TypeScript é régua que
--    ninguém consegue PROVAR contra o banco de produção e que o próximo
--    chamador (um batch, outra edge, um script) não enxerga. Aqui ela é uma
--    função, testável e única.
--
--    Devolve SEMPRE jsonb (nunca levanta exceção por dado do cliente): a edge
--    traduz ok=false em erro de negócio HTTP 200 com error_code, que é o
--    padrão das edges de cobrança.
--
--    A posse é reaplicada à mão (company_id do PROFILE, passado pela edge):
--    SECURITY DEFINER não passa por RLS. Linha de outra empresa cai no MESMO
--    'receivable_not_found' de linha inexistente — nunca vaza a existência.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_receivable_charge_target(
  p_company_id    uuid,
  p_receivable_id uuid,
  p_value         numeric,
  p_customer_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row        public.financial_transactions%ROWTYPE;
  v_balance    numeric;
  v_value      numeric;
  v_live       public.tenant_charges%ROWTYPE;
  v_money      text;
BEGIN
  IF p_company_id IS NULL OR p_receivable_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_input',
      'message', 'Informe a conta a receber que será cobrada.'
    );
  END IF;

  v_value := round(COALESCE(p_value, 0), 2);
  IF v_value <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_input',
      'message', 'Informe um valor válido para a cobrança.'
    );
  END IF;

  SELECT * INTO v_row
    FROM public.financial_transactions ft
   WHERE ft.id         = p_receivable_id
     AND ft.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'receivable_not_found',
      'message', 'A conta a receber não foi encontrada na sua empresa.'
    );
  END IF;

  -- Só a linha-MÃE de entrada vira cobrança. Linha de saída não é recebível;
  -- filha de recebimento parcial é um PEDAÇO de recebimento, e ligá-la
  -- quebraria ux_financial_transactions_one_mother_per_charge.
  IF v_row.transaction_type::text <> 'entrada' OR v_row.parent_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'receivable_not_chargeable',
      'message', 'Só é possível cobrar uma conta a receber. Selecione o lançamento principal, não um recebimento parcial.'
    );
  END IF;

  IF v_row.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'receivable_cancelled',
      'message', 'Esta conta a receber está cancelada. Reative-a antes de gerar a cobrança.'
    );
  END IF;

  IF v_row.is_paid IS TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'receivable_already_paid',
      'message', 'Esta conta a receber já consta como recebida. Não há saldo para cobrar.'
    );
  END IF;

  v_balance := round(COALESCE(v_row.amount, 0) - COALESCE(v_row.amount_received, 0), 2);

  IF v_balance <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'receivable_no_balance',
      'message', 'Esta conta a receber não tem saldo em aberto para cobrar.',
      'balance', v_balance
    );
  END IF;

  -- NENHUMA COBRANÇA VIVA ligada à linha. Duas portas, porque o elo pode estar
  -- em qualquer uma das duas pontas:
  --   (a) tenant_charges de origem 'receivable' apontando pra esta linha;
  --   (b) o tenant_charge_id DA LINHA apontando pra uma cobrança (que pode ter
  --       nascido avulsa/orçamento/OS e ter esta linha como espelho).
  -- 'DELETED' entra na lista de mortos porque a cobrança NÃO EXISTE MAIS no
  -- gateway (foi apagada no painel da Asaas e o webhook só marcou o status
  -- aqui) — tratá-la como viva prenderia a conta pra sempre.
  SELECT tc.* INTO v_live
    FROM public.tenant_charges tc
   WHERE tc.company_id = p_company_id
     AND (
          (tc.source_type = 'receivable' AND tc.source_id = v_row.id)
       OR (v_row.tenant_charge_id IS NOT NULL AND tc.id = v_row.tenant_charge_id)
     )
     AND upper(btrim(COALESCE(tc.status, ''))) NOT IN (
           'CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'DELETED'
         )
   ORDER BY (v_row.tenant_charge_id IS NOT NULL AND tc.id = v_row.tenant_charge_id) DESC,
            tc.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_money := replace(to_char(COALESCE(v_live.value, 0), 'FM999999990.00'), '.', ',');
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'live_charge_exists',
      'message', format(
        'Esta conta já tem uma cobrança em aberto de R$ %s%s. Cancele a cobrança atual antes de emitir uma nova.',
        v_money,
        CASE WHEN v_live.due_date IS NOT NULL
             THEN ' com vencimento em ' || to_char(v_live.due_date, 'DD/MM/YYYY')
             ELSE '' END
      ),
      'balance', v_balance,
      'live_charge', jsonb_build_object(
        'id',                v_live.id,
        'asaas_payment_id',  v_live.asaas_payment_id,
        'value',             v_live.value,
        'due_date',          v_live.due_date,
        'status',            v_live.status,
        'billing_type',      v_live.billing_type,
        'public_short_code', v_live.public_short_code,
        'invoice_url',       v_live.invoice_url
      )
    );
  END IF;

  -- Cliente da cobrança tem que ser o da conta: cobrar a pessoa errada e ainda
  -- assim dar baixa na conta é erro que ninguém percebe depois.
  IF p_customer_id IS NOT NULL
     AND v_row.customer_id IS NOT NULL
     AND v_row.customer_id <> p_customer_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'customer_mismatch',
      'message', 'Esta conta a receber é de outro cliente. Selecione o cliente da conta.'
    );
  END IF;

  -- O INVARIANTE. A cobrança tem que valer EXATAMENTE o saldo em aberto.
  -- Com valor menor, a baixa lançaria um parcial e a conta ficaria com um
  -- resto que ninguém pediu; com valor maior, o cliente pagaria mais do que
  -- deve e amount_received passaria do amount. É este invariante que deixa a
  -- baixa parcial ser confiável. Tolerância de 1 centavo (arredondamento).
  IF abs(v_balance - v_value) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'value_mismatch',
      'message', format(
        'O valor da cobrança precisa ser igual ao saldo em aberto desta conta (R$ %s).',
        replace(to_char(v_balance, 'FM999999990.00'), '.', ',')
      ),
      'balance', v_balance
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'receivable_id',   v_row.id,
    'amount',          round(COALESCE(v_row.amount, 0), 2),
    'amount_received', round(COALESCE(v_row.amount_received, 0), 2),
    'balance',         v_balance,
    'customer_id',     v_row.customer_id,
    'due_date',        v_row.due_date,
    'description',     v_row.description,
    'contract_id',     v_row.contract_id,
    -- Esperado no compare-and-swap do vínculo. Normalmente NULL ou o id de uma
    -- cobrança MORTA (viva já foi recusada acima).
    'current_charge_id', v_row.tenant_charge_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_receivable_charge_target(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_receivable_charge_target(uuid, uuid, numeric, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_receivable_charge_target(uuid, uuid, numeric, uuid) TO service_role;

COMMENT ON FUNCTION public.validate_receivable_charge_target(uuid, uuid, numeric, uuid) IS
  'Valida se uma conta a receber pode receber cobrança online do SALDO (posse, estado, cliente, valor == saldo, nenhuma cobrança viva). Nunca levanta exceção por dado do cliente: devolve {ok:false, error_code, message} em PT-BR.';


-- ---------------------------------------------------------------------------
-- 10) VÍNCULO cobrança -> conta a receber, com compare-and-swap.
--
--     Só sobrescreve o tenant_charge_id que a validação LEU (NULL, ou o de uma
--     cobrança já morta). Se outra requisição ligou a mesma conta nesse
--     meio-tempo, o UPDATE não pega linha e quem chama avisa o usuário — em
--     vez de uma cobrança roubar o elo da outra em silêncio e as duas
--     disputarem a mesma conta na hora da baixa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_receivable_to_tenant_charge(
  p_company_id         uuid,
  p_receivable_id      uuid,
  p_charge_id          uuid,
  p_expected_charge_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linked int := 0;
BEGIN
  IF p_company_id IS NULL OR p_receivable_id IS NULL OR p_charge_id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'missing_args');
  END IF;

  -- Posse da COBRANÇA também (a conta já é checada no UPDATE): sem isto, um
  -- charge_id de outra empresa viraria FK cross-tenant no Financeiro daqui.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_charges tc
     WHERE tc.id = p_charge_id AND tc.company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'charge_not_found');
  END IF;

  UPDATE public.financial_transactions ft
     SET tenant_charge_id = p_charge_id,
         updated_at       = now()
   WHERE ft.id                   = p_receivable_id
     AND ft.company_id           = p_company_id
     AND ft.transaction_type     = 'entrada'
     AND ft.parent_transaction_id IS NULL
     AND ft.cancelled_at IS NULL
     AND ft.is_paid IS DISTINCT FROM true
     -- IS NOT DISTINCT FROM: trata NULL como valor, que é o caso comum
     -- (conta nunca cobrada).
     AND ft.tenant_charge_id IS NOT DISTINCT FROM p_expected_charge_id;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RETURN jsonb_build_object(
    'linked', v_linked = 1,
    'reason', CASE WHEN v_linked = 1 THEN 'linked' ELSE 'stale_or_ineligible' END,
    'receivable_id', p_receivable_id,
    'charge_id', p_charge_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.link_receivable_to_tenant_charge(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_receivable_to_tenant_charge(uuid, uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_receivable_to_tenant_charge(uuid, uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.link_receivable_to_tenant_charge(uuid, uuid, uuid, uuid) IS
  'Liga uma cobrança online à conta a receber que já existia (compare-and-swap em financial_transactions.tenant_charge_id). Nunca cria lançamento.';
