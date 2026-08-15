-- ESTOQUE: get_accessible_inventory_ids() — quais materiais a lista "Itens do Estoque"
-- deve mostrar para o usuário logado, respeitando a ACL por local (stock_access).
--
-- Problema (feedback CEO / incidente de visibilidade):
--   A lista "Itens do Estoque" no front puxa `inventory` inteiro (company-wide).
--   Um usuário restrito a alguns locais via, na lista, materiais que só existem em
--   locais que ele NÃO acessa (apareciam com quantidade 0). O front não consegue
--   decidir isso sozinho: o RLS de inventory_stock_levels esconde do usuário as
--   linhas dos locais bloqueados, então ele não distingue
--     (a) "material novo sem presença configurada em lugar nenhum" (legado/global)
--     de
--     (b) "material que só existe em local bloqueado".
--   Só o SERVIDOR enxerga os dois casos (pode ler todas as linhas via SECURITY DEFINER).
--
-- Solução: RPC SECURITY DEFINER que devolve os ids de `inventory` que o usuário DEVE ver.
--   Um material `inv` (da company do usuário) é VISÍVEL se:
--     (1) EXISTS linha em inventory_stock_levels L com L.inventory_id = inv.id
--         AND L.is_present = true AND can_access_stock(auth.uid(), L.stock_id)
--         -> presente em ao menos 1 local acessível.
--     OU
--     (2) NOT EXISTS qualquer linha em inventory_stock_levels para inv.id
--         -> material sem presença configurada em lugar nenhum = global/legado,
--            mantém visível (backward-compat: não pode sumir material antigo).
--   Materiais que SÓ têm presença em local bloqueado ficam de fora.
--
-- Escopo: só materiais onde inv.company_id = get_user_company_id(auth.uid()).
--   super_admin: can_access_stock devolve true p/ todo local, então a condição (1) já cobre.
--   super_admin SEM company (get_user_company_id null) -> retorna vazio sem erro
--   (inv.company_id = NULL nunca é verdade, filtra tudo). Sem ramo especial.
--
-- SECURITY DEFINER: precisa ler TODAS as linhas de inventory_stock_levels
--   (inclusive dos locais bloqueados p/ o usuário) para avaliar o caso (2)
--   corretamente. Roda como owner, furando a RLS de inventory_stock_levels.
--   can_access_stock reintroduz o gate por local dentro do corpo (padrão: guard
--   reaplicado no corpo da RPC SECURITY DEFINER, não confia na RLS que foi furada).
-- STABLE: só lê. SET search_path = public: evita hijack de search_path.

CREATE OR REPLACE FUNCTION public.get_accessible_inventory_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT inv.id
    FROM public.inventory inv
   WHERE inv.company_id = public.get_user_company_id(auth.uid())
     AND (
       -- (1) presente em ao menos 1 local acessível
       EXISTS (
         SELECT 1
           FROM public.inventory_stock_levels l
          WHERE l.inventory_id = inv.id
            AND l.is_present = true
            AND public.can_access_stock(auth.uid(), l.stock_id)
       )
       OR
       -- (2) sem NENHUMA linha de presença = global/legado, mantém visível
       NOT EXISTS (
         SELECT 1
           FROM public.inventory_stock_levels l
          WHERE l.inventory_id = inv.id
       )
     );
$$;

COMMENT ON FUNCTION public.get_accessible_inventory_ids() IS
  'SETOF uuid: ids de inventory que o usuario logado deve ver na lista de itens, respeitando a ACL por local. Visivel se presente (is_present) em >=1 local acessivel (can_access_stock) OU sem nenhuma linha de presenca (legado/global). Esconde material que so existe em local bloqueado. SECURITY DEFINER pois precisa enxergar todas as linhas de inventory_stock_levels para distinguir legado de bloqueado.';

GRANT EXECUTE ON FUNCTION public.get_accessible_inventory_ids() TO authenticated, service_role;
