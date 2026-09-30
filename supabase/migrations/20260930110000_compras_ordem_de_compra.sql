-- =============================================================================
-- COMPRAS — Ordem de Compra (O.C.), fornecedor por item e recebimento com baixa
-- 2026-09-30 — Origem: pedido do cliente Engetec (Davi, comprador).
-- =============================================================================
--
-- FLUXO QUE O CLIENTE DESCREVEU (rotina real: compra semanal na sexta,
-- recebimento sexta/sabado, estoque redondo na segunda):
--   Requisicao (itens abaixo do minimo)
--     -> Cotacao (um preco por fornecedor por material)
--     -> ORDEM DE COMPRA (os itens do fornecedor escolhido)
--     -> envio da O.C. ao fornecedor (fora do MVP: o PDF resolve)
--     -> RECEBIMENTO com quantidade (parcial permitido)
--     -> entrada no estoque, NO LOCAL CERTO.
--
-- OS TRES FUROS QUE ESTA MIGRATION FECHA:
--   1. `compras` nao tinha local de destino. Consequencia: o caminho de entrada
--      atual chama register_inventory_movement SEM p_stock_id, entao TODA compra
--      caia no estoque principal, ignorando o multi-local. Com dois almoxarifados
--      isso esta errado na raiz. -> nasce `compras.stock_id`.
--   2. A escolha de fornecedor era por cotacao INTEIRA (compra_cotacoes.status
--      = 'aceita'), impedindo "fornecedor A pro item 1, fornecedor B pro item 2".
--      -> nasce `compra_materiais.chosen_cotacao_id`.
--   3. Nao existia documento de O.C., recebimento parcial, data de recebimento
--      nem divergencia (pedi 10, chegaram 8). -> nascem `compra_ordens`,
--      `compra_ordem_itens` e a RPC `receber_ordem_compra`.
--
-- -----------------------------------------------------------------------------
-- INVARIANTE / RISCO REGISTRADO PELO CEO — CAMINHO DUPLO DE ENTRADA
-- -----------------------------------------------------------------------------
--   Hoje existe um caminho PARALELO de entrada no estoque: o botao "Registrar
--   entrada no estoque" da cotacao aceita (`registerStockEntry`, em
--   src/hooks/useCompraCotacoes.ts). Ele da entrada da compra INTEIRA de uma vez,
--   sem p_stock_id e sem controle de quantidade recebida.
--
--   SE OS DOIS CAMINHOS CONVIVEREM, DA PRA DUPLICAR SALDO: a mesma compra entra
--   uma vez pela cotacao aceita e outra vez pelo recebimento da O.C. O banco NAO
--   tem como distinguir (sao dois 'entrada' legitimos no inventory_movements).
--
--   O caminho antigo vai ser APOSENTADO no front por outro agente, em etapa
--   posterior. Ate la, quem usar O.C. NAO deve usar o botao da cotacao aceita.
--   Nao foi criada trava no banco de proposito: travar aqui quebraria os tenants
--   que ainda usam so o fluxo antigo.
--
-- -----------------------------------------------------------------------------
-- OUTROS INVARIANTES
-- -----------------------------------------------------------------------------
--   * `register_inventory_movement` e o CAMINHO UNICO de escrita de saldo.
--     Nenhum UPDATE direto em inventory_stock_levels / inventory.quantity aqui.
--   * company_id NUNCA vem do client em RPC: e derivado de
--     get_user_company_id(auth.uid()), com escape so pra is_super_admin(auth.uid()).
--   * RLS das duas tabelas novas replica a regua das tabelas compra_* existentes
--     (20260619180000): 4 policies SEPARADAS por comando, TO authenticated,
--     predicado company_id = get_user_company_id(auth.uid()) OR is_super_admin(...).
--     NAO se usa policy FOR ALL: no Dominex uma policy FOR ALL ja sombreou a
--     policy restritiva de DELETE e causou vazamento.
--   * Numeracao da O.C. e sequencial POR EMPRESA, no mesmo padrao de
--     `compras.numero` (20260619193000): contador por empresa + upsert atomico,
--     nunca MAX+1 (que tem corrida) e nunca SERIAL global (que vaza volume entre
--     tenants).
--   * Idempotencia do recebimento: a protecao e o teto
--     quantity_received <= quantity_ordered. Duplo-clique que reenvia o mesmo
--     payload ESTOURA o token 'receipt_exceeds_ordered: <material>' em vez de
--     somar duas vezes.
--
-- Migration idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- =============================================================================
-- 1. compras.stock_id — local de destino da compra
-- =============================================================================
-- ON DELETE SET NULL (e nao CASCADE): apagar um almoxarifado nao pode apagar o
-- historico de compras. Com stock_id NULL a RPC de recebimento cai no estoque
-- principal da empresa, que e o comportamento de hoje.

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS stock_id uuid REFERENCES public.stocks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.compras.stock_id IS
  'Local de estoque de DESTINO desta compra. A entrada do recebimento da O.C. cai neste local. NULL = estoque principal (is_default) da empresa.';

