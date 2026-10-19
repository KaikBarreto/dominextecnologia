-- PDV, lado direito do caixa: retrodatar a venda e anexar foto ao PEDIDO
--
-- Pedido do CEO: no painel da direita do PDV, depois do total e antes de
-- finalizar, um campo de observacao do pedido e um botao "opcoes avancadas"
-- igual ao da EcoSistema, com (a) anexar foto comprimida e (b) retrodatar o
-- lancamento. Dos tres, UM NAO PRECISA DE BANCO: pdv_orders.notes JA EXISTE,
-- entao a observacao e so o front gravar no insert do pedido, e a compressao
-- ja mora em processImageFile (src/utils/imageConvert.ts). Os outros dois
-- nascem aqui.
--
-- ===========================================================================
-- PARTE 1 : pdv_settle_order ganha p_transaction_date (OPCIONAL)
-- ===========================================================================
--
-- Hoje a RPC crava CURRENT_DATE em transaction_date / paid_date e now() em
-- pdv_orders.paid_at. Nao havia como lancar a venda de ontem, que e o caso
-- real: a loja vendeu no sabado com o sistema fora do ar e lanca na segunda.
--
-- NULL = COMPORTAMENTO IDENTICO AO DE HOJE. O caminho feliz nao muda em nada,
-- e isso esta provado comparando transaction_date de uma venda sem o parametro.
--
-- O PONTO QUE ALGUEM VAI "CONSERTAR" ERRADO (leia antes de mexer):
--
--   O DINHEIRO DA VENDA RETRODATADA CONTINUA NA GAVETA DE HOJE, E ISSO ESTA
--   CERTO. O esperado do fechamento de caixa soma os pagamentos POR SESSAO
--   (pdv_close_cash_session: JOIN pdv_orders o ON o.id = pay.order_id WHERE
--   o.cash_session_id = <sessao>), SEM NENHUM filtro de data. Conferido na
--   definicao viva antes de escrever isto, nao por memoria. Entao lancar uma
--   venda com data de ontem NAO altera em um centavo o esperado da gaveta
--   aberta hoje, e nao deve alterar: o dinheiro esta fisicamente na gaveta de
--   hoje, porque foi hoje que ele entrou nela.
--
--   A data retroativa muda a COMPETENCIA (Financeiro, DRE, relatorio por
--   periodo). Ela nao muda ONDE O DINHEIRO ESTA. Sao duas perguntas
--   diferentes: "de que dia e esta receita" e "quanto tem na gaveta agora".
--
--   Corolario pratico: a conferencia do caixa de hoje vai fechar certo, e o DRE
--   de ontem vai mostrar a venda de ontem. Se alguem "corrigir" o esperado pra
--   filtrar por data, o caixa passa a acusar quebra fantasma todo dia que tiver
--   um lancamento retroativo. Nao faca isso.
--
-- IDEMPOTENCIA PRESERVADA: a segunda chamada com o mesmo client_request_id sai
-- pelo retorno idempotente ANTES de olhar a data, entao nao relanca nada e nao
-- muda a data do que ja foi gravado. A data da PRIMEIRA chamada e a que vale.
--
-- SEM SOBRECARGA: a assinatura antiga de 3 argumentos e DERRUBADA e a nova de 4
-- (sendo o 4o com DEFAULT) toma o lugar. Duas assinaturas deixariam o PostgREST
-- ambiguo, que foi exatamente o problema da register_inventory_movement de 8
-- argumentos removida hoje. O corpo abaixo foi extraido de pg_get_functiondef
-- da funcao VIVA (ela levou 2 rodadas de ajuste hoje; o arquivo de origem nao e
-- mais a verdade) e alterado em 6 pontos, todos comentados no lugar.
--
-- ===========================================================================
-- PARTE 2 : public.pdv_order_attachments (a foto e DO PEDIDO)
-- ===========================================================================
--
-- POR QUE TABELA NOVA E NAO financial_transaction_attachments:
-- porque a foto e do PEDIDO. Venda com pagamento misto gera DOIS OU MAIS
-- financial_transactions (uma perna por forma de pagamento), e aquela tabela e
-- chaveada por transaction_id. Pendurar o comprovante "na transacao" obrigaria
-- a escolher arbitrariamente uma das pernas, e a foto apareceria em uma parcela
-- e nao na outra. Pior: no modo balcao o pedido existe (e pode ter foto) ANTES
-- de qualquer transacao existir.
--
-- BUCKET: REAPROVEITA financial-receipts. Conferido: private=true,
-- file_size_limit=null, allowed_mime_types=null, e as 4 policies dele ja sao
-- uma por comando, TO authenticated, com carimbo de empresa
-- (storage_insert_company_ok / storage_stamp_company_ok). Bucket novo seria
-- superficie nova com 4 policies pra errar de novo, pra guardar exatamente o
-- mesmo tipo de arquivo (comprovante de dinheiro). Caminho esperado:
--     <company_id>/pdv-orders/<order_id>/<uuid>_<arquivo>
-- A primeira pasta precisa ser o company_id porque e o que
-- storage_insert_company_ok confere via storage_folder_uuid(name), e a tabela
-- repete essa exigencia num CHECK (defesa em profundidade: a linha nao pode
-- apontar pra pasta de outro tenant nem se o front errar).
--
-- PRIVILEGIO E RLS (a regua que ficou caro hoje, 18/10/2026):
--   REVOKE ALL de anon E de authenticated antes de qualquer GRANT (tabela nova
--   em public neste banco NASCE com arwdxtm pra os dois, e o REVOKE tambem e o
--   que fecha TRUNCATE, que ignora RLS); GRANT so de SELECT, INSERT e DELETE;
--   uma policy POR COMANDO, todas TO authenticated explicito, NENHUMA FOR ALL
--   (policy permissiva FOR ALL sombreia a estreita); auth.uid() embrulhado em
--   (SELECT ...) pra virar InitPlan.
--
-- SEM UPDATE DE PROPOSITO: anexo e metadado imutavel (quem subiu, quando, que
-- arquivo). Trocar a foto = apagar e subir outra, que deixa rastro; UPDATE de
-- storage_path deixaria a linha apontando pra outro arquivo com o
-- uploaded_by/uploaded_at do primeiro.
--
-- DELETE EXISTE, mas com freio: enquanto o pedido NAO foi pago, qualquer pessoa
-- da empresa apaga (e rascunho, nao ha registro de dinheiro ainda, e e
-- exatamente o caso de "anexei a foto errada antes de finalizar"). Depois de
-- pago, a foto e documento de um registro de dinheiro, e so quem administra o
-- sistema (can_manage_system) apaga. E a mesma regua que o Financeiro ja usa em
-- financial_transaction_attachments, cuja policy de DELETE e de manager.
-- A regra vai em TRIGGER com mensagem PT-BR, NAO no USING da policy: RLS
-- negando DELETE no PostgREST devolve 204 com zero linha e o usuario ve
-- "sucesso" sem nada ter acontecido.
-- Limite honesto desta trava: a policy de DELETE do bucket financial-receipts
-- permite que qualquer pessoa da empresa remova o ARQUIVO no Storage. Entao o
-- que a trava garante e que a LINHA (quem subiu, quando, que nome) sobrevive,
-- deixando rastro de que existiu um anexo. Fechar isso de vez seria estreitar a
-- policy do bucket, o que afeta o Financeiro todo e nao e decisao pra tomar de
-- passagem numa migration de PDV.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) A TABELA
-- ---------------------------------------------------------------------------
-- Espelha financial_transaction_attachments coluna por coluna (id,
-- storage_path, file_name, mime_type, size_bytes, uploaded_by, uploaded_at),
-- trocando transaction_id por order_id e ACRESCENTANDO company_id. A tabela do
-- Financeiro nao tem company_id e paga o preco: toda policy dela e um EXISTS
-- com JOIN em financial_transactions. Com company_id na linha, a policy e uma
-- comparacao direta e o indice resolve.
CREATE TABLE IF NOT EXISTS public.pdv_order_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id     uuid        NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  storage_path text        NOT NULL
    CONSTRAINT pdv_order_attachments_storage_path_check CHECK (btrim(storage_path) <> ''),
  file_name    text        NOT NULL
    CONSTRAINT pdv_order_attachments_file_name_check CHECK (btrim(file_name) <> ''),
  mime_type    text,
  size_bytes   bigint
    CONSTRAINT pdv_order_attachments_size_check CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

