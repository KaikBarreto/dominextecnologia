-- W2-01 P1: projecao minima do catalogo usada pela tela de pre-pedidos.
-- A RPC evita que consultas amplas carreguem custo, credito, fiscal ou contato
-- para o navegador de operadores do PDV.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_get_preorder_catalog_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  -- Fonte unica de auth, tenant, vigencia, modulo PDV e tela pdv/pdv_orders.
  v_company := public.pdv_preorder_access_company_v2();
  -- O catalogo inclui preco de venda e nao herda o fallback legado por role.
  -- Fora dos gestores canonicos, a tela precisa estar nominalmente concedida.
  IF NOT public.is_admin_or_gestor(v_uid)
     AND NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(v_uid, 'screen:pdv') IS DISTINCT FROM true
     AND public.pdv_has_explicit_action_permission_v2(v_uid, 'screen:pdv_orders') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar os pré-pedidos.'
      USING ERRCODE='42501', DETAIL='code=pdv_preorder_screen_denied';
  END IF;

  RETURN jsonb_build_object(
    'materials', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'name', i.name,
            'sku', i.sku,
            'barcode', i.barcode,
            'unit', i.unit,
            'sale_price', i.sale_price,
            'image_url', i.image_url,
            'archived_at', i.archived_at,
            'group', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', g.id,
              'name', g.name,
              'color', g.color
            ) END,
            'available_by_stock', (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'stock_id', s.id,
                    'available_quantity', CASE
                      WHEN availability.shortage_quantity > 0 THEN 0::numeric
                      ELSE GREATEST(
                        availability.physical_quantity
                          - GREATEST(availability.committed_quantity - availability.shortage_quantity, 0),
                        0
                      )
                    END
                  ) ORDER BY s.sort_order, s.name, s.id
                ),
                '[]'::jsonb
              )
              FROM public.stocks s
              LEFT JOIN public.inventory_stock_levels level
                ON level.company_id = v_company
               AND level.inventory_id = i.id
               AND level.stock_id = s.id
              CROSS JOIN LATERAL (
                SELECT
                  COALESCE(level.quantity, 0)::numeric AS physical_quantity,
                  COALESCE(sum(
                    reservation.reserved_quantity
                      - reservation.consumed_quantity
                      - reservation.released_quantity
                  ), 0)::numeric AS committed_quantity,
                  LEAST(
                    COALESCE(sum(
                      reservation.reserved_quantity
                        - reservation.consumed_quantity
                        - reservation.released_quantity
                    ), 0),
                    GREATEST(
                      COALESCE(sum(reservation.shortage_quantity), 0),
                      COALESCE(sum(
                        reservation.reserved_quantity
                          - reservation.consumed_quantity
                          - reservation.released_quantity
                      ), 0) - COALESCE(level.quantity, 0),
                      0
                    )
                  )::numeric AS shortage_quantity
                FROM public.pdv_stock_reservation_items reservation
                WHERE reservation.company_id = v_company
                  AND reservation.inventory_id = i.id
                  AND reservation.stock_id = s.id
                  AND reservation.state IN ('guaranteed', 'conflict')
              ) availability
              WHERE s.company_id = v_company
                AND s.customer_id IS NULL
                AND public.can_access_stock(v_uid, s.id)
            )
          ) ORDER BY i.name, i.id
        ),
        '[]'::jsonb
      )
      FROM public.inventory i
      LEFT JOIN public.material_groups g
        ON g.id = i.group_id
       AND g.company_id = v_company
      WHERE i.company_id = v_company
        AND i.customer_id IS NULL
        AND i.id IN (SELECT public.get_accessible_inventory_ids())
    ),
    'customers', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('id', c.id, 'name', c.name)
          ORDER BY c.name, c.id
        ),
        '[]'::jsonb
      )
      FROM public.customers c
      WHERE c.company_id = v_company
        AND c.is_deleted IS FALSE
    ),
    'stocks', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('id', s.id, 'name', s.name)
          ORDER BY s.sort_order, s.name, s.id
        ),
        '[]'::jsonb
      )
      FROM public.stocks s
      WHERE s.company_id = v_company
        AND s.customer_id IS NULL
        AND public.can_access_stock(v_uid, s.id)
    )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_get_preorder_catalog_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_preorder_catalog_v2() TO authenticated, service_role;

COMMENT ON FUNCTION public.pdv_get_preorder_catalog_v2() IS
  'Projecao allowlisted do catalogo de orcamentos do balcao. Retorna identificacao comercial, imagem, codigo, grupo e disponibilidade por local acessivel; nunca custo, credito, dados fiscais ou contato.';

COMMIT;
