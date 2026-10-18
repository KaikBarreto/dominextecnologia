-- ============================================================================
-- Importação financeira por planilha (.xlsx) — camada SQL (Dominex)
-- ============================================================================
--
-- Implementa EXATAMENTE o contrato de
-- docs/planos/2026-10-18-contrato-rpcs-planilha.md (que a tela já consome) e a
-- seção 6 de docs/planos/2026-10-17-importacao-planilha-financeira.md.
--
-- NOTA DE TIMESTAMP (2026-10-18): máximo remoto em
-- supabase_migrations.schema_migrations ao nomear este arquivo = 20261018010000
-- (conferido via Management API). 20261018121000 estava LIVRE. Timestamp já
-- registrado faz o `db push` dizer "up to date" e PULAR o arquivo pra sempre,
-- em silêncio — por isso se confere o REMOTO, nunca o `ls` local.
--
-- ⚠️ Uma sessão anterior RELATOU ter escrito este arquivo, com contrato campo a
-- campo. Ele nunca existiu em nenhum worktree nem commit, e nenhum dos objetos
-- abaixo existia em produção. Relatório não é prova; catálogo é.
--
-- ── INVARIANTES ───────────────────────────────────────────────────────────
--
-- 1. UM RESOLVEDOR ÚNICO. `_financial_import_resolve(company_id, rows)` é
--    consumido pelo PREVIEW e pelo APPLY. A tela de conferência e a gravação
--    não podem discordar — é o mesmo princípio da invariante 6 da conciliação
--    (um conjunto, duas leituras). Duas implementações divergem no primeiro
--    patch.
--
-- 2. O `content_key` DO CLIENT É IGNORADO. O servidor computa o seu, com
--    `financial_import_content_key` (IMMUTABLE, md5, acento via translate() —
--    NUNCA unaccent(), que é STABLE e não entra em índice/CTE). A trava de
--    idempotência não pode ser um número que o client escolheu. O hash do
--    parser serve só pra exibição.
--
-- 3. DUAS TRAVAS DE DEDUP. (a) UNIQUE (company_id, file_hash) pega o arquivo
--    IDÊNTICO; (b) conteúdo OCCURRENCE-AWARE pega o caso real — o cliente
--    reexporta a planilha com uma linha a mais, o hash muda, e tudo entraria de
--    novo. `batch_rank = row_number() OVER (PARTITION BY content_key ORDER BY
--    row_number)` comparado com `existing_count`: insere só
--    `batch_rank > existing_count`. Assim 2 pagamentos legitimamente iguais no
--    mesmo dia continuam entrando, e a reimportação sobreposta não duplica.
--    NADA é descartado em silêncio: o retorno traz skipped_dup_count +
--    amostras.
--
-- 4. O SCAN DO DEDUP É ESTREITO. O content_key das linhas JÁ gravadas é
--    computado só nas CONTAS presentes no payload e dentro do INTERVALO DE
--    DATAS do payload, com cancelled_at IS NULL. Sem isso, cada preview de
--    planilha varreria o financeiro inteiro do tenant (e estouraria o timeout
--    do Cloudflare). O índice parcial idx_ft_import_dedup_scan sustenta isso.
--
-- 5. SEVERIDADE POR LINHA, NÃO TUDO-OU-NADA. Categoria / conta / centro de
--    custo / forma de pagamento não resolvidos = ERRO (linha `blocked`).
--    CLIENTE/FORNECEDOR não resolvido = AVISO: a linha ENTRA, sem o vínculo,
--    com o nome cru reportado. Bloquear a contraparte faria uma planilha com
--    400 nomes novos travar as 400 — exatamente o que a seção 4.7 do plano
--    proíbe.
--
-- 6. CATEGORIA 'ambos' É ACEITA NAS DUAS DIREÇÕES. É o bug que acabamos de
--    corrigir em reconcile_create_transaction (20261018010000): 63 categorias
--    'ambos' ATIVAS em produção, a UI oferecendo (filterCategoriesByTransaction
--    Type) e a RPC recusando. E o teste de NULL é EXPLÍCITO: `NULL NOT IN (...)`
--    é NULL, e um `IF NULL` cairia no caminho de aceitar.
--
-- 6b. ON DELETE CASCADE em financial_import_rows.financial_transaction_id é
--    DECISÃO APROVADA, não descuido. Razão: esta tabela é VÍNCULO, não
--    PROTEÇÃO — quem protege lançamento conciliado é reconciliation_matches +
--    trigger. E RESTRICT é imediato e NÃO-ADIÁVEL: quebraria
--    reset_system_step('financial_movements') e o cascade de exclusão de
--    empresa, que apagam financial_transactions ANTES de chegar aqui. É
--    exatamente a lição da invariante 6b de 20261017200000.
--
-- 7. SEGURANÇA, igual à conciliação, sem exceção. SECURITY DEFINER +
--    SET search_path = public. company_id SEMPRE de
--    get_user_company_id(auth.uid()), NUNCA do client.
--    tenant_subscription_allows_access + company_plan_allows_product_area(
--    'finance') cobrados À MÃO (RPC DEFINER não passa por RLS).
--    Guarda de acesso PELO PAPEL, nunca por `auth.uid() IS NULL` como passe
--    livre — o papel `anon` também tem uid NULL, e foi assim que o EcoSistema
--    entregou dado financeiro de 13 empresas pra visitante. Aqui uid NULL
--    RECUSA (direção segura) e o papel é conferido por
--    _reconcile_assert_company, reusada de propósito pra existir UMA
--    implementação da detecção de papel.
--    Categoria / conta / centro de custo / cliente / fornecedor validados como
--    DA EMPRESA dentro do resolvedor.
--
-- 8. CONTA TIPO `cartao` É RECUSADA. Despesa de cartão nunca entra paga (só a
--    fatura é paga) e materializar fatura a partir de planilha é outra feature.
--    Mesma régua da compra direta e da invariante 5 da conciliação.
--
-- 9. GRANT: o Supabase mantém `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
--    EXECUTE ON FUNCTIONS TO anon`, então TODA função nova em public nasce com
--    grant EXPLÍCITO anon=X no proacl, e `REVOKE ALL ... FROM PUBLIC` NÃO
--    remove grant explícito de papel. Toda função criada aqui é revogada de
--    `anon` NOMINALMENTE, helpers puros incluídos, e o bloco de prova no fim
--    RECUSA O COMMIT se alguma escapar.
--
-- ── O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ ──────────────────────────
-- * Não cria categoria, conta, cliente nem fornecedor. Importação que inventa
--   cadastro produz catálogo-lixo que ninguém mais limpa (incidente Glacial).
--   A tela de conferência é quem mapeia ou cria, explicitamente.
-- * Não aceita conta de cartão (invariante 8).
-- * Não mexe em financial_transactions além do INSERT: nenhuma coluna nova na
--   tabela quente — o vínculo vive na tabela de ligação e some com o import.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '300s';

