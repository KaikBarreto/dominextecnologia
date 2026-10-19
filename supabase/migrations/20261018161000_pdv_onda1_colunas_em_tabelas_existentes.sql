-- ============================================================================
-- MODULO PDV E LOJA : Onda 1, parte 2 de 4 (as colunas nas tabelas que ja
-- existem: estoque, catalogo, cliente, financeiro e configuracoes)
--
-- A LEI DESTE ARQUIVO: PRA QUEM NAO TEM O MODULO, NADA MUDA
-- ---------------------------------------------------------------------------
-- Toda coluna nova nasce com DEFAULT igual ao comportamento de hoje:
--   stocks.purpose                  = 'operacional'  (todo local continua
--                                     operacional, a tela de Estoque nao
--                                     ganha secao nenhuma);
--   inventory.is_sellable           = true           (nao esconde item de
--                                     ninguem; quem nao tem PDV nao ve o
--                                     campo);
--   inventory.image_url / barcode   = NULL;
--   customers.is_service_customer   = true           (o backfill e implicito:
--                                     100% dos 2.076 clientes que existem hoje
--                                     entraram pelo lado de SERVICO, porque o
--                                     lado de loja nao existia);
--   customers.is_store_customer     = false;
--   financial_transactions.origin   = 'geral'        (os 1.619 lancamentos
--                                     historicos continuam exatamente onde
--                                     estao no DRE e nas Movimentacoes);
--   company_settings.pdv_*          = defaults inertes enquanto nao ha PDV.
-- Nenhum UPDATE de dado roda aqui. Nenhum SELECT existente muda de resultado.
--
-- POR QUE A ORIGEM DO LANCAMENTO ENTRA AGORA, NA ONDA 1
-- ---------------------------------------------------------------------------
-- O filtro de UI (Tudo / So a Loja / Sem a Loja) so chega na Onda 3, mas a
-- coluna tem que existir ANTES da primeira venda: dado nasce classificado,
-- backfill depois e chute. Uma coluna unica resolve receita E despesa (a venda
-- do balcao, a compra de material pra loja, o salario do balconista) sem tabela
-- nova. Se um dia a empresa quiser "por filial", esta coluna vira FK pra uma
-- tabela de centro de resultado; hoje seria complexidade sem comprador.
--
-- POR QUE O CONTADOR DE CODIGO DE BARRAS NAO FICA EM company_settings
-- ---------------------------------------------------------------------------
-- Justificado em detalhe na secao 6 deste arquivo. Resumo: company_settings e
-- escrita pelo proprio tenant (o form de Configuracoes manda a linha inteira),
-- entao um contador ali pode ANDAR PRA TRAS num salvar de tela e gerar codigo
-- de barras duplicado. Contador e estado, nao configuracao. Vai pra tabela
-- propria, fechada por RLS, no padrao de compra_ordens_number_counters e
-- project_number_counters. O PREFIXO, que e configuracao de verdade, fica em
-- company_settings.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) public.stocks.purpose : os dois grupos de local (Loja x Operacional)
-- ---------------------------------------------------------------------------
-- Com o modulo, a tela de Estoque agrupa os locais em duas secoes e o PDV so
-- vende de local purpose='pdv'. A transferencia entre os dois grupos continua
-- sendo a transfer_stock_between que ja existe (e assim que a peca sai do
-- deposito e vai pro balcao), e a stock_access_acl continua valendo (o
-- operador de caixa so enxerga o local da loja dele).
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'operacional'
    CONSTRAINT stocks_purpose_check CHECK (purpose IN ('operacional', 'pdv'));

COMMENT ON COLUMN public.stocks.purpose IS
  'Grupo do local: ''operacional'' (depósito, veículo, obra) ou ''pdv'' (loja/balcão). O DEFAULT ''operacional'' preserva integralmente o comportamento de quem não tem o módulo PDV: a tela de Estoque só passa a agrupar os locais quando existe algum local ''pdv''.';

CREATE INDEX IF NOT EXISTS idx_stocks_company_purpose
  ON public.stocks (company_id, purpose);

-- ---------------------------------------------------------------------------
-- 2) public.inventory : foto, codigo de barras e "vende no balcao?"
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS image_url   text,
  ADD COLUMN IF NOT EXISTS barcode     text,
  ADD COLUMN IF NOT EXISTS is_sellable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.inventory.image_url IS
  'URL da foto do produto no bucket privado inventory-photos (caminho {company_id}/{inventory_id}/...). NULL = sem foto, que é o estado de 100% do catálogo antes do PDV.';
COMMENT ON COLUMN public.inventory.barcode IS
  'EAN/GTIN do produto: ou o do fabricante (digitado/escaneado) ou um código interno gerado com o prefixo de company_settings.pdv_barcode_prefix. Único por empresa quando preenchido.';
