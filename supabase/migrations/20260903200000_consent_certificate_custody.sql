-- 20260903200000_consent_certificate_custody.sql
-- =============================================================================
-- LGPD: consentimento explícito para custódia do certificado digital A1
-- =============================================================================
-- Por quê: a Dominex passou a guardar o certificado A1 dos clientes
-- (criptografado) para emitir NFS-e direto no governo. Os Termos de Uso
-- ganharam a Seção 12 cobrindo essa custódia, e o front ganhou um checkbox de
-- autorização no ato do envio do certificado. Falta o purpose novo no CHECK de
-- `consent_records` e uma RPC dedicada que grave IP/user-agent capturados no
-- servidor (prova forte, Art. 8º §2º), espelhando `accept_terms_of_service`.

-- -----------------------------------------------------------------------------
-- (a) Ampliar o CHECK de consent_records.purpose com 'certificate_custody'
-- -----------------------------------------------------------------------------
ALTER TABLE public.consent_records
  DROP CONSTRAINT IF EXISTS consent_records_purpose_check;

ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_purpose_check CHECK (
    purpose IN (
      'registration',
      'terms_of_use',
      'privacy_policy',
      'marketing',
      'gps_tracking',
      'biometric_time_record',
      'cookie_essential',
      'cookie_analytics',
      'certificate_custody'
    )
  );

-- -----------------------------------------------------------------------------
-- (b) RPC record_certificate_custody_consent — espelha accept_terms_of_service
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_certificate_custody_consent(p_version text DEFAULT '1.0')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_company uuid;
  v_headers json;
  v_ua      text;
  v_xff     text;
  v_ip      inet;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado: autorização de custódia do certificado exige usuário logado.';
  END IF;

  v_company := get_user_company_id(v_uid);

  -- Headers da requisição PostgREST (pode não existir fora de PostgREST → NULL).
  v_headers := current_setting('request.headers', true)::json;
  v_ua  := v_headers ->> 'user-agent';
  v_xff := v_headers ->> 'x-forwarded-for';

  -- x-forwarded-for vem "ip_cliente, ip_proxy..." → primeiro IP, trimado.
  -- Cast pra inet protegido: header vazio/inválido grava NULL em vez de quebrar.
  BEGIN
    v_ip := nullif(trim(split_part(coalesce(v_xff, ''), ',', 1)), '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  -- Sem ON CONFLICT: uma linha por autorização — o histórico é a prova.
  INSERT INTO public.consent_records (
    user_id, company_id, purpose, version, accepted_at, ip_address, user_agent
  ) VALUES (
    v_uid, v_company, 'certificate_custody', coalesce(p_version, '1.0'), now(), v_ip, v_ua
  );
END;
$$;

COMMENT ON FUNCTION public.record_certificate_custody_consent(text) IS
  'LGPD: registra a autorização de custódia do certificado digital A1 (Seção 12 dos Termos) — grava IP real (x-forwarded-for), user-agent e versão em consent_records (purpose=certificate_custody). user_id derivado de auth.uid() (nunca de parâmetro). Sem ON CONFLICT: uma linha por autorização, histórico é a prova (Art. 8º §2º).';

-- Permissões: só usuário autenticado executa; client público não.
-- O default privilege do schema public concede EXECUTE a anon/authenticated
-- automaticamente — sem REVOKE explícito a função fica chamável por qualquer um.
REVOKE ALL ON FUNCTION public.record_certificate_custody_consent(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_certificate_custody_consent(text) TO authenticated;
