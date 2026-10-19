-- ===========================================================================
-- Importação financeira por planilha: CLIENTE e FORNECEDOR em DOIS CAMPOS
-- ---------------------------------------------------------------------------
-- POR QUÊ
--   O molde entregue em 20261018121000 tinha UMA coluna, "Cliente/Fornecedor",
--   sem lista de escolher, e o servidor adivinhava de que lado o nome era
--   (fornecedor homônimo ganhava em SAÍDA, cliente em ENTRADA). Isso erra
--   calado: "Clima Rio" cadastrado nos dois lados entra no lado errado e o
--   cliente só descobre no relatório. O CEO pediu DUAS colunas, cada uma com
--   seu próprio select — e com duas colunas o servidor não tem mais nada pra
--   adivinhar.
--
-- O QUE MUDA (só ACRÉSCIMO — a tela de importação já está no ar escrita
-- contra o shape atual, então nada é removido nem renomeado)
--   1. `p_rows` passa a aceitar dois campos de texto novos: `customer` e
--      `supplier`. `customer` resolve SÓ contra public.customers; `supplier`
--      SÓ contra public.suppliers. Mesma régua de nome do resto do módulo
--      (_financial_import_norm: sem acento via translate, sem caixa, espaços
--      colapsados), sempre dentro do tenant.
--   2. `counterparty` continua funcionando EXATAMENTE como hoje, inclusive o
--      palpite de lado — mas só vale pro lado que o payload não mencionou.
--   3. Cada linha do preview ganha `customer_input/name/status` e
--      `supplier_input/name/status`. `counterparty_input/name/status`
--      continuam existindo com o comportamento de sempre.
--
-- PRECEDÊNCIA DO VÍNCULO (contrato, por LADO e não por linha)
--   lado do CLIENTE    → `customer_id` (uuid) > `customer` (nome) > `counterparty`
--   lado do FORNECEDOR → `supplier_id` (uuid) > `supplier`  (nome) > `counterparty`
--   "Lado ativo" é o lado que o payload mencionou (uuid OU nome, mesmo que o
--   nome não resolva). Lado ativo IGNORA `counterparty`: `customer` escrito
--   errado tem que virar aviso de cliente não encontrado, nunca cair no
--   palpite do campo velho — senão a correção que o CEO pediu não acontece.
--   Consequência deliberada: payload antigo (só `counterparty`) tem os dois
--   lados inativos e se comporta byte a byte como antes.
--
-- SEVERIDADE (invariante 5 do módulo, mantida)
--   Cliente ou fornecedor não encontrado / ambíguo é AVISO, nunca erro. A
--   linha segue `ready`, entra sem o vínculo e o nome cru volta reportado.
--   Bloquear faria uma planilha com 400 nomes novos travar as 400 linhas.
--
-- OS DOIS LADOS NA MESMA LINHA
--   É contraditório, mas `customer_id` e `supplier_id` são colunas DIFERENTES
--   de financial_transactions: os dois são resolvidos mesmo assim e a linha
--   ganha um AVISO (`field: counterparty`, `code: both_filled`) dizendo que o
--   normal é preencher só um. Não bloqueia.
--
-- COMO
--   ALTER TYPE ADD ATTRIBUTE no tipo composto de retorno (atributos 37..42) e
--   CREATE OR REPLACE a partir da definição VIVA (pg_get_functiondef) de
--   _financial_import_resolve e preview_financial_import. Nada de DROP: DROP
--   FUNCTION leva os GRANTs embora. `apply_financial_import` NÃO muda de
--   corpo — ela já lê r.customer_id / r.supplier_id do resolvedor, então o
--   novo vínculo entra na gravação sozinho; só o COMMENT dela é atualizado.
-- ===========================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ===========================================================================
-- 1. TIPO DE RETORNO: 6 atributos novos, no FIM (a ordem importa — o SELECT
--    final do resolvedor é posicional).
-- ===========================================================================

DO $tipo$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute a
      JOIN pg_class c      ON c.oid = a.attrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public'
       AND c.relname  = 'financial_import_resolved_row'
       AND a.attname  = 'customer_input'
       AND NOT a.attisdropped
  ) THEN
    ALTER TYPE public.financial_import_resolved_row
      ADD ATTRIBUTE customer_input  text,
      ADD ATTRIBUTE customer_name   text,
      ADD ATTRIBUTE customer_status text,
      ADD ATTRIBUTE supplier_input  text,
      ADD ATTRIBUTE supplier_name   text,
      ADD ATTRIBUTE supplier_status text;
    RAISE NOTICE 'financial_import_resolved_row: 6 atributos de cliente/fornecedor adicionados';
  ELSE
    RAISE NOTICE 'financial_import_resolved_row: atributos ja existem, nada a fazer';
  END IF;
END
$tipo$;

