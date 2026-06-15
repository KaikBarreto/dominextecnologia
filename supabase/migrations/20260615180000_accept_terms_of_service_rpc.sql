-- 20260615180000_accept_terms_of_service_rpc.sql
-- =============================================================================
-- LGPD: RPC atômica de aceite dos Termos de Uso (Art. 8º §2º — ônus da prova)
-- =============================================================================
-- Por quê: hoje o aceite só faz `UPDATE profiles SET terms_accepted_at = now()`,
-- que serve de gate rápido mas NÃO é prova forte de consentimento. Para LGPD
-- (ônus da prova do aceite) precisamos registrar IP real, navegador (user-agent)
-- e a versão do termo aceito, de forma atômica. Esta função grava a linha em
-- `consent_records` (purpose = 'terms_of_use') E atualiza o gate em `profiles`
-- numa única transação.
--
-- Segurança: SECURITY DEFINER. O `user_id` é SEMPRE derivado de `auth.uid()`,
-- NUNCA de parâmetro do client — assim um usuário não consegue gravar
-- consentimento em nome de outro. O único parâmetro é a versão do termo.
--
-- IP/UA são capturados dos headers da requisição PostgREST via
-- `current_setting('request.headers', true)`. O x-forwarded-for pode vir como
-- "ip_cliente, ip_proxy1, ..."; pegamos o PRIMEIRO (o IP real do cliente). O
-- cast pra inet é protegido: se o header vier vazio/ausente/inválido, grava
-- NULL em vez de quebrar o aceite.

CREATE OR REPLACE FUNCTION public.accept_terms_of_service(p_version text DEFAULT '1.0')
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
    RAISE EXCEPTION 'Não autenticado: aceite de termos exige usuário logado.';
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

  INSERT INTO public.consent_records (
    user_id, company_id, purpose, version, accepted_at, ip_address, user_agent
  ) VALUES (
    v_uid, v_company, 'terms_of_use', coalesce(p_version, '1.0'), now(), v_ip, v_ua
  );

  UPDATE public.profiles
    SET terms_accepted_at = now()
    WHERE user_id = v_uid;
END;
$$;

COMMENT ON FUNCTION public.accept_terms_of_service(text) IS
  'LGPD: registra o aceite dos Termos de Uso de forma atômica — grava IP real (x-forwarded-for), user-agent e versão em consent_records (purpose=terms_of_use) e atualiza profiles.terms_accepted_at. user_id derivado de auth.uid() (nunca de parâmetro). Prova de consentimento (Art. 8º §2º).';

-- Permissões: só usuário autenticado executa; client público não.
REVOKE ALL ON FUNCTION public.accept_terms_of_service(text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_terms_of_service(text) TO authenticated;
