BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_enrich_order_receipt_company_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE
  v_company jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'logo_url',CASE WHEN settings.white_label_enabled IS TRUE
      THEN COALESCE(NULLIF(settings.white_label_logo_url,''),NULLIF(settings.logo_url,''))
      ELSE NULLIF(settings.logo_url,'') END,
    'white_label_enabled',COALESCE(settings.white_label_enabled,false),
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
      THEN COALESCE(NULLIF(settings.phone,''),NULLIF(company.phone,'')) END
  ))
  INTO v_company
  FROM public.companies company
  LEFT JOIN public.company_settings settings ON settings.company_id=company.id
  WHERE company.id=NEW.company_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar a empresa do comprovante.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_company_missing';
  END IF;

  NEW.snapshot := jsonb_set(
    NEW.snapshot,
    '{company}',
    COALESCE(NEW.snapshot->'company','{}'::jsonb) || v_company,
    true
  );
  NEW.snapshot_hash := encode(extensions.digest(convert_to(NEW.snapshot::text,'UTF8'),'sha256'),'hex');
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_pdv_enrich_order_receipt_company_v2 ON public.pdv_order_receipt_snapshots;
CREATE TRIGGER trg_pdv_enrich_order_receipt_company_v2
  BEFORE INSERT ON public.pdv_order_receipt_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.pdv_enrich_order_receipt_company_v2();

REVOKE ALL ON FUNCTION public.pdv_enrich_order_receipt_company_v2() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_enrich_order_receipt_company_v2() TO service_role;

COMMENT ON FUNCTION public.pdv_enrich_order_receipt_company_v2() IS
  'Congela logo, white-label, documento, endereço e telefone permitidos no snapshot imutável do comprovante antes do hash.';

COMMIT;