CREATE INDEX IF NOT EXISTS idx_compras_stock_id ON public.compras(stock_id);

-- Backfill retroativo: toda compra existente passa a apontar pro estoque
-- principal (is_default) da MESMA company_id. Subquery com LIMIT 1 deterministico
-- pra nao depender de a empresa ter exatamente um is_default.
DO $do$
DECLARE
  v_upd int;
BEGIN
  UPDATE public.compras c
     SET stock_id = (
       SELECT s.id
         FROM public.stocks s
        WHERE s.company_id = c.company_id
          AND s.is_default
        ORDER BY s.sort_order, s.created_at, s.id
        LIMIT 1
     )
   WHERE c.stock_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.stocks s
        WHERE s.company_id = c.company_id AND s.is_default
     );
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  RAISE NOTICE 'Backfill compras.stock_id: % compras apontadas pro estoque principal da propria empresa.', v_upd;
END $do$;

-- =============================================================================
-- 2. compra_materiais.chosen_cotacao_id — fornecedor escolhido POR ITEM
-- =============================================================================
-- E isto que permite dividir uma requisicao entre varios fornecedores: cada
-- material aponta pra cotacao vencedora dele. O preco sai de
-- compra_cotacao_precos (cotacao_id, compra_material_id).
-- ON DELETE SET NULL: remover uma cotacao solta os itens que a escolheram em vez
-- de apagar o material da requisicao.

ALTER TABLE public.compra_materiais
  ADD COLUMN IF NOT EXISTS chosen_cotacao_id uuid
    REFERENCES public.compra_cotacoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.compra_materiais.chosen_cotacao_id IS
  'Cotacao (= fornecedor) escolhida PARA ESTE ITEM. Permite dividir a mesma requisicao entre fornecedores diferentes. NULL = ainda sem fornecedor definido.';

CREATE INDEX IF NOT EXISTS idx_compra_materiais_chosen_cotacao_id
  ON public.compra_materiais(chosen_cotacao_id);

-- =============================================================================
-- 3. compra_ordens — a Ordem de Compra
-- =============================================================================
-- Uma O.C. EM ABERTO por fornecedor dentro de uma compra (trava em 3.1): o
-- UNIQUE e PARCIAL, so alcanca status ativo. O.C. cancelada ou ja fechada como
-- recebida NAO bloqueia a emissao de uma nova pro mesmo fornecedor.
--
-- supplier_id: mesma tabela e MESMA regra de ON DELETE que compra_cotacoes usa
-- hoje (public.suppliers ON DELETE CASCADE, 20260619180000). Consistencia com a
-- familia compra_* — o rastro do recebimento sobrevive em inventory_movements.

CREATE TABLE IF NOT EXISTS public.compra_ordens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  compra_id   uuid NOT NULL REFERENCES public.compras(id)   ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  numero      integer,
  status      text NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','enviada','recebida_parcial','recebida','cancelada')),
  sent_at     timestamptz,
  received_at timestamptz,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compra_ordens IS
  'Ordem de Compra (O.C.): o pedido fechado com UM fornecedor dentro de uma compra. Documento que vai pro fornecedor e que depois recebe a baixa de recebimento.';
