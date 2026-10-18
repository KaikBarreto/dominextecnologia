-- Conciliação bancária: `reconcile_create_transaction` passa a aceitar
-- categoria do tipo `'ambos'`.
--
-- O BUG (produção, achado em 2026-10-18): a tela de conciliação monta o select
-- de categoria com `filterCategoriesByTransactionType`
-- (src/lib/financial-category-filter.ts), o filtro canônico que TODAS as telas
-- do Financeiro usam -- e ele aceita `type IN (tipo_do_lancamento, 'ambos')`.
-- A RPC aplicada em `20261017200000_conciliacao_bancaria_ofx` comparava
-- `v_category.type IS DISTINCT FROM v_type`, ou seja, recusava `'ambos'`.
-- Com 63 categorias `'ambos'` ATIVAS em produção, o resultado era: a tela
-- oferece, o cliente clica, a RPC recusa com "a categoria escolhida é de ...".
--
-- Quem estava errado era a RPC: `'ambos'` é conceito legítimo do Dominex e todo
-- outro caminho de escrita (lançamento manual, fatura, importação) o aceita.
--
-- Esta migration recria a função a partir da DEFINIÇÃO VIVA extraída de
-- `pg_get_functiondef` (não de um corpo reescrito à mão), mudando SÓ o teste de
-- tipo, a mensagem de erro e o COMMENT. `CREATE OR REPLACE` com assinatura
-- idêntica preserva os GRANTs; mesmo assim o REVOKE/GRANT é reafirmado abaixo e
-- provado por um bloco `DO`, porque `DROP FUNCTION` levaria os GRANTs embora e
-- um dia alguém vai trocar o REPLACE por DROP+CREATE.
--
-- Auditoria do resto de `20261017200000`: `reconcile_create_transaction` é a
-- ÚNICA RPC daquela migration que lê `public.financial_categories` (confirmado
-- por grep -- só as linhas 2117/2140/2141 a referenciam). As demais
-- (`reconcile_create_transfer`, `reconcile_pay_card_bill`,
-- `reconcile_create_employee_movement`, `reconcile_match_existing`,
-- `reconcile_settle_transaction`) não classificam por categoria, então não
-- havia uma segunda ocorrência do mesmo erro para corrigir.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.reconcile_create_transaction(p_entry_id uuid, p_category_id uuid, p_description text, p_cost_center_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_category  public.financial_categories%ROWTYPE;
  v_type      text;
  v_date      date;
  v_desc      text;
  v_tx_id     uuid;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera lançamento. Use "Ignorar".' USING ERRCODE = '22023';
  END IF;

  v_type := CASE WHEN v_entry.effective_amount > 0 THEN 'entrada' ELSE 'saida' END;
  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- RPC é SECURITY DEFINER: a RLS NÃO protege este INSERT. Categoria é validada
  -- como da empresa, ativa e do TIPO certo — categoria de entrada em linha de
  -- débito classificaria receita como despesa na DRE.
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Escolha uma categoria para o lançamento.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_category
    FROM public.financial_categories c
   WHERE c.id = p_category_id
     AND c.company_id = v_entry.company_id
     AND c.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria inválida: não pertence a esta empresa ou está inativa.' USING ERRCODE = '42501';
  END IF;

  -- `'ambos'` é tipo legítimo de categoria no Dominex (63 ativas em produção) e
  -- TODO o resto do sistema o aceita nos dois sentidos -- inclusive o filtro
  -- canônico `filterCategoriesByTransactionType`
  -- (src/lib/financial-category-filter.ts), que é exatamente quem monta este
  -- select na tela de conciliação (EntryActionPanel). A comparação estrita
  -- anterior fazia a UI OFERECER a categoria e a RPC NEGAR no clique.
  -- Recusamos só o tipo OPOSTO: é ele que classificaria receita como despesa
  -- (ou vice-versa) na DRE. O teste de NULL é explícito porque
  -- `NULL NOT IN (...)` é NULL, e `IF NULL` cairia no caminho de aceitar.
  IF v_category.type IS NULL OR v_category.type NOT IN (v_type, 'ambos') THEN
    RAISE EXCEPTION 'A linha do extrato é uma % e a categoria escolhida é de %. Escolha uma categoria de % ou uma categoria do tipo "ambos".',
      CASE WHEN v_type = 'entrada' THEN 'entrada (crédito)' ELSE 'saída (débito)' END,
      COALESCE(v_category.type, 'tipo indefinido'),
      CASE WHEN v_type = 'entrada' THEN 'entrada' ELSE 'saída' END
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers cc
     WHERE cc.id = p_cost_center_id
       AND cc.company_id = v_entry.company_id
       AND cc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Centro de custo inválido: não pertence a esta empresa ou está inativo.' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id AND c.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s
     WHERE s.id = p_supplier_id AND s.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  -- Descrição: o que o usuário escreveu; na falta, o que o banco escreveu.
  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  v_desc := coalesce(v_desc,
                     nullif(btrim(coalesce(v_entry.name, '')), ''),
                     nullif(btrim(coalesce(v_entry.memo, '')), ''),
                     'Lançamento do extrato bancário');

  -- category guarda o NOME copiado (coluna text, não é FK) — mesma convenção do
  -- resto do schema; category_id não existe em financial_transactions.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description, notes,
    category, cost_center_id, customer_id, supplier_id,
    transaction_date, paid_date, is_paid, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, v_type::public.transaction_type,
    abs(v_entry.effective_amount), v_desc, p_notes,
    v_category.name, p_cost_center_id, p_customer_id, p_supplier_id,
    v_date, v_date, true, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'created', 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'match_type',               'created',
    'transaction_type',         v_type,
    'amount',                   abs(v_entry.effective_amount),
    'category',                 v_category.name,
    'paid_date',                v_date
  );