-- ===========================================================================
-- 1. HELPERS PUROS (IMMUTABLE, sem acesso a tabela)
-- ===========================================================================

-- Normalização de nome pra casar "Água e Esgoto" com "agua e esgoto".
-- translate(), NUNCA unaccent(): unaccent é STABLE (depende de dicionário) e
-- não pode entrar em função IMMUTABLE nem em índice.
CREATE OR REPLACE FUNCTION public._financial_import_norm(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               lower(
                 translate(
                   coalesce(p_text, ''),
                   'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                   'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
                 )
               ),
               '[^a-z0-9]+', ' ', 'g'
             ),
             '\s+', ' ', 'g'
           )
         )
$fn$;

COMMENT ON FUNCTION public._financial_import_norm(text) IS
  'IMMUTABLE. Normaliza nome pra casamento da importação por planilha: sem acento (translate, nunca unaccent que é STABLE), sem caixa, sem pontuação, espaço colapsado. Mesma régua de normalizeSearch do front.';

-- Cast seguro de uuid: texto que não é uuid vira NULL em vez de estourar
-- 22P02 e derrubar o preview inteiro por causa de uma célula torta.
CREATE OR REPLACE FUNCTION public._financial_import_uuid(p_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
           WHEN btrim(coalesce(p_text, ''))
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN btrim(p_text)::uuid
         END
$fn$;

COMMENT ON FUNCTION public._financial_import_uuid(text) IS
  'IMMUTABLE. Cast tolerante de texto pra uuid (não-uuid devolve NULL). Existe pra uma célula torta na planilha não estourar 22P02 e derrubar o preview das outras 400 linhas.';

-- Vocabulário canônico de forma de pagamento. Lei de
-- src/lib/finance-payment-methods.ts (PAYMENT_METHOD_CODES + sinônimos
-- legados), mais o RÓTULO HUMANO dos 4 idiomas — o cliente pode ter baixado o
-- molde em espanhol e reimportado depois de editar em outro idioma.
--
-- POR QUE O RÓTULO TAMBÉM ENTRA (decisão de 2026-10-18): o dropdown do molde
-- `.xlsx` só pode oferecer valores que esta função aceita. Se só o CÓDIGO
-- servisse, o cliente (e o contador dele) abriria um arquivo formatado, com
-- logo, e veria células escritas "cartao_credito"/"cartao_debito". Inaceitável
-- num arquivo que sai do sistema e circula. Então o molde mostra
-- "Cartão de Crédito" e esta função traduz. O que é GRAVADO continua sendo
-- SEMPRE o código canônico — nenhum rótulo chega a financial_transactions.
--
-- ⚠️ CASAMENTO POR IGUALDADE EXATA DO TOKEN NORMALIZADO (`CASE <expr> WHEN
-- 'literal'`), NUNCA ILIKE/substring. "Cartão de Débito" e "Cartão de Crédito"
-- compartilham o prefixo "cartao de", e um `like '%cartao%'` casaria os dois —
-- gravaria a forma de pagamento errada EM SILÊNCIO, que é o pior tipo de bug de
-- dinheiro. O leitor da planilha já pagou esse exato falso-positivo hoje, com
-- "No" casando "Nota"/"Novembro".
-- Pela mesma razão não há entrada genérica 'cartao': texto ambíguo é ERRO, e a
-- tela de conferência resolve.
CREATE OR REPLACE FUNCTION public._financial_import_payment_method(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE public._financial_import_norm(p_text)
           WHEN ''                      THEN NULL
           -- dinheiro
           WHEN 'dinheiro'              THEN 'dinheiro'
           WHEN 'cash'                  THEN 'dinheiro'
           WHEN 'efectivo'              THEN 'dinheiro'
           WHEN 'especes'               THEN 'dinheiro'
           WHEN 'especie'               THEN 'dinheiro'
           -- pix
           WHEN 'pix'                   THEN 'pix'
           -- cartao de debito (inclui o sinonimo legado `debito`)
           WHEN 'cartao debito'         THEN 'cartao_debito'
           WHEN 'cartao de debito'      THEN 'cartao_debito'
           WHEN 'debito'                THEN 'cartao_debito'
           WHEN 'debit card'            THEN 'cartao_debito'
           WHEN 'tarjeta de debito'     THEN 'cartao_debito'
           WHEN 'carte de debit'        THEN 'cartao_debito'
           -- cartao de credito (inclui os legados credito/avista/parcelado)
           WHEN 'cartao credito'        THEN 'cartao_credito'
           WHEN 'cartao de credito'     THEN 'cartao_credito'
           WHEN 'credito'               THEN 'cartao_credito'
           WHEN 'credito avista'        THEN 'cartao_credito'
           WHEN 'credito parcelado'     THEN 'cartao_credito'
           WHEN 'credit card'           THEN 'cartao_credito'
           WHEN 'tarjeta de credito'    THEN 'cartao_credito'
           WHEN 'carte de credit'       THEN 'cartao_credito'
           -- transferencia
           WHEN 'transferencia'         THEN 'transferencia'
           WHEN 'transferencia bancaria' THEN 'transferencia'
           WHEN 'bank transfer'         THEN 'transferencia'
           WHEN 'wire transfer'         THEN 'transferencia'
           WHEN 'virement'              THEN 'transferencia'
           WHEN 'virement bancaire'     THEN 'transferencia'
           WHEN 'ted'                   THEN 'transferencia'
           WHEN 'doc'                   THEN 'transferencia'
           -- boleto
           WHEN 'boleto'                THEN 'boleto'
           WHEN 'bank slip'             THEN 'boleto'
           WHEN 'pago de servicios'     THEN 'boleto'
           WHEN 'bon de paiement'       THEN 'boleto'
           WHEN 'bordereau'             THEN 'boleto'
           -- cheque
           WHEN 'cheque'                THEN 'cheque'
           WHEN 'check'                 THEN 'cheque'
           ELSE NULL
         END
$fn$;

COMMENT ON FUNCTION public._financial_import_payment_method(text) IS
  'IMMUTABLE. Traduz o que o cliente escreveu na coluna "Forma de pagamento" pro código canônico de src/lib/finance-payment-methods.ts (dinheiro, pix, cartao_debito, cartao_credito, transferencia, boleto, cheque) — e é SEMPRE o código que vai pro banco. Aceita três conjuntos: o código canônico exato, os sinônimos legados (debito, credito, credito_avista, credito_parcelado) e o RÓTULO HUMANO nos 4 idiomas (Cartão de Crédito / Credit Card / Tarjeta de Crédito / Carte de Crédit, etc.), porque o dropdown do molde .xlsx só pode oferecer valores que esta função aceita e um arquivo com logo não pode mostrar "cartao_credito" pro contador do cliente. Casa por IGUALDADE EXATA do token normalizado (sem acento via translate, sem caixa, espaço colapsado), NUNCA por ILIKE/substring: "Cartão de Débito" e "Cartão de Crédito" compartilham prefixo e um like por "cartao" gravaria a forma errada em silêncio. Devolve NULL pro desconhecido — quem distingue "vazio" de "não reconhecido" é o resolvedor (vazio = sem problema; desconhecido = erro).';

-- 2ª trava de dedup (invariante 3). IMMUTABLE de propósito: entra em CTE e
-- pode entrar em índice de expressão.
CREATE OR REPLACE FUNCTION public.financial_import_content_key(
  p_date          date,
  p_signed_amount numeric,
  p_description   text,
  p_account_id    uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT md5(
           coalesce(p_date::text, '')
           || '|' || to_char(round(coalesce(p_signed_amount, 0), 2), 'FM999999999990.00')
           || '|' || left(public._financial_import_norm(p_description), 48)
           || '|' || coalesce(p_account_id::text, '')
         )
$fn$;

COMMENT ON FUNCTION public.financial_import_content_key(date, numeric, text, uuid) IS
  'IMMUTABLE. Chave de conteúdo (data + valor COM SINAL + descrição normalizada sem acento + conta) de uma movimentação. É a 2ª trava de dedup da importação por planilha, occurrence-aware: cobre o caso real de o cliente reexportar a mesma planilha com uma linha a mais (hash do arquivo muda, conteúdo não). O content_key que o CLIENT manda é IGNORADO — a trava de idempotência não pode ser um número que o client escolheu. Não usa unaccent (STABLE).';

-- ===========================================================================
-- 2. GUARDAS DE ACESSO
--    Reusam public._reconcile_assert_company de propósito: a detecção de PAPEL
--    (service_role por claim, sessão direta sem JWT, anon barrado) tem que ter
--    UMA implementação no projeto. Aqui só as mensagens são do domínio da
--    importação.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public._financial_import_company()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
BEGIN
  -- ⚠️ uid NULL aqui RECUSA (direção segura). O erro do EcoSistema foi usar
  -- `auth.uid() IS NULL` como PASSE LIVRE — o papel anon também tem uid NULL.
  -- A importação é sempre ato de um usuário logado: o arquivo é dele, e o
  -- company_id sai do perfil dele, nunca do payload.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(auth.uid());

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma empresa.' USING ERRCODE = '42501';
  END IF;

  RETURN v_company;
END;
$fn$;

COMMENT ON FUNCTION public._financial_import_company() IS
  'Empresa do chamador, de get_user_company_id(auth.uid()). O company_id da importação NUNCA vem do client. uid NULL recusa (42501): aqui a direção segura é negar — usar uid NULL como passe livre é o engano que entregou dado financeiro de 13 empresas pro anon no EcoSistema.';

CREATE OR REPLACE FUNCTION public._financial_import_assert_write(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Guarda de papel/tenant: UMA implementação no projeto (ver COMMENT).
  PERFORM public._reconcile_assert_company(p_company_id);

  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.tenant_subscription_allows_access(p_company_id) THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: a importação de planilha está bloqueada.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_plan_allows_product_area(p_company_id, 'finance') THEN
    RAISE EXCEPTION 'O plano desta empresa não inclui o Financeiro.'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public._financial_import_assert_write(uuid) IS
  'Gate das RPCs de importação por planilha: _reconcile_assert_company (detecção de PAPEL — service_role por claim, sessão direta sem JWT, anon barrado; implementação ÚNICA no projeto, reusada de propósito) + tenant_subscription_allows_access + company_plan_allows_product_area(finance). Existe porque RPC SECURITY DEFINER não passa por RLS e precisa cobrar à mão o que as policies de financial_transactions cobram. Vale também pro PREVIEW: assinatura bloqueada não pré-visualiza financeiro.';

-- ===========================================================================
-- 3. TABELAS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.financial_imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name     text,
  file_hash     text NOT NULL,
  source        text NOT NULL DEFAULT 'xlsx',
  row_count     integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'applied',
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reverted_at   timestamptz,
  reverted_by   uuid REFERENCES auth.users(id),
  CONSTRAINT financial_imports_source_chk CHECK (source IN ('xlsx')),
  CONSTRAINT financial_imports_status_chk CHECK (status IN ('applied', 'reverted')),
  CONSTRAINT financial_imports_file_uq UNIQUE (company_id, file_hash)
);

COMMENT ON TABLE public.financial_imports IS
  'Um arquivo de planilha importado para o Financeiro. Existe pro cliente poder DESFAZER: a primeira importação sempre vem torta, e sem o desfazer ele fica com 400 lançamentos errados e nenhuma saída.';
COMMENT ON COLUMN public.financial_imports.file_hash IS
  '1ª trava de dedup: UNIQUE (company_id, file_hash). Reimportar o MESMO arquivo devolve already_imported=true e NÃO insere nada. Só pega arquivo idêntico — o caso real (reexportar com uma linha a mais) é coberto pela 2ª trava, por conteúdo.';
COMMENT ON COLUMN public.financial_imports.status IS
  'applied | reverted. Só vira reverted quando kept_count = 0 (reversão COMPLETA); reversão parcial segue applied, pro cliente poder tentar de novo depois de desamarrar o que travou. Import revertido NÃO bloqueia reimportar o mesmo arquivo: o apply REAPROVEITA a linha (o UNIQUE continua valendo) em vez de criar outra.';
COMMENT ON COLUMN public.financial_imports.skipped_count IS
  'row_count − created_count. Soma duplicadas + inválidas. O detalhe (skipped_dup_count / skipped_invalid_count + amostras) vem no retorno da RPC: nada é descartado em silêncio.';

CREATE TABLE IF NOT EXISTS public.financial_import_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id  uuid NOT NULL REFERENCES public.financial_imports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- ⚠️ ON DELETE CASCADE é DECISÃO APROVADA (invariante 6b do cabeçalho), não
  -- descuido. Esta tabela é VÍNCULO, não PROTEÇÃO: quem protege lançamento
  -- conciliado é reconciliation_matches + trigger. RESTRICT é imediato e
  -- não-adiável, e quebraria reset_system_step('financial_movements') e o
  -- cascade de exclusão de empresa, que apagam financial_transactions ANTES de
  -- chegar aqui.
  financial_transaction_id uuid NOT NULL
                             REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  row_number  integer NOT NULL,
  content_key text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_import_rows_row_uq UNIQUE (import_id, row_number)
);

COMMENT ON TABLE public.financial_import_rows IS
  'Vínculo linha-da-planilha ↔ lançamento criado. Tabela de ligação em vez de coluna em financial_transactions: a tabela quente não ganha coluna, e o vínculo some junto com o import. ON DELETE CASCADE no lançamento é deliberado (ver comentário da coluna).';
COMMENT ON COLUMN public.financial_import_rows.row_number IS
  'Número da linha na planilha, 1-indexado como o Excel mostra. UNIQUE por import: é o que faz a amostra de "o que pulou" apontar pra linha certa na tela.';
COMMENT ON COLUMN public.financial_import_rows.content_key IS
  'content_key COMPUTADO NO SERVIDOR no momento do apply (o do client é ignorado). Guardado pra auditoria do dedup — a contagem viva é sempre recalculada sobre financial_transactions.';

CREATE INDEX IF NOT EXISTS idx_fimp_company
  ON public.financial_imports (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fimp_rows_import
  ON public.financial_import_rows (import_id);
CREATE INDEX IF NOT EXISTS idx_fimp_rows_company
  ON public.financial_import_rows (company_id);
CREATE INDEX IF NOT EXISTS idx_fimp_rows_transaction
  ON public.financial_import_rows (financial_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fimp_rows_content_key
  ON public.financial_import_rows (company_id, content_key);

-- Índice que sustenta o scan ESTREITO do dedup (invariante 4): contas do
-- payload + janela de datas do payload + não cancelado. Sem ele, cada preview
-- varre o financeiro inteiro do tenant e estoura o timeout do Cloudflare.
CREATE INDEX IF NOT EXISTS idx_ft_import_dedup_scan
  ON public.financial_transactions (company_id, account_id, transaction_date)
  WHERE cancelled_at IS NULL;

-- ===========================================================================
-- 4. RLS — espelha EXATAMENTE as 3 tabelas da conciliação (20261017200000),
--    que por sua vez espelham financial_transactions (20261004213000):
--    tenant + entitlement, super_admin como caminho paralelo, DELETE com
--    can_delete_finance, RESTRICTIVE de área do plano `finance`.
--    Função de auth embrulhada em (SELECT ...) pra preservar o InitPlan.
--    A regra de QUEM-VÊ-O-QUÊ foi definida pela 🛡️ Plataforma naquelas duas
--    migrations; aqui é a MESMA regra aplicada a tabela irmã — só o SQL.
-- ===========================================================================

ALTER TABLE public.financial_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_import_rows ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['financial_imports', 'financial_import_rows']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access_' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users view entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users insert entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users update entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Managers delete entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Subscription plan allows finance on ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$, 'service_role_full_access_' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users view entitled own company ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users insert entitled own company ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
        WITH CHECK (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users update entitled own company ' || v_table, v_table);

    -- DELETE com o MESMO gate de permissão de financial_transactions: apagar um
    -- import descarta o rastro de 400 lançamentos.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
        USING (
          (
            (SELECT public.is_super_admin(auth.uid()))
            OR (
              company_id = (SELECT public.get_user_company_id(auth.uid()))
              AND public.tenant_subscription_allows_access(company_id)
            )
          )
          AND (SELECT public.can_delete_finance(auth.uid()))
        )
    $p$, 'Managers delete entitled own company ' || v_table, v_table);

    -- RESTRICTIVE de área do plano, igual financial_transactions (plano EXCEÇÃO
    -- não tem Financeiro). Complementa, não abre acesso novo.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
        USING (public.company_plan_allows_product_area(company_id, 'finance'))
        WITH CHECK (public.company_plan_allows_product_area(company_id, 'finance'))
    $p$, 'Subscription plan allows finance on ' || v_table, v_table);
  END LOOP;
END
$policies$;

-- ===========================================================================
-- 5. RESOLVEDOR ÚNICO (invariante 1)
--
--    Tipo composto nomeado em vez de RETURNS TABLE: com RETURNS TABLE os nomes
--    das colunas de saída viram PARÂMETROS visíveis no corpo e colidem com
--    colunas reais (`status`, `amount`, `account_id`, `row_number`...),
--    produzindo "column reference is ambiguous" em lugares difíceis de prever.
--    Com o tipo composto não existe variável nenhuma no escopo.
-- ===========================================================================

DROP FUNCTION IF EXISTS public._financial_import_resolve(uuid, jsonb);
DROP TYPE     IF EXISTS public.financial_import_resolved_row;

CREATE TYPE public.financial_import_resolved_row AS (
  row_number            integer,
  content_key           text,
  batch_rank            integer,
  existing_count        integer,
  status                text,
  transaction_date      date,
  transaction_type      text,
  description           text,
  amount                numeric,
  signed_amount         numeric,
  is_paid               boolean,
  paid_date             date,
  notes                 text,
  category_input        text,
  category_id           uuid,
  category_name         text,
  category_status       text,
  account_input         text,
  account_id            uuid,
  account_name          text,
  account_type          text,
  account_status        text,
  cost_center_input     text,
  cost_center_id        uuid,
  cost_center_name      text,
  cost_center_status    text,
  payment_method_input  text,
  payment_method        text,
  payment_method_status text,
  counterparty_input    text,
  customer_id           uuid,
  supplier_id           uuid,
  counterparty_name     text,
  counterparty_status   text,
  is_duplicate          boolean,
  issues                jsonb
);

COMMENT ON TYPE public.financial_import_resolved_row IS
  'Uma linha da planilha RESOLVIDA contra o cadastro do tenant. Shape único consumido pelo preview (que o devolve em JSON pra tela de conferência) e pelo apply (que grava a partir dele) — por construção a tela e a gravação não podem discordar.';

CREATE FUNCTION public._financial_import_resolve(
  p_company_id uuid,
  p_rows       jsonb
)
RETURNS SETOF public.financial_import_resolved_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
      sn.pid AS cp_sup_name_id, sn.pname AS cp_sup_name_name, coalesce(sn.hits_any, 0) AS cp_sup_hits
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
    f.cp_customer_id,
    f.cp_supplier_id,
    f.cp_name,
    f.cp_status,
    (f.brank <= f.ecount),
    f.iss
  FROM issued f
  ORDER BY f.rn, f.ord
$fn$;

COMMENT ON FUNCTION public._financial_import_resolve(uuid, jsonb) IS
  'RESOLVEDOR ÚNICO da importação por planilha (invariante 1): resolve cada linha contra o cadastro do tenant (categoria aceitando ''ambos'' nas duas direções, conta recusando tipo cartao, centro de custo, forma de pagamento canônica, cliente/fornecedor) e classifica em ready | duplicate | blocked. Consumido pelo PREVIEW e pelo APPLY — a tela de conferência e a gravação não podem discordar. content_key é SEMPRE computado no servidor (o do client é ignorado) e o dedup é occurrence-aware (batch_rank vs existing_count), com scan estreito às contas e à janela de datas do payload. Severidade por linha: catálogo não resolvido = erro (blocked); cliente/fornecedor não resolvido = AVISO (a linha entra sem o vínculo). INTERNA: recebe p_company_id como PARÂMETRO e NÃO valida tenant, por isso NÃO tem grant pra authenticated — dar grant aqui deixaria qualquer usuário resolver contra o catálogo de outra empresa. Quem chama é sempre RPC DEFINER que JÁ validou.';

-- ===========================================================================
-- 6. RPC 1 — PREVIEW (não grava NADA)
-- ===========================================================================

DROP FUNCTION IF EXISTS public.preview_financial_import(text, jsonb);

CREATE FUNCTION public.preview_financial_import(
  p_file_hash text,
  p_rows      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

COMMENT ON FUNCTION public.preview_financial_import(text, jsonb) IS
  'Pré-visualização da importação por planilha: NÃO GRAVA NADA. Devolve linha por linha o que seria criado, com o cadastro já resolvido e os problemas classificados por severidade (catálogo não resolvido = erro e a linha fica blocked; cliente/fornecedor não encontrado = aviso e a linha entra sem o vínculo). already_imported/existing_import cobrem a 1ª trava de dedup (arquivo idêntico); status duplicate cobre a 2ª (conteúdo occurrence-aware). total_in/total_out contam SÓ as linhas que seriam criadas, pro cliente ver o impacto ANTES de gravar. Usa o MESMO resolvedor do apply, por construção. Mais de 5000 linhas: 22023.';

-- ===========================================================================
-- 7. RPC 2 — APPLY
-- ===========================================================================

DROP FUNCTION IF EXISTS public.apply_financial_import(text, text, jsonb);

CREATE FUNCTION public.apply_financial_import(
  p_file_name text,
  p_file_hash text,
  p_rows      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
      -- Linha NÃO paga sem due_date é conta a pagar invisível (ela sai por
      -- último em toda lista ordenada por vencimento). Linha paga não tem
      -- vencimento a cobrar.
      CASE WHEN r.is_paid THEN NULL ELSE r.transaction_date END,
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
$fn$;

COMMENT ON FUNCTION public.apply_financial_import(text, text, jsonb) IS
  'Grava a importação por planilha. Usa o MESMO resolvedor do preview (invariante 1), por isso o que a tela de conferência mostrou é o que entra. amount SEMPRE positivo e a direção em transaction_type; is_paid/paid_date/account_id/category (nome copiado do cadastro) conforme a planilha; conta tipo cartao é recusada. Duas travas de dedup: UNIQUE (company_id, file_hash) devolve already_imported=true sem inserir nada, e o conteúdo occurrence-aware (batch_rank > existing_count) pega a reexportação com uma linha a mais. O que pulou vem contado e com amostra (até 20) — nada é descartado em silêncio. Import revertido por completo é REAPROVEITADO (o mesmo arquivo pode voltar depois do desfazer). Mais de 5000 linhas: 22023. O resumo é calculado ANTES do INSERT de propósito: depois dele o próprio resolvedor contaria as linhas novas como já existentes.';

-- ===========================================================================
-- 8. RPC 3 — REVERT
-- ===========================================================================

DROP FUNCTION IF EXISTS public.revert_financial_import(uuid);

CREATE FUNCTION public.revert_financial_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import     public.financial_imports%ROWTYPE;
  v_kept       jsonb;
  v_kept_count integer;
  v_deletable  uuid[];
  v_deleted    integer;
  v_status     text;
BEGIN
  SELECT * INTO v_import
    FROM public.financial_imports
   WHERE id = p_import_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._financial_import_assert_write(v_import.company_id);

  -- RPC DEFINER NÃO passa por RLS: o gate de exclusão do Financeiro (a policy
  -- "Managers delete ...") tem que ser cobrado À MÃO aqui.
  IF auth.uid() IS NOT NULL AND NOT public.can_delete_finance(auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir lançamentos financeiros, então não pode desfazer uma importação.'
      USING ERRCODE = '42501';
  END IF;

  WITH flagged AS (
    SELECT
      ir.row_number AS rn,
      t.id,
      t.transaction_date,
      t.description,
      t.amount,
      t.transaction_type::text AS ttype,
      array_remove(ARRAY[
        CASE WHEN EXISTS (
               SELECT 1 FROM public.reconciliation_matches rm
                WHERE rm.financial_transaction_id = t.id
             ) THEN 'já foi conciliado com o extrato bancário' END,
        CASE WHEN t.receipt_url IS NOT NULL
               OR EXISTS (
                    SELECT 1 FROM public.financial_transaction_attachments a
                     WHERE a.transaction_id = t.id
                  )
             THEN 'tem comprovante anexado' END,
        CASE WHEN coalesce(t.amount_received, 0) > 0
               OR EXISTS (
                    SELECT 1 FROM public.financial_transactions c
                     WHERE c.parent_transaction_id = t.id
                       AND c.category = 'Recebimento parcial'
                       AND c.transaction_type = 'entrada'
                  )
             THEN 'tem recebimento parcial lançado' END,
        CASE WHEN t.cancelled_at IS NOT NULL THEN 'foi cancelado' END,
        CASE WHEN t.transfer_pair_id IS NOT NULL THEN 'virou perna de uma transferência' END,
        CASE WHEN t.bill_id IS NOT NULL OR t.credit_card_bill_date IS NOT NULL
             THEN 'está amarrado a uma fatura' END,
        CASE WHEN t.payment_group_id IS NOT NULL THEN 'faz parte de um pagamento em grupo' END
      ], NULL) AS reasons
    FROM public.financial_import_rows ir
    JOIN public.financial_transactions t ON t.id = ir.financial_transaction_id
   WHERE ir.import_id = p_import_id
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'financial_transaction_id', f.id,
        'row_number',              f.rn,
        'transaction_date',        f.transaction_date,
        'description',             f.description,
        'amount',                  f.amount,
        'transaction_type',        f.ttype,
        'reasons',                 to_jsonb(f.reasons),
        'reason_label',            array_to_string(f.reasons, ' · ')
      ) ORDER BY f.rn
    ) FILTER (WHERE coalesce(array_length(f.reasons, 1), 0) > 0), '[]'::jsonb),
    count(*) FILTER (WHERE coalesce(array_length(f.reasons, 1), 0) > 0)::integer,
    array_agg(f.id) FILTER (WHERE coalesce(array_length(f.reasons, 1), 0) = 0)
  INTO v_kept, v_kept_count, v_deletable
  FROM flagged f;

  v_kept_count := coalesce(v_kept_count, 0);

  IF v_deletable IS NOT NULL AND array_length(v_deletable, 1) > 0 THEN
    -- O vínculo em financial_import_rows some por CASCADE (invariante 6b).
    DELETE FROM public.financial_transactions WHERE id = ANY (v_deletable);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_deleted := 0;
  END IF;

  -- `reverted` só com reversão COMPLETA. Reversão parcial segue `applied`, pro
  -- cliente poder tentar de novo depois de desamarrar o que travou.
  v_status := CASE WHEN v_kept_count = 0 THEN 'reverted' ELSE 'applied' END;

  UPDATE public.financial_imports
     SET status        = v_status,
         created_count = greatest(coalesce(created_count, 0) - v_deleted, 0),
         reverted_at   = CASE WHEN v_status = 'reverted' THEN now() ELSE NULL END,
         reverted_by   = CASE WHEN v_status = 'reverted' THEN auth.uid() ELSE NULL END
   WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'import_id',     p_import_id,
    'status',        v_status,
    'deleted_count', v_deleted,
    'kept_count',    v_kept_count,
    'kept',          v_kept,
    'message',       CASE
                       WHEN v_deleted = 0 AND v_kept_count = 0
                         THEN 'Esta importação não tem mais nenhuma movimentação para desfazer.'
                       WHEN v_kept_count = 0
                         THEN v_deleted || CASE WHEN v_deleted = 1 THEN ' movimentação foi removida.' ELSE ' movimentações foram removidas.' END
                       WHEN v_deleted = 0
                         THEN 'Nada foi removido: ' || v_kept_count || CASE WHEN v_kept_count = 1 THEN ' movimentação já foi usada no sistema.' ELSE ' movimentações já foram usadas no sistema.' END
                       ELSE v_deleted || ' removida(s). ' || v_kept_count || ' mantida(s) porque já foram usadas no sistema — veja o motivo de cada uma.'
                     END
  );
END;
$fn$;

COMMENT ON FUNCTION public.revert_financial_import(uuid) IS
  'Desfaz uma importação por planilha: apaga os lançamentos criados que ainda NÃO FORAM TOCADOS e RECUSA, com motivo em PT-BR, os que foram — conciliado · com anexo ou receipt_url · com recebimento parcial (filha ou amount_received > 0) · cancelado · perna de transferência · amarrado a fatura (bill_id / credit_card_bill_date) · em pagamento de grupo. Exige can_delete_finance(auth.uid()) cobrado À MÃO, porque RPC SECURITY DEFINER não passa por RLS. status só vira reverted com kept_count = 0; reversão parcial segue applied pro cliente poder tentar de novo depois de desamarrar. Existe porque a primeira importação do cliente sempre vem torta: sem o desfazer ele fica com 400 lançamentos errados e nenhuma saída.';

-- ===========================================================================
-- 9. GRANTS
--     Internas (prefixo _) ficam SEM grant pra authenticated: são chamadas de
--     dentro de RPC DEFINER, que roda como o dono. _financial_import_resolve em
--     especial recebe company_id como PARÂMETRO e não valida tenant — dar grant
--     ali seria abrir o catálogo de qualquer empresa.
-- ===========================================================================

DO $grants$
DECLARE
  v_sig text;
BEGIN
  -- Internas: ninguém além do dono.
  FOREACH v_sig IN ARRAY ARRAY[
    'public._financial_import_resolve(uuid, jsonb)',
    'public._financial_import_company()',
    'public._financial_import_assert_write(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
  END LOOP;

  -- Helpers PUROS: `anon` revogado NOMINALMENTE também (o default privilege do
  -- Supabase concede a ele explicitamente; revoke de PUBLIC não tira isso).
  FOREACH v_sig IN ARRAY ARRAY[
    'public._financial_import_norm(text)',
    'public._financial_import_uuid(text)',
    'public._financial_import_payment_method(text)',
    'public.financial_import_content_key(date, numeric, text, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;

  -- As 3 RPCs do contrato.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.preview_financial_import(text, jsonb)',
    'public.apply_financial_import(text, text, jsonb)',
    'public.revert_financial_import(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END
$grants$;

-- ===========================================================================
-- 10. PROVA, dentro da própria transação (invariante 9).
--     Se qualquer objeto faltar ou `anon` escapar, a migration NÃO COMMITA.
-- ===========================================================================

DO $proof$
DECLARE
  v_sig  text;
  v_tbl  text;
  v_n    integer;
BEGIN
  -- 1. Tabelas, com RLS ligada e as 6 policies de cada.
  FOREACH v_tbl IN ARRAY ARRAY['financial_imports', 'financial_import_rows'] LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      RAISE EXCEPTION 'tabela public.% nao existe', v_tbl;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relname = v_tbl AND c.relrowsecurity;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'RLS nao esta habilitada em public.%', v_tbl;
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tbl;
    IF v_n <> 6 THEN
      RAISE EXCEPTION 'public.% tem % policies, esperado 6', v_tbl, v_n;
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tbl AND permissive = 'RESTRICTIVE';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'public.% nao tem a policy RESTRICTIVE de area do plano', v_tbl;
    END IF;
  END LOOP;

  -- 2. ON DELETE CASCADE deliberado (invariante 6b): se alguem trocar por
  --    RESTRICT, a migration avisa.
  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.financial_import_rows'::regclass
     AND contype = 'f'
     AND confrelid = 'public.financial_transactions'::regclass
     AND confdeltype = 'c';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'a FK de financial_import_rows pra financial_transactions nao esta ON DELETE CASCADE';
  END IF;

  -- 3. UNIQUEs das duas travas de dedup.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'financial_imports_file_uq'
                    AND conrelid = 'public.financial_imports'::regclass) THEN
    RAISE EXCEPTION 'falta UNIQUE (company_id, file_hash) em financial_imports';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'financial_import_rows_row_uq'
                    AND conrelid = 'public.financial_import_rows'::regclass) THEN
    RAISE EXCEPTION 'falta UNIQUE (import_id, row_number) em financial_import_rows';
  END IF;

  -- 4. Indice do scan estreito do dedup (invariante 4).
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'idx_ft_import_dedup_scan') THEN
    RAISE EXCEPTION 'falta o indice idx_ft_import_dedup_scan que sustenta o scan do dedup';
  END IF;

  -- 5. Tipo composto e as 9 funcoes, com assinatura exata.
  IF to_regtype('public.financial_import_resolved_row') IS NULL THEN
    RAISE EXCEPTION 'o tipo public.financial_import_resolved_row nao existe';
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public._financial_import_norm(text)',
    'public._financial_import_uuid(text)',
    'public._financial_import_payment_method(text)',
    'public.financial_import_content_key(date, numeric, text, uuid)',
    'public._financial_import_company()',
    'public._financial_import_assert_write(uuid)',
    'public._financial_import_resolve(uuid, jsonb)',
    'public.preview_financial_import(text, jsonb)',
    'public.apply_financial_import(text, text, jsonb)',
    'public.revert_financial_import(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'funcao % nao existe', v_sig;
    END IF;
    -- 6. anon NUNCA executa nada da importacao, helpers puros incluidos.
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon mantem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- 7. As 3 RPCs do contrato alcancaveis por quem tem que alcancar.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.preview_financial_import(text, jsonb)',
    'public.apply_financial_import(text, text, jsonb)',
    'public.revert_financial_import(uuid)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated nao tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role nao tem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- 8. O resolvedor NAO pode estar ao alcance de authenticated: ele recebe
  --    company_id como parametro e nao valida tenant.
  IF has_function_privilege('authenticated', 'public._financial_import_resolve(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE em _financial_import_resolve — isso abre o catalogo de qualquer empresa';
  END IF;

  -- 9. O resolvedor compila e devolve o shape esperado (empresa inexistente,
  --    zero linhas: prova a assinatura e o tipo de retorno sem tocar em dado).
  SELECT count(*) INTO v_n
    FROM public._financial_import_resolve('00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'o resolvedor devolveu % linhas para payload vazio', v_n;
  END IF;

  -- 10. E resolve de verdade: 2 linhas identicas no mesmo payload tem
  --     batch_rank 1 e 2 (occurrence-aware), e a 2a NAO e tratada como
  --     duplicata do sistema quando nada igual existe lá.
  SELECT count(*) INTO v_n
    FROM public._financial_import_resolve(
           '00000000-0000-0000-0000-000000000000'::uuid,
           '[{"row_number":2,"date":"2026-10-01","type":"saida","description":"Teste","amount":"10.00"},
             {"row_number":3,"date":"2026-10-01","type":"saida","description":"Teste","amount":"10.00"}]'::jsonb
         ) r
   WHERE r.batch_rank IN (1, 2) AND r.existing_count = 0;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'o dedup occurrence-aware nao numerou as 2 ocorrencias (achou %)', v_n;
  END IF;

  -- 11. FORMA DE PAGAMENTO: codigo canonico E rotulo humano resolvem pro MESMO
  --      codigo, e rotulos que compartilham prefixo NAO se confundem. Se algum
  --      dia alguem trocar a igualdade exata por ILIKE/substring, estas
  --      asserts estouram e a migration nao commita.
  IF public._financial_import_payment_method('cartao_credito')   IS DISTINCT FROM 'cartao_credito'
     OR public._financial_import_payment_method('Cartão de Crédito') IS DISTINCT FROM 'cartao_credito'
     OR public._financial_import_payment_method('  CARTÃO DE CRÉDITO  ') IS DISTINCT FROM 'cartao_credito'
     OR public._financial_import_payment_method('Credit Card')        IS DISTINCT FROM 'cartao_credito'
     OR public._financial_import_payment_method('Tarjeta de Crédito') IS DISTINCT FROM 'cartao_credito'
     OR public._financial_import_payment_method('Carte de Crédit')    IS DISTINCT FROM 'cartao_credito' THEN
    RAISE EXCEPTION 'cartao de credito: codigo ou rotulo nao resolve pra cartao_credito';
  END IF;

  IF public._financial_import_payment_method('cartao_debito')      IS DISTINCT FROM 'cartao_debito'
     OR public._financial_import_payment_method('Cartão de Débito')  IS DISTINCT FROM 'cartao_debito'
     OR public._financial_import_payment_method('Debit Card')        IS DISTINCT FROM 'cartao_debito'
     OR public._financial_import_payment_method('Tarjeta de Débito') IS DISTINCT FROM 'cartao_debito'
     OR public._financial_import_payment_method('Carte de Débit')    IS DISTINCT FROM 'cartao_debito' THEN
    RAISE EXCEPTION 'cartao de debito: codigo ou rotulo nao resolve pra cartao_debito';
  END IF;

  -- O falso-positivo de prefixo, nominalmente barrado.
  IF public._financial_import_payment_method('Cartão de Débito') = 'cartao_credito' THEN
    RAISE EXCEPTION 'FALSO-POSITIVO: Cartão de Débito resolveu pra cartao_credito';
  END IF;
  IF public._financial_import_payment_method('Cartão de Crédito') = 'cartao_debito' THEN
    RAISE EXCEPTION 'FALSO-POSITIVO: Cartão de Crédito resolveu pra cartao_debito';
  END IF;
  -- Texto ambiguo e ERRO, nao um chute: "Cartão" sozinho nao diz qual.
  IF public._financial_import_payment_method('Cartão') IS NOT NULL THEN
    RAISE EXCEPTION 'FALSO-POSITIVO: "Cartão" sozinho resolveu pra %',
      public._financial_import_payment_method('Cartão');
  END IF;

  -- Os outros cinco, nos 4 idiomas + codigo.
  IF public._financial_import_payment_method('dinheiro')  IS DISTINCT FROM 'dinheiro'
     OR public._financial_import_payment_method('Dinheiro') IS DISTINCT FROM 'dinheiro'
     OR public._financial_import_payment_method('Cash')     IS DISTINCT FROM 'dinheiro'
     OR public._financial_import_payment_method('Efectivo') IS DISTINCT FROM 'dinheiro'
     OR public._financial_import_payment_method('Espèces')  IS DISTINCT FROM 'dinheiro'
     OR public._financial_import_payment_method('PIX')      IS DISTINCT FROM 'pix'
     OR public._financial_import_payment_method('Transferência')  IS DISTINCT FROM 'transferencia'
     OR public._financial_import_payment_method('Wire Transfer')  IS DISTINCT FROM 'transferencia'
     OR public._financial_import_payment_method('Bank Transfer')  IS DISTINCT FROM 'transferencia'
     OR public._financial_import_payment_method('Transferencia')  IS DISTINCT FROM 'transferencia'
     OR public._financial_import_payment_method('Virement')       IS DISTINCT FROM 'transferencia'
     OR public._financial_import_payment_method('Boleto')            IS DISTINCT FROM 'boleto'
     OR public._financial_import_payment_method('Bank Slip')         IS DISTINCT FROM 'boleto'
     OR public._financial_import_payment_method('Pago de Servicios') IS DISTINCT FROM 'boleto'
     OR public._financial_import_payment_method('Bon de paiement')   IS DISTINCT FROM 'boleto'
     OR public._financial_import_payment_method('Cheque') IS DISTINCT FROM 'cheque'
     OR public._financial_import_payment_method('Check')  IS DISTINCT FROM 'cheque'
     OR public._financial_import_payment_method('Chèque') IS DISTINCT FROM 'cheque' THEN
    RAISE EXCEPTION 'algum rotulo de forma de pagamento dos 4 idiomas nao resolve pro codigo canonico';
  END IF;

  -- Desconhecido continua NULL (o resolvedor transforma isso em erro de linha).
  IF public._financial_import_payment_method('Maquininha da esquina') IS NOT NULL THEN
    RAISE EXCEPTION 'forma de pagamento desconhecida deixou de ser NULL';
  END IF;
  IF public._financial_import_payment_method(NULL) IS NOT NULL
     OR public._financial_import_payment_method('   ') IS NOT NULL THEN
    RAISE EXCEPTION 'forma de pagamento vazia deixou de ser NULL';
  END IF;

  RAISE NOTICE 'importacao por planilha: 2 tabelas (6 policies cada), 1 tipo, 10 funcoes, anon=false em todas, forma de pagamento aceita codigo + rotulo nos 4 idiomas sem falso-positivo de prefixo';
END
$proof$;

COMMIT;