COMMENT ON COLUMN public.inventory.is_sellable IS
  'Entra na grade de venda do PDV. DEFAULT true de propósito: nenhum item fica escondido por causa desta migration, e quem não tem o módulo nem vê o campo. Serve pra tirar do balcão o insumo que só se consome em OS.';

-- Unicidade POR EMPRESA (nunca global): dois tenants podem muito bem vender o
-- mesmo EAN de fabricante, e um unique global vazaria a existencia do produto
-- do vizinho (a repeticao do bug de catalogo de 06/06/2026). O WHERE deixa
-- conviver o catalogo inteiro sem codigo.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_company_barcode
  ON public.inventory (company_id, barcode)
  WHERE barcode IS NOT NULL;

-- Busca por codigo de barras DENTRO da empresa. O unique acima ja atende a
-- leitura do scanner (igualdade exata). Este aqui e pra digitacao PARCIAL
-- ("789..." no campo de busca): o btree da collation padrao nao serve pra
-- LIKE 'x%', text_pattern_ops serve.
CREATE INDEX IF NOT EXISTS idx_inventory_company_barcode_prefix
  ON public.inventory (company_id, barcode text_pattern_ops)
  WHERE barcode IS NOT NULL;

-- Grade de venda do PDV: itens vendaveis e nao arquivados, em ordem de nome.
CREATE INDEX IF NOT EXISTS idx_inventory_company_sellable
  ON public.inventory (company_id, name)
  WHERE is_sellable AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) public.customers : atende como Loja, como Servico, ou como os dois
-- ---------------------------------------------------------------------------
-- Duas colunas booleanas em vez de um text[]: indice trivial, filtro trivial, e
-- na UI vira naturalmente um multi-selecao de dois checkboxes ("Atende como:
-- Serviço / Loja").
--
-- BACKFILL IMPLICITO: nao existe UPDATE neste arquivo porque o DEFAULT ja faz
-- o trabalho. Todo cliente que existe hoje entrou pelo lado de servico (OS,
-- orcamento, contrato, PMOC), logo is_service_customer=true e a verdade
-- historica, e is_store_customer=false tambem.
--
-- DEFAULT CONTEXTUAL DO QUICK-CREATE (pedido literal do CEO) E REGRA DE FRONT,
-- NAO DE BANCO: cliente criado de dentro de uma OS/orcamento nasce
-- is_service_customer=true; criado de dentro do PDV nasce
-- is_store_customer=true. O banco nao tem como saber de que tela veio o INSERT,
-- entao quem carimba e o hook. Cliente que ja existe como servico e compra na
-- loja so GANHA o segundo check, nunca vira cadastro duplicado.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_service_customer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_store_customer   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_limit        numeric
    CONSTRAINT customers_credit_limit_check CHECK (credit_limit IS NULL OR credit_limit >= 0);

COMMENT ON COLUMN public.customers.is_service_customer IS
  'Atende como cliente de serviço (OS, orçamento, contrato, PMOC). DEFAULT true: é o backfill implícito de todo cliente que existia antes do módulo PDV.';
COMMENT ON COLUMN public.customers.is_store_customer IS
  'Atende como cliente de loja (compra no balcão). DEFAULT false. Quem não tem o módulo PDV nem vê este campo na ficha.';
COMMENT ON COLUMN public.customers.credit_limit IS
  'Teto de fiado em reais. NULL = sem limite definido, e nesse caso o PDV avisa em vez de bloquear. A validação do limite mora na RPC de fechamento da venda, não aqui.';

-- So o indice de LOJA e criado. O de servico seria um indice sobre ~100% da
-- tabela (todo cliente e de servico), ou seja, custo de escrita sem ganho de
-- leitura: o idx_customers_company_created que ja existe atende esse caso.
CREATE INDEX IF NOT EXISTS idx_customers_company_store
  ON public.customers (company_id)
  WHERE is_store_customer AND NOT is_deleted;

-- Fiado: achar rapido quem tem teto definido (relatorio de credito concedido).
CREATE INDEX IF NOT EXISTS idx_customers_company_credit_limit
  ON public.customers (company_id)
  WHERE credit_limit IS NOT NULL AND NOT is_deleted;

-- ---------------------------------------------------------------------------
-- 4) public.financial_transactions.origin : o resultado da loja separado
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'geral'
    CONSTRAINT financial_transactions_origin_check CHECK (origin IN ('geral', 'pdv'));

COMMENT ON COLUMN public.financial_transactions.origin IS
  'De onde veio o dinheiro: ''geral'' (a operação de sempre) ou ''pdv'' (a loja). O DEFAULT ''geral'' preserva 100% do histórico: nenhum lançamento antigo sai de onde está. Cobre receita E despesa (a venda do balcão, a compra de material pra loja, o salário do balconista), e existe pro DRE e pros relatórios poderem isolar o resultado da loja. As RPCs do PDV carimbam ''pdv'' automaticamente.';