COMMENT ON COLUMN public.compra_ordens.numero IS
  'Numero sequencial da O.C. POR EMPRESA (comeca em 1). Preenchido pelo trigger trg_compra_ordens_defaults; nunca informar do client.';
COMMENT ON COLUMN public.compra_ordens.status IS
  'rascunho | enviada | recebida_parcial | recebida | cancelada. recebida_parcial/recebida sao escritos pela RPC receber_ordem_compra.';
COMMENT ON COLUMN public.compra_ordens.sent_at IS
  'Quando a O.C. foi enviada ao fornecedor. Preenchido automaticamente na primeira vez que o status vira enviada.';
COMMENT ON COLUMN public.compra_ordens.received_at IS
  'Quando a O.C. foi fechada como totalmente recebida. Fica NULL enquanto houver item pendente.';

CREATE INDEX IF NOT EXISTS idx_compra_ordens_company_id  ON public.compra_ordens(company_id);
CREATE INDEX IF NOT EXISTS idx_compra_ordens_compra_id   ON public.compra_ordens(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_ordens_supplier_id ON public.compra_ordens(supplier_id);

-- -----------------------------------------------------------------------------
-- 3.1 UMA O.C. em aberto por (requisicao, fornecedor) — trava de duplicidade
-- -----------------------------------------------------------------------------
-- DECISAO DO TECH LEAD (2026-09-30). Sem esta trava, nada impedia DUAS O.C.
-- ativas pro mesmo fornecedor dentro da mesma requisicao: as duas seriam
-- recebidas e o saldo do estoque entraria DUAS VEZES pelo mesmo pedido, com o
-- banco sem como distinguir (sao dois 'entrada' legitimos em inventory_movements).
--
-- O indice e PARCIAL de proposito: cobre so os status EM ABERTO
-- (rascunho | enviada | recebida_parcial). Assim que a O.C. fecha como
-- 'recebida' ou vira 'cancelada' ela sai do indice e uma nova O.C. pro mesmo
-- fornecedor volta a ser permitida — reemissao legitima continua liberada,
-- duplicidade de saldo morre.
--
-- NULL nao e problema: compra_id e supplier_id sao ambos NOT NULL, entao nao ha
-- linha escapando pela semantica de NULL em indice unico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_ordens_ativa_por_fornecedor
  ON public.compra_ordens (compra_id, supplier_id)
  WHERE status IN ('rascunho','enviada','recebida_parcial');

COMMENT ON INDEX public.uq_compra_ordens_ativa_por_fornecedor IS
  'So pode existir UMA Ordem de Compra EM ABERTO (rascunho/enviada/recebida_parcial) por (compra_id, supplier_id). Evita duplicar entrada de estoque com duas O.C. ativas do mesmo fornecedor na mesma requisicao. Depois de recebida ou cancelada, uma nova O.C. pro mesmo fornecedor e liberada.';

DROP TRIGGER IF EXISTS set_compra_ordens_updated_at ON public.compra_ordens;
CREATE TRIGGER set_compra_ordens_updated_at
  BEFORE UPDATE ON public.compra_ordens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4. compra_ordem_itens — as linhas da O.C.
-- =============================================================================
-- quantity_received e ACUMULADA (soma de todos os recebimentos). O teto
-- quantity_received <= quantity_ordered esta no CHECK e tambem e checado dentro
-- da RPC, pra devolver mensagem legivel em vez de erro cru de constraint.
--
-- compra_material_id e NULLABLE com ON DELETE SET NULL: apagar a linha da
-- requisicao nao pode apagar o item ja pedido/recebido (material_name, unit,
-- quantity_ordered e unit_price ficam denormalizados aqui exatamente por isso).

CREATE TABLE IF NOT EXISTS public.compra_ordem_itens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL,
  ordem_id           uuid NOT NULL REFERENCES public.compra_ordens(id)    ON DELETE CASCADE,
  compra_material_id uuid          REFERENCES public.compra_materiais(id) ON DELETE SET NULL,
  inventory_id       uuid          REFERENCES public.inventory(id)        ON DELETE SET NULL,
  material_name      text,
  unit               text,
  quantity_ordered   numeric NOT NULL,
  quantity_received  numeric NOT NULL DEFAULT 0,
  unit_price         numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_ordem_itens_qty_ordered_chk
    CHECK (quantity_ordered > 0),
  CONSTRAINT compra_ordem_itens_qty_received_chk
    CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered)
);

