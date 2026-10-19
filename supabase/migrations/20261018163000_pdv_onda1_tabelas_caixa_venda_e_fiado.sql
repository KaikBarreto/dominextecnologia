-- ============================================================================
-- MODULO PDV E LOJA : Onda 1, parte 4 de 4 (as tabelas novas: terminal, sessao
-- de caixa, sangria/suprimento, pedido, item, pagamento e conta corrente)
--
-- ESCOPO DESTE ARQUIVO: SO O SCHEMA. Nenhuma RPC de negocio entra aqui
-- (pdv_open_cash_session, pdv_settle_order, pdv_commit_order_stock,
-- pdv_cancel_order, pdv_generate_barcode, next_pdv_order_number) de proposito:
-- misturar schema com logica de dinheiro no mesmo review esconde erro nos dois.
-- Elas vem no despacho seguinte e sao as unicas coisas que vao escrever nestas
-- tabelas em producao.
--
-- NO MOMENTO EM QUE ESTA MIGRATION RODA NAO EXISTE NENHUM DADO DE PDV
-- ---------------------------------------------------------------------------
-- Conferido no banco: nenhuma tabela pdv_* existe. Logo nao ha backfill de
-- DADO, so de INVARIANTE: todo CHECK, todo NOT NULL e todo indice unico nasce
-- valido por construcao, e o "antes" e o "depois" sao identicos pra 100% das
-- empresas. Mesma retorica do cabecalho de 20261017180000 (Projetos).
--
-- ============================================================================
-- DECISAO 1 : company_id COM FK PRA companies, ON DELETE CASCADE
-- ---------------------------------------------------------------------------
-- Isso DIVERGE de stocks e inventory_stock_levels, que tem company_id SEM FK.
-- A divergencia e deliberada e tem motivo concreto: public.admin_delete_company
-- e public.reset_system_step apagam o tenant enumerando tabela por tabela, na
-- mao. Tabela nova que nao entra naquela lista ou (a) deixa lixo pra sempre, ou
-- (b) TRAVA a exclusao do tenant, porque o DELETE FROM customers bate numa FK
-- que ainda aponta pra ele.
-- Com a FK pra companies em CASCADE, o ultimo passo do admin_delete_company
-- (DELETE FROM public.companies) varre todo o PDV sozinho, sem precisar
-- reescrever aquela funcao gigante dentro de uma onda de feature.
-- (reset_system_step continua precisando de um step 'pdv' proprio pra "zerar o
-- sistema" sem apagar a empresa; isso esta reportado como pendencia de
-- Plataforma, nao e resolvido aqui.)
--
-- DECISAO 2 : FK PRA ENTIDADE DO TENANT E SEMPRE "ON DELETE SET NULL"
-- ---------------------------------------------------------------------------
-- customer_id, stock_id, inventory_id, financial_account_id,
-- financial_transaction_id e tenant_charge_id usam SET NULL. Nao e descuido com
-- a pista: e o que mantem admin_delete_company e reset_system_step
-- funcionando, porque eles apagam customers / inventory / financial_transactions
-- em STATEMENTS SEPARADOS, com as linhas de PDV ainda de pe. Com NO ACTION ali,
-- a exclusao do tenant quebraria no meio.
--
-- DECISAO 3 : FK ENTRE TABELAS DO PDV USA "NO ACTION" (o default), NAO RESTRICT
-- ---------------------------------------------------------------------------
-- pdv_cash_sessions.terminal_id e pdv_orders.cash_session_id apontam pra dentro
-- do proprio PDV e NAO podem ser apagados por acidente (terminal com historico
-- de caixa se desativa, nao se apaga: is_active=false). Isso pede checagem de
-- integridade, mas RESTRICT seria uma armadilha: RESTRICT e verificado NA HORA,
-- e durante o CASCADE da exclusao do tenant a ordem entre as duas tabelas nao e
-- garantida, entao ele poderia estourar. NO ACTION e verificado NO FIM DO
-- STATEMENT, quando as duas tabelas ja foram varridas pelo mesmo CASCADE. Mesma
-- protecao no dia a dia, sem o falso positivo na exclusao do tenant.
--
-- DECISAO 4 : set_company_id_on_insert EM TODAS AS TABELAS NOVAS
-- ---------------------------------------------------------------------------
-- Tabela nova NAO HERDA a trigger de company_id, e esse bug ja reincidiu duas
-- vezes neste projeto (stocks e material_groups). Aqui cada uma das 8 tabelas
-- ganha a trigger explicitamente, no fim do arquivo, em laco, pra nao dar
-- chance de esquecer uma.
-- Isso NAO dispensa o hook de mandar company_id explicito: a trigger e a rede
-- de seguranca (ela so age quando o INSERT veio sem company_id, e vira no-op
-- quando auth.uid() e NULL, ou seja, em chamada de service_role/webhook). Quem
-- manda company_id continua manda.
--
-- DECISAO 5 : salesperson_id APONTA PRA auth.users, NAO PRA public.salespeople
-- ---------------------------------------------------------------------------
-- public.salespeople NAO TEM company_id: e o time comercial da AUCTUS (quem
-- vendeu o SaaS pra empresa, apontado por companies.salesperson_id), nao o
-- balconista do tenant. Usar aquela tabela aqui misturaria dois mundos e seria
-- vazamento de conceito entre tenants. O vendedor do balcao e o USUARIO LOGADO
-- que montou o pedido, logo auth.users.
--
-- DECISAO 6 : A RLS NAO USA can_access_stock
-- ---------------------------------------------------------------------------
-- As tabelas de estoque gateiam por can_access_stock(auth.uid(), stock_id) alem
-- do company_id. Aqui NAO, de proposito: pdv_orders tem stock_id, mas e tambem
-- documento FINANCEIRO. Gatear o pedido pela ACL de estoque esconderia a venda
-- de quem cuida do dinheiro e nao tem acesso ao local. Quem continua gateado por
-- can_access_stock e o estoque em si (stocks, inventory_stock_levels), que e o
-- que a ACL existe pra proteger. A regra de "que local este caixa pode vender"
-- e validada na RPC de venda, nao escondendo o historico.
-- Regra de quem-ve-o-que definida por dev-plataforma-multitenant; aqui e a
-- implementacao em SQL.
--
-- DECISAO 7 : O GRANT INVISIVEL. REVOKE DE anon E DE authenticated, SEMPRE
-- ---------------------------------------------------------------------------
-- NESTE BANCO, CREATE TABLE EM public JA NASCE COM GRANT arwdxtm PRA anon E PRA
-- authenticated (conferido agora: pg_default_acl, defaclobjtype='r'). Ou seja,
-- omitir o GRANT NAO BASTA: a tabela nasce com SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE pra anon sem ninguem escrever uma linha, e a unica coisa segurando e
-- a RLS. Camada unica. Ja aconteceu em 11/09/2026 (cost_centers) e em
-- 02/10/2026 (salesperson_daily_activity).
-- Por isso a secao 9 faz, em TODA tabela nova:
--     REVOKE ALL FROM anon;  REVOKE ALL FROM authenticated;
--     GRANT <so o que a tela precisa> TO authenticated;
-- O REVOKE tambem e o que fecha TRUNCATE, que IGNORA RLS.
--
-- DECISAO 8 : LIVRO DE DINHEIRO E APPEND-ONLY NO NIVEL DE PRIVILEGIO
-- ---------------------------------------------------------------------------
-- authenticated recebe SELECT+INSERT e NADA MAIS em:
--     customer_credit_ledger  (a conta corrente do cliente)
--     pdv_order_payments      (o que foi recebido e em que forma)
--     pdv_cash_movements      (sangria e suprimento)
-- Corrigir lancamento nessas tabelas e LINHA NOVA (kind='ajuste', estorno),
-- nunca edicao nem exclusao da linha velha. Sem UPDATE e sem DELETE no GRANT,
-- nem um client comprometido reescreve divida de cliente ou apaga a sangria que
-- explica a falta na gaveta. As RPCs SECURITY DEFINER (proximo despacho) rodam
-- como owner e seguem conseguindo escrever o que precisam.
-- pdv_cash_sessions tambem NAO recebe DELETE: sessao de caixa nao se apaga.
--
-- DECISAO 9 : O CASCADE DE pdv_orders -> itens/pagamentos NAO PASSA PELA RLS
-- ---------------------------------------------------------------------------
-- Esta escrito aqui pra ninguem no futuro achar que a RLS das filhas e a
-- defesa: apagar o PAI por ON DELETE CASCADE apaga as FILHAS SEM avaliar a RLS
-- delas. Esta OK porque (a) pai e filha sao sempre da mesma empresa, garantido
-- pela trigger de integridade da secao 11, e (b) quem recorta o DELETE do pai e
-- a RLS do pai, que exige company_id do chamador. Quem defende as filhas e a
-- policy do PAI, nao a delas.
--
-- DECISAO 10 : INTEGRIDADE VAI EM GATILHO, NAO NO USING DA POLICY
-- ---------------------------------------------------------------------------
-- Era tentador escrever ... AND NOT EXISTS (venda vinculada) no USING do DELETE.
-- E seguro, mas RLS negando DELETE no PostgREST devolve 204 COM ZERO LINHAS: o
-- usuario le "excluido com sucesso" e nada aconteceu. Bloqueio silencioso ja
-- custou caro duas vezes neste projeto. Entao: POLICY = so posse (company_id).
-- INTEGRIDADE = trigger BEFORE DELETE com RAISE EXCEPTION em PT-BR, que chega
-- na tela como mensagem de erro de verdade (secao 12).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) public.pdv_terminals : o ponto de venda fisico (uma gaveta, um balcao)
-- ---------------------------------------------------------------------------
-- stock_id e o local de onde esse terminal vende (sempre um local
-- purpose='pdv'; o FK nao consegue exigir isso, a RPC valida). Nullable porque
-- o terminal pode ser cadastrado antes de a loja ter local proprio.
CREATE TABLE IF NOT EXISTS public.pdv_terminals (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  stock_id   uuid        REFERENCES public.stocks(id) ON DELETE SET NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pdv_terminals IS
  'Pontos de venda (caixas) da empresa. Terminal com histórico de sessão se DESATIVA (is_active=false), nunca se apaga: a FK de pdv_cash_sessions.terminal_id é NO ACTION e segura o DELETE.';
COMMENT ON COLUMN public.pdv_terminals.stock_id IS
  'Local de estoque de onde este terminal vende. Esperado stocks.purpose=''pdv''; validado na RPC de venda, porque FK não consegue exigir valor de coluna do pai.';

CREATE INDEX IF NOT EXISTS idx_pdv_terminals_company
  ON public.pdv_terminals (company_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2) public.pdv_cash_sessions : a sessao de caixa (o CONFERIDOR, nao uma conta)
-- ---------------------------------------------------------------------------
-- O COFRE e a conta financial_accounts type='caixa' apontada em
-- company_settings.pdv_cash_account_id. Abrir o caixa NAO TRANSFERE NADA: o
-- dinheiro continua inteiro no cofre. O que muda e a DISPONIBILIDADE:
--     reservado  = soma de opening_amount das sessoes com status='aberta'
--     disponivel = saldo do cofre - reservado
-- Fechar devolve o valor ao disponivel automaticamente, porque a sessao sai da
-- soma. Nao existe dinheiro materializado em lugar nenhum por causa do caixa, e
-- e justamente isso que impede o saldo de dobrar.
--
-- Durante a sessao, a venda em dinheiro credita a conta COFRE direto
-- (financial_transactions de entrada, is_paid=true). A sessao so compara:
--     esperado = abertura + vendas em dinheiro + suprimentos - sangrias
-- (o troco nao entra na conta porque amount do pagamento ja e o valor LIQUIDO
--  aplicado ao pedido; ver pdv_order_payments.change_amount)
CREATE TABLE IF NOT EXISTS public.pdv_cash_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  terminal_id     uuid        NOT NULL REFERENCES public.pdv_terminals(id),
  opened_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  opening_amount  numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_cash_sessions_opening_amount_check CHECK (opening_amount >= 0),
  closed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at       timestamptz,
  counted_amount  numeric,
  expected_amount numeric,
  difference      numeric,
  status          text        NOT NULL DEFAULT 'aberta'
    CONSTRAINT pdv_cash_sessions_status_check CHECK (status IN ('aberta', 'fechada')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Coerencia do fechamento: sessao aberta nao tem contagem nem data de
  -- fechamento, e sessao fechada tem as duas. Sem isso, um client bugado deixa
  -- a sessao em estado meio-fechado e o relatorio de caixa mente.
  CONSTRAINT pdv_cash_sessions_close_coherence CHECK (
    (status = 'aberta'  AND closed_at IS NULL     AND closed_by IS NULL
                        AND counted_amount IS NULL)
    OR
    (status = 'fechada' AND closed_at IS NOT NULL AND counted_amount IS NOT NULL)
  )
);

COMMENT ON TABLE public.pdv_cash_sessions IS
  'Sessão de caixa. É CONFERIDOR, não conta: abrir caixa não move dinheiro, só RESERVA (reservado = soma de opening_amount das sessões abertas; disponível no cofre = saldo da conta caixa menos o reservado). A trava de não abrir acima do disponível mora na RPC pdv_open_cash_session, com advisory lock por empresa, respeitando company_settings.pdv_strict_cash_tracking.';
COMMENT ON COLUMN public.pdv_cash_sessions.expected_amount IS
  'Quanto DEVERIA ter na gaveta: abertura + vendas em dinheiro + suprimentos - sangrias. Calculado e congelado pela RPC de fechamento, pra o comprovante não mudar depois.';
COMMENT ON COLUMN public.pdv_cash_sessions.difference IS
  'counted_amount - expected_amount. Sobra (positivo) entra como receita e falta (negativo) como despesa na conta cofre, categoria Quebra de caixa, pela RPC de fechamento.';

-- UMA sessao aberta por terminal. Belt do advisory lock da RPC: lock resolve a
-- corrida de duas aberturas simultaneas, o unique garante o invariante mesmo
-- contra um client que insira direto (foi exatamente o furo do PDV da
-- EcoSistema, onde a regra vivia so no cliente).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_cash_sessions_aberta_por_terminal
  ON public.pdv_cash_sessions (terminal_id)
  WHERE status = 'aberta';

CREATE INDEX IF NOT EXISTS idx_pdv_cash_sessions_company_status
  ON public.pdv_cash_sessions (company_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdv_cash_sessions_company_opened
  ON public.pdv_cash_sessions (company_id, opened_at DESC);

-- ---------------------------------------------------------------------------
-- 3) public.pdv_cash_movements : sangria e suprimento
-- ---------------------------------------------------------------------------
-- Sangria = dinheiro sai da gaveta e vai pro banco (ou pro cofre fisico).
-- Suprimento = dinheiro entra na gaveta (troco).
-- to_account_id e a conta DE DESTINO da sangria (ou de origem do suprimento);
-- NULL quando o dinheiro so trocou de lugar dentro do proprio cofre.
CREATE TABLE IF NOT EXISTS public.pdv_cash_movements (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id               uuid        NOT NULL REFERENCES public.pdv_cash_sessions(id) ON DELETE CASCADE,
  kind                     text        NOT NULL
    CONSTRAINT pdv_cash_movements_kind_check CHECK (kind IN ('sangria', 'suprimento')),
  amount                   numeric     NOT NULL
    CONSTRAINT pdv_cash_movements_amount_check CHECK (amount > 0),
  to_account_id            uuid        REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  financial_transaction_id uuid        REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  reason                   text,
  created_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pdv_cash_movements IS
  'Sangria (dinheiro sai da gaveta) e suprimento (dinheiro entra). amount é SEMPRE positivo; quem dá o sinal é kind. Entram na conta do esperado no fechamento.';

CREATE INDEX IF NOT EXISTS idx_pdv_cash_movements_session
  ON public.pdv_cash_movements (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pdv_cash_movements_company
  ON public.pdv_cash_movements (company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) public.pdv_order_number_counters : numeracao do pedido, por empresa
-- ---------------------------------------------------------------------------
-- Espelha compra_ordens_number_counters / project_number_counters. NAO e
-- sequence global: buracos na sequencia VAZAM o volume de operacao do vizinho,
-- e cada loja tem que comecar no pedido numero 1 na casa dela. NAO e MAX+1:
-- duas vendas simultaneas leriam o mesmo MAX. A funcao que consome o contador
-- vem no despacho das RPCs.
CREATE TABLE IF NOT EXISTS public.pdv_order_number_counters (
  company_id uuid    PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.pdv_order_number_counters IS
  'Próximo número de pedido do PDV por empresa. DELIBERADAMENTE sem nenhuma policy: o cliente nunca toca nesta tabela, só a função SECURITY DEFINER de numeração. Espelha project_number_counters.';

ALTER TABLE public.pdv_order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_order_number_counters FROM anon, authenticated;
GRANT ALL ON public.pdv_order_number_counters TO service_role;

-- ---------------------------------------------------------------------------
-- 5) public.pdv_orders : o pedido de venda
-- ---------------------------------------------------------------------------
-- status: rascunho -> aguardando_pagamento -> pago -> entregue, mais cancelado.
-- No modo simples o pedido nasce e morre em segundos; no modo balcao ele para
-- em aguardando_pagamento (vendedor), vira pago (caixa) e entregue (expedicao),
-- e e so na entrega que o estoque baixa.
CREATE TABLE IF NOT EXISTS public.pdv_orders (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number             integer     NOT NULL,
  customer_id        uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
  salesperson_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  stock_id           uuid        REFERENCES public.stocks(id) ON DELETE SET NULL,
  terminal_id        uuid        REFERENCES public.pdv_terminals(id),
  status             text        NOT NULL DEFAULT 'rascunho'
    CONSTRAINT pdv_orders_status_check CHECK (status IN (
      'rascunho', 'aguardando_pagamento', 'pago', 'entregue', 'cancelado')),
  subtotal           numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_orders_subtotal_check CHECK (subtotal >= 0),
  discount_amount    numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_orders_discount_check CHECK (discount_amount >= 0),
  coupon_id          uuid,
  points_redeemed    numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_orders_points_check CHECK (points_redeemed >= 0),
  total              numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_orders_total_check CHECK (total >= 0),
  cash_session_id    uuid        REFERENCES public.pdv_cash_sessions(id),
  stock_committed_at timestamptz,
  client_request_id  text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz
);

COMMENT ON TABLE public.pdv_orders IS
  'Pedido de venda do PDV. number é sequencial POR EMPRESA (pdv_order_number_counters). Toda escrita de produção passa pelas RPCs atômicas (pdv_settle_order, pdv_commit_order_stock, pdv_cancel_order).';
COMMENT ON COLUMN public.pdv_orders.coupon_id IS
  'Cupom aplicado. SEM FK de propósito: a tabela de cupom só nasce na Onda 4 (Comercial). A FK entra junto com ela, numa migration que já encontra a coluna aqui.';
COMMENT ON COLUMN public.pdv_orders.stock_committed_at IS
  'Quando o estoque deste pedido foi efetivamente baixado. É a trava de idempotência da pdv_commit_order_stock (mesma ideia do committed_quantity do consumo de OS): preenchido, não baixa de novo.';
COMMENT ON COLUMN public.pdv_orders.client_request_id IS
  'Chave de idempotência gerada NO CLIENTE. Único por empresa: chamar a RPC de fechamento duas vezes com o mesmo valor (retry de rede, offline, duplo clique no F9) não duplica lançamento nem baixa estoque duas vezes.';
COMMENT ON COLUMN public.pdv_orders.salesperson_id IS
  'Usuário logado que montou o pedido (auth.users). NÃO aponta pra public.salespeople, que é o time comercial da Auctus e não tem company_id.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_orders_company_number
  ON public.pdv_orders (company_id, number);

-- Idempotencia: duas chamadas com o mesmo client_request_id nao viram dois
-- pedidos. Parcial porque pedido criado pelo painel/importacao pode nao ter um.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_orders_company_client_request
  ON public.pdv_orders (company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_company_status
  ON public.pdv_orders (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdv_orders_company_customer
  ON public.pdv_orders (company_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdv_orders_cash_session
  ON public.pdv_orders (cash_session_id)
  WHERE cash_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdv_orders_company_paid_at
  ON public.pdv_orders (company_id, paid_at DESC)
  WHERE paid_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) public.pdv_order_items : as linhas do cupom
-- ---------------------------------------------------------------------------
-- inventory_id e NULLABLE de proposito: o PDV tambem vende SERVICO AVULSO de
-- balcao (mao de obra, "carga de gas", "instalacao") como item livre no mesmo
-- cupom, sem abrir OS. Esse item nao tem produto no catalogo.
--
-- description e unit_cost sao SNAPSHOT:
--   description : o cupom impresso nao pode mudar porque alguem renomeou o
--                 produto depois;
--   unit_cost   : E O QUE FAZ O LUCRO. Custo e historico; ler cost_price do
--                 catalogo depois da venda daria margem retroativa fantasiosa.
CREATE TABLE IF NOT EXISTS public.pdv_order_items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid    NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  inventory_id    uuid    REFERENCES public.inventory(id) ON DELETE SET NULL,
  description     text    NOT NULL,
  quantity        numeric NOT NULL DEFAULT 1
    CONSTRAINT pdv_order_items_quantity_check CHECK (quantity > 0),
  unit_price      numeric NOT NULL DEFAULT 0
    CONSTRAINT pdv_order_items_unit_price_check CHECK (unit_price >= 0),
  unit_cost       numeric NOT NULL DEFAULT 0
    CONSTRAINT pdv_order_items_unit_cost_check CHECK (unit_cost >= 0),
  discount_amount numeric NOT NULL DEFAULT 0
    CONSTRAINT pdv_order_items_discount_check CHECK (discount_amount >= 0),
  total           numeric NOT NULL DEFAULT 0
    CONSTRAINT pdv_order_items_total_check CHECK (total >= 0),
  sort_order      integer NOT NULL DEFAULT 0
);

COMMENT ON COLUMN public.pdv_order_items.inventory_id IS
  'Produto do catálogo. NULL = serviço avulso de balcão (mão de obra, carga de gás), que não tem produto e não move estoque.';
COMMENT ON COLUMN public.pdv_order_items.unit_cost IS
  'SNAPSHOT do custo unitário no momento da venda. É o que faz o lucro: ler cost_price do catálogo depois da venda daria margem retroativa fantasiosa.';

CREATE INDEX IF NOT EXISTS idx_pdv_order_items_order
  ON public.pdv_order_items (order_id, sort_order);
-- Serve a curva ABC, o giro e o "sem giro" (Onda 3), que leem venda por produto.
CREATE INDEX IF NOT EXISTS idx_pdv_order_items_company_inventory
  ON public.pdv_order_items (company_id, inventory_id)
  WHERE inventory_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7) public.pdv_order_payments : as formas de pagamento do pedido
-- ---------------------------------------------------------------------------
-- PAGAMENTO MISTO E REGRA, NAO EXCECAO no balcao (metade Pix, metade dinheiro),
-- e por isso isto e TABELA e nao coluna no pedido.
--   dinheiro      -> credita a conta COFRE
--   pix / transferencia / debito / credito -> credita a conta de banco escolhida
--   fiado         -> nao e dinheiro recebido: gera financial_transactions a
--                    receber (is_paid=false, com vencimento) + linha no
--                    customer_credit_ledger
--   pontos        -> abate sem dinheiro (Onda 4)
CREATE TABLE IF NOT EXISTS public.pdv_order_payments (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id                 uuid        NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  method                   text        NOT NULL
    CONSTRAINT pdv_order_payments_method_check CHECK (method IN (
      'dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado', 'pontos')),
  amount                   numeric     NOT NULL
    CONSTRAINT pdv_order_payments_amount_check CHECK (amount > 0),
  change_amount            numeric     NOT NULL DEFAULT 0
    CONSTRAINT pdv_order_payments_change_check CHECK (change_amount >= 0),
  financial_account_id     uuid        REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  financial_transaction_id uuid        REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  tenant_charge_id         uuid        REFERENCES public.tenant_charges(id) ON DELETE SET NULL,
  received_at              timestamptz NOT NULL DEFAULT now(),
  created_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);

COMMENT ON COLUMN public.pdv_order_payments.amount IS
  'Valor LÍQUIDO aplicado ao pedido nesta forma de pagamento. Em dinheiro, não é o que o cliente entregou: o que ele entregou é amount + change_amount. Assim o esperado do caixa é abertura + soma de amount em dinheiro + suprimentos - sangrias, sem precisar descontar troco e sem risco de contar duas vezes.';
COMMENT ON COLUMN public.pdv_order_payments.change_amount IS
  'Troco devolvido ao cliente, só pra imprimir no comprovante e auditar a gaveta. Não entra na conta do esperado (amount já é líquido).';
COMMENT ON COLUMN public.pdv_order_payments.tenant_charge_id IS
  'Cobrança em tenant_charges quando o Pix sai como QR Code via módulo Cobranças (Onda 2). NULL quando o Pix é confirmado na mão.';

CREATE INDEX IF NOT EXISTS idx_pdv_order_payments_order
  ON public.pdv_order_payments (order_id);
-- Relatorio por forma de pagamento e fechamento de caixa por metodo.
CREATE INDEX IF NOT EXISTS idx_pdv_order_payments_company_method
  ON public.pdv_order_payments (company_id, method, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdv_order_payments_transaction
  ON public.pdv_order_payments (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8) public.customer_credit_ledger : a conta corrente do cliente (fiado)
-- ---------------------------------------------------------------------------
-- Saldo devedor = SOMA do ledger. Nao existe coluna de saldo em customers de
-- proposito: saldo materializado em dois lugares e saldo que divergiu.
--
-- O CHECK de sinal por tipo e o invariante mais importante desta tabela: ele
-- impede que um bug de sinal transforme pagamento em divida nova. amount e
-- assinado, e o sinal e amarrado ao kind:
--   venda_fiado  (+)  aumenta a divida
--   pagamento    (-)  o cliente pagou
--   credito      (-)  troco/devolucao que virou credito na ficha
--   ajuste       (+-) correcao manual, com motivo em notes
--
-- A venda fiado NAO entra como dinheiro recebido: ela gera
-- financial_transactions a receber (is_paid=false, com due_date), pra cobranca
-- do fiado aparecer em "a receber" como qualquer outra e Movimentacoes seguir
-- sendo so realizado.
CREATE TABLE IF NOT EXISTS public.customer_credit_ledger (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id              uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind                     text        NOT NULL
    CONSTRAINT customer_credit_ledger_kind_check CHECK (kind IN (
      'venda_fiado', 'pagamento', 'ajuste', 'credito')),
  amount                   numeric     NOT NULL,
  order_id                 uuid        REFERENCES public.pdv_orders(id) ON DELETE SET NULL,
  financial_transaction_id uuid        REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  notes                    text,
  CONSTRAINT customer_credit_ledger_sinal_check CHECK (
    (kind = 'venda_fiado'              AND amount > 0)
    OR (kind IN ('pagamento', 'credito') AND amount < 0)
    OR (kind = 'ajuste'                AND amount <> 0)
  )
);

COMMENT ON TABLE public.customer_credit_ledger IS
  'Conta corrente do cliente (fiado). O saldo devedor é a SOMA de amount, nunca uma coluna em customers: saldo materializado em dois lugares é saldo que divergiu. customer_id em CASCADE porque ledger sem cliente não significa nada, e porque a exclusão real de cliente só acontece em Zerar Sistema / exclusão do tenant (a UI faz soft delete).';
COMMENT ON COLUMN public.customer_credit_ledger.amount IS
  'Valor ASSINADO. Positivo aumenta a dívida (venda fiado), negativo abate (pagamento, crédito). O CHECK de sinal por kind existe pra um bug de sinal não virar dívida nova na ficha do cliente.';

CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_customer
  ON public.customer_credit_ledger (company_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_order
  ON public.customer_credit_ledger (order_id)
  WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9) RLS + PRIVILEGIO : isto e seguranca, nao UX (filtro no client e UX)
-- ---------------------------------------------------------------------------
-- Para cada tabela:
--   a) RLS LIGADA;
--   b) REVOKE ALL de anon E de authenticated (ver DECISAO 7 no cabecalho: a
--      tabela nasce aberta no nivel de GRANT neste banco, e REVOKE tambem e o
--      que fecha TRUNCATE, que ignora RLS);
--   c) GRANT so dos comandos que a tela realmente precisa (ver DECISAO 8: as
--      tres tabelas de dinheiro sao append-only pro usuario);
--   d) uma policy POR COMANDO concedido, com TO authenticated EXPLICITO.
--
-- NADA de FOR ALL: policy permissiva FOR ALL sombreia a policy estreita do
-- comando especifico. E nada de policy sem TO, que cairia em TO public (inclui
-- anon). service_role nao ganha policy: ele tem BYPASSRLS e o GRANT dele e
-- explicito logo abaixo; policy FOR ALL pra ele seria exatamente o cmd=ALL que
-- a auditoria nao quer ver.
--
-- A posse e resolvida SEMPRE pelo servidor: get_user_company_id(auth.uid()) le
-- profiles. O company_id do payload nunca e autoridade, so e comparado. Os
-- (SELECT ...) em volta de auth.uid() e das funcoes sao de proposito: viram
-- InitPlan e sao avaliados UMA vez por query em vez de uma vez por linha, o que
-- em pdv_order_items de loja movimentada e a diferenca entre tela rapida e tela
-- travada.
--
-- EXECUTE dos helpers conferido antes de escrever: authenticated ja tem EXECUTE
-- em get_user_company_id e is_super_admin (policy que chama funcao sem EXECUTE
-- estoura em runtime em vez de negar limpo).
DO $rls$
DECLARE
  v_spec  text;
  v_table text;
  v_cmds  text[];
  v_cmd   text;
  v_own   text :=
    'company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))'
    || ' OR (SELECT public.is_super_admin((SELECT auth.uid())))';
