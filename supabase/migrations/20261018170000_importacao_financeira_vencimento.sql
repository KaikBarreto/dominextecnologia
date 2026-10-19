-- ===========================================================================
-- Importação financeira por planilha: coluna VENCIMENTO
-- ---------------------------------------------------------------------------
-- POR QUÊ
--   O molde entregue em 20261018121000 não tinha a coluna "Vencimento", mas o
--   formulário de lançamento do sistema EXIGE vencimento quando "Pago?" = Não.
--   Pra não gravar NULL (conta a pagar invisível: sai por último em toda lista
--   ordenada por vencimento) o apply INVENTAVA o valor:
--
--     CASE WHEN r.is_paid THEN NULL ELSE r.transaction_date END
--
--   Era remendo consciente, e ele erra feio: conta LANÇADA em 01/10 pra VENCER
--   em 15/11 entrava vencendo 01/10 — nascia atrasada, suja o contas a pagar e
--   o aging no primeiro relatório. O molde agora tem a coluna, então o
--   vencimento passa a vir do cliente.
--
-- O QUE MUDA (só ACRÉSCIMO: planilha e payload SEM a coluna seguem idênticos)
--   1. Cada item de `p_rows` aceita `due_date`: string ISO 'aaaa-mm-dd' ou
--      null. Igual a `date` e `paid_date`, o servidor NÃO reinterpreta formato
--      — quem normaliza serial do Excel e dd/mm/aaaa é o parser do cliente
--      (src/utils/financialImport/parseSheet.ts).
--   2. O tipo composto financial_import_resolved_row ganha `due_date date`
--      como ATRIBUTO 7, logo depois de `transaction_date`. É o que faz o
--      vencimento aparecer no retorno do preview — e a tela de conferência
--      renderiza de lá. Sem isso o cliente estaria gravando um vencimento que
--      nunca viu, e "o cliente confere antes de gravar" é invariante 1 do
--      módulo.
--   3. preview_financial_import devolve a chave `due_date` em cada item de
--      rows[], com o valor JÁ RESOLVIDO (não o texto cru).
--   4. apply_financial_import grava `r.due_date` direto. O invariante "linha
--      paga não tem vencimento" sai do INSERT e passa a ser garantido na
--      RESOLUÇÃO — é o que faz a tela mostrar exatamente o que vai ser gravado.
--
-- REGRA DE RESOLUÇÃO (contrato)
--   linha PAGA                       -> NULL   (não há vencimento a cobrar)
--   não paga + vencimento válido      -> o que o cliente escreveu
--   não paga + célula em branco       -> transaction_date (FALLBACK: é o que
--                                       mantém a planilha antiga importando)
--   não paga + texto que não é data   -> NULL + issue de ERRO (a linha nasce
--                                       `blocked`; nunca chutamos a data)
--   PAGA   + qualquer coisa escrita   -> NULL + issue de AVISO `ignored`
--
--   Os dois últimos ramos são MUTUAMENTE EXCLUSIVOS de propósito: numa linha
--   paga o vencimento é descartado por contrato, então texto estragado num
--   campo que vai pro lixo não pode BLOQUEAR um lançamento que no resto está
--   perfeito. Ele vira o mesmo aviso `ignored` que `paid_date` já emite em
--   linha não paga (espelho exato daquele ramo). Descartar em SILÊNCIO é que
--   não pode — mesma lei do arredondamento de `amount`.
--
-- O VENCIMENTO NÃO ENTRA NO DEDUP
--   content_key segue sendo (data, valor com sinal, descrição, conta). Dois
--   lançamentos iguais com vencimentos diferentes continuam sendo o MESMO
--   lançamento pro dedup. Mexer nisso mudaria o comportamento de arquivos já
--   importados e não foi pedido.
--
-- COMO
--   DROP TYPE ... CASCADE + recriação do tipo e das TRÊS funções. Não dá pra
--   usar ALTER TYPE ADD ATTRIBUTE (como fez 20261018150000) porque o atributo
--   novo tem que entrar no MEIO do tipo, na posição 7, e o SELECT final do
--   resolvedor é posicional. O CASCADE leva embora só
--   _financial_import_resolve (conferido em pg_depend: preview e apply não têm
--   dependência registrada no tipo, mas são recriadas de qualquer forma porque
--   as duas mudam de corpo). revert_financial_import não toca no tipo e fica
--   intacta.
--
--   ⚠️ DROP leva o GRANT junto, e no Supabase função nova em `public` nasce com
--   EXECUTE pra `anon` por ALTER DEFAULT PRIVILEGES (REVOKE FROM PUBLIC não
--   tira isso). Por isso o bloco 5 revoga `anon` NOMINALMENTE e o bloco 6
--   ABORTA O COMMIT se sobrar privilégio.
-- ===========================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ===========================================================================
-- 1. TIPO DE RETORNO: 43 atributos (os 42 de 20261018150000 + `due_date` na
--    posição 7). A ORDEM É CONTRATO — o SELECT final do resolvedor é
--    posicional, então atributo fora de lugar grava dado na coluna errada.
-- ===========================================================================