-- O caminho TEM que comecar pela pasta da propria empresa. E o mesmo predicado
-- que a policy do bucket aplica (storage_folder_uuid(name)); repetir aqui
-- impede que a LINHA aponte pra pasta de outro tenant mesmo que alguem suba o
-- arquivo por fora. Roda depois do BEFORE INSERT que preenche company_id, entao
-- enxerga o valor final.
ALTER TABLE public.pdv_order_attachments
  DROP CONSTRAINT IF EXISTS pdv_order_attachments_path_sob_a_empresa;
ALTER TABLE public.pdv_order_attachments
  ADD CONSTRAINT pdv_order_attachments_path_sob_a_empresa
  CHECK (storage_path LIKE (company_id::text || '/%'));

COMMENT ON TABLE public.pdv_order_attachments IS
  'Anexos (foto do comprovante, cupom assinado) de um PEDIDO do PDV. É do pedido e não da transação financeira de propósito: venda com pagamento misto gera dois ou mais financial_transactions e escolher uma das pernas pra pendurar a foto seria arbitrário. Arquivo mora no bucket privado financial-receipts, em <company_id>/pdv-orders/<order_id>/<uuid>_<arquivo>. Append-only pro usuário (sem UPDATE): trocar a foto é apagar e subir outra.';
COMMENT ON COLUMN public.pdv_order_attachments.storage_path IS
  'Caminho no bucket financial-receipts. OBRIGATORIAMENTE começa por <company_id>/ (CHECK pdv_order_attachments_path_sob_a_empresa): é o mesmo predicado que a policy do bucket aplica via storage_folder_uuid(name), repetido aqui pra a linha não poder apontar pra pasta de outro tenant.';
COMMENT ON COLUMN public.pdv_order_attachments.file_name IS
  'Nome ORIGINAL do arquivo, pra mostrar e pra baixar. O nome dentro do caminho é sanitizado (sanitizeStorageFileName) e prefixado por uuid, então os dois não são iguais.';
COMMENT ON COLUMN public.pdv_order_attachments.size_bytes IS
  'Tamanho informado PELO CLIENTE. Serve pra exibir, não é trava: quem mente no payload já subiu o arquivo grande no Storage de qualquer jeito. Limite de verdade, se um dia precisar, é file_size_limit do bucket.';

CREATE INDEX IF NOT EXISTS idx_pdv_order_attachments_order
  ON public.pdv_order_attachments (order_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_pdv_order_attachments_company
  ON public.pdv_order_attachments (company_id, uploaded_at DESC);

-- Replay do mesmo insert (fila offline do PWA, retry de rede) nao vira anexo
-- duplicado: o caminho ja carrega um uuid, entao duas linhas com o MESMO
-- storage_path no mesmo pedido so podem ser a mesma intencao gravada duas
-- vezes. O front pode usar upsert com ignoreDuplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_order_attachments_order_path
  ON public.pdv_order_attachments (order_id, storage_path);

-- ---------------------------------------------------------------------------
-- 2) RLS + PRIVILEGIO
-- ---------------------------------------------------------------------------
ALTER TABLE public.pdv_order_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pdv_order_attachments FROM anon;
REVOKE ALL ON public.pdv_order_attachments FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.pdv_order_attachments TO authenticated;
GRANT ALL    ON public.pdv_order_attachments TO service_role;

