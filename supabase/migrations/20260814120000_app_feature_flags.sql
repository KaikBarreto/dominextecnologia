-- =============================================================================
-- app_feature_flags: flags de rollout controladas por banco (toggle instantâneo)
-- Não existe framework de flag no projeto; env var exigiria redeploy. Esta tabela
-- permite ligar/desligar sem deploy e com override por contrato (rollout gradual).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  -- lista opcional de contract_ids pra habilitar SÓ neles (cobaia). enabled=false
  -- + allowlist → habilita só nesses contratos; enabled=true → todos;
  -- enabled=false + allowlist vazia → desligado.
  contract_allowlist uuid[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_feature_flags IS
  'Flags de rollout por banco. enabled=false + allowlist → habilita só nos contratos da allowlist; enabled=true → todos; enabled=false + allowlist vazia → desligado.';

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

-- Leitura liberada pra usuários logados (flags não são segredo).
DROP POLICY IF EXISTS app_feature_flags_read ON public.app_feature_flags;
CREATE POLICY app_feature_flags_read ON public.app_feature_flags
  FOR SELECT TO authenticated USING (true);

-- Escrita só super_admin.
DROP POLICY IF EXISTS app_feature_flags_write ON public.app_feature_flags;
CREATE POLICY app_feature_flags_write ON public.app_feature_flags
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed: flag da regeneração server-side, DESLIGADA.
INSERT INTO public.app_feature_flags (key, enabled, contract_allowlist)
VALUES ('regenerate_contract_visits_rpc', false, '{}')
ON CONFLICT (key) DO NOTHING;