BEGIN
  FOREACH v_spec IN ARRAY ARRAY[
    -- cadastro comum
    'pdv_terminals=SELECT,INSERT,UPDATE,DELETE',
    -- sessao de caixa: abre e fecha, nunca apaga
    'pdv_cash_sessions=SELECT,INSERT,UPDATE',
    -- dinheiro: append-only
    'pdv_cash_movements=SELECT,INSERT',
    -- pedido: rascunho pode ser apagado (integridade na trigger da secao 12)
    'pdv_orders=SELECT,INSERT,UPDATE,DELETE',
    -- carrinho: linha entra, muda e sai enquanto o pedido nao foi pago
    'pdv_order_items=SELECT,INSERT,UPDATE,DELETE',
    -- dinheiro: append-only
    'pdv_order_payments=SELECT,INSERT',
    -- dinheiro: append-only (correcao e linha de kind='ajuste')
    'customer_credit_ledger=SELECT,INSERT'
  ]
  LOOP
    v_table := split_part(v_spec, '=', 1);
    v_cmds  := string_to_array(split_part(v_spec, '=', 2), ',');

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v_table);
    EXECUTE format('GRANT %s ON public.%I TO authenticated',
                   array_to_string(v_cmds, ', '), v_table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table);

    -- Derruba as 4 possiveis + a antiga de service_role antes de recriar, pra
    -- rodar duas vezes nao duplicar nem deixar sobra de versao anterior.
    FOREACH v_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                     v_table || '_' || lower(v_cmd) || '_own_company', v_table);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'service_role_full_access_' || v_table, v_table);

    FOREACH v_cmd IN ARRAY v_cmds
    LOOP
      IF v_cmd IN ('SELECT', 'DELETE') THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)',
          v_table || '_' || lower(v_cmd) || '_own_company', v_table, v_cmd, v_own);
      ELSIF v_cmd = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
          v_table || '_insert_own_company', v_table, v_own);
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
          v_table || '_update_own_company', v_table, v_own, v_own);
      END IF;
    END LOOP;
  END LOOP;
