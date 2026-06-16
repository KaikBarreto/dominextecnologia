-- =============================================================================
-- Fase 1 — Níveis (tiers) e cota mensal de NFS-e
-- =============================================================================
-- O módulo `nfe` (NFS-e via Fisqal) ganha 4 níveis com cota mensal de documentos.
-- Continua sendo UM único module code `nfe` (acesso à tela via hasModule('nfe'));
-- o nível é uma dimensão à parte, gravada em companies.nfse_tier.
--
-- Virada PREÇO-NEUTRA: todo cliente atual vira nível 1 (DEFAULT 1). Nada mexe
-- em companies.subscription_value.
--
-- Catálogo de níveis:
--   1 → 200/mês  → R$100
--   2 → 500/mês  → R$200
--   3 → 1000/mês → R$300
--   4 → ilimitado (monthly_limit NULL) → R$400
--
-- Contagem do mês: mês-calendário corrente em America/Sao_Paulo (UTC-3 régua do
-- projeto). Exclui só status de FALHA/REJEIÇÃO na origem (rejeitada/falhou e os
-- equivalentes crus em inglês que o edge pode gravar do retorno da Fisqal).
-- Cancelamento de nota JÁ EMITIDA continua contando (consumiu cota da prefeitura).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Catálogo de níveis (nome novo, sem colisão com tabela tenant).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nfse_tiers (
  tier          smallint PRIMARY KEY,
  name          text NOT NULL,
  monthly_limit int,                      -- NULL = ilimitado
  price         numeric(12,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed idempotente das 4 linhas.
INSERT INTO public.nfse_tiers (tier, name, monthly_limit, price) VALUES
  (1, 'Nível 1',             200,  100),
  (2, 'Nível 2',             500,  200),
  (3, 'Nível 3',            1000,  300),
  (4, 'Nível 4 (Ilimitado)', NULL, 400)
ON CONFLICT (tier) DO UPDATE
  SET name          = EXCLUDED.name,
      monthly_limit = EXCLUDED.monthly_limit,
      price         = EXCLUDED.price,
      updated_at    = now();

-- RLS de catálogo de preço (sem dado sensível de tenant): leitura aberta,
-- escrita só super_admin. Espelha o padrão de subscription_plans.
ALTER TABLE public.nfse_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view nfse tiers" ON public.nfse_tiers;
CREATE POLICY "Anyone can view nfse tiers"
  ON public.nfse_tiers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Super admins can manage nfse tiers" ON public.nfse_tiers;
CREATE POLICY "Super admins can manage nfse tiers"
  ON public.nfse_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.nfse_tiers TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) Coluna do nível na empresa (DEFAULT 1 = grandfathering preço-neutro).
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS nfse_tier smallint NOT NULL DEFAULT 1;

-- FK pro catálogo (NOT VALID p/ não travar a migration varrendo a tabela inteira;
-- o DEFAULT 1 já garante linhas existentes válidas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_nfse_tier_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_nfse_tier_fkey
      FOREIGN KEY (nfse_tier) REFERENCES public.nfse_tiers(tier) NOT VALID;
  END IF;
END $$;

-- Grandfathering explícito (no-op porque NOT NULL DEFAULT 1 já preencheu).
UPDATE public.companies SET nfse_tier = 1 WHERE nfse_tier IS NULL;

-- ---------------------------------------------------------------------------
-- 3) nfse_month_usage(p_company_id) -> int
--    Conta emissões do mês-calendário corrente (America/Sao_Paulo) que NÃO
--    falharam/foram rejeitadas na origem.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nfse_month_usage(p_company_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COUNT(*)::int
  FROM public.nfse_emissions e
  WHERE e.company_id = p_company_id
    AND date_trunc('month', e.created_at AT TIME ZONE 'America/Sao_Paulo')
        = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
    AND lower(coalesce(e.status, '')) NOT IN
        ('rejeitada', 'falhou', 'rejected', 'failed', 'error', 'erro');
$function$;

GRANT EXECUTE ON FUNCTION public.nfse_month_usage(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) nfse_can_emit(p_company_id) -> jsonb
--    Resolve tier da empresa, lê limite/preço do catálogo, conta uso do mês e
--    decide. Inclui next_tier (próximo nível) ou null se já no topo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nfse_can_emit(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tier        smallint;
  v_limit       int;
  v_used        int;
  v_allowed     boolean;
  v_unlimited   boolean;
  v_next        jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0, 'limit', 0,
                              'tier', 1, 'unlimited', false, 'next_tier', NULL);
  END IF;

  -- Tier da empresa (default 1 se ausente).
  SELECT COALESCE(c.nfse_tier, 1) INTO v_tier
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_tier IS NULL THEN
    v_tier := 1;
  END IF;

  -- Limite do tier corrente no catálogo.
  SELECT t.monthly_limit INTO v_limit
  FROM public.nfse_tiers t
  WHERE t.tier = v_tier;

  -- Próximo nível (tier+1), ou NULL se já no topo.
  SELECT jsonb_build_object(
           'tier',  t.tier,
           'name',  t.name,
           'limit', t.monthly_limit,
           'price', t.price
         )
    INTO v_next
  FROM public.nfse_tiers t
  WHERE t.tier = v_tier + 1;

  v_unlimited := (v_limit IS NULL);

  IF v_unlimited THEN
    RETURN jsonb_build_object(
      'allowed',   true,
      'used',      public.nfse_month_usage(p_company_id),
      'limit',     NULL,
      'tier',      v_tier,
      'unlimited', true,
      'next_tier', v_next
    );
  END IF;

  v_used    := public.nfse_month_usage(p_company_id);
  v_allowed := (v_used < v_limit);

  RETURN jsonb_build_object(
    'allowed',   v_allowed,
    'used',      v_used,
    'limit',     v_limit,
    'tier',      v_tier,
    'unlimited', false,
    'next_tier', v_next
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nfse_can_emit(uuid)
  TO authenticated, service_role;