DROP TYPE IF EXISTS public.financial_import_resolved_row CASCADE;

CREATE TYPE public.financial_import_resolved_row AS (
  row_number            integer,  --  1
  content_key           text,     --  2
  batch_rank            integer,  --  3
  existing_count        integer,  --  4
  status                text,     --  5
  transaction_date      date,     --  6
  due_date              date,     --  7  ← NOVO (20261018170000)
  transaction_type      text,     --  8
  description           text,     --  9
  amount                numeric,  -- 10
  signed_amount         numeric,  -- 11
  is_paid               boolean,  -- 12
  paid_date             date,     -- 13
  notes                 text,     -- 14
  category_input        text,     -- 15
  category_id           uuid,     -- 16
  category_name         text,     -- 17
  category_status       text,     -- 18
  account_input         text,     -- 19
  account_id            uuid,     -- 20
  account_name          text,     -- 21
  account_type          text,     -- 22
  account_status        text,     -- 23
  cost_center_input     text,     -- 24
  cost_center_id        uuid,     -- 25
  cost_center_name      text,     -- 26
  cost_center_status    text,     -- 27
  payment_method_input  text,     -- 28
  payment_method        text,     -- 29
  payment_method_status text,     -- 30
  counterparty_input    text,     -- 31
  customer_id           uuid,     -- 32
  supplier_id           uuid,     -- 33
  counterparty_name     text,     -- 34
  counterparty_status   text,     -- 35
  is_duplicate          boolean,  -- 36
  issues                jsonb,    -- 37
  customer_input        text,     -- 38
  customer_name         text,     -- 39
  customer_status       text,     -- 40
  supplier_input        text,     -- 41
  supplier_name         text,     -- 42
  supplier_status       text      -- 43
);

COMMENT ON TYPE public.financial_import_resolved_row IS
  'Linha da planilha JÁ RESOLVIDA (catálogo da empresa, dedup, issues). Retorno de _financial_import_resolve. A ordem dos atributos é CONTRATO: o SELECT final do resolvedor é posicional. `due_date` é o atributo 7, acrescentado em 20261018170000.';