-- Serve o filtro segmentado (Tudo / So a Loja / Sem a Loja) nos dois sentidos e
-- ja entrega a ordenacao por data. Um indice parcial em origin='pdv' seria
-- menor, mas precisaria ser reescrito quando aparecer uma terceira origem.
CREATE INDEX IF NOT EXISTS idx_ft_company_origin_date
  ON public.financial_transactions (company_id, origin, transaction_date DESC);

-- ---------------------------------------------------------------------------
-- 5) public.company_settings : as configuracoes do PDV
-- ---------------------------------------------------------------------------
-- pdv_strict_cash_tracking vive AQUI (servidor) e nao no localStorage de
-- 'usability-settings' que a aba Usabilidade tambem usa: e regra de negocio
-- validada dentro da RPC de abertura de caixa, e localStorage e burlavel.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pdv_cash_account_id uuid
    CONSTRAINT company_settings_pdv_cash_account_id_fkey
      REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdv_strict_cash_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdv_mode text NOT NULL DEFAULT 'simples'
    CONSTRAINT company_settings_pdv_mode_check CHECK (pdv_mode IN ('simples', 'balcao')),
  ADD COLUMN IF NOT EXISTS pdv_barcode_prefix text NOT NULL DEFAULT '200'
    CONSTRAINT company_settings_pdv_barcode_prefix_check
      CHECK (pdv_barcode_prefix ~ '^[0-9]{2,7}$');

COMMENT ON COLUMN public.company_settings.pdv_cash_account_id IS
  'Qual conta de financial_accounts é o COFRE da empresa (o dinheiro físico). Esperado type=''caixa''; um FK não consegue exigir isso, então a RPC de abertura de caixa valida o tipo e recusa conta de banco ou cartão. ON DELETE SET NULL: apagar a conta não pode travar a exclusão, só desconfigura o PDV.';
COMMENT ON COLUMN public.company_settings.pdv_strict_cash_tracking IS
  'Trava de servidor: com true (padrão), não dá pra abrir caixa com valor acima do disponível no cofre (saldo do cofre menos a soma das aberturas das sessões ainda abertas). O opt-out fica em Configurações e é respeitado dentro da RPC, nunca no cliente.';
COMMENT ON COLUMN public.company_settings.pdv_mode IS
  'Modo de operação: ''simples'' (um operador monta o pedido, recebe e imprime) ou ''balcao'' (pré-venda: vendedor monta, caixa recebe, expedição entrega e só aí o estoque baixa). Trocar de modo não migra dado nenhum: as três telas leem a mesma tabela.';
COMMENT ON COLUMN public.company_settings.pdv_barcode_prefix IS
  'Prefixo do código de barras INTERNO gerado pelo sistema. Padrão ''200'': a faixa GS1 200 a 299 é reservada a uso interno de loja, então um código gerado aqui nunca colide com EAN de fabricante.';

-- ---------------------------------------------------------------------------
-- 6) public.pdv_barcode_counters : o sequencial do codigo interno, por empresa
-- ---------------------------------------------------------------------------
-- DECISAO (e o porque, pedido no briefing): o contador NAO fica em
-- company_settings.
--   (a) company_settings e gravada pelo proprio tenant, e o form de
--       Configuracoes salva a LINHA INTEIRA. Um salvar com estado antigo em
--       memoria devolveria o contador pra tras e geraria codigo de barras
--       DUPLICADO, que e justamente o que o unique de inventory.barcode
--       passaria a recusar na cara do operador.
--   (b) Contador e ESTADO de numeracao, nao configuracao. O projeto ja tem o
--       padrao certo pra isso em compra_ordens_number_counters,
--       equipment_number_counters e project_number_counters.
--   (c) Tabela propria permite fechar a porta: RLS ligada SEM POLICY NENHUMA
--       pra authenticated, mais REVOKE. So a RPC SECURITY DEFINER encosta nela.
-- O PREFIXO, que e escolha do cliente, continua em company_settings (secao 5).
--
-- bigint e nao integer: o codigo interno e consumido por item cadastrado e por
-- reimpressao de etiqueta; nao custa nada e nunca vira teto.
CREATE TABLE IF NOT EXISTS public.pdv_barcode_counters (
  company_id uuid   PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.pdv_barcode_counters IS
  'Próximo sequencial de código de barras interno, por empresa. DELIBERADAMENTE sem nenhuma policy: o cliente nunca toca nesta tabela, só a função SECURITY DEFINER de geração de código (próximo despacho). Espelha project_number_counters.';

-- RLS ligada e sem policy = nega tudo. O REVOKE e a segunda camada: o
-- pg_default_acl do schema public concede privilegio pra anon E authenticated
-- em toda tabela nova deste banco, entao sem ele a tabela nasceria aberta no
-- nivel de GRANT mesmo com RLS fechando a leitura.
ALTER TABLE public.pdv_barcode_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_barcode_counters FROM anon, authenticated;
GRANT ALL ON public.pdv_barcode_counters TO service_role;

COMMIT;
