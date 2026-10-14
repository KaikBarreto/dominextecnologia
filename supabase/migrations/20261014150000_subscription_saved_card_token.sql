-- Cartão salvo da assinatura para cobrança imediata de upgrade proporcional.
--
-- O token Asaas nunca fica em public.companies nem é exposto ao tenant. Ele é
-- guardado no Supabase Vault sob um nome determinístico por empresa. A tabela
-- companies recebe somente metadados não sensíveis usados pela UI.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS subscription_card_brand TEXT,
  ADD COLUMN IF NOT EXISTS subscription_card_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.companies'::regclass
       AND conname = 'companies_subscription_card_last4_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_card_last4_check
      CHECK (
        subscription_card_last4 IS NULL
        OR subscription_card_last4 ~ '^[0-9]{4}$'
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.companies.subscription_card_last4 IS
  'Últimos quatro dígitos do cartão da assinatura, somente para exibição. O token real fica no Vault.';
COMMENT ON COLUMN public.companies.subscription_card_brand IS
  'Bandeira normalizada do cartão da assinatura, somente para exibição.';
COMMENT ON COLUMN public.companies.subscription_card_updated_at IS
  'Momento em que o token do cartão da assinatura foi salvo/rotacionado no Vault.';

-- Wrapper restrito: a edge informa apenas company_id + token. O nome do secret
-- é derivado no banco, evitando que callers escolham outro segredo do Vault.
CREATE OR REPLACE FUNCTION public.vault_upsert_subscription_card_token(
  p_company_id UUID,
  p_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription_card_company_required';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'subscription_card_token_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'subscription_card_company_not_found';
  END IF;

  v_name := 'dominex_subscription_card_' || p_company_id::TEXT;
  PERFORM public.vault_upsert_tenant_secret(v_name, p_token);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_read_subscription_card_token(
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription_card_company_required';
  END IF;
  RETURN public.vault_read_tenant_secret(
    'dominex_subscription_card_' || p_company_id::TEXT
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_delete_subscription_card_token(
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription_card_company_required';
  END IF;
  RETURN public.vault_delete_tenant_secret(
    'dominex_subscription_card_' || p_company_id::TEXT
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vault_upsert_subscription_card_token(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_read_subscription_card_token(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_delete_subscription_card_token(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vault_upsert_subscription_card_token(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_read_subscription_card_token(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_subscription_card_token(UUID)
  TO service_role;