-- ===========================================================================
-- 2. RESOLVEDOR. Interna: continua SEM grant pra authenticated — ela recebe
--    company_id como PARÂMETRO e não valida tenant, dar grant ali abriria o
--    catálogo de qualquer empresa.
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
      -- Data, VENCIMENTO e valor chegam JÁ normalizados pelo parser
      -- (parseSheet.ts resolve serial do Excel, dd/mm/aaaa e R$ 1.234,56). O
      -- servidor NÃO reinterpreta formato: aceita só o canônico e marca o resto
      -- pra conferência.
      CASE WHEN btrim(coalesce(r.elem->>'date', '')) ~ '^\d{4}-\d{2}-\d{2}$'
           THEN (btrim(r.elem->>'date'))::date END AS d_date,
      -- VENCIMENTO (coluna nova do molde). `in_due` guarda o texto cru só pra
      -- distinguir "célula em branco" (= usa o fallback, planilha antiga segue
      -- importando) de "escreveu algo que não é data" (= erro, nunca chute).
      nullif(btrim(coalesce(r.elem->>'due_date', '')), '')       AS in_due,
      CASE WHEN btrim(coalesce(r.elem->>'due_date', '')) ~ '^\d{4}-\d{2}-\d{2}$'
           THEN (btrim(r.elem->>'due_date'))::date END AS d_due_date,
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
      CASE WHEN v.d_is_paid THEN coalesce(v.d_paid_date, v.d_date) END AS pay_date,
      -- VENCIMENTO RESOLVIDO (contrato de 20261018170000). Antes desta
      -- migration o apply inventava `transaction_date` pra toda linha não paga,
      -- e conta lançada em 01/10 pra vencer em 15/11 nascia ATRASADA.
      --   linha PAGA                        -> NULL (não há vencimento a cobrar)
      --   não paga + vencimento válido       -> o que o cliente escreveu
      --   não paga + célula em branco        -> cai na data do lançamento
      --                                        (compatibilidade: molde antigo,
      --                                        sem a coluna, segue importando)
      --   não paga + texto que não é data    -> NULL, e a linha nasce `blocked`
      --                                        pelo issue de erro (sem chute)
      -- ⚠️ O invariante "linha paga não tem vencimento" passou a ser garantido
      -- AQUI, na resolução. O apply grava r.due_date direto, sem CASE.
      CASE
        WHEN v.d_is_paid                                     THEN NULL
        WHEN v.in_due IS NOT NULL AND v.d_due_date IS NULL    THEN NULL
        ELSE coalesce(v.d_due_date, v.d_date)
      END AS due_date_res
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
        -- ── vencimento ───────────────────────────────────────────────
        -- Os dois ramos são MUTUAMENTE EXCLUSIVOS de propósito. Numa linha PAGA
        -- o vencimento é descartado por contrato: texto estragado num campo que
        -- vai pro lixo não pode BLOQUEAR um lançamento que, no resto, está
        -- perfeito. Ele vira o MESMO aviso `ignored` de sempre — descartar em
        -- silêncio é que não pode (mesma lei do arredondamento de `amount`).
     || CASE
          WHEN q.d_is_paid IS NOT TRUE AND q.in_due IS NOT NULL AND q.d_due_date IS NULL
            THEN jsonb_build_array(jsonb_build_object(
                   'field', 'due_date', 'code', 'invalid', 'severity', 'error',
                   'message', 'Vencimento "' || coalesce(q.in_due, '') || '" não deu para ler como data. Use dd/mm/aaaa ou deixe a célula em branco para usar a data do lançamento.'))
          WHEN q.d_is_paid IS TRUE AND q.in_due IS NOT NULL
            THEN jsonb_build_array(jsonb_build_object(
                   'field', 'due_date', 'code', 'ignored', 'severity', 'warning',
                   'message', 'A linha está marcada como PAGA, então o vencimento foi ignorado — lançamento já pago não tem vencimento a cobrar.'))
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
    -- atributo 7 do tipo: VENCIMENTO, logo depois de transaction_date. A tela de
    -- conferência renderiza do retorno do preview — sem ele o cliente gravaria
    -- um vencimento que nunca viu.
    f.due_date_res,
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

VENCIMENTO (`due_date`, a partir de 20261018170000). Entra em p_rows[].due_date
como 'aaaa-mm-dd' (o servidor não reinterpreta formato) e sai no atributo 7 do
tipo, JÁ RESOLVIDO:
  linha PAGA                      -> NULL (não há vencimento a cobrar)
  não paga + vencimento válido     -> o que o cliente escreveu
  não paga + célula em branco       -> transaction_date (fallback que mantém a
                                      planilha sem a coluna importando)
  não paga + texto que não é data   -> NULL + issue de ERRO (linha `blocked`)
  PAGA   + qualquer coisa escrita   -> NULL + issue de AVISO `ignored`