-- ===========================================================================
-- 2. RESOLVEDOR (definição viva + os dois lados). Interna: continua SEM grant
--    pra authenticated — ela recebe company_id como PARÂMETRO e não valida
--    tenant, dar grant ali abriria o catálogo de qualquer empresa.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public._financial_import_resolve(p_company_id uuid, p_rows jsonb)
 RETURNS SETOF financial_import_resolved_row
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT a.ord::integer AS ord, a.elem
      FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY AS a(elem, ord)
  ),
  src AS (
    SELECT
      r.ord,
      coalesce(
        CASE WHEN btrim(coalesce(r.elem->>'row_number', '')) ~ '^[0-9]+$'
             THEN (btrim(r.elem->>'row_number'))::integer END,
        r.ord
      ) AS rn,
      -- Data e valor chegam JÁ normalizados pelo parser (parseSheet.ts resolve
      -- serial do Excel, dd/mm/aaaa e R$ 1.234,56). O servidor NÃO reinterpreta
      -- formato: aceita só o canônico e marca o resto pra conferência.
      CASE WHEN btrim(coalesce(r.elem->>'date', '')) ~ '^\d{4}-\d{2}-\d{2}$'
           THEN (btrim(r.elem->>'date'))::date END AS d_date,
      lower(btrim(coalesce(r.elem->>'type', ''))) AS d_type_raw,
      nullif(btrim(coalesce(r.elem->>'description', '')), '') AS d_desc,
      CASE WHEN btrim(coalesce(r.elem->>'amount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (btrim(r.elem->>'amount'))::numeric END AS d_amount,
      CASE WHEN btrim(coalesce(r.elem->>'paid_date', '')) ~ '^\d{4}-\d{2}-\d{2}$'
           THEN (btrim(r.elem->>'paid_date'))::date END AS d_paid_date,
      -- is_paid: default TRUE (contrato). Só o "não" explícito desmarca.
      CASE
        WHEN lower(btrim(coalesce(r.elem->>'is_paid', '')))
             IN ('false', 'f', '0', 'n', 'no', 'nao', 'não', 'non', 'pendente', 'em aberto')
        THEN false
        ELSE true
      END AS d_is_paid,
      nullif(btrim(coalesce(r.elem->>'notes', '')), '')          AS d_notes,
      nullif(btrim(coalesce(r.elem->>'category', '')), '')       AS in_cat,
      nullif(btrim(coalesce(r.elem->>'account', '')), '')        AS in_acc,
      nullif(btrim(coalesce(r.elem->>'cost_center', '')), '')    AS in_cc,
      nullif(btrim(coalesce(r.elem->>'payment_method', '')), '') AS in_pm,
      nullif(btrim(coalesce(r.elem->>'counterparty', '')), '')   AS in_cp,
      -- MOLDE NOVO: duas colunas, cada uma com seu select. `customer` resolve
      -- SÓ contra customers, `supplier` SÓ contra suppliers — com dois campos
      -- o servidor não adivinha mais de que lado a contraparte é.
      -- `counterparty` continua aceito pra planilha e tela antigas.
      nullif(btrim(coalesce(r.elem->>'customer', '')), '')       AS in_cus,
      nullif(btrim(coalesce(r.elem->>'supplier', '')), '')       AS in_sup,
      -- "id vence quando os dois vêm" (contrato).
      public._financial_import_uuid(r.elem->>'category_id')    AS id_cat,
      public._financial_import_uuid(r.elem->>'account_id')     AS id_acc,
      public._financial_import_uuid(r.elem->>'cost_center_id') AS id_cc,
      public._financial_import_uuid(r.elem->>'customer_id')    AS id_cus,
      public._financial_import_uuid(r.elem->>'supplier_id')    AS id_sup
    FROM raw r
  ),
  norm AS (
    SELECT s.*,
           CASE
             WHEN s.d_type_raw IN ('entrada', 'in', 'income', 'credit', 'credito', 'crédito',
                                   'ingreso', 'entree', 'entrée', 'recette', 'receita')
               THEN 'entrada'
             WHEN s.d_type_raw IN ('saida', 'saída', 'out', 'expense', 'debit', 'debito', 'débito',
                                   'egreso', 'salida', 'sortie', 'depense', 'dépense', 'despesa')
               THEN 'saida'
           END AS tx_type
      FROM src s
  ),

  -- ── resolução de CATEGORIA ───────────────────────────────────────────────
  -- Por ID (vence) e por NOME. No caminho por nome a disputa já é resolvida
  -- pela COMPATIBILIDADE de tipo, igual ao filtro canônico
  -- filterCategoriesByTransactionType da UI: tipo da linha OU 'ambos'
  -- (invariante 6).
  cat_id AS (
    SELECT n.ord, c.id AS pid, c.name AS pname, c.type AS ptype, c.is_active AS pactive
      FROM norm n
      JOIN public.financial_categories c
        ON c.id = n.id_cat AND c.company_id = p_company_id
     WHERE n.id_cat IS NOT NULL
  ),
  cat_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           count(*) FILTER (
             WHERE c.type IS NOT NULL AND c.type IN (coalesce(n.tx_type, 'entrada'), 'ambos')
           ) AS hits_ok,
           (array_agg(c.id ORDER BY c.name, c.id) FILTER (
             WHERE c.type IS NOT NULL AND c.type IN (coalesce(n.tx_type, 'entrada'), 'ambos')
           ))[1] AS pid,
           (array_agg(c.name ORDER BY c.name, c.id) FILTER (
             WHERE c.type IS NOT NULL AND c.type IN (coalesce(n.tx_type, 'entrada'), 'ambos')
           ))[1] AS pname
      FROM norm n
      JOIN public.financial_categories c
        ON c.company_id = p_company_id
       AND c.is_active = true
       AND public._financial_import_norm(c.name) = public._financial_import_norm(n.in_cat)
     WHERE n.id_cat IS NULL AND n.in_cat IS NOT NULL
     GROUP BY n.ord
  ),

  -- ── resolução de CONTA ───────────────────────────────────────────────────
  acc_id AS (
    SELECT n.ord, a.id AS pid, a.name AS pname, a.type AS ptype, a.is_active AS pactive
      FROM norm n
      JOIN public.financial_accounts a
        ON a.id = n.id_acc AND a.company_id = p_company_id
     WHERE n.id_acc IS NOT NULL
  ),
  acc_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(a.id   ORDER BY a.name, a.id))[1] AS pid,
           (array_agg(a.name ORDER BY a.name, a.id))[1] AS pname,
           (array_agg(a.type ORDER BY a.name, a.id))[1] AS ptype
      FROM norm n
      JOIN public.financial_accounts a
        ON a.company_id = p_company_id
       AND a.is_active = true
       AND public._financial_import_norm(a.name) = public._financial_import_norm(n.in_acc)
     WHERE n.id_acc IS NULL AND n.in_acc IS NOT NULL
     GROUP BY n.ord
  ),

  -- ── resolução de CENTRO DE CUSTO ─────────────────────────────────────────
  cc_id AS (
    SELECT n.ord, k.id AS pid, k.name AS pname, k.is_active AS pactive
      FROM norm n
      JOIN public.cost_centers k
        ON k.id = n.id_cc AND k.company_id = p_company_id
     WHERE n.id_cc IS NOT NULL
  ),
  cc_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(k.id   ORDER BY k.name, k.id))[1] AS pid,
           (array_agg(k.name ORDER BY k.name, k.id))[1] AS pname
      FROM norm n
      JOIN public.cost_centers k
        ON k.company_id = p_company_id
       AND k.is_active = true
       AND public._financial_import_norm(k.name) = public._financial_import_norm(n.in_cc)
     WHERE n.id_cc IS NULL AND n.in_cc IS NOT NULL
     GROUP BY n.ord
  ),

  -- ── resolução de CONTRAPARTE (severidade AVISO, invariante 5) ────────────
  cus_id AS (
    SELECT n.ord, c.id AS pid, c.name AS pname
      FROM norm n
      JOIN public.customers c
        ON c.id = n.id_cus AND c.company_id = p_company_id
     WHERE n.id_cus IS NOT NULL
  ),
  sup_id AS (
    SELECT n.ord, s.id AS pid, s.name AS pname
      FROM norm n
      JOIN public.suppliers s
        ON s.id = n.id_sup AND s.company_id = p_company_id
     WHERE n.id_sup IS NOT NULL
  ),
  cus_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(c.id   ORDER BY c.name, c.id))[1] AS pid,
           (array_agg(c.name ORDER BY c.name, c.id))[1] AS pname
      FROM norm n
      JOIN public.customers c
        ON c.company_id = p_company_id
       AND coalesce(c.is_deleted, false) = false
       AND public._financial_import_norm(c.name) = public._financial_import_norm(n.in_cp)
     WHERE n.id_cus IS NULL AND n.id_sup IS NULL AND n.in_cp IS NOT NULL
     GROUP BY n.ord
  ),
  sup_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(s.id   ORDER BY s.name, s.id))[1] AS pid,
           (array_agg(s.name ORDER BY s.name, s.id))[1] AS pname
      FROM norm n
      JOIN public.suppliers s
        ON s.company_id = p_company_id
       AND public._financial_import_norm(s.name) = public._financial_import_norm(n.in_cp)
     WHERE n.id_cus IS NULL AND n.id_sup IS NULL AND n.in_cp IS NOT NULL
     GROUP BY n.ord
  ),

  -- ── resolução por CAMPO SEPARADO (molde de duas colunas) ────────────────
  -- Mesma régua de nome do resto do arquivo: _financial_import_norm (sem
  -- acento via translate, sem caixa, espaços colapsados), sempre dentro do
  -- tenant. `customers` tem is_deleted; `suppliers` não tem conceito de
  -- ativo/inativo, então não há filtro a aplicar lá (igual ao caminho legado).
  cusf_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(c.id   ORDER BY c.name, c.id))[1] AS pid,
           (array_agg(c.name ORDER BY c.name, c.id))[1] AS pname
      FROM norm n
      JOIN public.customers c
        ON c.company_id = p_company_id
       AND coalesce(c.is_deleted, false) = false
       AND public._financial_import_norm(c.name) = public._financial_import_norm(n.in_cus)
     WHERE n.id_cus IS NULL AND n.in_cus IS NOT NULL
     GROUP BY n.ord
  ),
  supf_name AS (
    SELECT n.ord,
           count(*) AS hits_any,
           (array_agg(s.id   ORDER BY s.name, s.id))[1] AS pid,
           (array_agg(s.name ORDER BY s.name, s.id))[1] AS pname
      FROM norm n
      JOIN public.suppliers s
        ON s.company_id = p_company_id
       AND public._financial_import_norm(s.name) = public._financial_import_norm(n.in_sup)
     WHERE n.id_sup IS NULL AND n.in_sup IS NOT NULL
     GROUP BY n.ord
  ),

  resolved AS (
    SELECT
      n.*,
      -- CATEGORIA
      CASE
        WHEN n.id_cat IS NOT NULL THEN
          CASE
            WHEN ci.pid IS NULL               THEN 'not_found'
            WHEN ci.pactive IS NOT TRUE       THEN 'inactive'
            WHEN n.tx_type IS NULL            THEN 'ok'
            -- Teste de NULL EXPLÍCITO: `NULL NOT IN (...)` é NULL e um
            -- `IF NULL` cairia no caminho de aceitar (invariante 6).
            WHEN ci.ptype IS NULL             THEN 'wrong_type'
            WHEN ci.ptype NOT IN (n.tx_type, 'ambos') THEN 'wrong_type'
            ELSE 'ok'
          END
        WHEN n.in_cat IS NULL                 THEN 'empty'
        WHEN coalesce(cn.hits_ok, 0) = 1      THEN 'ok'
        WHEN coalesce(cn.hits_ok, 0) > 1      THEN 'ambiguous'
        WHEN coalesce(cn.hits_any, 0) > 0     THEN 'wrong_type'
        ELSE 'not_found'
      END AS cat_status,
      CASE WHEN n.id_cat IS NOT NULL THEN ci.pid   ELSE cn.pid   END AS cat_pid,
      CASE WHEN n.id_cat IS NOT NULL THEN ci.pname ELSE cn.pname END AS cat_pname,
      -- CONTA
      CASE
        WHEN n.id_acc IS NOT NULL THEN
          CASE
            WHEN ai.pid IS NULL          THEN 'not_found'
            WHEN ai.pactive IS NOT TRUE  THEN 'inactive'
            WHEN ai.ptype = 'cartao'     THEN 'card_account'
            ELSE 'ok'
          END
        WHEN n.in_acc IS NULL            THEN 'empty'
        WHEN coalesce(an.hits_any, 0) > 1 THEN 'ambiguous'
        WHEN coalesce(an.hits_any, 0) = 0 THEN 'not_found'
        WHEN an.ptype = 'cartao'         THEN 'card_account'
        ELSE 'ok'
      END AS acc_status,
      CASE WHEN n.id_acc IS NOT NULL THEN ai.pid   ELSE an.pid   END AS acc_pid,
      CASE WHEN n.id_acc IS NOT NULL THEN ai.pname ELSE an.pname END AS acc_pname,
      CASE WHEN n.id_acc IS NOT NULL THEN ai.ptype ELSE an.ptype END AS acc_ptype,
      -- CENTRO DE CUSTO (opcional: vazio não é problema)
      CASE
        WHEN n.id_cc IS NOT NULL THEN
          CASE
            WHEN ki.pid IS NULL         THEN 'not_found'
            WHEN ki.pactive IS NOT TRUE THEN 'inactive'
            ELSE 'ok'
          END
        WHEN n.in_cc IS NULL             THEN 'empty'
        WHEN coalesce(kn.hits_any, 0) > 1 THEN 'ambiguous'
        WHEN coalesce(kn.hits_any, 0) = 0 THEN 'not_found'
        ELSE 'ok'
      END AS cc_status,
      CASE WHEN n.id_cc IS NOT NULL THEN ki.pid   ELSE kn.pid   END AS cc_pid,
      CASE WHEN n.id_cc IS NOT NULL THEN ki.pname ELSE kn.pname END AS cc_pname,
      -- FORMA DE PAGAMENTO (opcional: vazio não é problema; desconhecida é erro)
      CASE
        WHEN n.in_pm IS NULL                                         THEN 'empty'
        WHEN public._financial_import_payment_method(n.in_pm) IS NULL THEN 'not_found'
        ELSE 'ok'
      END AS pm_status,
      public._financial_import_payment_method(n.in_pm) AS pm_code,
      -- CONTRAPARTE. Preferência por direção: numa SAÍDA o fornecedor homônimo
      -- vence; numa ENTRADA, o cliente.
      CASE
        WHEN n.id_cus IS NOT NULL THEN CASE WHEN ui.pid IS NULL THEN 'not_found' ELSE 'matched_customer' END
        WHEN n.id_sup IS NOT NULL THEN CASE WHEN si.pid IS NULL THEN 'not_found' ELSE 'matched_supplier' END
        WHEN n.in_cp IS NULL      THEN 'empty'
        WHEN n.tx_type = 'saida' AND coalesce(sn.hits_any, 0) = 1 THEN 'matched_supplier'
        WHEN n.tx_type = 'saida' AND coalesce(sn.hits_any, 0) > 1 THEN 'ambiguous'
        WHEN coalesce(un.hits_any, 0) = 1 THEN 'matched_customer'
        WHEN coalesce(un.hits_any, 0) > 1 THEN 'ambiguous'
        WHEN coalesce(sn.hits_any, 0) = 1 THEN 'matched_supplier'
        WHEN coalesce(sn.hits_any, 0) > 1 THEN 'ambiguous'
        ELSE 'not_found'
      END AS cp_status,
      ui.pid AS cp_cus_id_hit, si.pid AS cp_sup_id_hit,
      ui.pname AS cp_cus_id_name, si.pname AS cp_sup_id_name,
      un.pid AS cp_cus_name_id, un.pname AS cp_cus_name_name, coalesce(un.hits_any, 0) AS cp_cus_hits,
      sn.pid AS cp_sup_name_id, sn.pname AS cp_sup_name_name, coalesce(sn.hits_any, 0) AS cp_sup_hits,
      -- ── CLIENTE (campo próprio) ─────────────────────────────────────
      -- Lado "ativo" = o payload falou dele (uuid OU nome). Lado ativo ignora
      -- `counterparty` por completo: é a precedência do contrato.
      (n.id_cus IS NOT NULL OR n.in_cus IS NOT NULL) AS cus_side_active,
      (n.id_sup IS NOT NULL OR n.in_sup IS NOT NULL) AS sup_side_active,
      CASE
        WHEN n.id_cus IS NOT NULL THEN CASE WHEN ui.pid IS NULL THEN 'not_found' ELSE 'ok' END
        WHEN n.in_cus IS NULL             THEN 'empty'
        WHEN coalesce(uf.hits_any, 0) = 1 THEN 'ok'
        WHEN coalesce(uf.hits_any, 0) > 1 THEN 'ambiguous'
        ELSE 'not_found'
      END AS cus_status,
      CASE WHEN n.id_cus IS NOT NULL THEN ui.pid   ELSE uf.pid   END AS cus_pid_raw,
      CASE WHEN n.id_cus IS NOT NULL THEN ui.pname ELSE uf.pname END AS cus_pname_raw,
      -- ── FORNECEDOR (campo próprio) ──────────────────────────────────
      CASE
        WHEN n.id_sup IS NOT NULL THEN CASE WHEN si.pid IS NULL THEN 'not_found' ELSE 'ok' END
        WHEN n.in_sup IS NULL             THEN 'empty'
        WHEN coalesce(sf.hits_any, 0) = 1 THEN 'ok'
        WHEN coalesce(sf.hits_any, 0) > 1 THEN 'ambiguous'
        ELSE 'not_found'
      END AS sup_status,
      CASE WHEN n.id_sup IS NOT NULL THEN si.pid   ELSE sf.pid   END AS sup_pid_raw,
      CASE WHEN n.id_sup IS NOT NULL THEN si.pname ELSE sf.pname END AS sup_pname_raw
    FROM norm n
    LEFT JOIN cat_id   ci ON ci.ord = n.ord
    LEFT JOIN cat_name cn ON cn.ord = n.ord
    LEFT JOIN acc_id   ai ON ai.ord = n.ord
    LEFT JOIN acc_name an ON an.ord = n.ord
    LEFT JOIN cc_id    ki ON ki.ord = n.ord
    LEFT JOIN cc_name  kn ON kn.ord = n.ord
    LEFT JOIN cus_id   ui ON ui.ord = n.ord
    LEFT JOIN sup_id   si ON si.ord = n.ord
    LEFT JOIN cus_name un ON un.ord = n.ord
    LEFT JOIN sup_name sn ON sn.ord = n.ord
    LEFT JOIN cusf_name uf ON uf.ord = n.ord
    LEFT JOIN supf_name sf ON sf.ord = n.ord
  ),

  shaped AS (
    SELECT
      v.*,
      CASE
        WHEN v.cp_status = 'matched_customer' AND v.id_cus IS NOT NULL THEN v.cp_cus_id_hit
        WHEN v.cp_status = 'matched_customer'                          THEN v.cp_cus_name_id
      END AS cp_customer_id,
      CASE
        WHEN v.cp_status = 'matched_supplier' AND v.id_sup IS NOT NULL THEN v.cp_sup_id_hit
        WHEN v.cp_status = 'matched_supplier'                          THEN v.cp_sup_name_id
      END AS cp_supplier_id,
      CASE
        WHEN v.cp_status = 'matched_customer' AND v.id_cus IS NOT NULL THEN v.cp_cus_id_name
        WHEN v.cp_status = 'matched_customer'                          THEN v.cp_cus_name_name
        WHEN v.cp_status = 'matched_supplier' AND v.id_sup IS NOT NULL THEN v.cp_sup_id_name
        WHEN v.cp_status = 'matched_supplier'                          THEN v.cp_sup_name_name
      END AS cp_name,
      -- ── PRECEDÊNCIA DO VÍNCULO (contrato) ───────────────────────────
      -- 1) uuid (customer_id / supplier_id) vence de tudo;
      -- 2) depois o nome do campo próprio (`customer` / `supplier`);
      -- 3) só quando o lado NÃO foi mencionado é que `counterparty` preenche
      --    ele (compatibilidade com a planilha e a tela que já estão no ar).
      -- Lado ativo mas não resolvido fica NULO de propósito: `customer` escrito
      -- errado não pode cair no palpite do `counterparty`.
      CASE
        WHEN v.cus_side_active THEN CASE WHEN v.cus_status = 'ok' THEN v.cus_pid_raw END
        WHEN v.cp_status = 'matched_customer' AND v.id_cus IS NOT NULL THEN v.cp_cus_id_hit
        WHEN v.cp_status = 'matched_customer'                          THEN v.cp_cus_name_id
      END AS out_customer_id,
      CASE
        WHEN v.sup_side_active THEN CASE WHEN v.sup_status = 'ok' THEN v.sup_pid_raw END
        WHEN v.cp_status = 'matched_supplier' AND v.id_sup IS NOT NULL THEN v.cp_sup_id_hit
        WHEN v.cp_status = 'matched_supplier'                          THEN v.cp_sup_name_id
      END AS out_supplier_id,
      -- amount SEMPRE positivo; a direção vem do Tipo (lei do schema: o
      -- Dominex não guarda valor com sinal).
      --
      -- round(...,2) é a ESCALA DA MOEDA, não um conserto: o valor chega como
      -- número JSON e o ponto flutuante entrega 1234.5600000000001 pra
      -- 1234,56. `amount` é numeric SEM escala declarada, então sem este round
      -- o lixo de float entraria no banco e o lançamento nunca bateria com o
      -- extrato por R$ 0,0000000001. Quando o round MUDA algo acima da 2ª
      -- decimal, a linha ganha um AVISO — normalizar é permitido, normalizar
      -- em silêncio não é.
      round(abs(v.d_amount), 2) AS amt_abs,
      CASE
        WHEN v.d_amount IS NULL OR v.tx_type IS NULL THEN NULL
        WHEN v.tx_type = 'entrada' THEN  round(abs(v.d_amount), 2)
        ELSE                            -round(abs(v.d_amount), 2)
      END AS amt_signed,
      CASE WHEN v.d_is_paid THEN coalesce(v.d_paid_date, v.d_date) END AS pay_date
    FROM resolved v
  ),

  keyed AS (
    SELECT
      w.*,
      public.financial_import_content_key(w.d_date, w.amt_signed, w.d_desc, w.acc_pid) AS ckey
    FROM shaped w
  ),

  ranked AS (
    SELECT
      k.*,
      row_number() OVER (PARTITION BY k.ckey ORDER BY k.rn, k.ord)::integer AS brank
    FROM keyed k
  ),

  -- Scan ESTREITO do dedup (invariante 4): só as contas do payload, só a
  -- janela de datas do payload, só não-cancelados.
  scope AS (
    SELECT array_agg(DISTINCT acc_pid) FILTER (WHERE acc_pid IS NOT NULL) AS accts,
           min(d_date) AS min_d,
           max(d_date) AS max_d
      FROM keyed
  ),
  existing AS (
    SELECT public.financial_import_content_key(
             t.transaction_date,
             public.ft_signed_amount(t.transaction_type::text, t.amount),
             t.description,
             t.account_id
           ) AS ckey,
           count(*)::integer AS cnt
      FROM public.financial_transactions t
      CROSS JOIN scope sc
     WHERE t.company_id = p_company_id
       AND t.cancelled_at IS NULL
       AND sc.accts IS NOT NULL
       AND sc.min_d IS NOT NULL
       AND t.account_id = ANY (sc.accts)
       AND t.transaction_date BETWEEN sc.min_d AND sc.max_d
     GROUP BY 1
  ),

  issued AS (
    SELECT
      q.*,
      coalesce(ex.cnt, 0) AS ecount,
      (
        -- ── obrigatórios ────────────────────────────────────────────────
        CASE WHEN q.d_date IS NULL THEN jsonb_build_array(jsonb_build_object(
               'field', 'date', 'code', 'invalid', 'severity', 'error',
               'message', 'Data ausente ou em formato que não deu para ler.'))
             ELSE '[]'::jsonb END
     || CASE WHEN q.tx_type IS NULL THEN jsonb_build_array(jsonb_build_object(
               'field', 'type', 'code', 'invalid', 'severity', 'error',
               'message', 'Tipo ausente ou não reconhecido. Use "Entrada" ou "Saída".'))
             ELSE '[]'::jsonb END
     || CASE WHEN q.d_desc IS NULL THEN jsonb_build_array(jsonb_build_object(
               'field', 'description', 'code', 'required', 'severity', 'error',
               'message', 'Descrição é obrigatória.'))
             ELSE '[]'::jsonb END
     || CASE WHEN q.d_amount IS NULL THEN jsonb_build_array(jsonb_build_object(
               'field', 'amount', 'code', 'invalid', 'severity', 'error',
               'message', 'Valor ausente ou em formato que não deu para ler.'))
             WHEN abs(q.d_amount) = 0 THEN jsonb_build_array(jsonb_build_object(
               'field', 'amount', 'code', 'invalid', 'severity', 'error',
               'message', 'Valor tem que ser maior que zero — quem diz se entrou ou saiu é a coluna Tipo.'))
             ELSE '[]'::jsonb END
        -- ── categoria (obrigatória) ─────────────────────────────────────
     || CASE q.cat_status
          WHEN 'ok'    THEN '[]'::jsonb
          WHEN 'empty' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'category', 'code', 'empty', 'severity', 'error',
                 'message', 'Categoria é obrigatória. Escolha uma das categorias da sua empresa.'))
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'category', 'code', 'not_found', 'severity', 'error',
                 'message', 'Categoria "' || coalesce(q.in_cat, '') || '" não existe nesta empresa. Mapeie para uma existente na tela de conferência.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'category', 'code', 'ambiguous', 'severity', 'error',
                 'message', 'Mais de uma categoria com o nome "' || coalesce(q.in_cat, '') || '". Escolha qual na tela de conferência.'))
          WHEN 'inactive' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'category', 'code', 'inactive', 'severity', 'error',
                 'message', 'A categoria escolhida está inativa.'))
          WHEN 'wrong_type' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'category', 'code', 'wrong_type', 'severity', 'error',
                 'message', 'A categoria "' || coalesce(q.in_cat, coalesce(q.cat_pname, '')) || '" não serve para uma linha de '
                            || CASE WHEN q.tx_type = 'entrada' THEN 'entrada' ELSE 'saída' END
                            || '. Escolha uma categoria de '
                            || CASE WHEN q.tx_type = 'entrada' THEN 'entrada' ELSE 'saída' END
                            || ' ou uma do tipo "ambos".'))
          ELSE '[]'::jsonb END
        -- ── conta (obrigatória) ─────────────────────────────────────────
     || CASE q.acc_status
          WHEN 'ok'    THEN '[]'::jsonb
          WHEN 'empty' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'account', 'code', 'empty', 'severity', 'error',
                 'message', 'Conta é obrigatória. Escolha uma das contas da sua empresa.'))
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'account', 'code', 'not_found', 'severity', 'error',
                 'message', 'Conta "' || coalesce(q.in_acc, '') || '" não existe nesta empresa. Mapeie para uma existente na tela de conferência.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'account', 'code', 'ambiguous', 'severity', 'error',
                 'message', 'Mais de uma conta com o nome "' || coalesce(q.in_acc, '') || '". Escolha qual na tela de conferência.'))
          WHEN 'inactive' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'account', 'code', 'inactive', 'severity', 'error',
                 'message', 'A conta escolhida está inativa.'))
          WHEN 'card_account' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'account', 'code', 'card_account', 'severity', 'error',
                 'message', 'Conta de cartão de crédito não entra por planilha: despesa de cartão nunca entra paga — só a fatura é paga. Use uma conta bancária ou o caixa.'))
          ELSE '[]'::jsonb END
        -- ── centro de custo (opcional; informado e não resolvido é erro) ─
     || CASE q.cc_status
          WHEN 'ok'    THEN '[]'::jsonb
          WHEN 'empty' THEN '[]'::jsonb
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'cost_center', 'code', 'not_found', 'severity', 'error',
                 'message', 'Centro de custo "' || coalesce(q.in_cc, '') || '" não existe nesta empresa. Apague a célula ou mapeie na tela de conferência.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'cost_center', 'code', 'ambiguous', 'severity', 'error',
                 'message', 'Mais de um centro de custo com o nome "' || coalesce(q.in_cc, '') || '". Escolha qual na tela de conferência.'))
          WHEN 'inactive' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'cost_center', 'code', 'inactive', 'severity', 'error',
                 'message', 'O centro de custo escolhido está inativo.'))
          ELSE '[]'::jsonb END
        -- ── forma de pagamento (opcional; desconhecida é erro) ──────────
        -- A mensagem lista os RÓTULOS (o que o cliente consegue agir), não os
        -- códigos. `accepted` vem junto, machine-readable, pro hook poder
        -- reescrever a frase no idioma do tenant: o Postgres não conhece o
        -- locale da sessão e mensagem de RPC neste repo é PT-BR por lei.
     || CASE q.pm_status
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'payment_method', 'code', 'not_found', 'severity', 'error',
                 'message', 'Forma de pagamento "' || coalesce(q.in_pm, '') || '" não é reconhecida. Use uma destas: Dinheiro, PIX, Cartão de Débito, Cartão de Crédito, Transferência, Boleto, Cheque.',
                 'accepted', jsonb_build_array('dinheiro', 'pix', 'cartao_debito',
                                               'cartao_credito', 'transferencia',
                                               'boleto', 'cheque')))
          ELSE '[]'::jsonb END
        -- ── contraparte: AVISO, nunca erro (invariante 5) ───────────────
     || CASE q.cp_status
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'counterparty', 'code', 'not_found', 'severity', 'warning',
                 'message', 'Cliente/fornecedor "' || coalesce(q.in_cp, '') || '" não foi encontrado no cadastro. A movimentação entra sem o vínculo — você pode ligar depois.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'counterparty', 'code', 'ambiguous', 'severity', 'warning',
                 'message', 'Mais de um cadastro com o nome "' || coalesce(q.in_cp, '') || '". A movimentação entra sem o vínculo.'))
          ELSE '[]'::jsonb END
        -- ── cliente / fornecedor em campo próprio: AVISO, nunca erro ────
        -- Mesma lei do `counterparty`: 400 nomes novos não podem travar 400
        -- linhas. A linha entra sem o vínculo e o nome cru volta reportado.
     || CASE q.cus_status
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'customer', 'code', 'not_found', 'severity', 'warning',
                 'message', 'Cliente "' || coalesce(q.in_cus, '') || '" não foi encontrado no cadastro. A movimentação entra sem o vínculo — você pode ligar depois.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'customer', 'code', 'ambiguous', 'severity', 'warning',
                 'message', 'Mais de um cliente com o nome "' || coalesce(q.in_cus, '') || '". A movimentação entra sem o vínculo.'))
          ELSE '[]'::jsonb END
     || CASE q.sup_status
          WHEN 'not_found' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'supplier', 'code', 'not_found', 'severity', 'warning',
                 'message', 'Fornecedor "' || coalesce(q.in_sup, '') || '" não foi encontrado no cadastro. A movimentação entra sem o vínculo — você pode ligar depois.'))
          WHEN 'ambiguous' THEN jsonb_build_array(jsonb_build_object(
                 'field', 'supplier', 'code', 'ambiguous', 'severity', 'warning',
                 'message', 'Mais de um fornecedor com o nome "' || coalesce(q.in_sup, '') || '". A movimentação entra sem o vínculo.'))
          ELSE '[]'::jsonb END
        -- ── os dois lados na mesma linha: contraditório, mas NÃO bloqueia ─
        -- São colunas diferentes do banco (customer_id e supplier_id), então
        -- os dois são resolvidos mesmo assim. O aviso existe porque o normal
        -- é preencher só um — quem paga é fornecedor, quem paga pra você é
        -- cliente.
     || CASE WHEN q.in_cus IS NOT NULL AND q.in_sup IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object(
                 'field', 'counterparty', 'code', 'both_filled', 'severity', 'warning',
                 'message', 'Esta linha tem Cliente e Fornecedor preenchidos ao mesmo tempo. Os dois foram vinculados, mas o normal é preencher só um.'))
             ELSE '[]'::jsonb END
        -- ── sinal brigando com o Tipo (aviso, decisão já documentada) ───
     || CASE WHEN q.d_amount IS NOT NULL AND q.d_amount < 0 THEN jsonb_build_array(jsonb_build_object(
               'field', 'amount', 'code', 'negative_value', 'severity', 'warning',
               'message', 'O valor veio negativo. Usamos o valor absoluto: quem diz se entrou ou saiu é a coluna Tipo.'))
             ELSE '[]'::jsonb END
        -- ── valor com mais de 2 casas: normalizado, mas REPORTADO ───────
     || CASE WHEN q.d_amount IS NOT NULL AND abs(q.d_amount) <> round(abs(q.d_amount), 2)
               THEN jsonb_build_array(jsonb_build_object(
                 'field', 'amount', 'code', 'rounded', 'severity', 'warning',
                 'message', 'O valor tinha mais de duas casas decimais e foi arredondado para ' || to_char(round(abs(q.d_amount), 2), 'FM999999999990.00') || '.'))
             ELSE '[]'::jsonb END
        -- ── data de pagamento informada em linha não paga ───────────────
     || CASE WHEN q.d_is_paid IS NOT TRUE AND q.d_paid_date IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
               'field', 'paid_date', 'code', 'ignored', 'severity', 'warning',
               'message', 'A linha está marcada como NÃO paga, então a data de pagamento foi ignorada.'))
             ELSE '[]'::jsonb END
      ) AS iss
    FROM ranked q
    LEFT JOIN existing ex ON ex.ckey = q.ckey
  )

  SELECT
    f.rn,
    f.ckey,
    f.brank,
    f.ecount,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(f.iss) z WHERE z->>'severity' = 'error'
      ) THEN 'blocked'
      WHEN f.brank <= f.ecount THEN 'duplicate'
      ELSE 'ready'
    END,
    f.d_date,
    f.tx_type,
    f.d_desc,
    f.amt_abs,
    f.amt_signed,
    f.d_is_paid,
    f.pay_date,
    f.d_notes,
    f.in_cat,
    CASE WHEN f.cat_status = 'ok' THEN f.cat_pid   END,
    CASE WHEN f.cat_status = 'ok' THEN f.cat_pname END,
    f.cat_status,
    f.in_acc,
    CASE WHEN f.acc_status = 'ok' THEN f.acc_pid   END,
    CASE WHEN f.acc_status = 'ok' THEN f.acc_pname END,
    f.acc_ptype,
    f.acc_status,
    f.in_cc,
    CASE WHEN f.cc_status = 'ok' THEN f.cc_pid   END,
    CASE WHEN f.cc_status = 'ok' THEN f.cc_pname END,
    f.cc_status,
    f.in_pm,
    CASE WHEN f.pm_status = 'ok' THEN f.pm_code END,
    f.pm_status,
    f.in_cp,
    f.out_customer_id,
    f.out_supplier_id,
    f.cp_name,
    f.cp_status,
    (f.brank <= f.ecount),
    f.iss,
    -- Atributos 37..42 do tipo, na ordem do ALTER TYPE acima.
    f.in_cus,
    CASE WHEN f.cus_status = 'ok' THEN f.cus_pname_raw END,
    f.cus_status,
    f.in_sup,
    CASE WHEN f.sup_status = 'ok' THEN f.sup_pname_raw END,
    f.sup_status
  FROM issued f
  ORDER BY f.rn, f.ord
