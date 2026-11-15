-- Identidade operacional dos documentos, independente da marca do painel admin.

CREATE OR REPLACE FUNCTION public.pdv_get_receipt_company_v3()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_company uuid; v_identity jsonb;
BEGIN
  -- A mesma fronteira dos comprovantes valida usuário ativo, empresa, assinatura,
  -- módulo e uma tela operacional permitida. Não recebe company_id do navegador.
  PERFORM public.pdv_get_receipt_settings_v3();
  v_company:=public.get_user_company_id(auth.uid());
  SELECT jsonb_build_object(
    'company_id',company.id,
    'name',COALESCE(NULLIF(settings.name,''),company.name),
    'document',CASE WHEN settings.show_cnpj_in_documents IS NOT FALSE
      THEN COALESCE(NULLIF(settings.document,''),NULLIF(company.cnpj,'')) END,
    'address',CASE WHEN settings.show_address_in_documents IS NOT FALSE THEN NULLIF(concat_ws(', ',
      NULLIF(COALESCE(settings.address,company.address),''),
      NULLIF(COALESCE(settings.address_number,company.address_number,company.street_number),''),
      NULLIF(COALESCE(settings.neighborhood,company.neighborhood),''),
      NULLIF(concat_ws(' - ',NULLIF(COALESCE(settings.city,company.city),''),NULLIF(COALESCE(settings.state,company.state),'')),''),
      NULLIF(COALESCE(settings.zip_code,company.zip_code),'')
    ),'') END,
    'phone',CASE WHEN settings.show_phone_in_documents IS NOT FALSE
      THEN COALESCE(NULLIF(settings.phone,''),NULLIF(company.phone,'')) END,
    'logo_url',CASE WHEN settings.white_label_enabled IS TRUE
      THEN COALESCE(NULLIF(settings.white_label_logo_url,''),NULLIF(settings.logo_url,''))
      ELSE NULLIF(settings.logo_url,'') END,
    'time_zone',COALESCE(NULLIF(settings.timezone,''),'America/Sao_Paulo'),
    'white_label_enabled',COALESCE(settings.white_label_enabled,false)
  ) INTO v_identity
  FROM public.companies company
  LEFT JOIN public.company_settings settings ON settings.company_id=company.id
  WHERE company.id=v_company;
  IF v_identity IS NULL OR NULLIF(v_identity->>'name','') IS NULL THEN
    RAISE EXCEPTION 'Não foi possível carregar os dados da empresa para o comprovante.'
      USING ERRCODE='P0002',DETAIL='code=pdv_receipt_company_missing';
  END IF;
  RETURN v_identity;
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_get_receipt_company_v3() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_receipt_company_v3() TO authenticated,service_role;
COMMENT ON FUNCTION public.pdv_get_receipt_company_v3() IS
  'Identidade mínima da empresa autenticada para orçamento/retirada, com flags de privacidade e white-label. Não depende do cache de aparência do painel admin nem aceita empresa informada pelo cliente.';
;
