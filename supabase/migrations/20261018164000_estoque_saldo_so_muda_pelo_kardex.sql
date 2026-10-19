-- ============================================================================
-- ESTOQUE : SALDO SO MUDA PELO KARDEX (fechamento de furo de integridade)
--
-- O FURO
-- ---------------------------------------------------------------------------
-- public.inventory_stock_levels da INSERT/UPDATE/DELETE pra authenticated. As
-- policies JA recortam por company_id E por can_access_stock (20260814225028),
-- entao ISTO NAO E VAZAMENTO ENTRE EMPRESAS e nao e isso que estamos
-- consertando. O que esta aberto e INTEGRIDADE: quem tem acesso legitimo ao
-- local escreve `quantity` direto por PostgREST, FORA da
-- register_inventory_movement, e o saldo muda SEM LINHA EM
-- inventory_movements, sem stock_before, sem stock_after. O Kardex deixa de
-- explicar o saldo, e e o Kardex que o cliente usa pra achar divergencia.
--
-- E TEM UM CAMINHO PIOR, QUE NAO ESTAVA REGISTRADO EM LUGAR NENHUM: O DELETE.
-- A policy inventory_stock_levels_delete_own_company deixa o cliente APAGAR a
-- linha de nivel. A trigger trg_sync_inventory_quantity roda AFTER DELETE e
-- recalcula o espelho inventory.quantity pra baixo. Resultado: o saldo e
-- DESTRUIDO e o Kardex nao registra nada. Varredura no src inteiro: NENHUM call
-- site de front faz isso, ou seja, e porta aberta sem uso, que e o pior tipo
-- (ninguem nota se for usada).
--
-- POR QUE AS POLICIES DE ESCRITA FICAM COMO ESTAO (decisao do Tech Lead)
-- ---------------------------------------------------------------------------
-- A divida registrada no projeto dizia que fechar isso exigiria migrar
-- useInventory e a contagem de inventario pra RPC, com deploy coordenado. ISSO
-- ESTA DESATUALIZADO, e foi MEDIDO antes desta migration:
--   * unico ponto de ESCRITA no front inteiro:
--     useInventory.updateStockLevelMinQuantity (src/hooks/useInventory.ts:152-189),
--     que faz UPDATE de min_quantity e, se nao achou linha, INSERT com
--     quantity: 0;
--   * useInventoryCounts so faz SELECT (a finalizacao ja passa por
--     finalize_inventory_count);
--   * useCustomerStock, useCustomerStockManagement e useCompanyDataExport so
--     leem;
--   * nenhuma edge function toca a tabela.
-- Mesmo assim, GUARD TRIGGER e melhor que dropar policy aqui, por tres razoes:
--   (1) nao quebra o edit inline de minimo, que e escrita legitima e inofensiva
--       (min_quantity e limiar, nao dinheiro);
--   (2) fecha no CAMINHO DE ESCRITA em vez de na permissao;
--   (3) sobrevive a alguem recriar as policies num loop genérico no futuro, que
--       foi exatamente como o furo nasceu (20260721160000).
-- Nao reabrir essa discussao do zero daqui a 3 meses: a contagem de call sites
-- acima e a razao.
--
-- AS DUAS ARMADILHAS, COPIADAS DO PRECEDENTE guard_inventory_presence_write
-- ---------------------------------------------------------------------------
--  1) A FUNCAO TEM QUE SER SECURITY INVOKER. Como SECURITY DEFINER, current_user
--     dentro dela e SEMPRE o owner e o guard fica INERTE. Foi exatamente o que
--     aconteceu com o guard de presenca entre 22/07 e 30/09/2026, provado em
--     producao. A funcao nao precisa de privilegio nenhum: so le NEW/OLD e
--     levanta excecao.
--  2) O teste de autoria e pg_has_role(current_user, 'postgres', 'MEMBER'), NAO
--     comparacao de string. Cobre postgres e superusuario (supabase_admin,
--     editor SQL do dashboard, migrations futuras) e exclui anon,
--     authenticated e service_role. DML dentro de funcao SECURITY DEFINER com
--     owner postgres faz o trigger invoker enxergar current_user='postgres',
--     entao as RPCs de estoque (register_inventory_movement,
--     transfer_stock_between, finalize_inventory_count,
--     update_materials_stock_batch) continuam passando livremente. Tambem ja
--     provado em producao.
--
-- COMPORTAMENTO
-- ---------------------------------------------------------------------------
--   BEFORE INSERT : nao-owner tem NEW.quantity NORMALIZADO pra 0, SEM ERRO.
--                   Levantar excecao aqui quebraria o insert legitimo do estoque
--                   minimo inline, que cria o nivel sem saber de saldo. Mesma
--                   escolha do guard de presenca pro is_present.
--   BEFORE UPDATE : nao-owner mudando quantity leva
--                   stock_quantity_write_forbidden. min_quantity e qualquer
--                   outra coluna seguem livres.
--   BEFORE DELETE : nao-owner apagando linha com quantity <> 0 leva
--                   stock_level_delete_forbidden. Linha com saldo zero pode ser
--                   apagada (limpeza inofensiva).
--
-- Nada muda pra quem nao tem modulo nenhum: isto nao e feature, e trava de
-- integridade no caminho que ja existia.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_inventory_quantity_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_is_owner boolean := pg_has_role(current_user, 'postgres', 'MEMBER');
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Saldo so nasce via register_inventory_movement. Insert de fora normaliza
    -- pra 0, sem erro, pra nao quebrar o insert de min_quantity inline.
    IF NOT v_is_owner THEN
      NEW.quantity := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Apagar a linha de nivel some com o saldo SEM deixar linha no Kardex,
    -- porque trg_sync_inventory_quantity recalcula o espelho AFTER DELETE.
    IF OLD.quantity <> 0 AND NOT v_is_owner THEN
      RAISE EXCEPTION 'stock_level_delete_forbidden: nao e possivel apagar saldo de material com quantidade em estoque'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: so bloqueia quando o SALDO de fato muda e o autor nao tem autoridade
  -- de owner (as RPCs security-definer rodam como owner e passam livremente).
  -- min_quantity e as outras colunas seguem livres de proposito.
  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     AND NOT v_is_owner THEN
    RAISE EXCEPTION 'stock_quantity_write_forbidden: saldo so pode ser alterado via register_inventory_movement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_inventory_quantity_write() IS
  'Trava de integridade: saldo (quantity) de inventory_stock_levels só muda via register_inventory_movement, e linha com saldo não pode ser apagada. DELIBERADAMENTE SECURITY INVOKER: como SECURITY DEFINER o current_user dentro da função seria sempre o owner e o guard ficaria INERTE (foi o que aconteceu com guard_inventory_presence_write entre 22/07 e 30/09/2026). Não padronizar pra DEFINER. A autoria é testada por pg_has_role(current_user, ''postgres'', ''MEMBER''), que deixa passar as RPCs SECURITY DEFINER e barra anon/authenticated/service_role.';

DROP TRIGGER IF EXISTS trg_guard_inventory_quantity_insert ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_quantity_insert
  BEFORE INSERT ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_quantity_write();

DROP TRIGGER IF EXISTS trg_guard_inventory_quantity_update ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_quantity_update
  BEFORE UPDATE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_quantity_write();

DROP TRIGGER IF EXISTS trg_guard_inventory_quantity_delete ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_quantity_delete
  BEFORE DELETE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_quantity_write();

COMMIT;