$function$;

COMMENT ON FUNCTION public._financial_import_resolve(uuid, jsonb) IS
$doc$Resolvedor único da importação financeira por planilha. INTERNO: recebe
company_id como parâmetro e NÃO valida tenant — nunca dar EXECUTE a
authenticated/anon.

Contraparte, a partir de 20261018150000, tem DOIS LADOS independentes:
  lado CLIENTE    → p_rows[].customer_id (uuid) > p_rows[].customer (nome) > p_rows[].counterparty
  lado FORNECEDOR → p_rows[].supplier_id (uuid) > p_rows[].supplier  (nome) > p_rows[].counterparty

"Lado ativo" = o payload mencionou aquele lado (uuid OU nome, resolvendo ou
não). Lado ativo ignora `counterparty` por completo — `customer` escrito errado
vira aviso de cliente não encontrado em vez de cair no palpite do campo antigo.
Lado NÃO mencionado continua sendo preenchido pelo `counterparty` com o
comportamento de sempre (em SAÍDA o fornecedor homônimo vence; em ENTRADA, o
cliente), que é o que mantém planilha e tela antigas funcionando.

Status por lado (customer_status / supplier_status): 'ok' | 'empty' |
'not_found' | 'ambiguous'. counterparty_status segue com o vocabulário antigo:
'matched_customer' | 'matched_supplier' | 'empty' | 'not_found' | 'ambiguous'.
counterparty_name/counterparty_status descrevem SÓ o campo `counterparty`.