-- Derruba as 4 possiveis antes de criar as 3 que ficam, pra rodar duas vezes
-- nao duplicar nem deixar sobra de uma versao anterior (inclusive a de
-- service_role, que nao deve existir: service_role tem BYPASSRLS e uma policy
-- FOR ALL pra ele seria justamente o cmd=ALL que a auditoria nao quer ver).
DROP POLICY IF EXISTS pdv_order_attachments_select_own_company ON public.pdv_order_attachments;
DROP POLICY IF EXISTS pdv_order_attachments_insert_own_company ON public.pdv_order_attachments;
DROP POLICY IF EXISTS pdv_order_attachments_update_own_company ON public.pdv_order_attachments;
DROP POLICY IF EXISTS pdv_order_attachments_delete_own_company ON public.pdv_order_attachments;
DROP POLICY IF EXISTS service_role_full_access_pdv_order_attachments ON public.pdv_order_attachments;

CREATE POLICY pdv_order_attachments_select_own_company
  ON public.pdv_order_attachments FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

CREATE POLICY pdv_order_attachments_insert_own_company
  ON public.pdv_order_attachments FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- Posse so. "Pedido pago e anexo de manager" e integridade e vai no gatilho da
-- secao 4, com mensagem que chega na tela.
CREATE POLICY pdv_order_attachments_delete_own_company
  ON public.pdv_order_attachments FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 3) Triggers de company_id e de FK cross-tenant
-- ---------------------------------------------------------------------------
-- Tabela nova NAO HERDA nada: o company_id automatico e a validacao de
-- referencia entram na mao, como nas outras 7 tabelas do PDV.
DROP TRIGGER IF EXISTS tg_set_company_id_pdv_order_attachments ON public.pdv_order_attachments;
CREATE TRIGGER tg_set_company_id_pdv_order_attachments
  BEFORE INSERT ON public.pdv_order_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- A RLS garante que a LINHA e minha; ela nao garante que o que a linha APONTA e
-- meu. Sem isto, um client comprometido insere anexo com company_id meu e
-- order_id de pedido de OUTRA empresa: passa na policy e passa na FK (que nao
-- sabe nada de tenant). A funcao ja existe e trata por TG_TABLE_NAME, entao
-- aqui ela ganha um ramo novo. Recriada a partir da definicao viva.
CREATE OR REPLACE FUNCTION public.pdv_assert_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Registro do PDV sem empresa definida.' USING ERRCODE = '42501';
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'pdv_terminals' THEN
      PERFORM public.pdv_assert_ref_company('public.stocks', NEW.stock_id, NEW.company_id, 'O local de estoque');

    WHEN 'pdv_cash_sessions' THEN
      PERFORM public.pdv_assert_ref_company('public.pdv_terminals', NEW.terminal_id, NEW.company_id, 'O terminal');

    WHEN 'pdv_cash_movements' THEN
      PERFORM public.pdv_assert_ref_company('public.pdv_cash_sessions', NEW.session_id, NEW.company_id, 'A sessão de caixa');
      PERFORM public.pdv_assert_ref_company('public.financial_accounts', NEW.to_account_id, NEW.company_id, 'A conta de destino');
      PERFORM public.pdv_assert_ref_company('public.financial_transactions', NEW.financial_transaction_id, NEW.company_id, 'O lançamento financeiro');

    WHEN 'pdv_orders' THEN
      PERFORM public.pdv_assert_ref_company('public.customers', NEW.customer_id, NEW.company_id, 'O cliente');
      PERFORM public.pdv_assert_ref_company('public.stocks', NEW.stock_id, NEW.company_id, 'O local de estoque');
      PERFORM public.pdv_assert_ref_company('public.pdv_terminals', NEW.terminal_id, NEW.company_id, 'O terminal');
      PERFORM public.pdv_assert_ref_company('public.pdv_cash_sessions', NEW.cash_session_id, NEW.company_id, 'A sessão de caixa');

    WHEN 'pdv_order_items' THEN
      PERFORM public.pdv_assert_ref_company('public.pdv_orders', NEW.order_id, NEW.company_id, 'O pedido');
      PERFORM public.pdv_assert_ref_company('public.inventory', NEW.inventory_id, NEW.company_id, 'O produto');

    WHEN 'pdv_order_payments' THEN
      PERFORM public.pdv_assert_ref_company('public.pdv_orders', NEW.order_id, NEW.company_id, 'O pedido');
      PERFORM public.pdv_assert_ref_company('public.financial_accounts', NEW.financial_account_id, NEW.company_id, 'A conta');
      PERFORM public.pdv_assert_ref_company('public.financial_transactions', NEW.financial_transaction_id, NEW.company_id, 'O lançamento financeiro');
      PERFORM public.pdv_assert_ref_company('public.tenant_charges', NEW.tenant_charge_id, NEW.company_id, 'A cobrança');

    WHEN 'pdv_order_attachments' THEN
      PERFORM public.pdv_assert_ref_company('public.pdv_orders', NEW.order_id, NEW.company_id, 'O pedido');

    WHEN 'customer_credit_ledger' THEN
      PERFORM public.pdv_assert_ref_company('public.customers', NEW.customer_id, NEW.company_id, 'O cliente');
      PERFORM public.pdv_assert_ref_company('public.pdv_orders', NEW.order_id, NEW.company_id, 'O pedido');
      PERFORM public.pdv_assert_ref_company('public.financial_transactions', NEW.financial_transaction_id, NEW.company_id, 'O lançamento financeiro');

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.pdv_assert_tenant_refs() IS
  'Recusa INSERT/UPDATE em tabela do PDV cuja FK aponte pra linha de OUTRA empresa. A RLS garante que a linha escrita é minha; ela não garante que o que a linha aponta é meu. Mensagem em PT-BR, nunca bloqueio silencioso. Cobre as 8 tabelas do módulo, incluindo pdv_order_attachments.';

REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs() FROM authenticated;

-- tg_zz pra rodar DEPOIS do tg_set_company_id_* (o Postgres dispara por ordem
-- alfabetica de nome dentro do mesmo evento): a validacao precisa do
-- company_id ja preenchido.
DROP TRIGGER IF EXISTS tg_zz_tenant_refs_pdv_order_attachments ON public.pdv_order_attachments;
CREATE TRIGGER tg_zz_tenant_refs_pdv_order_attachments
  BEFORE INSERT OR UPDATE ON public.pdv_order_attachments
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_tenant_refs();

-- ---------------------------------------------------------------------------
-- 4) Integridade de exclusao do anexo : erro PT-BR, nunca 204 silencioso
-- ---------------------------------------------------------------------------
-- Pedido ainda nao pago: qualquer pessoa da empresa apaga (foto errada antes de
-- finalizar e o caso comum do balcao). Pedido pago ou entregue: a foto e
-- documento de um registro de dinheiro, e so can_manage_system apaga.
--
-- As DUAS VALVULAS do modulo, na mesma ordem das outras travas do PDV:
--   a) empresa ja nao existe = estamos dentro do CASCADE de
--      admin_delete_company (o RI trigger do cascade roda depois da exclusao do
--      pai). Sem isto, excluir um tenant que vendeu no PDV com anexo quebraria.
--   b) GUC app.pdv_purge_company igual ao company_id da linha = expurgo do
--      Zerar Sistema (transaction-local). Mesma valvula de
--      pdv_block_delete_of_closed_order.
-- Ha ainda um terceiro caminho de cascade: apagar um PEDIDO (so rascunho e
-- permitido, pela tg_pdv_orders_block_delete) leva os anexos dele. Esse passa
-- sozinho, porque rascunho nao e 'pago'.
CREATE OR REPLACE FUNCTION public.pdv_block_delete_of_paid_order_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_number integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  IF coalesce(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN OLD;
  END IF;

  -- service_role e super_admin passam: quem opera o painel master nao e o
  -- caixa da loja.
  IF public.is_super_admin(auth.uid()) THEN
    RETURN OLD;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT o.status, o.number INTO v_status, v_number
    FROM public.pdv_orders o
   WHERE o.id = OLD.order_id;

  -- Pedido ja sumiu = cascade do DELETE do proprio pedido (rascunho).
  IF v_status IS NULL THEN
    RETURN OLD;
  END IF;

  IF v_status IN ('pago', 'entregue')
     AND NOT public.can_manage_system(auth.uid()) THEN
    RAISE EXCEPTION 'O pedido nº % já foi finalizado, então o anexo dele só pode ser removido por um responsável pelo sistema.', v_number
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END
$fn$;

COMMENT ON FUNCTION public.pdv_block_delete_of_paid_order_attachment() IS
  'Recusa DELETE de anexo de pedido já pago/entregue quando quem apaga não administra o sistema (can_manage_system). Antes do pagamento o anexo é livre: foto errada em rascunho é erro de digitação, não documento. Regra em gatilho e não no USING da policy porque RLS negando DELETE no PostgREST devolve 204 com zero linha e o usuário vê "sucesso" sem nada ter acontecido. Três válvulas: empresa inexistente (cascade de admin_delete_company), GUC app.pdv_purge_company (Zerar Sistema) e pedido inexistente (cascade do delete do rascunho).';

REVOKE ALL ON FUNCTION public.pdv_block_delete_of_paid_order_attachment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_paid_order_attachment() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_paid_order_attachment() FROM authenticated;

DROP TRIGGER IF EXISTS tg_pdv_order_attachments_block_delete ON public.pdv_order_attachments;
CREATE TRIGGER tg_pdv_order_attachments_block_delete
  BEFORE DELETE ON public.pdv_order_attachments
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_delete_of_paid_order_attachment();

-- ---------------------------------------------------------------------------
-- 5) pdv_settle_order : a assinatura NOVA (4 argumentos, o 4o opcional)
-- ---------------------------------------------------------------------------
-- DROP + CREATE em vez de sobrecarga: duas assinaturas visiveis deixam o
-- PostgREST ambiguo. O DROP leva os GRANTs, entao eles sao refeitos abaixo.
DROP FUNCTION IF EXISTS public.pdv_settle_order(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.pdv_settle_order(uuid, jsonb, text, date);

CREATE OR REPLACE FUNCTION public.pdv_settle_order(
  p_order_id         uuid,
  p_payments         jsonb,
  p_client_request_id text,
  p_transaction_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid         uuid := auth.uid();
  v_company     uuid;
  v_order       public.pdv_orders;
  v_snap        record;
  v_pay         jsonb;
  v_method      text;
  v_amount      numeric;
  v_change      numeric;
  v_account     uuid;
  v_acc_type    text;
  v_due         date;
  v_charge      uuid;
  v_tx          uuid;
  v_subtotal    numeric := 0;
  v_total       numeric := 0;
  v_sum_pay     numeric := 0;
  v_items       integer := 0;
  v_has_cash    boolean := false;
  v_session     uuid;
  v_session_st  text;
  v_other_num   integer;
  v_customer    record;
  v_debt        numeric := 0;
  v_fiado       numeric := 0;
  v_avisos      jsonb := '[]'::jsonb;
  v_stock_res   jsonb := NULL;
  v_cat_done    boolean := false;
  -- Retrodatacao. v_eff_date e a COMPETENCIA do lancamento (transaction_date /
  -- paid_date) e v_eff_paid_at e o paid_at do pedido. v_today_sp e hoje no fuso
  -- de Sao Paulo, que e a regua de "hoje" da casa (o banco roda em UTC, e UTC
  -- esta 3h adiante: depois das 21h locais CURRENT_DATE ja virou amanha).
  v_eff_date    date;
  v_eff_paid_at timestamptz;
  v_today_sp    date := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma forma de pagamento.' USING ERRCODE = '22023';
  END IF;

  -- Serializa o retry: duas chamadas pro mesmo pedido entram em fila aqui.
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-order:' || p_order_id::text, 0));

  SELECT * INTO v_order
    FROM public.pdv_orders o
   WHERE o.id = p_order_id
     AND o.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- CAMINHO IDEMPOTENTE: mesma chave, pedido ja finalizado. Devolve o resumo
  -- gravado e sai. Nao e erro: e retry de rede, offline ou duplo clique no F9.
  IF v_order.status IN ('pago', 'entregue') THEN
    IF p_client_request_id IS NOT NULL
       AND v_order.client_request_id IS NOT NULL
       AND v_order.client_request_id = p_client_request_id THEN
      -- data_lancamento vem do LANCAMENTO, nao do paid_at: pedido fechado
      -- antes desta migration tem paid_at = now() do momento, e derivar a data
      -- dali erraria em um dia nas vendas fechadas entre 21h e meia-noite.
      SELECT min(t.transaction_date) INTO v_eff_date
        FROM public.pdv_order_payments pay
        JOIN public.financial_transactions t ON t.id = pay.financial_transaction_id
       WHERE pay.order_id   = v_order.id
         AND pay.company_id = v_company;

      RETURN public.pdv_order_summary(v_order.id)
             || jsonb_build_object(
                  'idempotente',     true,
                  'avisos',          '[]'::jsonb,
                  'data_lancamento', v_eff_date
                );
    END IF;
    RAISE EXCEPTION 'O pedido nº % já foi finalizado.', v_order.number USING ERRCODE = '23505';
  END IF;

  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'O pedido nº % foi cancelado e não pode ser finalizado.', v_order.number USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------------------------
  -- A DATA DO LANCAMENTO (p_transaction_date)
  -- -------------------------------------------------------------------------
  -- Esta validacao fica DEPOIS do retorno idempotente de proposito: um retry
  -- de pedido ja finalizado tem que devolver o mesmo resumo, mesmo que o
  -- payload do retry carregue uma data que hoje seria recusada. Idempotencia
  -- nao pode depender da validacao de parametro.
  --
  -- DATA FUTURA E RECUSADA. Nao e teimosia: este lancamento nasce is_paid=true
  -- (dinheiro que JA entrou), e pagamento no futuro nao existe. E a mesma regua
  -- que o Financeiro ja aplica no TransactionFormDialog ("Já foi pago (ou
  -- recebido) é, no máximo, hoje"), com a MESMA frase, pra o operador nao
  -- aprender duas regras pro mesmo conceito. A comparacao e contra o dia de
  -- SAO PAULO, nao contra CURRENT_DATE: entre 21h e meia-noite CURRENT_DATE
  -- (UTC) ja e amanha, e recusar "hoje" pro caixa de uma loja aberta a noite
  -- seria um bug inexplicavel na tela.
  --
  -- NAO HA LIMITE DE QUANTO PRA TRAS, de proposito. Procurei trava de
  -- competencia fechada no Financeiro antes de decidir: nao existe nenhuma
  -- (financial_transactions nao tem CHECK nem trigger de data, e dado legado
  -- com data futura existe em producao justamente porque nunca houve trava).
  -- A unica nocao de "competencia encerrada" da casa mora na NFS-e automatica
  -- (nfse_auto_aguardar_decisao) e e sobre EMITIR NOTA, nao sobre lancar venda.
  -- Inventar aqui um segundo limite seria criar uma regua nova que o contador
  -- do cliente nao pediu e que ninguem mais respeita. O aviso de "isso muda a
  -- competencia" fica na TELA, onde o humano decide.
  IF p_transaction_date IS NOT NULL AND p_transaction_date > v_today_sp THEN
    RAISE EXCEPTION 'Esta data não pode ser no futuro. Já foi pago (ou recebido) é, no máximo, hoje.'
      USING ERRCODE = '22023';
  END IF;

  -- Caminho feliz INTACTO: parametro nulo = CURRENT_DATE e now(), exatamente
  -- como antes desta migration.
  v_eff_date := COALESCE(p_transaction_date, CURRENT_DATE);

  IF p_transaction_date IS NULL OR p_transaction_date = v_today_sp THEN
    -- Venda de hoje guarda a HORA de verdade. O front que sempre manda a data
    -- (picker preenchido com hoje) nao perde o relogio por isso.
    v_eff_paid_at := now();
  ELSE
    -- Venda retrodatada: MEIO-DIA de Sao Paulo no dia escolhido. Meio-dia e
    -- ancora anti-drift: 12:00 em Sao Paulo e 15:00 UTC no MESMO dia, entao
    -- qualquer leitura (local ou UTC crua) devolve a data que a pessoa
    -- escolheu. Meia-noite local cairia no dia anterior em UTC e a venda
    -- apareceria um dia antes em qualquer relatorio que leia o timestamp cru.
    v_eff_paid_at := (p_transaction_date + time '12:00') AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- Chave ja usada em OUTRO pedido: o indice unico parcial estouraria com erro
  -- cru 23505 mais abaixo. Aqui vira mensagem que o operador entende.
  IF p_client_request_id IS NOT NULL THEN
    SELECT o.number INTO v_other_num
      FROM public.pdv_orders o
     WHERE o.company_id = v_company
       AND o.client_request_id = p_client_request_id
       AND o.id <> p_order_id
     LIMIT 1;
    IF v_other_num IS NOT NULL THEN
      RAISE EXCEPTION 'Esta finalização já foi registrada no pedido nº %.', v_other_num USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Total recalculado dos ITENS. Pedido sem item nao fecha.
  SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_items, v_subtotal
    FROM public.pdv_order_items i
   WHERE i.order_id = v_order.id;

  IF v_items = 0 THEN
    RAISE EXCEPTION 'Não dá para finalizar um pedido sem itens.' USING ERRCODE = '22023';
  END IF;

  v_subtotal := round(v_subtotal, 2);
  v_total    := round(GREATEST(v_subtotal - COALESCE(v_order.discount_amount, 0), 0), 2);

  -- Total zero (desconto comeu a venda inteira) nao fecha: cada forma de
  -- pagamento tem que ser maior que zero por CHECK, entao a soma nunca
  -- fecharia em zero e o operador ficaria num beco sem mensagem.
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'O total do pedido nº % ficou em zero. Revise o desconto antes de finalizar.', v_order.number
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  -- Primeira passada: valida tudo e soma, SEM gravar nada. Dinheiro nao se
  -- grava pela metade, e e mais barato recusar antes de inserir a primeira
  -- linha do que confiar no rollback.
  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := NULLIF(btrim(COALESCE(v_pay->>'method', '')), '');
    v_amount := round(COALESCE((v_pay->>'amount')::numeric, 0), 2);

    IF v_method IS NULL THEN
      RAISE EXCEPTION 'Escolha a forma de pagamento.' USING ERRCODE = '22023';
    END IF;
    IF v_method = 'pontos' THEN
      RAISE EXCEPTION 'Pagamento com pontos ainda não está disponível.' USING ERRCODE = '0A000';
    END IF;
    IF v_method NOT IN ('dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida: %.', v_method USING ERRCODE = '22023';
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'O valor de cada forma de pagamento tem que ser maior que zero.' USING ERRCODE = '22023';
    END IF;

    v_sum_pay := v_sum_pay + v_amount;
    IF v_method = 'dinheiro' THEN
      v_has_cash := true;
    ELSIF v_method = 'fiado' THEN
      v_fiado := v_fiado + v_amount;
    ELSE
      v_account := NULLIF(v_pay->>'account_id', '')::uuid;
      IF v_account IS NULL THEN
        RAISE EXCEPTION 'Escolha a conta que vai receber o pagamento em %.', v_method USING ERRCODE = '23502';
      END IF;
      -- Mensagem unica pra conta inexistente, inativa ou de outra empresa.
      SELECT fa.type INTO v_acc_type
        FROM public.financial_accounts fa
       WHERE fa.id = v_account
         AND fa.company_id = v_company
         AND fa.is_active IS TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
      END IF;
      IF v_acc_type = 'cartao' THEN
        RAISE EXCEPTION 'Cartão de crédito não recebe venda. Escolha uma conta de banco ou de dinheiro.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF abs(v_sum_pay - v_total) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) não confere com o total do pedido (%).',
      public.pdv_fmt_brl(v_sum_pay), public.pdv_fmt_brl(v_total)
      USING ERRCODE = '23514';
  END IF;

  IF v_has_cash AND v_snap.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta do cofre em Configurações do PDV antes de receber em dinheiro.' USING ERRCODE = '23502';
  END IF;

  -- Fiado: cliente obrigatorio e limite respeitado. O saldo devedor e a SOMA do
  -- ledger, nunca uma coluna em customers.
  IF v_fiado > 0 THEN
    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda no fiado precisa de cliente identificado no pedido.' USING ERRCODE = '23502';
    END IF;

    SELECT c.name, c.credit_limit INTO v_customer
      FROM public.customers c
     WHERE c.id = v_order.customer_id
       AND c.company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0) INTO v_debt
      FROM public.customer_credit_ledger l
     WHERE l.company_id  = v_company
       AND l.customer_id = v_order.customer_id;

    IF v_customer.credit_limit IS NULL THEN
      v_avisos := v_avisos || jsonb_build_array('cliente_sem_limite_definido');
    ELSIF round(v_debt + v_fiado, 2) > round(v_customer.credit_limit, 2) THEN
      RAISE EXCEPTION '% já deve % e o limite é %. Esta venda no fiado (%) passaria do limite.',
        v_customer.name,
        public.pdv_fmt_brl(v_debt),
        public.pdv_fmt_brl(v_customer.credit_limit),
        public.pdv_fmt_brl(v_fiado)
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Sessao de caixa: a do pedido, senao a aberta do terminal, senao a aberta
  -- deste operador. Venda em DINHEIRO exige caixa aberto; venda so em pix /
  -- cartao / fiado nao, porque ali nada entra na gaveta.
  v_session := v_order.cash_session_id;
  IF v_session IS NULL AND v_order.terminal_id IS NOT NULL THEN
    SELECT s.id INTO v_session
      FROM public.pdv_cash_sessions s
     WHERE s.terminal_id = v_order.terminal_id
       AND s.company_id  = v_company
       AND s.status      = 'aberta'
     LIMIT 1;
  END IF;
  IF v_session IS NULL THEN
    SELECT s.id INTO v_session
      FROM public.pdv_cash_sessions s
     WHERE s.company_id = v_company
       AND s.status     = 'aberta'
       AND s.opened_by  = v_uid
     ORDER BY s.opened_at DESC
     LIMIT 1;
  END IF;

  IF v_has_cash THEN
    IF v_session IS NULL THEN
      RAISE EXCEPTION 'Abra o caixa antes de receber em dinheiro.' USING ERRCODE = '42501';
    END IF;
    SELECT s.status INTO v_session_st
      FROM public.pdv_cash_sessions s
     WHERE s.id = v_session AND s.company_id = v_company;
    IF v_session_st IS DISTINCT FROM 'aberta' THEN
      RAISE EXCEPTION 'O caixa deste pedido já foi fechado. Abra um caixa para receber em dinheiro.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Daqui pra baixo GRAVA. Tudo na mesma transacao.
  UPDATE public.pdv_orders
     SET subtotal          = v_subtotal,
         total             = v_total,
         cash_session_id   = COALESCE(cash_session_id, v_session),
         client_request_id = COALESCE(p_client_request_id, client_request_id)
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := btrim(v_pay->>'method');
    v_amount := round((v_pay->>'amount')::numeric, 2);
    v_change := round(GREATEST(COALESCE((v_pay->>'change_amount')::numeric, 0), 0), 2);
    v_charge := NULLIF(v_pay->>'tenant_charge_id', '')::uuid;
    v_tx     := NULL;

    IF NOT v_cat_done THEN
      INSERT INTO public.financial_categories (company_id, name, type, dre_group, icon, color)
      VALUES (v_company, 'Venda no PDV', 'entrada', 'opex', 'ShoppingCart', '#16a34a')
      ON CONFLICT (company_id, name) DO NOTHING;
      IF v_fiado > 0 THEN
        INSERT INTO public.financial_categories (company_id, name, type, dre_group, icon, color)
        VALUES (v_company, 'Venda no fiado', 'entrada', 'opex', 'Handshake', '#16a34a')
        ON CONFLICT (company_id, name) DO NOTHING;
      END IF;
      v_cat_done := true;
    END IF;

    IF v_method = 'fiado' THEN
      -- A RECEBER: is_paid=false, com vencimento, SEM conta (o dinheiro nao
      -- entrou). Default do vencimento e hoje + 1 MES CALENDARIO, nunca 30 dias.
      -- O prazo conta da DATA DA VENDA, nao de hoje: fiado de 3 dias atras com
      -- 1 mes de prazo vence 1 mes depois DAQUELE dia. Ancorar em hoje daria ao
      -- cliente alguns dias de brinde e o extrato nao fecharia com o papel.
      -- Mes CALENDARIO (interval '1 month'), nunca 30 dias.
      v_due := COALESCE(NULLIF(v_pay->>'due_date', '')::date, (v_eff_date + interval '1 month')::date);

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, due_date, is_paid, customer_id, origin,
        payment_method, created_by
      ) VALUES (
        v_company, 'entrada'::transaction_type,
        'Venda no fiado, pedido PDV nº ' || v_order.number::text,
        v_amount, 'Venda no fiado',
        v_eff_date, v_due, false, v_order.customer_id, 'pdv',
        'fiado', v_uid
      )
      RETURNING id INTO v_tx;

      INSERT INTO public.pdv_order_payments (
        company_id, order_id, method, amount, change_amount,
        financial_account_id, financial_transaction_id, tenant_charge_id, created_by
      ) VALUES (
        v_company, v_order.id, 'fiado', v_amount, 0,
        NULL, v_tx, v_charge, v_uid
      );

      -- Ledger append-only. Correcao futura e linha de kind 'ajuste'.
      INSERT INTO public.customer_credit_ledger (
        company_id, customer_id, kind, amount, order_id,
        financial_transaction_id, created_by, notes
      ) VALUES (
        v_company, v_order.customer_id, 'venda_fiado', v_amount, v_order.id,
        v_tx, v_uid, 'Venda no fiado, pedido PDV nº ' || v_order.number::text
      );
    ELSE
      v_account := CASE
                     WHEN v_method = 'dinheiro' THEN v_snap.cash_account_id
                     ELSE NULLIF(v_pay->>'account_id', '')::uuid
                   END;

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, paid_date, is_paid, account_id, customer_id,
        origin, payment_method, tenant_charge_id, created_by
      ) VALUES (
        v_company, 'entrada'::transaction_type,
        'Venda no PDV, pedido nº ' || v_order.number::text,
        v_amount, 'Venda no PDV',
        v_eff_date, v_eff_date, true, v_account, v_order.customer_id,
        -- payment_method segue a convencao JA usada no resto do financeiro
        -- (medido em producao: pix / dinheiro / transferencia / cartao_debito /
        -- cartao_credito). Gravar 'debito' cru criaria um valor novo pro mesmo
        -- conceito e quebraria agrupamento de relatorio por forma de pagamento.
        'pdv',
        CASE v_method
          WHEN 'debito'  THEN 'cartao_debito'
          WHEN 'credito' THEN 'cartao_credito'
          ELSE v_method
        END,
        v_charge, v_uid
      )
      RETURNING id INTO v_tx;

      INSERT INTO public.pdv_order_payments (
        company_id, order_id, method, amount, change_amount,
        financial_account_id, financial_transaction_id, tenant_charge_id, created_by
      ) VALUES (
        v_company, v_order.id, v_method, v_amount, v_change,
        v_account, v_tx, v_charge, v_uid
      );
    END IF;
  END LOOP;

  UPDATE public.pdv_orders
     SET status  = 'pago',
         paid_at = v_eff_paid_at
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Modo SIMPLES: um operador faz tudo e o estoque baixa na hora do pagamento.
  -- Modo BALCAO: o estoque so baixa na entrega (Expedicao, Onda 2), entao aqui
  -- nao se baixa nada.
  IF COALESCE(v_snap.pdv_mode, 'simples') = 'simples' THEN
    v_stock_res := public.pdv_commit_order_stock(v_order.id);
    IF jsonb_typeof(v_stock_res->'avisos') = 'array' THEN
      v_avisos := v_avisos || (v_stock_res->'avisos');
    END IF;
  END IF;

  RETURN public.pdv_order_summary(v_order.id)
         || jsonb_build_object(
              'idempotente',     false,
              'modo',            COALESCE(v_snap.pdv_mode, 'simples'),
              'estoque',         v_stock_res,
              'avisos',          v_avisos,
              -- A tela confirma pelo retorno em que dia a venda caiu, sem
              -- precisar de um SELECT depois.
              'data_lancamento', v_eff_date,
              'retrodatado',     (p_transaction_date IS NOT NULL AND p_transaction_date < v_today_sp)
            );