O vencimento NÃO participa do content_key: o dedup continua sendo (data, valor
com sinal, descrição, conta).

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
-- 3. PREVIEW. O builder do JSON ENUMERA campo por campo e RENOMEIA
--    transaction_date -> 'date', então a chave `due_date` tem que ser
--    adicionada na mão: nada sai de graça de to_jsonb aqui.
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
        -- Vencimento JÁ RESOLVIDO (fallback e regra de linha paga aplicados).
        -- O front consome a chave `due_date`; este builder enumera campo por
        -- campo e renomeia transaction_date -> 'date', logo nada sai de graça.
        'due_date',              r.due_date,
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

Cada item de p_rows aceita: row_number, date (aaaa-mm-dd), due_date
(aaaa-mm-dd, opcional), type, description, amount, paid_date, is_paid, notes,
category|category_id, account|account_id, cost_center|cost_center_id,
payment_method, customer|customer_id, supplier|supplier_id e counterparty
(legado).

Cada item de rows[] traz a chave `due_date` com o vencimento JÁ RESOLVIDO
(fallback da linha não paga e NULL da linha paga aplicados) — é o valor que o
apply vai gravar, e é por isso que a tela de conferência pode mostrá-lo como
verdade. Vencimento ilegível em linha não paga vira issue de ERRO
(field 'due_date', code 'invalid'); vencimento escrito em linha paga vira AVISO
(code 'ignored').

Traz também customer_input, customer_name, customer_status, supplier_input,
supplier_name, supplier_status — vocabulário 'ok' | 'empty' | 'not_found' |
'ambiguous'. customer_id/supplier_id são os vínculos finais já com a
precedência aplicada (uuid > nome do campo próprio > counterparty, por lado).
counterparty_input/name/status seguem inalterados.$doc$;