Severidade: cliente/fornecedor não encontrado ou ambíguo é AVISO (a linha segue
`ready` e entra sem vínculo). Cliente E fornecedor na mesma linha resolve os
dois e emite aviso `both_filled` — não bloqueia.$doc$;

-- ===========================================================================
-- 3. PREVIEW (definição viva + as 6 chaves novas por linha).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.preview_financial_import(p_file_hash text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company  uuid;
  v_hash     text;
  v_count    integer;
  v_existing public.financial_imports%ROWTYPE;
  v_rows     jsonb;
  v_ready    integer;
  v_dup      integer;
  v_blocked  integer;
  v_in       numeric;
  v_out      numeric;
BEGIN
  v_company := public._financial_import_company();
  PERFORM public._financial_import_assert_write(v_company);

  IF jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'As linhas da planilha têm que vir como lista.' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));

  IF v_count > 5000 THEN
    RAISE EXCEPTION 'A planilha tem % linhas. O limite por importação é 5.000 — divida o arquivo.', v_count
      USING ERRCODE = '22023';
  END IF;

  v_hash := nullif(btrim(coalesce(p_file_hash, '')), '');

  -- Import revertido NÃO conta como "já importado": o apply reaproveita a
  -- linha, então o cliente pode reimportar o arquivo que ele acabou de desfazer.
  IF v_hash IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.financial_imports
     WHERE company_id = v_company
       AND file_hash = v_hash
       AND status = 'applied';
  END IF;

  SELECT coalesce(jsonb_agg(x.js ORDER BY x.rn), '[]'::jsonb),
         count(*) FILTER (WHERE x.st = 'ready')::integer,
         count(*) FILTER (WHERE x.st = 'duplicate')::integer,
         count(*) FILTER (WHERE x.st = 'blocked')::integer,
         coalesce(SUM(x.amt) FILTER (WHERE x.st = 'ready' AND x.tt = 'entrada'), 0),
         coalesce(SUM(x.amt) FILTER (WHERE x.st = 'ready' AND x.tt = 'saida'), 0)
    INTO v_rows, v_ready, v_dup, v_blocked, v_in, v_out
  FROM (
    SELECT
      r.row_number AS rn,
      r.status     AS st,
      r.amount     AS amt,
      r.transaction_type AS tt,
      jsonb_build_object(
        'row_number',            r.row_number,
        'content_key',           r.content_key,
        'batch_rank',            r.batch_rank,
        'existing_count',        r.existing_count,
        'status',                r.status,
        'date',                  r.transaction_date,
        'transaction_type',      r.transaction_type,
        'description',           r.description,
        'amount',                r.amount,
        'signed_amount',         r.signed_amount,
        'is_paid',               r.is_paid,
        'paid_date',             r.paid_date,
        'notes',                 r.notes,
        'category_input',        r.category_input,
        'category_id',           r.category_id,
        'category_name',         r.category_name,
        'category_status',       r.category_status,
        'account_input',         r.account_input,
        'account_id',            r.account_id,
        'account_name',          r.account_name,
        'account_type',          r.account_type,
        'account_status',        r.account_status,
        'cost_center_input',     r.cost_center_input,
        'cost_center_id',        r.cost_center_id,
        'cost_center_name',      r.cost_center_name,
        'cost_center_status',    r.cost_center_status,
        'payment_method_input',  r.payment_method_input,
        'payment_method',        r.payment_method,
        'payment_method_status', r.payment_method_status,
        'counterparty_input',    r.counterparty_input,
        'customer_id',           r.customer_id,
        'supplier_id',           r.supplier_id,
        'counterparty_name',     r.counterparty_name,
        'counterparty_status',   r.counterparty_status,
        -- Molde de duas colunas. `customer_*` e `supplier_*` são ACRÉSCIMO:
        -- `counterparty_*` continua indo no payload com o comportamento de
        -- sempre pra não quebrar a tela que já está no ar.
        'customer_input',        r.customer_input,
        'customer_name',         r.customer_name,
        'customer_status',       r.customer_status,
        'supplier_input',        r.supplier_input,
        'supplier_name',         r.supplier_name,
        'supplier_status',       r.supplier_status,
        'is_duplicate',          r.is_duplicate,
        'issues',                r.issues
      ) AS js
    FROM public._financial_import_resolve(v_company, coalesce(p_rows, '[]'::jsonb)) r
  ) x;

  RETURN jsonb_build_object(
    'already_imported', (v_existing.id IS NOT NULL),
    'existing_import',  CASE WHEN v_existing.id IS NULL THEN NULL ELSE jsonb_build_object(
                          'id',            v_existing.id,
                          'file_name',     v_existing.file_name,
                          'created_at',    v_existing.created_at,
                          'created_count', v_existing.created_count,
                          'status',        v_existing.status
                        ) END,
    'row_count',        v_count,
    'ready_count',      coalesce(v_ready, 0),
    'blocked_count',    coalesce(v_blocked, 0),
    'duplicate_count',  coalesce(v_dup, 0),
    'total_in',         round(coalesce(v_in, 0), 2),
    'total_out',        round(coalesce(v_out, 0), 2),
    'rows',             coalesce(v_rows, '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_financial_import(text, jsonb) IS
$doc$Conferência da importação financeira (não grava nada). Devolve jsonb com
already_imported, existing_import, row_count, ready_count, blocked_count,
duplicate_count, total_in, total_out e rows[].

Cada item de p_rows aceita: row_number, date (aaaa-mm-dd), type, description,
amount, paid_date, is_paid, notes, category|category_id, account|account_id,
cost_center|cost_center_id, payment_method, customer|customer_id,
supplier|supplier_id e counterparty (legado).

Cada item de rows[] traz, além do que já trazia: customer_input, customer_name,
customer_status, supplier_input, supplier_name, supplier_status — vocabulário
'ok' | 'empty' | 'not_found' | 'ambiguous'. customer_id/supplier_id são os
vínculos finais já com a precedência aplicada (uuid > nome do campo próprio >
counterparty, por lado). counterparty_input/name/status seguem inalterados.$doc$;

COMMENT ON FUNCTION public.apply_financial_import(text, text, jsonb) IS
$doc$Grava a importação financeira. Idempotente por (company_id, file_hash):
arquivo idêntico já aplicado devolve already_imported=true sem inserir nada;
import revertido reaproveita a linha. O resumo é calculado ANTES do INSERT e
conferido depois (previa/gravou/vinculou) — divergência ABORTA tudo.

p_rows tem o mesmo shape de preview_financial_import, incluindo os campos
`customer` e `supplier` (molde de duas colunas) e o `counterparty` legado. O
vínculo gravado em financial_transactions.customer_id / .supplier_id é o que o
resolvedor devolve, com a precedência por lado: uuid > nome do campo próprio >
counterparty. Contraparte não encontrada NÃO impede a gravação (aviso).$doc$;

-- ===========================================================================
-- 4. GRANTS. Reafirmados mesmo sem DROP: barato, e garante que um replace
--    futuro não deixe o estado ambíguo. `anon` é revogado NOMINALMENTE — o
--    default privilege do Supabase concede EXECUTE a ele explicitamente em
--    função nova de public, e REVOKE FROM PUBLIC não tira grant de papel.
-- ===========================================================================

DO $grants$
DECLARE
  v_sig text;
BEGIN
  -- Interna: ninguém além do dono.
  FOREACH v_sig IN ARRAY ARRAY[
    'public._financial_import_resolve(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
  END LOOP;

  -- RPC do contrato.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.preview_financial_import(text, jsonb)',
    'public.apply_financial_import(text, text, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END
$grants$;

-- ===========================================================================
-- 5. PROVA, dentro da própria transação. Se algo escapar, NÃO COMMITA.
-- ===========================================================================

DO $proof$
DECLARE
  v_n     integer;
  v_rows  jsonb;
  v_row   jsonb;
  v_co    uuid;
  v_cusid uuid;
  v_cusnm text;
  v_supid uuid;
  v_supnm text;
  v_catnm text;
  v_accnm text;
BEGIN
  -- 1. Os 6 atributos novos existem, na ordem certa, no fim do tipo.
  SELECT count(*) INTO v_n
    FROM pg_attribute a
    JOIN pg_class c      ON c.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname  = 'financial_import_resolved_row'
     AND NOT a.attisdropped AND a.attnum > 0
     AND a.attname IN ('customer_input', 'customer_name', 'customer_status',
                       'supplier_input', 'supplier_name', 'supplier_status');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'financial_import_resolved_row tem % dos 6 atributos novos', v_n;
  END IF;

  -- Nada foi removido: 30 atributos antigos + 6 novos = 36 + 6.
  SELECT count(*) INTO v_n
    FROM pg_attribute a
    JOIN pg_class c      ON c.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'financial_import_resolved_row'
     AND NOT a.attisdropped AND a.attnum > 0;
  IF v_n <> 42 THEN
    RAISE EXCEPTION 'financial_import_resolved_row tem % atributos, esperado 42 (nada pode ter sido removido)', v_n;
  END IF;

  -- 2. `anon` sem EXECUTE em nada do módulo; interna fechada pra authenticated.
  IF has_function_privilege('anon', 'public._financial_import_resolve(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.preview_financial_import(text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_financial_import(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em funcao da importacao financeira';
  END IF;
  IF has_function_privilege('authenticated', 'public._financial_import_resolve(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE em _financial_import_resolve — isso abre o catalogo de qualquer empresa';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.preview_financial_import(text, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.apply_financial_import(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE nas RPCs do contrato';
  END IF;

  -- 3. Payload vazio não explode.
  PERFORM 1 FROM public._financial_import_resolve(
    '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);

  -- 4. COMPORTAMENTO, com cliente, fornecedor, categoria e conta REAIS da
  --    primeira empresa que tiver os quatro (categoria e conta entram porque
  --    SÃO OBRIGATÓRIAS: sem elas a linha nasce `blocked` e a prova de que
  --    contraparte não encontrada segue `ready` não provaria nada).
  --    Nomes homônimos são excluídos — ambiguidade estragaria a asserção.
  --    Sem fixture, a prova é pulada (banco novo).
  SELECT c.company_id, c.id, c.name, s.id, s.name, k.name, a.name
    INTO v_co, v_cusid, v_cusnm, v_supid, v_supnm, v_catnm, v_accnm
    FROM public.customers c
    JOIN public.suppliers s ON s.company_id = c.company_id
    JOIN public.financial_categories k
      ON k.company_id = c.company_id AND k.is_active AND k.type IN ('saida', 'ambos')
    JOIN public.financial_accounts a
      ON a.company_id = c.company_id AND a.is_active AND a.type <> 'cartao'
   WHERE coalesce(c.is_deleted, false) = false
     AND btrim(coalesce(c.name, '')) <> ''
     AND btrim(coalesce(s.name, '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM public.customers c2
                      WHERE c2.company_id = c.company_id
                        AND coalesce(c2.is_deleted, false) = false
                        AND public._financial_import_norm(c2.name) = public._financial_import_norm(c.name)
                        AND c2.id <> c.id)
     AND NOT EXISTS (SELECT 1 FROM public.suppliers s2
                      WHERE s2.company_id = s.company_id
                        AND public._financial_import_norm(s2.name) = public._financial_import_norm(s.name)
                        AND s2.id <> s.id)
     AND NOT EXISTS (SELECT 1 FROM public.financial_categories k2
                      WHERE k2.company_id = k.company_id AND k2.is_active
                        AND public._financial_import_norm(k2.name) = public._financial_import_norm(k.name)
                        AND k2.id <> k.id)
     AND NOT EXISTS (SELECT 1 FROM public.financial_accounts a2
                      WHERE a2.company_id = a.company_id AND a2.is_active
                        AND public._financial_import_norm(a2.name) = public._financial_import_norm(a.name)
                        AND a2.id <> a.id)
   LIMIT 1;

  IF v_co IS NULL THEN
    RAISE NOTICE 'sem cliente+fornecedor+categoria+conta para a prova de comportamento — pulada';
    RETURN;
  END IF;

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.row_number) INTO v_rows
    FROM public._financial_import_resolve(v_co, jsonb_build_array(
      -- linha 1: só `customer`
      jsonb_build_object('row_number', 1, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'prova lado cliente', 'amount', '10',
                         'category', v_catnm, 'account', v_accnm,
                         'customer', v_cusnm),
      -- linha 2: só `supplier`
      jsonb_build_object('row_number', 2, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'prova lado fornecedor', 'amount', '20',
                         'category', v_catnm, 'account', v_accnm,
                         'supplier', v_supnm),
      -- linha 3: `customer` inexistente → AVISO, linha segue
      jsonb_build_object('row_number', 3, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'prova cliente inexistente', 'amount', '30',
                         'category', v_catnm, 'account', v_accnm,
                         'customer', 'zzz nao existe zzz 9f3a'),
      -- linha 4: legado, só `counterparty` (em SAÍDA o fornecedor vence)
      jsonb_build_object('row_number', 4, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'prova legado counterparty', 'amount', '40',
                         'category', v_catnm, 'account', v_accnm,
                         'counterparty', v_supnm),
      -- linha 5: os dois lados
      jsonb_build_object('row_number', 5, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'prova dois lados', 'amount', '50',
                         'category', v_catnm, 'account', v_accnm,
                         'customer', v_cusnm, 'supplier', v_supnm)
    )) r;

  v_row := v_rows -> 0;
  IF (v_row->>'customer_id')::uuid IS DISTINCT FROM v_cusid
     OR v_row->>'supplier_id' IS NOT NULL
     OR v_row->>'customer_status' <> 'ok'
     OR v_row->>'supplier_status' <> 'empty' THEN
    RAISE EXCEPTION 'linha so com customer resolveu errado: %', v_row;
  END IF;

  v_row := v_rows -> 1;
  IF (v_row->>'supplier_id')::uuid IS DISTINCT FROM v_supid
     OR v_row->>'customer_id' IS NOT NULL
     OR v_row->>'supplier_status' <> 'ok'
     OR v_row->>'customer_status' <> 'empty' THEN
    RAISE EXCEPTION 'linha so com supplier resolveu errado: %', v_row;
  END IF;

  v_row := v_rows -> 2;
  IF v_row->>'customer_status' <> 'not_found'
     OR v_row->>'customer_id' IS NOT NULL
     OR v_row->>'status' <> 'ready' THEN
    RAISE EXCEPTION 'customer inexistente deveria ser AVISO e a linha seguir ready: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'customer' AND z->>'severity' = 'warning') THEN
    RAISE EXCEPTION 'customer inexistente nao gerou aviso: %', v_row;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
              WHERE z->>'field' = 'customer' AND z->>'severity' = 'error') THEN
    RAISE EXCEPTION 'customer inexistente virou ERRO (invariante 5 quebrada): %', v_row;
  END IF;

  v_row := v_rows -> 3;
  IF (v_row->>'supplier_id')::uuid IS DISTINCT FROM v_supid
     OR v_row->>'counterparty_status' <> 'matched_supplier'
     OR v_row->>'customer_status' <> 'empty'
     OR v_row->>'supplier_status' <> 'empty' THEN
    RAISE EXCEPTION 'payload legado (counterparty) mudou de comportamento: %', v_row;
  END IF;

  v_row := v_rows -> 4;
  IF (v_row->>'customer_id')::uuid IS DISTINCT FROM v_cusid
     OR (v_row->>'supplier_id')::uuid IS DISTINCT FROM v_supid THEN
    RAISE EXCEPTION 'os dois lados juntos deveriam resolver os dois: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'code' = 'both_filled' AND z->>'severity' = 'warning') THEN
    RAISE EXCEPTION 'os dois lados juntos nao geraram aviso both_filled: %', v_row;
  END IF;

  RAISE NOTICE 'prova de comportamento OK (cliente=% / fornecedor=%)', v_cusnm, v_supnm;
END
$proof$;

NOTIFY pgrst, 'reload schema';

COMMIT;
