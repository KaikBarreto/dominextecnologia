-- Fix v1.9.28: adiciona UNIQUE(company_id) em pricing_settings.
--
-- Bug em produção (Engetec): usePricingSettings faz
--   .upsert({ company_id, ... }, { onConflict: 'company_id' })
-- mas a tabela só tinha PRIMARY KEY(id) + INDEX simples em company_id.
-- Postgres retorna erro 42P10 ("there is no unique or exclusion constraint
-- matching the ON CONFLICT specification") ao salvar BDI em
-- Orçamentos -> Precificação.
--
-- Regra de negócio: cada empresa tem UMA linha de pricing_settings
-- (config singleton por tenant -- admin_indirect_rate, default_profit_rate,
-- tax_rate, card_*, km_cost). UNIQUE(company_id) reflete isso.

-- DEFENSIVO: se já existem duplicatas (improvável, safety check rodado
-- em prod retornou 0 linhas), manter a mais recente e apagar antigas.
-- Sem isso, ALTER TABLE ADD CONSTRAINT falharia.
DELETE FROM public.pricing_settings p1
USING public.pricing_settings p2
WHERE p1.company_id = p2.company_id
  AND p1.created_at < p2.created_at;

-- Adiciona a constraint UNIQUE.
-- Idempotente via DO block: só cria se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pricing_settings'::regclass
      AND conname = 'pricing_settings_company_id_key'
  ) THEN
    ALTER TABLE public.pricing_settings
      ADD CONSTRAINT pricing_settings_company_id_key UNIQUE (company_id);
    RAISE NOTICE 'Constraint pricing_settings_company_id_key criada.';
  ELSE
    RAISE NOTICE 'Constraint pricing_settings_company_id_key já existe — skip.';
  END IF;
END $$;