-- ===========================================================================
-- 4. APPLY. Único ponto que muda de verdade: grava r.due_date em vez de
--    inventar transaction_date.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.apply_financial_import(p_file_name text, p_file_hash text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company   uuid;
  v_hash      text;
  v_count     integer;
  v_existing  public.financial_imports%ROWTYPE;
  v_import_id uuid;
  v_ready     integer;
  v_dup       integer;
  v_blocked   integer;
  v_in        numeric;
  v_out       numeric;
  v_samples   jsonb;
  v_created   integer;
  v_linked    integer;
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
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'Arquivo sem identificação: não é possível garantir que ele não entre duas vezes.'
      USING ERRCODE = '22023';
  END IF;

  -- Trava de concorrência: dois cliques no "Importar" (ou duas abas) não podem
  -- inserir o mesmo arquivo em paralelo. O UNIQUE pegaria o segundo com 23505,
  -- mas depois de ele já ter criado os lançamentos.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text || '|' || v_hash, 0));

  SELECT * INTO v_existing
    FROM public.financial_imports
   WHERE company_id = v_company AND file_hash = v_hash
   FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'applied' THEN
    -- 1ª trava: arquivo idêntico. NADA é inserido e o import_id devolvido é o
    -- que já existia — o cliente pode reimportar sem medo (prometido no molde).
    RETURN jsonb_build_object(
      'already_imported',      true,
      'import_id',             v_existing.id,
      'row_count',             v_existing.row_count,
      'created_count',         0,
      'skipped_count',         v_count,
      'skipped_dup_count',     v_count,
      'skipped_invalid_count', 0,
      'skipped_samples',       '[]'::jsonb,
      'total_in',              0,
      'total_out',             0
    );
  END IF;

  -- ⚠️ ORDEM IMPORTA: o resumo é calculado ANTES de qualquer INSERT. O
  -- resolvedor conta quantas movimentações iguais JÁ existem; se ele rodasse
  -- depois da gravação, as linhas recém-criadas contariam como "existentes" e
  -- tudo viraria `duplicate` no relatório.
  SELECT count(*) FILTER (WHERE r.status = 'ready')::integer,
         count(*) FILTER (WHERE r.status = 'duplicate')::integer,
         count(*) FILTER (WHERE r.status = 'blocked')::integer,
         coalesce(SUM(r.amount) FILTER (WHERE r.status = 'ready' AND r.transaction_type = 'entrada'), 0),
         coalesce(SUM(r.amount) FILTER (WHERE r.status = 'ready' AND r.transaction_type = 'saida'), 0)
    INTO v_ready, v_dup, v_blocked, v_in, v_out
    FROM public._financial_import_resolve(v_company, coalesce(p_rows, '[]'::jsonb)) r;

  -- Amostra do que pulou. NADA é descartado em silêncio (invariante 3).
  SELECT coalesce(jsonb_agg(s.js ORDER BY s.rn), '[]'::jsonb)
    INTO v_samples
  FROM (
    SELECT r.row_number AS rn,
           jsonb_build_object(
             'row_number',  r.row_number,
             'date',        r.transaction_date,
             'amount',      r.amount,
             'description', r.description,
             'reason',      CASE WHEN r.status = 'duplicate' THEN 'duplicate' ELSE 'invalid' END,
             'message',     CASE
                              WHEN r.status = 'duplicate'
                                THEN 'Esta movimentação já existe no sistema (mesma data, valor, descrição e conta).'
                              ELSE coalesce(
                                     (SELECT z->>'message'
                                        FROM jsonb_array_elements(r.issues) z
                                       WHERE z->>'severity' = 'error'
                                       LIMIT 1),
                                     'Linha com informação faltando.')
                            END
           ) AS js
      FROM public._financial_import_resolve(v_company, coalesce(p_rows, '[]'::jsonb)) r
     WHERE r.status <> 'ready'
     ORDER BY r.row_number
     LIMIT 20
  ) s;

  IF v_existing.id IS NOT NULL THEN
    -- Import REVERTIDO por completo: reaproveita a linha (o UNIQUE
    -- (company_id, file_hash) continua valendo) em vez de criar outra.
    v_import_id := v_existing.id;
    DELETE FROM public.financial_import_rows WHERE import_id = v_import_id;
    UPDATE public.financial_imports
       SET file_name     = coalesce(nullif(btrim(coalesce(p_file_name, '')), ''), file_name),
           source        = 'xlsx',
           row_count     = v_count,
           created_count = 0,
           skipped_count = v_count,
           status        = 'applied',
           created_by    = auth.uid(),
           created_at    = now(),
           reverted_at   = NULL,
           reverted_by   = NULL
     WHERE id = v_import_id;
  ELSE
    INSERT INTO public.financial_imports (
      company_id, file_name, file_hash, source, row_count, created_count, skipped_count,
      status, created_by
    ) VALUES (
      v_company,
      nullif(btrim(coalesce(p_file_name, '')), ''),
      v_hash,
      'xlsx',
      v_count, 0, v_count,
      'applied', auth.uid()
    )
    RETURNING id INTO v_import_id;
  END IF;

  -- Gravação em UM statement. O uuid do lançamento é gerado na CTE pra a tabela
  -- de ligação poder referenciá-lo: RETURNING não devolveria o row_number da
  -- origem, e sem ele o "desfazer" não saberia o que apagar.
  -- A FK de financial_import_rows é checada no FIM do statement, quando as
  -- linhas de financial_transactions já existem.
  WITH r AS (
    SELECT gen_random_uuid() AS tx_id, x.*
      FROM public._financial_import_resolve(v_company, coalesce(p_rows, '[]'::jsonb)) x
     WHERE x.status = 'ready'
  ),
  ins_tx AS (
    INSERT INTO public.financial_transactions (
      id, company_id, account_id, transaction_type, amount, description, notes,
      category, cost_center_id, customer_id, supplier_id, payment_method,
      transaction_date, due_date, paid_date, is_paid, created_by
    )
    SELECT
      r.tx_id,
      v_company,
      r.account_id,
      r.transaction_type::public.transaction_type,
      r.amount,
      r.description,
      r.notes,
      -- `category` guarda o NOME copiado do cadastro (coluna text, não é FK) —
      -- mesma convenção de 20261018005000 e de reconcile_create_transaction.
      r.category_name,
      r.cost_center_id,
      r.customer_id,
      r.supplier_id,
      r.payment_method,
      r.transaction_date,
      -- VENCIMENTO: o que o resolvedor devolveu, sem reinterpretar nada aqui.
      -- Antes de 20261018170000 este INSERT fazia
      --   CASE WHEN r.is_paid THEN NULL ELSE r.transaction_date END
      -- porque o molde não tinha a coluna — conta lançada em 01/10 pra vencer
      -- em 15/11 nascia ATRASADA. Agora a coluna existe e o invariante "linha
      -- paga não tem vencimento" é garantido na RESOLUÇÃO, não no INSERT: o
      -- cliente confere na tela exatamente o valor que vai ser gravado.
      r.due_date,
      r.paid_date,
      r.is_paid,
      auth.uid()
    FROM r
    RETURNING id
  ),
  ins_rows AS (
    INSERT INTO public.financial_import_rows (
      import_id, company_id, financial_transaction_id, row_number, content_key
    )
    SELECT v_import_id, v_company, r.tx_id, r.row_number, r.content_key
      FROM r
    RETURNING id
  )
  SELECT (SELECT count(*)::integer FROM ins_tx), (SELECT count(*)::integer FROM ins_rows)
    INTO v_created, v_linked;

  v_created := coalesce(v_created, 0);
  v_linked  := coalesce(v_linked, 0);

  -- Prova em runtime de que o resolvedor é determinístico dentro da transação:
  -- se o resumo e a gravação discordarem, a importação ABORTA em vez de
  -- entregar um relatório que não descreve o que entrou.
  IF v_created <> coalesce(v_ready, 0) OR v_linked <> v_created THEN
    RAISE EXCEPTION 'Importação abortada por inconsistência interna (previa %, gravou %, vinculou %). Nada foi gravado.',
      coalesce(v_ready, 0), v_created, v_linked
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.financial_imports
     SET created_count = v_created,
         skipped_count = v_count - v_created
   WHERE id = v_import_id;

  RETURN jsonb_build_object(
    'already_imported',      false,
    'import_id',             v_import_id,
    'row_count',             v_count,
    'created_count',         v_created,
    'skipped_count',         v_count - v_created,
    'skipped_dup_count',     coalesce(v_dup, 0),
    'skipped_invalid_count', coalesce(v_blocked, 0),
    'skipped_samples',       coalesce(v_samples, '[]'::jsonb),
    'total_in',              round(coalesce(v_in, 0), 2),
    'total_out',             round(coalesce(v_out, 0), 2)
  );
