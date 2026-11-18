-- A API pagina resultados em blocos de 1.000. A ordem deterministica evita
-- itens repetidos ou ausentes entre as paginas quando a empresa ultrapassa o
-- primeiro bloco, mantendo exatamente as mesmas regras de acesso por estoque.
CREATE OR REPLACE FUNCTION public.get_accessible_inventory_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT inv.id
    FROM public.inventory inv
   WHERE inv.company_id = public.get_user_company_id(auth.uid())
     AND inv.customer_id IS NULL
     AND inv.archived_at IS NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.inventory_stock_levels l
          JOIN public.stocks s ON s.id = l.stock_id AND s.customer_id IS NULL
         WHERE l.inventory_id = inv.id
           AND l.is_present = true
           AND public.can_access_stock(auth.uid(), l.stock_id)
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.inventory_stock_levels l WHERE l.inventory_id = inv.id
       )
     )
   ORDER BY inv.id;
$function$;

REVOKE ALL ON FUNCTION public.get_accessible_inventory_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_accessible_inventory_ids() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_accessible_inventory_ids() IS
  'Lista ordenada de itens visiveis ao usuario. A ordem por UUID garante paginacao estavel no PostgREST para empresas com mais de 1.000 produtos.';
