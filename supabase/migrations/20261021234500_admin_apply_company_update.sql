-- Escrita atômica da edição administrativa de empresa. A Edge Function valida
-- o super-admin e calcula catálogo/preço; esta RPC só é executável pela
-- service_role e garante que company + módulos mudem juntos.
CREATE OR REPLACE FUNCTION public.admin_apply_company_update(
  p_company_id uuid,
  p_patch jsonb,
  p_modules text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies
     SET name = p_patch->>'name',
         cnpj = NULLIF(p_patch->>'cnpj', ''),
         email = NULLIF(p_patch->>'email', ''),
         phone = NULLIF(p_patch->>'phone', ''),
         address = NULLIF(p_patch->>'address', ''),
         contact_name = NULLIF(p_patch->>'contact_name', ''),
         subscription_status = p_patch->>'subscription_status',
         subscription_plan = p_patch->>'subscription_plan',
         subscription_value = (p_patch->>'subscription_value')::numeric,
         subscription_expires_at = NULLIF(p_patch->>'subscription_expires_at', '')::timestamptz,
         billing_cycle = p_patch->>'billing_cycle',
         max_users = (p_patch->>'max_users')::integer,
         notes = NULLIF(p_patch->>'notes', ''),
         origin = NULLIF(p_patch->>'origin', ''),
         salesperson_id = NULLIF(p_patch->>'salesperson_id', '')::uuid,
         sdr_id = NULL,
         affiliate_id = NULLIF(p_patch->>'affiliate_id', '')::uuid,
         segment = NULLIF(p_patch->>'segment', ''),
         custom_price = NULLIF(p_patch->>'custom_price', '')::numeric,
         custom_price_permanent = COALESCE((p_patch->>'custom_price_permanent')::boolean, true),
         custom_price_months = NULLIF(p_patch->>'custom_price_months', '')::integer,
         nfse_tier = (p_patch->>'nfse_tier')::integer,
         whatsapp_tier = (p_patch->>'whatsapp_tier')::integer,
         plan_locked = (p_patch->>'plan_locked')::boolean,
         updated_at = now()
   WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  DELETE FROM public.company_modules WHERE company_id = p_company_id;
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT p_company_id, module_code
    FROM unnest(COALESCE(p_modules, ARRAY[]::text[])) AS module_code;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) TO service_role;