END
$rls$;

-- ---------------------------------------------------------------------------
-- 10) Triggers : company_id automatico e updated_at
-- ---------------------------------------------------------------------------
-- Tabela nova NAO HERDA a trigger de company_id. Aqui as 7 tabelas de negocio
-- recebem a set_company_id_on_insert em laco, pra nao sobrar nenhuma de fora
-- (as duas tabelas de contador ficam fora porque company_id la e a PK e quem
-- escreve e so a funcao SECURITY DEFINER).
DO $triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pdv_terminals',
    'pdv_cash_sessions',
    'pdv_cash_movements',
    'pdv_orders',
    'pdv_order_items',
    'pdv_order_payments',
    'customer_credit_ledger'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'tg_set_company_id_' || v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I'
      || ' FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      'tg_set_company_id_' || v_table, v_table);
  END LOOP;

  -- updated_at so onde a coluna existe.
  FOREACH v_table IN ARRAY ARRAY[
    'pdv_terminals',
    'pdv_cash_sessions',
    'pdv_orders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'set_' || v_table || '_updated_at', v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I'
      || ' FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'set_' || v_table || '_updated_at', v_table);
  END LOOP;
END
$triggers$;

-- ---------------------------------------------------------------------------
-- 11) O FURO QUE NENHUMA POLICY PEGA: FK APONTANDO PRA LINHA DE OUTRO TENANT
-- ---------------------------------------------------------------------------
-- A RLS garante que a LINHA que eu escrevo e minha (company_id meu). Ela NAO
-- garante que o que ela APONTA e meu. Um client comprometido consegue inserir
-- um pedido com company_id = o meu (passa na policy) e customer_id = cliente de
-- OUTRA empresa (passa na FK, que nao sabe nada de tenant). Resultado: dado
-- cruzado entre empresas, e no caso do indice unico de sessao aberta por
-- terminal da pra ate PROVAR a existencia de recurso do vizinho pelo erro de
-- violacao. Nenhum SELECT vaza, mas a base deixa de ser confiavel.
--
-- POR QUE NAO FK COMPOSTA (company_id, id), que resolveria isso sem trigger:
-- porque as FKs pra entidade do tenant precisam de ON DELETE SET NULL (DECISAO
-- 2), e SET NULL numa FK composta zera TAMBEM o company_id, que e NOT NULL.
-- A exclusao do tenant quebraria. Entao a validacao vai em trigger.
--
-- Mensagem em PT-BR e ERRCODE 42501: chega na tela como erro de verdade, nunca
-- como "sucesso" silencioso.
CREATE OR REPLACE FUNCTION public.pdv_assert_ref_company(
  p_table      regclass,
  p_id         uuid,
  p_company_id uuid,
  p_label      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  -- SECURITY DEFINER de proposito: precisa ver a linha apontada mesmo quando
  -- ela e de outra empresa, justamente pra poder RECUSAR com mensagem decente.
  EXECUTE format('SELECT company_id FROM %s WHERE id = $1', p_table)
     INTO v_owner USING p_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION '% informado(a) não existe.', p_label USING ERRCODE = '23503';
  END IF;

  IF v_owner <> p_company_id THEN
    RAISE EXCEPTION '% informado(a) pertence a outra empresa.', p_label
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_assert_ref_company(regclass, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_assert_ref_company(regclass, uuid, uuid, text) FROM authenticated;

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
  'Recusa INSERT/UPDATE em tabela do PDV cuja FK aponte pra linha de OUTRA empresa. A RLS garante que a linha escrita é minha; ela não garante que o que a linha aponta é meu. Mensagem em PT-BR, nunca bloqueio silencioso.';

REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs() FROM authenticated;

-- O nome comeca com tg_zz pra garantir que esta trigger roda DEPOIS da
-- tg_set_company_id_* (o Postgres dispara por ordem alfabetica de nome dentro
-- do mesmo evento): a validacao precisa do company_id ja preenchido.
DO $guards$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pdv_terminals',
    'pdv_cash_sessions',
    'pdv_cash_movements',
    'pdv_orders',
    'pdv_order_items',
    'pdv_order_payments',
    'customer_credit_ledger'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'tg_zz_tenant_refs_' || v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I'
      || ' FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_tenant_refs()',
      'tg_zz_tenant_refs_' || v_table, v_table);
  END LOOP;
END
$guards$;

-- ---------------------------------------------------------------------------
-- 12) Integridade de exclusao : erro em PT-BR, nunca 204 silencioso
-- ---------------------------------------------------------------------------
-- Ver DECISAO 10 no cabecalho. Policy cuida de POSSE; o que nao pode ser
-- apagado e recusado aqui, com mensagem que chega na tela.
-- As tres funcoes desta secao sao SECURITY DEFINER com search_path fixo pra a
-- consulta de apoio (companies / pdv_orders / pdv_cash_sessions) ser sempre
-- autoritativa, e nao depender da RLS de quem disparou o DELETE.
--
-- E TODAS TEM A MESMA VALVULA NO INICIO: se a linha de companies ja nao existe,
-- estamos DENTRO do CASCADE de admin_delete_company (o RI trigger do CASCADE
-- roda depois da exclusao do pai, entao a empresa ja sumiu). Sem essa valvula,
-- estas travas quebrariam a exclusao de um tenant que tenha vendido no PDV, que
-- e exatamente o tipo de bug que so aparece meses depois.
CREATE OR REPLACE FUNCTION public.pdv_block_delete_of_closed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Pedido nº % não pode ser excluído porque já saiu do rascunho. Cancele o pedido (o cancelamento estorna estoque e financeiro e preserva o histórico).', OLD.number
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_block_delete_of_closed_order() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_closed_order() FROM authenticated;