COMMENT ON TABLE public.compra_ordem_itens IS
  'Itens de uma Ordem de Compra. quantity_received e acumulada (permite recebimento parcial e divergencia: pedi 10, chegaram 8).';
COMMENT ON COLUMN public.compra_ordem_itens.inventory_id IS
  'Item do estoque correspondente. NULL enquanto for material manual; a RPC receber_ordem_compra cria o item no inventory no primeiro recebimento e amarra aqui.';
COMMENT ON COLUMN public.compra_ordem_itens.quantity_received IS
  'Total ja recebido (acumulado). Escrito SO pela RPC receber_ordem_compra. Nunca pode passar de quantity_ordered.';
COMMENT ON COLUMN public.compra_ordem_itens.unit_price IS
  'Preco unitario negociado nesta O.C. Vira p_unit_cost do movimento de entrada.';

CREATE INDEX IF NOT EXISTS idx_compra_ordem_itens_company_id         ON public.compra_ordem_itens(company_id);
CREATE INDEX IF NOT EXISTS idx_compra_ordem_itens_ordem_id           ON public.compra_ordem_itens(ordem_id);
CREATE INDEX IF NOT EXISTS idx_compra_ordem_itens_compra_material_id ON public.compra_ordem_itens(compra_material_id);
CREATE INDEX IF NOT EXISTS idx_compra_ordem_itens_inventory_id       ON public.compra_ordem_itens(inventory_id);

-- =============================================================================
-- 5. Numeracao sequencial da O.C. POR EMPRESA
--    Espelha 20260619193000 (compras.numero): contador por empresa + upsert
--    atomico com ON CONFLICT (trava a linha, sem corrida). Nunca MAX+1.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compra_ordens_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value int NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.compra_ordens_number_counters IS
  'Contador do proximo numero de Ordem de Compra por empresa. Sem acesso do client: so a funcao SECURITY DEFINER next_compra_ordem_numero escreve aqui.';

ALTER TABLE public.compra_ordens_number_counters ENABLE ROW LEVEL SECURITY;