END
$fn$;

COMMENT ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) IS
  'Finaliza o pedido do PDV numa transação só: cria os financial_transactions (um por forma de pagamento, origin=pdv), grava pdv_order_payments, o fiado vai pro customer_credit_ledger respeitando credit_limit, muda o status pra pago e, no modo simples, baixa o estoque pelo Kardex. Idempotente por client_request_id: a 2ª chamada devolve o mesmo resumo com idempotente=true, sem relançar e SEM mudar a data do que já foi gravado (a data da 1ª chamada é a que vale).
p_transaction_date (OPCIONAL) retrodata o lançamento: NULL = comportamento idêntico ao histórico (CURRENT_DATE e now()); preenchido = vira transaction_date, paid_date e pdv_orders.paid_at (meio-dia de São Paulo, âncora anti-drift de fuso). Data FUTURA é recusada com a mesma frase que o Financeiro já usa ("Já foi pago (ou recebido) é, no máximo, hoje"), porque o lançamento nasce is_paid=true e pagamento no futuro não existe. NÃO há limite de quanto pra trás, de propósito: não existe trava de competência fechada no Financeiro desta casa (nenhum CHECK nem trigger de data em financial_transactions), e inventar uma segunda régua aqui brigaria com o fechamento que o contador do cliente faz. O aviso de competência fica na tela.
ATENÇÃO, O PONTO QUE PARECE BUG E NÃO É: a venda retrodatada CONTINUA contando na gaveta de HOJE, e isso está correto. O esperado do fechamento (pdv_close_cash_session) soma os pagamentos POR SESSÃO (pdv_orders.cash_session_id), sem nenhum filtro de data, porque o dinheiro está fisicamente na gaveta de hoje: foi hoje que ele entrou nela. A data retroativa muda a COMPETÊNCIA (Financeiro, DRE, relatório por período), não ONDE O DINHEIRO ESTÁ. Quem "corrigir" o esperado pra filtrar por data vai fazer o caixa acusar quebra fantasma em todo dia que tiver lançamento retroativo.';

REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) A migration CONFERE A SI MESMA antes de comitar
-- ---------------------------------------------------------------------------
-- Falhar no deploy e muito mais barato que descobrir em producao. ACL de funcao
-- sempre por has_function_privilege, NUNCA por leitura de proacl: proacl nao
-- mostra privilegio herdado de PUBLIC, e foi essa leitura errada que deixou o
-- oraculo cross-tenant de hoje de manha passar na revisao.
DO $conf$
DECLARE
  v_n     integer;
  v_oid   oid;
  v_sig   text;
  v_funcs text[] := ARRAY[
    'public.pdv_settle_order(uuid,jsonb,text,date)',
    'public.pdv_assert_tenant_refs()',
    'public.pdv_block_delete_of_paid_order_attachment()'
  ];
BEGIN
  -- a) UMA assinatura so de pdv_settle_order (sobrecarga = PostgREST ambiguo)
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_settle_order';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pdv_settle_order ficou com % assinaturas. Tem que ser exatamente 1.', v_n;
  END IF;

  -- b) o 4o argumento tem que ter DEFAULT, senao toda chamada antiga de 3
  --    argumentos quebra em runtime
  SELECT p.pronargdefaults INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_settle_order';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'p_transaction_date nasceu SEM DEFAULT: as chamadas de 3 argumentos quebrariam.';
  END IF;

  -- c) ACL das funcoes
  FOREACH v_sig IN ARRAY v_funcs
  LOOP
    v_oid := v_sig::regprocedure::oid;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: anon ainda tem EXECUTE em %. Revogue de PUBLIC (nao basta revogar de anon).', v_sig;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.pdv_settle_order(uuid,jsonb,text,date)'::regprocedure::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated precisa de EXECUTE em pdv_settle_order e nao tem.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.pdv_settle_order(uuid,jsonb,text,date)'::regprocedure::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role precisa de EXECUTE em pdv_settle_order e nao tem.';
  END IF;
  IF has_function_privilege('authenticated', 'public.pdv_block_delete_of_paid_order_attachment()'::regprocedure::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: a funcao de gatilho nao pode ter EXECUTE pra authenticated.';
  END IF;

  -- d) RLS ligada na tabela nova
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pdv_order_attachments'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta ligada em pdv_order_attachments.';
  END IF;

  -- e) nenhum privilegio pra anon na tabela nova
  IF has_table_privilege('anon', 'public.pdv_order_attachments', 'SELECT')
     OR has_table_privilege('anon', 'public.pdv_order_attachments', 'INSERT')
     OR has_table_privilege('anon', 'public.pdv_order_attachments', 'UPDATE')
     OR has_table_privilege('anon', 'public.pdv_order_attachments', 'DELETE')
     OR has_table_privilege('anon', 'public.pdv_order_attachments', 'TRUNCATE') THEN
    RAISE EXCEPTION 'anon ficou com privilegio em pdv_order_attachments.';
  END IF;

  -- f) authenticated NAO pode ter UPDATE nem TRUNCATE (append-only pro usuario)
  IF has_table_privilege('authenticated', 'public.pdv_order_attachments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_order_attachments', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated ficou com UPDATE/TRUNCATE em pdv_order_attachments.';
  END IF;

  -- g) policies: 3, uma por comando, todas TO authenticated, nenhuma FOR ALL
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pdv_order_attachments';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'pdv_order_attachments ficou com % policies. Esperado 3 (SELECT, INSERT, DELETE).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pdv_order_attachments'
     AND (cmd = 'ALL' OR roles <> ARRAY['authenticated']::name[] OR permissive <> 'PERMISSIVE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% policy(s) de pdv_order_attachments com cmd=ALL ou role fora de authenticated.', v_n;
  END IF;

  RAISE NOTICE 'Conferido: pdv_settle_order com 1 assinatura e 4o arg com DEFAULT; pdv_order_attachments com RLS, sem anon, sem UPDATE pra authenticated e 3 policies uma por comando.';
END
$conf$;

COMMIT;