END;
$function$;

COMMENT ON FUNCTION public.apply_financial_import(text, text, jsonb) IS
$doc$Grava a importação financeira. Idempotente por (company_id, file_hash):
arquivo idêntico já aplicado devolve already_imported=true sem inserir nada;
import revertido reaproveita a linha. O resumo é calculado ANTES do INSERT e
conferido depois (previa/gravou/vinculou) — divergência ABORTA tudo.

p_rows tem o mesmo shape de preview_financial_import, incluindo `due_date`
(coluna Vencimento do molde), os campos `customer` e `supplier` (molde de duas
colunas) e o `counterparty` legado.

financial_transactions.due_date recebe o vencimento JÁ RESOLVIDO pelo
resolvedor, sem reinterpretação aqui. Até 20261018170000 este INSERT inventava
`CASE WHEN is_paid THEN NULL ELSE transaction_date END` porque o molde não tinha
a coluna, e conta lançada em 01/10 pra vencer em 15/11 nascia ATRASADA. O
invariante "linha paga não tem vencimento" agora é garantido na resolução — o
que a tela de conferência mostra é byte a byte o que é gravado.

O vínculo gravado em financial_transactions.customer_id / .supplier_id é o que o
resolvedor devolve, com a precedência por lado: uuid > nome do campo próprio >
counterparty. Contraparte não encontrada NÃO impede a gravação (aviso).$doc$;