END;
$function$

;

COMMENT ON FUNCTION public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text) IS
  'Cria o lancamento avulso que falta no sistema, a partir da linha do extrato: transaction_type pelo SINAL do effective_amount, amount = abs(effective_amount), is_paid=true, paid_date e transaction_date = data civil da linha, account_id = a conta conciliada. A categoria chega por ID e e validada como da empresa, ativa e COMPATIVEL com o sinal -- compativel significa o mesmo tipo OU o tipo ''ambos'', igual ao filtro canonico filterCategoriesByTransactionType da UI; so o tipo oposto e recusado. O NOME atual da categoria e copiado para a coluna text `category`. E tambem o destino da linha que nao e receita nem despesa (aporte, resgate): o marcador "fora do resultado" nasce na categoria junto com o fluxo de caixa e reclassifica o historico de uma vez.';

-- RPC SECURITY DEFINER nunca pode ficar ao alcance de `anon`.
REVOKE ALL ON FUNCTION public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text) TO authenticated, service_role;

-- Prova, dentro da propria transacao: se o grant de `anon` escapar, a migration
-- nao commita. Vale mais que um checklist manual.
DO $proof$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'anon mantem EXECUTE em reconcile_create_transaction';
  END IF;
  IF NOT has_function_privilege(
       'authenticated',
       'public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em reconcile_create_transaction';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE em reconcile_create_transaction';
  END IF;
  RAISE NOTICE 'grants de reconcile_create_transaction conferidos: anon=false, authenticated=true, service_role=true';
END
$proof$;

-- Prova de comportamento: a funcao recem-criada tem que ACEITAR 'ambos' e
-- RECUSAR o tipo oposto. Checado no texto da definicao viva (nao ha como
-- executar a RPC sem auth.uid() dentro da migration).
DO $behaviour$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reconcile_create_transaction';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'reconcile_create_transaction nao existe depois do CREATE OR REPLACE';
  END IF;
  IF position('NOT IN (v_type, ''ambos'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'o fold de ''ambos'' nao entrou no corpo de reconcile_create_transaction';
  END IF;
  IF position('IS DISTINCT FROM v_type' IN v_src) > 0 THEN
    RAISE EXCEPTION 'a comparacao estrita de tipo de categoria continua no corpo';
  END IF;
  RAISE NOTICE 'reconcile_create_transaction aceita categoria ''ambos'' e recusa o tipo oposto';
END
$behaviour$;

COMMIT;