DROP TRIGGER IF EXISTS tg_pdv_orders_block_delete ON public.pdv_orders;
CREATE TRIGGER tg_pdv_orders_block_delete
  BEFORE DELETE ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_delete_of_closed_order();

CREATE OR REPLACE FUNCTION public.pdv_block_item_change_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_order  uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = COALESCE(NEW.company_id, OLD.company_id)
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Numa UPDATE, so interessa a mudanca do QUE E O CUPOM. Deixar passar o resto
  -- nao e frouxidao: quando o catalogo e apagado (Zerar Sistema, exclusao do
  -- tenant), a FK faz SET NULL em inventory_id e isso chega aqui como UPDATE.
  -- Sem esta porta, aquelas rotinas quebrariam no meio por causa de um pedido
  -- pago antigo. description/quantity/preco/custo/desconto/total seguem
  -- travados, que e o que de fato muda o valor do cupom.
  IF TG_OP = 'UPDATE' AND NOT (
       NEW.description     IS DISTINCT FROM OLD.description
    OR NEW.quantity        IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price      IS DISTINCT FROM OLD.unit_price
    OR NEW.unit_cost       IS DISTINCT FROM OLD.unit_cost
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.total           IS DISTINCT FROM OLD.total
  ) THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.pdv_orders WHERE id = v_order;

  -- Pedido cujo pai ja foi apagado (CASCADE) nao tem o que validar.
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status NOT IN ('rascunho', 'aguardando_pagamento') THEN
    RAISE EXCEPTION 'Os itens deste pedido não podem mais ser alterados: ele já está %. Cancele o pedido e faça outro.', v_status
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_block_item_change_after_payment() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_block_item_change_after_payment() FROM authenticated;

