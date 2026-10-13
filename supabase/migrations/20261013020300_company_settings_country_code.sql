-- Persiste o pais do tenant para que idioma, moeda e fuso tenham um fallback
-- regional deterministico. Clientes antigos e linhas existentes continuam BR.
--
-- RLS: nenhuma policy e criada, alterada ou removida. A coluna permanece sob
-- as mesmas fronteiras multi-tenant de public.company_settings.
--
-- user_preferences.language permanece inalterada de proposito. Hoje nao e
-- possivel distinguir um 'pt-br' escolhido explicitamente de um valor criado
-- pelo default historico; converter linhas existentes para NULL poderia apagar
-- preferencias reais. Essa limpeza exige uma decisao/migration separada.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'BR';

-- O ADD COLUMN acima faz o backfill normal sem disparar triggers de UPDATE.
-- Este UPDATE so encontra linhas em ambientes com drift, onde a coluna possa
-- ter sido criada manualmente antes da migration, nula ou fora do formato.
UPDATE public.company_settings
SET country_code = 'BR'
WHERE country_code IS NULL
   OR country_code !~ '^[A-Z]{2}$';

ALTER TABLE public.company_settings
  ALTER COLUMN country_code SET DEFAULT 'BR',
  ALTER COLUMN country_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.company_settings'::regclass
      AND conname = 'company_settings_country_code_format_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_country_code_format_check
      CHECK (country_code ~ '^[A-Z]{2}$') NOT VALID;
  END IF;
END $$;

ALTER TABLE public.company_settings
  VALIDATE CONSTRAINT company_settings_country_code_format_check;

COMMENT ON COLUMN public.company_settings.country_code IS
  'Pais da empresa no formato ISO 3166-1 alpha-2 em maiusculas. Padrao: BR.';
