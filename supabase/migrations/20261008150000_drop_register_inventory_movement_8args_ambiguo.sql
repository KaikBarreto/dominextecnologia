-- Remove a versao ANTIGA (8 args) de register_inventory_movement.
--
-- POR QUE: a migration 20260721160000_multi_estoque_e_grupos_material.sql criou a
-- versao multi-estoque com CREATE OR REPLACE acrescentando o parametro p_stock_id
-- no fim. Como a assinatura mudou, o Postgres criou uma SOBRECARGA nova em vez de
-- substituir a antiga -- e ninguem dropou a de 8 args.
--
-- Resultado: toda chamada via PostgREST que OMITE p_stock_id fica ambigua, porque
-- os dois candidatos aceitam o mesmo conjunto de 8 argumentos nomeados:
--   PGRST203 - Could not choose the best candidate function between:
--     public.register_inventory_movement(... 8 args ...),
--     public.register_inventory_movement(... 9 args ...)
--
-- Quebrado em producao desde 21/07/2026. Caminhos afetados (todos omitem p_stock_id):
--   - src/hooks/useQuoteConversion.ts  ("Converter em OS" de orcamento com material;
--     a OS era criada ANTES do loop de materiais, sobrando OS orfa e orcamento nao
--     marcado como convertido -- clicar de novo duplicava a OS)
--   - src/hooks/useNfeImport.ts        (entrada de estoque por importacao de NF-e)
--   - src/hooks/useInventory.ts        (cadastro com quantidade inicial e ajuste
--     manual de quantidade, quando nao ha local de estoque selecionado)
--
-- POR QUE DROPAR A ANTIGA E SEGURO: a de 9 args e superconjunto estrito da de 8 --
-- mesmos 8 parametros, mesmos tipos, mesmos DEFAULTs -- mais p_stock_id DEFAULT NULL.
-- E p_stock_id NULL ja resolve para o estoque principal da empresa (stocks.is_default),
-- que e exatamente o comportamento single-stock da versao antiga. Nenhum chamador
-- perde comportamento.
--
-- Verificado em producao ANTES do drop (byqldosixshhuiuarszp):
--   - pg_depend: ZERO objetos (view/trigger/constraint/default) referenciam a de 8 args.
--   - As 3 funcoes SQL que chamam a RPC internamente (finalize_inventory_count,
--     commit_os_material_consumption, receber_ordem_compra) usam notacao de argumento
--     NOMEADO e passam p_stock_id explicitamente -- ja resolviam para a de 9 args e
--     continuam resolvendo (agora como candidato unico). Nenhuma usa os 8 posicionais.
--   - Ambas tinham os mesmos GRANTs (authenticated, service_role). Os GRANTs sao
--     reconcedidos abaixo porque DROP de funcao leva os GRANTs dela junto, e nao
--     queremos depender de qual OID o Postgres associou a cada ACL.

DROP FUNCTION IF EXISTS public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid);

-- Reafirma os GRANTs da versao que FICA (idempotente; protege contra o gotcha de
-- "DROP de funcao leva os GRANTs junto").
GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

-- A RPC e SECURITY DEFINER e faz o proprio isolamento por company_id/can_access_stock,
-- mas nao deve ser alcancavel sem sessao autenticada.
REVOKE ALL ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  FROM anon;