-- Soh UPDATE e DELETE. O INSERT do item e feito junto com a venda, quando o
-- pedido ainda pode estar em qualquer um dos dois estados abertos, e a RPC de
-- fechamento (owner) nao passa por esta trava porque ela e de integridade de
-- ordem de operacao, nao de privilegio: a RPC insere item ANTES de marcar pago.
DROP TRIGGER IF EXISTS tg_pdv_order_items_block_change ON public.pdv_order_items;
CREATE TRIGGER tg_pdv_order_items_block_change
  BEFORE UPDATE OR DELETE ON public.pdv_order_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_item_change_after_payment();

CREATE OR REPLACE FUNCTION public.pdv_block_delete_of_used_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pdv_cash_sessions s WHERE s.terminal_id = OLD.id) THEN
    RAISE EXCEPTION 'O terminal "%" já tem histórico de caixa e não pode ser excluído. Desative ele em vez de excluir.', OLD.name
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pdv_orders o WHERE o.terminal_id = OLD.id) THEN
    RAISE EXCEPTION 'O terminal "%" já tem pedidos e não pode ser excluído. Desative ele em vez de excluir.', OLD.name
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_block_delete_of_used_terminal() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_used_terminal() FROM authenticated;

DROP TRIGGER IF EXISTS tg_pdv_terminals_block_delete ON public.pdv_terminals;
CREATE TRIGGER tg_pdv_terminals_block_delete
  BEFORE DELETE ON public.pdv_terminals
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_delete_of_used_terminal();

