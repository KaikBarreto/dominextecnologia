-- ===========================================================================
-- Importação financeira por planilha: CAST DE DATA À PROVA DE ESTOURO
-- ---------------------------------------------------------------------------
-- POR QUÊ (bug de produção, pré-existente desde 20261018121000)
--   O guard das três datas do payload era só um regex de FORMA:
--
--     CASE WHEN btrim(coalesce(r.elem->>'date','')) ~ '^\d{4}-\d{2}-\d{2}$'
--          THEN (btrim(r.elem->>'date'))::date END
--
--   '2099-13-45' CASA com esse regex (4 dígitos, 2, 2) e estoura no `::date`:
--
--     ERROR: 22008: date/time field value out of range: "2099-13-45"
--     CONTEXT: SQL function "_financial_import_resolve" statement 1
--
--   Resultado: a CONFERÊNCIA INTEIRA morria com erro 500 em vez daquela única
--   linha virar um issue. Uma célula ruim derrubava as outras 4.999, e o
--   cliente não tinha como saber qual era — a tela não mostra nada, só falha.
--   Vale pros TRÊS campos de data: `date`, `paid_date` e `due_date`.
--
-- O QUE MUDA
--   1. Helper novo public.ft_try_parse_iso_date(text) -> date: mesmo regex de
--      antes como filtro (o contrato continua sendo SÓ o canônico 'aaaa-mm-dd'
--      — quem normaliza serial do Excel e dd/mm/aaaa é o parser do cliente,
--      src/utils/financialImport/parseSheet.ts), mas com o cast PROTEGIDO.
--      Texto impossível devolve NULL em vez de abortar.
--   2. Os três guards de _financial_import_resolve passam a chamar o helper.
--      Pra ENTRADA VÁLIDA o resultado é IDÊNTICO ao de antes — a única
--      diferença observável é que lixo tipo '2099-13-45' virou issue em vez de
--      derrubar a chamada. Cada campo mantém a consequência que já tinha:
--        date     NULL -> issue de ERRO, linha nasce `blocked` (igual a hoje)
--        paid_date NULL em linha paga -> pay_date cai em transaction_date
--        due_date NULL em linha não paga -> fallback em transaction_date, ou
--                 issue `invalid`/error se o cliente escreveu algo ilegível
--                 (regra de 20261018170000, NÃO reescrita aqui)
--   3. `paid_date` ILEGÍVEL passa a AVISAR. Até agora era descartado em
--      SILÊNCIO: linha paga com data de pagamento impossível gravava a data do
--      lançamento como data do pagamento sem dizer nada — a mesma invenção
--      silenciosa de dado que o vencimento tinha antes da 20261018170000.
--      Agora é issue {field:'paid_date', code:'invalid', severity:'warning'}.
--      WARNING e não error DE PROPÓSITO: em linha paga o fallback pra data do
--      lançamento é aceitável e não pode BLOQUEAR um lançamento que no resto
--      está perfeito. O que não pode é ser calado (mesma lei do arredondamento
--      de `amount`). Em linha NÃO paga continua sendo o aviso `ignored`, que
--      agora também cobre o texto ilegível (antes só o legível avisava).
--
-- COMO — e por que NÃO houve DROP TYPE aqui
--   Nenhum atributo novo entra em financial_import_resolved_row (o issue de
--   paid_date vai dentro de `issues`, que já existe), então não há motivo pra
--   DROP TYPE ... CASCADE: basta CREATE OR REPLACE FUNCTION no resolvedor, que
--   PRESERVA os GRANTs. preview_financial_import e apply_financial_import NÃO
--   são recriadas — elas não parseiam data nenhuma, consomem o que o
--   resolvedor devolve. Mexer nelas sem necessidade só aumentaria a área de
--   risco de uma correção de bug.
--
--   ⚠️ No Supabase função NOVA em `public` pode nascer com EXECUTE pra `anon`
--   (ALTER DEFAULT PRIVILEGES; REVOKE FROM PUBLIC não tira grant de papel
--   nomeado). Por isso o bloco 3 revoga `anon` NOMINALMENTE do helper e o
--   bloco 4 ABORTA O COMMIT se sobrar privilégio em qualquer uma das quatro.
-- ===========================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ===========================================================================
-- 1. HELPER: parse ISO com cast protegido.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.ft_try_parse_iso_date(p_text text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txt text := btrim(p_text);
BEGIN
  -- Filtro de FORMA primeiro, e de propósito: o contrato do servidor é SÓ o
  -- canônico 'aaaa-mm-dd'. Sem o regex o `::date` aceitaria 'hoje',
  -- '10/11/2026' e 'Jan 5 2026' — adivinhação de formato é do parser do
  -- cliente, não daqui. Também evita entrar no bloco de exceção (= abrir
  -- subtransação) pra toda célula de texto livre.
  IF v_txt !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;

  -- O regex olha a FORMA, não a VALIDADE: '2099-13-45' e '2099-02-30' passam
  -- por ele e estouram no cast. É exatamente isso que derrubava a conferência
  -- inteira com 22008. Aqui a linha ruim vira NULL e o chamador decide o que
  -- fazer (issue), em vez do lote morrer.
  BEGIN
    RETURN v_txt::date;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN NULL;
  END;
END;
$function$;

COMMENT ON FUNCTION public.ft_try_parse_iso_date(text) IS
$doc$Converte texto em date SÓ quando ele é um ISO 'aaaa-mm-dd' realmente
válido; devolve NULL em qualquer outro caso, inclusive quando o texto tem a
forma certa mas a data não existe ('2099-13-45', '2026-02-30').

Existe porque o guard anterior da importação financeira era apenas
`~ '^\d{4}-\d{2}-\d{2}$'` seguido de `::date`: a forma casava, o cast estourava
com 22008 (date/time field value out of range) e a CONFERÊNCIA INTEIRA voltava
erro 500 — uma célula ruim derrubava as outras 4.999. Com o helper a célula ruim
vira issue na linha dela.

NÃO adivinha formato (não aceita 'hoje', '10/11/2026' nem 'Jan 5 2026'): isso é
papel do parser do cliente (src/utils/financialImport/parseSheet.ts). IMMUTABLE
é legítimo porque o regex restringe a entrada ao ISO 8601, que o Postgres lê
igual em qualquer DateStyle.$doc$;

-- ===========================================================================
-- 2. RESOLVEDOR. CREATE OR REPLACE (mesma assinatura, mesmo tipo de retorno):
--    preserva os GRANTs, e o tipo composto não é tocado.
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
      --
      -- ⚠️ Os TRÊS campos de data passam pelo helper de parse seguro (bloco 1
      -- desta migration), nunca por `~ regex` + `::date` direto. Antes de
      -- 20261018180000 era regex + cast cru aqui, e o regex só olha a FORMA:
      -- '2099-13-45' tem
      -- 4-2-2 dígitos, casava, e o cast seguinte estourava com 22008
      -- (date/time field value out of range) — ABORTANDO A CONFERÊNCIA INTEIRA.
      -- Uma célula ruim derrubava as outras 4.999 com erro 500. O helper
      -- mantém o mesmo regex como filtro e devolve NULL quando o cast falha,
      -- então a linha ruim vira ISSUE em vez de matar o lote (20261018180000).
      public.ft_try_parse_iso_date(r.elem->>'date')      AS d_date,
      -- VENCIMENTO (coluna nova do molde). `in_due` guarda o texto cru só pra
      -- distinguir "célula em branco" (= usa o fallback, planilha antiga segue
      -- importando) de "escreveu algo que não é data" (= erro, nunca chute).
      nullif(btrim(coalesce(r.elem->>'due_date', '')), '')       AS in_due,
      public.ft_try_parse_iso_date(r.elem->>'due_date')  AS d_due_date,
      lower(btrim(coalesce(r.elem->>'type', ''))) AS d_type_raw,
      nullif(btrim(coalesce(r.elem->>'description', '')), '') AS d_desc,
      CASE WHEN btrim(coalesce(r.elem->>'amount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (btrim(r.elem->>'amount'))::numeric END AS d_amount,
      -- DATA DE PAGAMENTO. `in_paid` guarda o texto cru pelo MESMO motivo de
      -- `in_due`: distinguir "celula em branco" (fallback silencioso e
      -- legitimo) de "escreveu algo que nao da pra ler" (tem que AVISAR).
      nullif(btrim(coalesce(r.elem->>'paid_date', '')), '')      AS in_paid,
      public.ft_try_parse_iso_date(r.elem->>'paid_date') AS d_paid_date,
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
        -- ── data de pagamento ───────────────────────────────────────────
        -- Espelho EXATO do bloco de vencimento logo abaixo, e pelo mesmo
        -- motivo: ramos MUTUAMENTE EXCLUSIVOS por `is_paid`, e nada é
        -- descartado em silêncio (mesma lei do arredondamento de `amount`).
        --   NÃO paga + qualquer coisa escrita  -> AVISO `ignored` (a célula vai
        --      pro lixo por contrato; antes de 20261018180000 o texto ILEGÍVEL
        --      não avisava nada, só o legível avisava)
        --   PAGA    + texto que não é data     -> AVISO `invalid`, porque o
        --      pay_date cai na data do lançamento (coalesce(d_paid_date,
        --      d_date) em `shaped`). Inventar a data do pagamento calado é a
        --      mesma invenção silenciosa que o vencimento tinha. É AVISO e não
        --      erro de propósito: em linha paga o fallback pra data do
        --      lançamento é aceitável e não pode BLOQUEAR um lançamento que no
        --      resto está perfeito.
     || CASE
          WHEN q.d_is_paid IS NOT TRUE AND q.in_paid IS NOT NULL
            THEN jsonb_build_array(jsonb_build_object(
                   'field', 'paid_date', 'code', 'ignored', 'severity', 'warning',
                   'message', 'A linha está marcada como NÃO paga, então a data de pagamento foi ignorada.'))
          WHEN q.d_is_paid IS TRUE AND q.in_paid IS NOT NULL AND q.d_paid_date IS NULL
            THEN jsonb_build_array(jsonb_build_object(
                   'field', 'paid_date', 'code', 'invalid', 'severity', 'warning',
                   'message', 'Data de pagamento "' || coalesce(q.in_paid, '') || '" não deu para ler como data. Usamos a data do lançamento como data do pagamento — corrija a célula se não for isso.'))
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

PARSE DE DATA (a partir de 20261018180000). `date`, `paid_date` e `due_date`
passam por public.ft_try_parse_iso_date: mesmo regex 'aaaa-mm-dd' de antes, mas
o cast é protegido. '2099-13-45' casa com o regex e estourava 22008
(date/time field value out of range), matando a conferência INTEIRA com erro
500 — uma célula ruim derrubava as outras 4.999. Agora texto impossível resolve
NULL e cada campo segue a consequência que já tinha (data ausente bloqueia a
linha; vencimento e data de pagamento avisam).

DATA DE PAGAMENTO ilegível passou a AVISAR (field 'paid_date'): em linha PAGA é
code 'invalid' severidade warning, porque pay_date cai na data do lançamento e
inventar data de pagamento em silêncio é a mesma falta do vencimento; em linha
NÃO paga é o code 'ignored' de sempre. Nenhum dos dois bloqueia.

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
-- 3. GRANTS. CREATE OR REPLACE preservou os privilégios do resolvedor, então
--    aqui é REAFIRMAÇÃO (idempotente) — e, pro helper NOVO, é o que fecha a
--    porta do `anon`.
-- ===========================================================================

DO $grants$
DECLARE
  v_sig text;
BEGIN
  -- Internas: ninguém além do dono (e do service_role, por default privilege).
  -- O helper não precisa de grant pra authenticated: quem o chama é
  -- _financial_import_resolve, que é SECURITY DEFINER — a checagem de EXECUTE
  -- lá dentro usa o DONO da função, não quem chamou a RPC. Mesma razão pela
  -- qual authenticated nunca teve EXECUTE no resolvedor e a importação sempre
  -- funcionou.
  FOREACH v_sig IN ARRAY ARRAY[
    'public._financial_import_resolve(uuid, jsonb)',
    'public.ft_try_parse_iso_date(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
  END LOOP;

  -- RPC do contrato: inalteradas aqui, reafirmadas por garantia.
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
-- 4. PROVA, dentro da própria transação. Se algo escapar, NÃO COMMITA.
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
  -- 1. O HELPER. Válido devolve a data; forma certa com valor impossível
  --    devolve NULL em vez de estourar; formato não canônico devolve NULL.
  IF public.ft_try_parse_iso_date('2026-02-28') IS DISTINCT FROM DATE '2026-02-28' THEN
    RAISE EXCEPTION 'helper rejeitou data valida';
  END IF;
  IF public.ft_try_parse_iso_date(' 2026-02-28 ') IS DISTINCT FROM DATE '2026-02-28' THEN
    RAISE EXCEPTION 'helper nao aplicou btrim como o guard antigo aplicava';
  END IF;
  IF public.ft_try_parse_iso_date('2024-02-29') IS DISTINCT FROM DATE '2024-02-29' THEN
    RAISE EXCEPTION 'helper rejeitou 29/02 de ano bissexto';
  END IF;
  IF public.ft_try_parse_iso_date('2099-13-45') IS NOT NULL
     OR public.ft_try_parse_iso_date('2026-02-30') IS NOT NULL
     OR public.ft_try_parse_iso_date('2026-00-10') IS NOT NULL
     OR public.ft_try_parse_iso_date('0000-01-01') IS NOT NULL THEN
    RAISE EXCEPTION 'helper aceitou data impossivel — o estouro voltaria';
  END IF;
  IF public.ft_try_parse_iso_date('hoje') IS NOT NULL
     OR public.ft_try_parse_iso_date('10/11/2026') IS NOT NULL
     OR public.ft_try_parse_iso_date('Jan 5 2026') IS NOT NULL
     OR public.ft_try_parse_iso_date('') IS NOT NULL
     OR public.ft_try_parse_iso_date(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'helper passou a adivinhar formato — o contrato e so o canonico';
  END IF;

  -- 2. O TIPO não foi tocado: 43 atributos, due_date ainda no 7, transaction_date
  --    no 6. O SELECT final do resolvedor é posicional.
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financial_import_resolved_row'::regclass
     AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_n <> 43 THEN
    RAISE EXCEPTION 'financial_import_resolved_row tem % atributos, esperado 43', v_n;
  END IF;
  SELECT a.attname || ' ' || a.atttypid::regtype::text INTO v_t
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financial_import_resolved_row'::regclass AND a.attnum = 7;
  IF v_t IS DISTINCT FROM 'due_date date' THEN
    RAISE EXCEPTION 'atributo 7 do tipo e "%", esperado "due_date date"', coalesce(v_t, '<vazio>');
  END IF;

  -- 3. Nenhum regex de data sobrou dentro do resolvedor: se sobrar um, sobrou um
  --    cast desprotegido, e o bug de 22008 volta por aquele caminho.
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   CROSS JOIN LATERAL regexp_matches(pg_get_functiondef(p.oid), '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$', 'g')
   WHERE ns.nspname = 'public' AND p.proname = '_financial_import_resolve';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'sobraram % guards de data com regex+cast cru no resolvedor', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   CROSS JOIN LATERAL regexp_matches(pg_get_functiondef(p.oid), 'ft_try_parse_iso_date', 'g')
   WHERE ns.nspname = 'public' AND p.proname = '_financial_import_resolve';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'resolvedor chama o helper % vezes, esperado 3 (date, due_date, paid_date)', v_n;
  END IF;

  -- 4. PRIVILÉGIOS. `anon` é o que mais importa: função nova em public pode
  --    nascer com EXECUTE pra ele por default privilege.
  IF has_function_privilege('anon', 'public.ft_try_parse_iso_date(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._financial_import_resolve(uuid, jsonb)', 'EXECUTE')
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

  -- 5. Payload vazio não explode.
  PERFORM 1 FROM public._financial_import_resolve(
    '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);

  -- 6. COMPORTAMENTO. Fixture real (categoria e conta são OBRIGATÓRIAS: sem
  --    elas toda linha nasce `blocked` e nada se prova). Homônimos excluídos.
  --    SOMENTE LEITURA — o resolvedor é STABLE.
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
      -- 1: data IMPOSSÍVEL com forma de data (ANTES: ERROR 22008, lote morria)
      jsonb_build_object('row_number', 1, 'date', '2099-13-45', 'type', 'saida',
                         'description', 'data impossivel', 'amount', '10',
                         'category', v_catnm, 'account', v_accnm, 'is_paid', 'true'),
      -- 2: vencimento IMPOSSÍVEL em linha não paga -> ERRO, linha blocked
      jsonb_build_object('row_number', 2, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'vencimento impossivel', 'amount', '20',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'false', 'due_date', '2099-13-45'),
      -- 3: data de pagamento IMPOSSÍVEL em linha paga -> AVISO + fallback
      jsonb_build_object('row_number', 3, 'date', '2099-01-01', 'type', 'saida',
                         'description', 'pagamento impossivel', 'amount', '30',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'true', 'paid_date', '2099-13-45'),
      -- 4: linha 100% VÁLIDA no MESMO lote: tem que seguir `ready` intacta.
      --    É a prova de que uma célula ruim não derruba mais as vizinhas.
      jsonb_build_object('row_number', 4, 'date', '2099-01-02', 'type', 'saida',
                         'description', 'vizinha intacta', 'amount', '40',
                         'category', v_catnm, 'account', v_accnm,
                         'is_paid', 'false', 'due_date', '2099-02-15')
    )) r;

  v_row := v_rows -> 0;
  IF v_row->>'transaction_date' IS NOT NULL OR v_row->>'status' <> 'blocked' THEN
    RAISE EXCEPTION 'data impossivel tinha que resolver NULL e bloquear a linha: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'date' AND z->>'severity' = 'error') THEN
    RAISE EXCEPTION 'data impossivel tinha que gerar o issue de data: %', v_row;
  END IF;

  v_row := v_rows -> 1;
  IF v_row->>'due_date' IS NOT NULL OR v_row->>'status' <> 'blocked'
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                     WHERE z->>'field' = 'due_date' AND z->>'code' = 'invalid'
                       AND z->>'severity' = 'error') THEN
    RAISE EXCEPTION 'vencimento impossivel nao seguiu a regra de 20261018170000: %', v_row;
  END IF;

  v_row := v_rows -> 2;
  IF v_row->>'paid_date' IS DISTINCT FROM '2099-01-01' THEN
    RAISE EXCEPTION 'linha paga com data de pagamento ilegivel tinha que cair na data do lancamento: %', v_row;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') z
                  WHERE z->>'field' = 'paid_date' AND z->>'code' = 'invalid'
                    AND z->>'severity' = 'warning') THEN
    RAISE EXCEPTION 'data de pagamento ilegivel nao pode ser descartada calada: %', v_row;
  END IF;
  IF v_row->>'status' <> 'ready' THEN
    RAISE EXCEPTION 'aviso de data de pagamento nao pode bloquear a linha: %', v_row;
  END IF;

  v_row := v_rows -> 3;
  IF v_row->>'status' <> 'ready'
     OR v_row->>'due_date' IS DISTINCT FROM '2099-02-15'
     OR jsonb_array_length(v_row->'issues') <> 0 THEN
    RAISE EXCEPTION 'linha valida foi contaminada pelas vizinhas ruins: %', v_row;
  END IF;

  RAISE NOTICE 'prova OK: celula de data impossivel virou issue e a linha vizinha seguiu ready (categoria=% / conta=%)', v_catnm, v_accnm;
END
$proof$;

NOTIFY pgrst, 'reload schema';

COMMIT;
