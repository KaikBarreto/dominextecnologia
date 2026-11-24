-- Identificação comercial do cliente no seletor PDV, preservando o catálogo seguro existente.

CREATE OR REPLACE FUNCTION public.pdv_get_direct_sale_catalog_v3()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_catalog jsonb; v_company uuid; v_customers jsonb;
BEGIN
  -- A v2 continua sendo a fronteira de sessão, assinatura, módulo, tela,
  -- estoque e custódia. Nenhum dado adicional é lido antes dessa autorização.
  v_catalog := public.pdv_get_direct_sale_catalog_v2();
  v_company := public.pdv_direct_sale_rollout_company_v2();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name,
          'document', c.document,
          'phone', c.phone,
          'celular', c.celular,
          'email', c.email,
          'address', c.address,
          'address_number', c.address_number,
          'neighborhood', c.neighborhood,
          'city', c.city,
          'state', c.state,
          'company_name', c.company_name,
          'nome_fantasia', c.nome_fantasia,
          'customer_type', c.customer_type
        ) ORDER BY allowed.ordinality), '[]'::jsonb)
    INTO v_customers
    FROM jsonb_array_elements(COALESCE(v_catalog->'customers', '[]'::jsonb))
      WITH ORDINALITY AS allowed(entry, ordinality)
    JOIN public.customers c
      ON c.id::text = allowed.entry->>'id'
     AND c.company_id = v_company
     AND c.is_deleted IS NOT TRUE;
  RETURN jsonb_set(v_catalog, '{customers}', v_customers, true);
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_get_direct_sale_catalog_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_direct_sale_catalog_v3() TO authenticated, service_role;
COMMENT ON FUNCTION public.pdv_get_direct_sale_catalog_v3() IS
  'Catálogo PDV v3: enriquece somente clientes já autorizados na v2 com identificação e contato necessários ao seletor; nunca saldo, crédito, notas ou cadastro completo.';

CREATE OR REPLACE FUNCTION public.pdv_get_preorder_catalog_v3()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_catalog jsonb; v_company uuid; v_customers jsonb;
BEGIN
  -- A v2 continua sendo a fronteira de sessão, assinatura, módulo, tela,
  -- estoque e custódia. Nenhum dado adicional é lido antes dessa autorização.
  v_catalog := public.pdv_get_preorder_catalog_v2();
  v_company := public.pdv_preorder_access_company_v2();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name,
          'document', c.document,
          'phone', c.phone,
          'celular', c.celular,
          'email', c.email,
          'address', c.address,
          'address_number', c.address_number,
          'neighborhood', c.neighborhood,
          'city', c.city,
          'state', c.state,
          'company_name', c.company_name,
          'nome_fantasia', c.nome_fantasia,
          'customer_type', c.customer_type
        ) ORDER BY allowed.ordinality), '[]'::jsonb)
    INTO v_customers
    FROM jsonb_array_elements(COALESCE(v_catalog->'customers', '[]'::jsonb))
      WITH ORDINALITY AS allowed(entry, ordinality)
    JOIN public.customers c
      ON c.id::text = allowed.entry->>'id'
     AND c.company_id = v_company
     AND c.is_deleted IS NOT TRUE;
  RETURN jsonb_set(v_catalog, '{customers}', v_customers, true);
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_get_preorder_catalog_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_preorder_catalog_v3() TO authenticated, service_role;
COMMENT ON FUNCTION public.pdv_get_preorder_catalog_v3() IS
  'Catálogo PDV v3: enriquece somente clientes já autorizados na v2 com identificação e contato necessários ao seletor; nunca saldo, crédito, notas ou cadastro completo.';
;