-- ---------------------------------------------------------------------------
-- 13) O CONTRATO PRAS RPCs DO PROXIMO DESPACHO (nao e decoracao, e regra)
-- ---------------------------------------------------------------------------
-- Toda RPC do PDV (pdv_open_cash_session, pdv_close_cash_session,
-- pdv_settle_order, pdv_commit_order_stock, pdv_cancel_order,
-- pdv_generate_barcode, next_pdv_order_number, pdv_receive_customer_credit)
-- NASCE assim, sem excecao:
--
--   CREATE OR REPLACE FUNCTION public.<nome>(...) ... SECURITY DEFINER
--     SET search_path = public, extensions
--   -- 1) company_id vem SEMPRE de get_user_company_id(auth.uid()), NUNCA de
--   --    parametro: SECURITY DEFINER ignora RLS por definicao, entao parametro
--   --    de empresa vindo do cliente seria a porta aberta.
--   -- 2) toda linha lida/escrita e conferida contra esse company_id.
--   -- 3) gate de modulo: company_has_module(company_id, 'pdv').
--   -- 4) REVOKE ALL ON FUNCTION ... FROM anon, authenticated;  e depois
--   --    GRANT EXECUTE ... TO authenticated;  (toda funcao nova neste banco
--   --    nasce com EXECUTE pra anon, por pg_default_acl: omitir nao basta).
--   -- 5) dinheiro em transacao unica, com pg_advisory_xact_lock(company_id)
--   --    onde houver corrida, e idempotencia por client_request_id.
--   -- 6) mensagem de erro em PT-BR, sempre: bloqueio silencioso e proibido.

COMMIT;
