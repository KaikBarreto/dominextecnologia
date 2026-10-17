-- Rollout geral apos testes de contrato, RLS e smoke transacional em producao.
-- O gate de assinatura/trial continua sendo revalidado pela edge e pelas RPCs.
-- Para rollback operacional imediato: definir enabled=false nesta mesma flag.
UPDATE public.app_feature_flags
   SET enabled = true,
       updated_at = now()
 WHERE key = 'public_api_v1';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_feature_flags
     WHERE key = 'public_api_v1' AND enabled
  ) THEN
    RAISE EXCEPTION 'public_api_v1 feature flag missing or not enabled';
  END IF;
END
$guard$;
