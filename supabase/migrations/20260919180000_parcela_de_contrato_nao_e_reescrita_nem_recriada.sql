-- Por quê: a edge tenant-asaas-create-charge v30 passou a aceitar
-- source_type='contract_installment' e, nesse caso, em vez de inserir um recebível
-- novo ela LIGA a parcela que já existe (UPDATE financial_transactions SET
-- tenant_charge_id = ...). A partir daí existe espelho que É a parcela do contrato
-- do cliente, e duas funções ainda não sabiam disso. Esta migration fecha as duas.
--
-- Vão juntas numa migration só de propósito: são a mesma falha, aberta pela mesma
-- edge, no mesmo dia. Separar criaria uma janela em que uma guarda está no ar e a
-- outra não, com a edge v30 já em produção. Ou entram as duas, ou nenhuma.
--
-- (1) update_tenant_charge_local reescrevia a parcela do contrato.
--     O bloco de espelho atualizava amount/due_date/description em toda 'entrada'
--     daquela cobrança cujo has_money fosse falso. Parcela de contrato em aberto tem
--     has_money falso, então editar o valor da cobrança reescrevia o valor da parcela
--     do contrato. Mesma família do bug do delete (20260919160000), só que por cima.
--     Agora contract_id IS NOT NULL entra no conjunto travado e o retorno avisa.
--
--     Decisão de produto (do Tech Lead, não minha): a cobrança SEGUE editada no
--     gateway mesmo com a parcela travada. O retorno só informa que a parcela não
--     acompanhou; quem avisa o usuário é a tela.
--
--     Sobre o shape do retorno: mirror_locked JÁ existe e JÁ é lido pela edge
--     tenant-asaas-update-charge, que dela deriva a frase "o lançamento no Financeiro
--     já estava baixado e não foi mexido". Alargar mirror_locked para incluir contrato
--     tornaria essa frase FALSA para uma parcela em aberto, que não tem baixa nenhuma.
--     Então mirror_locked mantém exatamente o significado de hoje (travado por dinheiro
--     em cima) e o motivo novo vem em chave nova, aditiva:
--         mirror_locked         = travadas por baixa/recebimento parcial (inalterado)
--         mirror_locked_contract = travadas por serem parcela de contrato, SEM baixa
--     Os dois conjuntos são disjuntos, então o total travado é a soma dos dois.
--
-- (2) rebuild_tenant_charge_receivable não conhecia contract_installment.
--     Hoje ela só não duplica por acidente: a edge grava post_to_finance=false e a
--     auto-cura desiste no opt-out. É um cinto só. Se qualquer caminho futuro criar a
--     cobrança de parcela sem esse post_to_finance, a cura INSERE uma segunda receita
--     e o DRE do cliente dobra em silêncio. A suspensória: cobrança de parcela de
--     contrato nunca é curada, independente de post_to_finance. A guarda entra ANTES
--     de qualquer outra checagem, para que nenhum caminho de INSERT fique alcançável.
--
-- Assinaturas intactas nas duas. CREATE OR REPLACE, nunca DROP (DROP levaria os
-- GRANTs junto). ACL das duas hoje: {postgres=X/postgres, service_role=X/postgres}.
-- Corpos copiados da definição VIVA (pg_get_functiondef), não de arquivo em disco.

-- ---------------------------------------------------------------------------
-- (1) update_tenant_charge_local
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
       AND m.has_money   = false
       AND m.is_contract = false
    RETURNING ft.id
  )
  SELECT (SELECT count(*) FROM mirror),
         (SELECT count(*) FROM upd),
         (SELECT count(*) FROM mirror WHERE has_money),
         (SELECT count(*) FROM mirror WHERE has_nfse),
         (SELECT count(*) FROM mirror WHERE is_contract AND NOT has_money)
    INTO v_mirror_total, v_mirror_updated, v_mirror_locked, v_mirror_nfse,
         v_mirror_locked_contract;

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
    'mirror_locked_contract', v_mirror_locked_contract
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_tenant_charge_local(uuid, uuid, numeric, date, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- (2) rebuild_tenant_charge_receivable
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
      NULL   -- centro de custo original nao e reconstruivel; fica em branco
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

GRANT EXECUTE ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) TO service_role;
