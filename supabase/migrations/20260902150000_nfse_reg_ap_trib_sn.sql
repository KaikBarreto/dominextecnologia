-- NFS-e nacional: regime de apuração tributária pelo Simples Nacional (regApTribSN).
-- Obrigatório no layout quando opSimpNac=3 (empresa optante do Simples Nacional).
-- opSimpNac é derivado em runtime de company_fiscal_settings.regime_tributario;
-- regApTribSN precisa ser persistido pois é uma escolha do prestador, não dedutível.
-- Regra de RLS já existente na tabela (definida por Plataforma) cobre a coluna nova sem alteração.

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS reg_ap_trib_sn text NOT NULL DEFAULT '1';

COMMENT ON COLUMN public.company_fiscal_settings.reg_ap_trib_sn IS
  'Regime de apuração tributária pelo Simples Nacional (XSD regApTribSN da NFS-e nacional). 1=federais e municipal pelo SN; 2=federais pelo SN e ISSQN fora; 3=ambos fora do SN. Obrigatório quando opSimpNac=3.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_fiscal_settings_reg_ap_trib_sn_check'
      AND conrelid = 'public.company_fiscal_settings'::regclass
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_reg_ap_trib_sn_check
      CHECK (reg_ap_trib_sn IN ('1', '2', '3'));
  END IF;
END $$;