-- Mesma regra de seguranca do compras_number_counters: NENHUM acesso direto do
-- client. Sem policy permissiva + privilegios revogados. A funcao roda como owner.
REVOKE ALL ON public.compra_ordens_number_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_compra_ordem_numero(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_consumed int;
BEGIN
  -- Upsert atomico: a primeira insercao da empresa consome 1 (a linha final tem
  -- next_value=2, logo 2-1=1). Em conflito, DO UPDATE soma 1 e o RETURNING ve a
  -- linha pos-update, entao (next_value)-1 = valor antigo = valor consumido.
  -- Sem corrida porque o ON CONFLICT trava a linha.
  INSERT INTO public.compra_ordens_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN v_consumed;
END;
$fn$;

COMMENT ON FUNCTION public.next_compra_ordem_numero(uuid) IS
  'Consome e devolve o proximo numero de Ordem de Compra da empresa (atomico, sem corrida). Chamada so pelo trigger trg_compra_ordens_defaults.';

-- Gerador sequencial: mesma exposicao de next_compra_numero depois de
-- 20260912150000 (so service_role; o trigger SECURITY DEFINER roda como owner).
REVOKE ALL ON FUNCTION public.next_compra_ordem_numero(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_compra_ordem_numero(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_compra_ordem_numero(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_compra_ordem_numero(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5.1 Trigger unico de defaults da O.C. (company_id + numero + created_by + sent_at)
-- -----------------------------------------------------------------------------
-- UM SO trigger de propósito: se company_id e numero fossem dois triggers, a
-- ordem de disparo (alfabetica pelo nome) viraria dependencia implicita e o
-- numero poderia ser gerado antes do company_id existir.
--
-- Por que derivar company_id do PAI e nao so de auth.uid(): amarra a O.C. a
-- compra dona. Se o client mandar company_id divergente do da compra, estoura.
-- Se mandar NULL apontando pra compra de OUTRO tenant, o trigger preenche com o
-- company_id do outro tenant e a policy de INSERT (WITH CHECK company_id =
-- get_user_company_id) REJEITA — fail-closed. RLS WITH CHECK e avaliada DEPOIS
-- dos triggers BEFORE ROW, entao a protecao nao e contornada.

CREATE OR REPLACE FUNCTION public.compra_ordens_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_parent_company uuid;
BEGIN
  SELECT c.company_id INTO v_parent_company
    FROM public.compras c
   WHERE c.id = NEW.compra_id;

  IF NEW.company_id IS NULL THEN
    -- Pode continuar NULL se a compra nao existir: o NOT NULL/FK barra depois.
    NEW.company_id := v_parent_company;
  ELSIF v_parent_company IS DISTINCT FROM NEW.company_id THEN
    -- Mensagem generica de proposito: nao revela de qual tenant e a compra.
    RAISE EXCEPTION 'Compra informada nao pertence a esta empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    IF NEW.numero IS NULL AND NEW.company_id IS NOT NULL THEN
      NEW.numero := public.next_compra_ordem_numero(NEW.company_id);
    END IF;
  END IF;

  -- Carimba o envio na primeira vez que a O.C. vira 'enviada'.
  IF NEW.status = 'enviada' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.compra_ordens_set_defaults() IS
  'BEFORE INSERT/UPDATE de compra_ordens: deriva e valida company_id contra a compra dona, gera o numero sequencial da empresa, preenche created_by e carimba sent_at no primeiro envio.';

DROP TRIGGER IF EXISTS trg_compra_ordens_defaults ON public.compra_ordens;
CREATE TRIGGER trg_compra_ordens_defaults
  BEFORE INSERT OR UPDATE ON public.compra_ordens
  FOR EACH ROW EXECUTE FUNCTION public.compra_ordens_set_defaults();

-- numero vira NOT NULL + UNIQUE por empresa depois do trigger existir.
--
-- Na PRIMEIRA execucao a tabela acabou de nascer e este bloco nao mexe em nada.
-- Ele existe pra reexecucao ser segura: numera so as linhas com numero NULL e
-- as numera A PARTIR do maior numero ja usado pela empresa (nao reinicia em 1,
-- senao colidiria com a UNIQUE (company_id, numero) logo abaixo).
DO $do$
DECLARE
  v_renumbered bigint;
  v_companies  bigint;
BEGIN
  WITH base AS (
    SELECT company_id, COALESCE(max(numero), 0) AS max_numero
      FROM public.compra_ordens
     GROUP BY company_id
  ), ordered AS (
    SELECT o.id,
           b.max_numero
             + row_number() OVER (PARTITION BY o.company_id ORDER BY o.created_at, o.id) AS rn
      FROM public.compra_ordens o
      JOIN base b ON b.company_id = o.company_id
     WHERE o.numero IS NULL
  )
  UPDATE public.compra_ordens o
     SET numero = x.rn
    FROM ordered x
   WHERE o.id = x.id;
  GET DIAGNOSTICS v_renumbered = ROW_COUNT;

  -- Contador nunca ANDA PRA TRAS: GREATEST protege reexecucao.
  INSERT INTO public.compra_ordens_number_counters AS c (company_id, next_value)
  SELECT company_id, max(numero) + 1
    FROM public.compra_ordens
   GROUP BY company_id
  ON CONFLICT (company_id) DO UPDATE
    SET next_value = GREATEST(c.next_value, EXCLUDED.next_value);
  GET DIAGNOSTICS v_companies = ROW_COUNT;

  RAISE NOTICE 'compra_ordens.numero: % ordens numeradas, % contadores sincronizados', v_renumbered, v_companies;
END $do$;

ALTER TABLE public.compra_ordens ALTER COLUMN numero SET NOT NULL;

ALTER TABLE public.compra_ordens
  DROP CONSTRAINT IF EXISTS compra_ordens_company_numero_unique;
ALTER TABLE public.compra_ordens
  ADD CONSTRAINT compra_ordens_company_numero_unique UNIQUE (company_id, numero);

-- -----------------------------------------------------------------------------
-- 5.2 Trigger de company_id dos itens (derivado da O.C. dona)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compra_ordem_itens_set_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_parent_company uuid;
BEGIN
  SELECT o.company_id INTO v_parent_company
    FROM public.compra_ordens o
   WHERE o.id = NEW.ordem_id;

  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_parent_company;
  ELSIF v_parent_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Ordem de compra informada nao pertence a esta empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.compra_ordem_itens_set_company() IS
  'BEFORE INSERT/UPDATE de compra_ordem_itens: deriva e valida company_id contra a O.C. dona, impedindo item de um tenant pendurado em ordem de outro.';

DROP TRIGGER IF EXISTS trg_compra_ordem_itens_company ON public.compra_ordem_itens;
CREATE TRIGGER trg_compra_ordem_itens_company
  BEFORE INSERT OR UPDATE ON public.compra_ordem_itens
  FOR EACH ROW EXECUTE FUNCTION public.compra_ordem_itens_set_company();

-- =============================================================================
-- 6. RLS — regua identica a das tabelas compra_* (20260619180000)
-- =============================================================================
-- 4 policies SEPARADAS por comando (SELECT/INSERT/UPDATE/DELETE), TO authenticated.
-- Predicado unico: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()).
--
-- POR QUE SEPARADAS E NAO UMA FOR ALL: policy FOR ALL e PERMISSIVA e se soma por
-- OR a todas as outras, sombreando qualquer regra mais restritiva de DELETE.
-- No Dominex isso ja causou vazamento (can_manage_system sem company_id).
--
-- O UPDATE tem USING **e** WITH CHECK: o USING so valida a linha ANTES da
-- mudanca; sem WITH CHECK daria pra fazer SET company_id = '<outro tenant>'.

ALTER TABLE public.compra_ordens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_ordem_itens ENABLE ROW LEVEL SECURITY;

-- compra_ordens
DROP POLICY IF EXISTS compra_ordens_select_own_company ON public.compra_ordens;
CREATE POLICY compra_ordens_select_own_company
  ON public.compra_ordens FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordens_insert_own_company ON public.compra_ordens;
CREATE POLICY compra_ordens_insert_own_company
  ON public.compra_ordens FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordens_update_own_company ON public.compra_ordens;
CREATE POLICY compra_ordens_update_own_company
  ON public.compra_ordens FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordens_delete_own_company ON public.compra_ordens;
CREATE POLICY compra_ordens_delete_own_company
  ON public.compra_ordens FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- compra_ordem_itens
DROP POLICY IF EXISTS compra_ordem_itens_select_own_company ON public.compra_ordem_itens;
CREATE POLICY compra_ordem_itens_select_own_company
  ON public.compra_ordem_itens FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordem_itens_insert_own_company ON public.compra_ordem_itens;
CREATE POLICY compra_ordem_itens_insert_own_company
  ON public.compra_ordem_itens FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordem_itens_update_own_company ON public.compra_ordem_itens;
CREATE POLICY compra_ordem_itens_update_own_company
  ON public.compra_ordem_itens FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS compra_ordem_itens_delete_own_company ON public.compra_ordem_itens;
CREATE POLICY compra_ordem_itens_delete_own_company
  ON public.compra_ordem_itens FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 6.1 Fechar anon/PUBLIC no nivel de GRANT (segunda camada)
-- -----------------------------------------------------------------------------
-- O pg_default_acl do schema public NESTE projeto concede privilegios amplos pra
-- anon em TODA tabela nova. Nao seria explorável aqui (as 8 policies sao TO
-- authenticated e RLS nega o que nao tem policy), mas deixaria a seguranca
-- apoiada numa camada so. REVOKE ALL antes do GRANT tambem tira TRUNCATE,
-- REFERENCES e TRIGGER de authenticated.

REVOKE ALL ON public.compra_ordens      FROM PUBLIC, anon;
REVOKE ALL ON public.compra_ordem_itens FROM PUBLIC, anon;
REVOKE ALL ON public.compra_ordens      FROM authenticated;
REVOKE ALL ON public.compra_ordem_itens FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_ordens      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_ordem_itens TO authenticated;

GRANT ALL ON public.compra_ordens      TO service_role;
GRANT ALL ON public.compra_ordem_itens TO service_role;

-- =============================================================================
-- 7. RPC receber_ordem_compra(p_ordem_id, p_itens)
-- =============================================================================
-- p_itens = array JSON de { "item_id": uuid, "quantity": numeric }
--           quantity = o que chegou AGORA (incremental), nao o acumulado.
--
-- Faz tudo numa transacao so (funcao plpgsql = atomica): soma o recebido,
-- da a entrada no estoque pelo caminho unico (register_inventory_movement) no
-- LOCAL DA COMPRA, e recalcula o status da O.C.
--
-- Tokens de erro estaveis que o front trata:
--   'receipt_exceeds_ordered: <nome do material>'  ERRCODE check_violation
--   'ordem_cancelada: ...'                          ERRCODE check_violation
--   'payload_invalido: ...'                         ERRCODE invalid_parameter_value
--
-- Idempotencia: o teto quantity_received <= quantity_ordered E o SELECT ... FOR
-- UPDATE na ordem. Duplo-clique com o mesmo payload serializa e o segundo
-- estoura 'receipt_exceeds_ordered' em vez de somar duas vezes.

CREATE OR REPLACE FUNCTION public.receber_ordem_compra(
  p_ordem_id uuid,
  p_itens    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_company       uuid;
  v_user_company  uuid;
  v_status        text;
  v_numero        integer;
  v_supplier_id   uuid;
  v_compra_id     uuid;
  v_stock_id      uuid;
  v_item          public.compra_ordem_itens%ROWTYPE;
  v_inventory_id  uuid;
  v_total_items   bigint;
  v_pending       bigint;
  v_touched       int := 0;
  v_qty_total     numeric := 0;
  r               record;
BEGIN
  IF p_ordem_id IS NULL THEN
    RAISE EXCEPTION 'payload_invalido: p_ordem_id obrigatorio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'payload_invalido: p_itens deve ser um array de objetos com item_id e quantity'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Trava a ordem: serializa recebimentos concorrentes (duplo-clique) da MESMA O.C.
  SELECT o.company_id, o.status, o.numero, o.supplier_id, o.compra_id
    INTO v_company, v_status, v_numero, v_supplier_id, v_compra_id
    FROM public.compra_ordens o
   WHERE o.id = p_ordem_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de compra nao encontrada: %', p_ordem_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Guarda de tenant: company_id vem do BANCO, nunca do client.
  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: ordem de compra de outra empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'ordem_cancelada: a O.C. #% foi cancelada e nao aceita recebimento', v_numero
      USING ERRCODE = 'check_violation';
  END IF;

  -- Local de destino: o da compra dona. NULL => register_inventory_movement usa
  -- o estoque principal (is_default) da empresa.
  SELECT c.stock_id INTO v_stock_id
    FROM public.compras c
   WHERE c.id = v_compra_id;

  -- NULLIF(...,'') evita 22P02 quando o front manda string vazia. Elemento que
  -- nao for objeto JSON devolve NULL em ->> (jsonb) e cai no CONTINUE abaixo.
  FOR r IN
    SELECT NULLIF(e->>'item_id', '')::uuid                       AS item_id,
           COALESCE(NULLIF(e->>'quantity', '')::numeric, 0)      AS quantity
      FROM jsonb_array_elements(p_itens) AS e
  LOOP
    CONTINUE WHEN r.item_id IS NULL;
    CONTINUE WHEN r.quantity IS NULL OR r.quantity <= 0;

    SELECT i.* INTO v_item
      FROM public.compra_ordem_itens i
     WHERE i.id = r.item_id
       AND i.ordem_id = p_ordem_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'payload_invalido: item % nao pertence a O.C. #%', r.item_id, v_numero
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- TETO. Token estavel: o front casa pelo prefixo 'receipt_exceeds_ordered:'.
    IF (v_item.quantity_received + r.quantity) > v_item.quantity_ordered THEN
      RAISE EXCEPTION 'receipt_exceeds_ordered: %',
        COALESCE(NULLIF(btrim(v_item.material_name), ''), 'Material')
        USING ERRCODE = 'check_violation';
    END IF;

    -- Material manual (sem inventory_id): cria no estoque da empresa antes da
    -- entrada e amarra o rastro de volta (item da O.C. e, se estiver solta, a
    -- linha da requisicao). Mesma logica que o front fazia em
    -- useCompraCotacoes.registerStockEntry, agora dentro da transacao.
    v_inventory_id := v_item.inventory_id;
    IF v_inventory_id IS NULL THEN
      INSERT INTO public.inventory (company_id, name, unit, cost_price, quantity)
      VALUES (
        v_company,
        COALESCE(NULLIF(btrim(v_item.material_name), ''), 'Material'),
        COALESCE(NULLIF(btrim(v_item.unit), ''), 'un'),
        COALESCE(v_item.unit_price, 0),
        0
      )
      RETURNING id INTO v_inventory_id;

      UPDATE public.compra_ordem_itens
         SET inventory_id = v_inventory_id
       WHERE id = v_item.id;

      UPDATE public.compra_materiais
         SET inventory_id = v_inventory_id
       WHERE id = v_item.compra_material_id
         AND inventory_id IS NULL;
    END IF;

    -- CAMINHO UNICO de escrita de saldo. Nunca UPDATE direto em
    -- inventory_stock_levels / inventory.quantity.
    PERFORM public.register_inventory_movement(
      p_inventory_id        => v_inventory_id,
      p_movement_type       => 'entrada',
      p_quantity            => r.quantity,
      p_supplier_id         => v_supplier_id,
      p_unit_cost           => v_item.unit_price,
      p_notes               => 'Recebimento da O.C. #' || v_numero::text,
      p_service_order_id    => NULL,
      p_related_movement_id => NULL,
      p_stock_id            => v_stock_id
    );

    UPDATE public.compra_ordem_itens
       SET quantity_received = quantity_received + r.quantity
     WHERE id = v_item.id;

    v_touched   := v_touched + 1;
    v_qty_total := v_qty_total + r.quantity;
  END LOOP;

  -- Recalcula o status pelo estado REAL dos itens (nao pelo payload).
  SELECT count(*),
         count(*) FILTER (WHERE i.quantity_received < i.quantity_ordered)
    INTO v_total_items, v_pending
    FROM public.compra_ordem_itens i
   WHERE i.ordem_id = p_ordem_id;

  IF v_total_items > 0 AND v_pending = 0 THEN
    UPDATE public.compra_ordens
       SET status      = 'recebida',
           received_at = COALESCE(received_at, now())
     WHERE id = p_ordem_id;
    v_status := 'recebida';
  ELSIF v_touched > 0 THEN
    UPDATE public.compra_ordens
       SET status = 'recebida_parcial'
     WHERE id = p_ordem_id;
    v_status := 'recebida_parcial';
  END IF;

  RETURN jsonb_build_object(
    'ordem_id',        p_ordem_id,
    'numero',          v_numero,
    'status',          v_status,
    'itens_recebidos', v_touched,
    'quantidade_total', v_qty_total,
    'itens_pendentes', v_pending,
    'stock_id',        v_stock_id
  );
END;
$fn$;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid, jsonb) IS
  'Recebe (total ou parcialmente) uma Ordem de Compra. p_itens = array de { item_id, quantity } com a quantidade que chegou AGORA. Soma em quantity_received respeitando o teto quantity_ordered, da entrada no estoque via register_inventory_movement no local de destino da compra (compras.stock_id) e recalcula o status da O.C. Tokens de erro: receipt_exceeds_ordered, ordem_cancelada, payload_invalido.';

-- Superficie minima: a chave anon vai no bundle do frontend, entao RPC
-- security-definer que ESCREVE nunca pode ficar aberta pra anon/PUBLIC.
REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO authenticated, service_role;

COMMIT;