-- ===========================================================================
-- 5. GRANTS. O DROP do bloco 1 levou TODOS os privilégios embora, então aqui
--    não é "reafirmar": é reconstruir. `anon` é revogado NOMINALMENTE porque o
--    default privilege do Supabase CONCEDE EXECUTE a ele em função nova de
--    public, e REVOKE FROM PUBLIC não tira grant de papel nomeado.
-- ===========================================================================

DO $grants$
DECLARE
  v_sig text;
BEGIN
  -- Interna: ninguém além do dono (e do service_role, por default privilege).
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
-- 6. PROVA, dentro da própria transação. Se algo escapar, NÃO COMMITA.
-- ===========================================================================

DO $proof$
DECLARE
  v_n      integer;
  v_t      text;
  v_rows   jsonb;
  v_row    jsonb;
  v_co     uuid;
  v_catnm  text;
  v_accnm  text;
BEGIN
  -- 1. O tipo tem 43 atributos e `due_date date` é o 7º, logo depois de
  --    transaction_date. Posição errada = dado na coluna errada (SELECT
  --    posicional), então isto é prova de corretude, não de estilo.
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financial_import_resolved_row'::regclass
     AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_n <> 43 THEN
    RAISE EXCEPTION 'financial_import_resolved_row tem % atributos, esperado 43', v_n;
  END IF;

  SELECT a.attname || ' ' || a.atttypid::regtype::text INTO v_t
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financial_import_resolved_row'::regclass
     AND a.attnum = 7 AND NOT a.attisdropped;
  IF v_t IS DISTINCT FROM 'due_date date' THEN
    RAISE EXCEPTION 'atributo 7 do tipo e "%", esperado "due_date date"', coalesce(v_t, '<vazio>');
  END IF;

  SELECT a.attname INTO v_t
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financial_import_resolved_row'::regclass
     AND a.attnum = 6 AND NOT a.attisdropped;
  IF v_t IS DISTINCT FROM 'transaction_date' THEN
    RAISE EXCEPTION 'atributo 6 do tipo e "%", esperado "transaction_date"', coalesce(v_t, '<vazio>');
  END IF;

  -- 2. O DROP levou os GRANTs; o bloco 5 tinha que reconstruir. `anon` é o que
  --    mais importa: função nova em public NASCE com EXECUTE pra ele.
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
  IF NOT has_function_privilege('service_role', 'public.preview_financial_import(text, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.apply_financial_import(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE nas RPCs do contrato';
  END IF;

  -- 3. revert_financial_import sobreviveu ao CASCADE.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'revert_financial_import') THEN
    RAISE EXCEPTION 'revert_financial_import desapareceu — o CASCADE levou mais do que devia';
  END IF;

  -- 4. Payload vazio não explode.
  PERFORM 1 FROM public._financial_import_resolve(
    '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);

  -- 5. COMPORTAMENTO: os 5 ramos da regra de vencimento, com categoria e conta
  --    REAIS (as duas são OBRIGATÓRIAS — sem elas toda linha nasce `blocked` e
  --    a prova de que o vencimento válido segue `ready` não provaria nada).
  --    Homônimos são excluídos: ambiguidade estragaria a asserção. Sem fixture
  --    a prova é pulada (banco novo). SOMENTE LEITURA: o resolvedor é STABLE.
  SELECT k.company_id, k.name, a.name
    INTO v_co, v_catnm, v_accnm
    FROM public.financial_categories k
    JOIN public.financial_accounts a
      ON a.company_id = k.company_id AND a.is_active AND a.type <> 'cartao'
   WHERE k.is_active AND k.type IN ('saida', 'ambos')
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
    RAISE NOTICE 'sem categoria+conta para a prova de comportamento — pulada';
    RETURN;
  END IF;

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.row_number) INTO v_rows
    FROM public._financial_import_resolve(v_co, jsonb_build_array(
      -- 1: NÃO paga, vencimento válido → usa o que o cliente escreveu
      jsonb_build_object('row_number', 1, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'venc valido nao pago', 'amount', '10',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'false', 'due_date', '2099-02-15'),
      -- 2: NÃO paga, vencimento vazio → FALLBACK na data do lançamento
      jsonb_build_object('row_number', 2, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'venc vazio nao pago', 'amount', '20',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'false'),
      -- 3: PAGA com vencimento preenchido → NULL + aviso `ignored`
      jsonb_build_object('row_number', 3, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'venc em linha paga', 'amount', '30',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'true', 'due_date', '2099-02-15'),
      -- 4: NÃO paga, texto que não é data → NULL + ERRO (linha `blocked`)
      jsonb_build_object('row_number', 4, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'venc ilegivel nao pago', 'amount', '40',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'false', 'due_date', '15 de fevereiro'),
      -- 5: PAGA com texto ilegível → o aviso `ignored` VENCE o erro (contrato)
      jsonb_build_object('row_number', 5, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'venc ilegivel em linha paga', 'amount', '50',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'true', 'due_date', '15 de fevereiro')
    )) r;

  v_row := v_rows -> 0;
  IF v_row->>'due_date' IS DISTINCT FROM '2099-02-15'
     OR v_row->>'status' <> 'ready'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z WHERE z->>'field' = 'due_date') THEN
    RAISE EXCEPTION 'vencimento valido em linha nao paga resolveu errado: %', v_row;
  END IF;

  v_row := v_rows -> 1;
  IF v_row->>'due_date' IS DISTINCT FROM '2099-01-01'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z WHERE z->>'field' = 'due_date') THEN
    RAISE EXCEPTION 'fallback do vencimento vazio quebrou (planilha antiga pararia de importar): %', v_row;
  END IF;

  v_row := v_rows -> 2;
  IF v_row->>'due_date' IS NOT NULL THEN
    RAISE EXCEPTION 'linha PAGA nao pode ter vencimento: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'due_date' AND z->>'code' = 'ignored' AND z->>'severity' = 'warning') THEN
    RAISE EXCEPTION 'vencimento em linha paga tinha que gerar aviso ignored: %', v_row;
  END IF;
  IF v_row->>'status' <> 'ready' THEN
    RAISE EXCEPTION 'aviso de vencimento ignorado nao pode bloquear a linha: %', v_row;
  END IF;

  v_row := v_rows -> 3;
  IF v_row->>'due_date' IS NOT NULL THEN
    RAISE EXCEPTION 'vencimento ilegivel nao pode virar chute: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'due_date' AND z->>'code' = 'invalid' AND z->>'severity' = 'error') THEN
    RAISE EXCEPTION 'vencimento ilegivel em linha nao paga tinha que gerar ERRO: %', v_row;
  END IF;
  IF v_row->>'status' <> 'blocked' THEN
    RAISE EXCEPTION 'linha com vencimento ilegivel tinha que nascer blocked: %', v_row;
  END IF;

  v_row := v_rows -> 4;
  IF v_row->>'status' <> 'ready'
     OR v_row->>'due_date' IS NOT NULL
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                 WHERE z->>'field' = 'due_date' AND z->>'severity' = 'error') THEN
    RAISE EXCEPTION 'linha PAGA com vencimento ilegivel nao pode ser bloqueada (o campo vai pro lixo): %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'due_date' AND z->>'code' = 'ignored') THEN
    RAISE EXCEPTION 'linha PAGA com vencimento ilegivel tinha que avisar, nunca descartar calada: %', v_row;
  END IF;

  RAISE NOTICE 'prova de comportamento do vencimento OK (5 ramos, categoria=% / conta=%)', v_catnm, v_accnm;
END
$proof$;

NOTIFY pgrst, 'reload schema';

COMMIT;
