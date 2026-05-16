-- =====================================================================
-- company_origins — cleanup de duplicatas + UNIQUE constraint em name
-- =====================================================================
-- Contexto: a tabela acumulou 28 linhas com 11 nomes duplicados porque
-- nunca teve UNIQUE em name. Esta migration:
--   1. Resolve compostos vs partes (Facebook/Instagram, Site/Google)
--   2. Padroniza variantes visuais (Indicação verde, Outros com Star)
--   3. Deduplica o resto mantendo a linha mais antiga (created_at ASC)
--   4. Adiciona UNIQUE(name) pra prevenir nova duplicação
--   5. Verifica via RAISE EXCEPTION que o cleanup deu certo
--
-- companies.origin armazena string (sem FK), então cleanup é seguro:
-- nenhum rótulo final ('Outros', 'Tráfego Pago', 'Site/Google') é apagado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 1: Compostos vencem partes
-- ---------------------------------------------------------------------
-- Mantém Facebook/Instagram como rótulo único pra redes sociais.
DELETE FROM public.company_origins
WHERE name IN ('Facebook', 'Instagram');

-- Mantém Site/Google como rótulo único pra busca digital.
DELETE FROM public.company_origins
WHERE name IN ('Site', 'Google');

-- ---------------------------------------------------------------------
-- Parte 2: Indicação — manter verde (UserPlus), apagar roxas (Users)
-- ---------------------------------------------------------------------
DELETE FROM public.company_origins
WHERE name = 'Indicação' AND color = '#8B5CF6';

-- ---------------------------------------------------------------------
-- Parte 3: Outros — apagar HelpCircle (sobra 2 cópias Star, Parte 4 dedupa)
-- ---------------------------------------------------------------------
DELETE FROM public.company_origins
WHERE name = 'Outros' AND icon = 'HelpCircle';

-- ---------------------------------------------------------------------
-- Parte 4: Dedupe genérico — manter created_at mais antiga por nome
-- ---------------------------------------------------------------------
-- Cobre BNI, ChatGPT/IAs, Feira/Evento, Parceiro, Tráfego Pago, WhatsApp,
-- YouTube, Facebook/Instagram, Site/Google, e a sobra de Outros (Star x2).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
  FROM public.company_origins
)
DELETE FROM public.company_origins
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ---------------------------------------------------------------------
-- Parte 5: UNIQUE(name) — prevenção definitiva
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_origins_name_unique'
      AND conrelid = 'public.company_origins'::regclass
  ) THEN
    ALTER TABLE public.company_origins
      ADD CONSTRAINT company_origins_name_unique UNIQUE (name);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Parte 6: Verificação pós-cleanup — aborta migration se falhou
-- ---------------------------------------------------------------------
DO $$
DECLARE
  total_rows INTEGER;
  duplicate_names INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM public.company_origins;
  SELECT COUNT(*) INTO duplicate_names FROM (
    SELECT name FROM public.company_origins GROUP BY name HAVING COUNT(*) > 1
  ) AS d;

  RAISE NOTICE 'company_origins cleanup: % rows remaining, % duplicate names',
    total_rows, duplicate_names;

  IF duplicate_names > 0 THEN
    RAISE EXCEPTION 'Cleanup falhou — ainda há % nomes duplicados', duplicate_names;
  END IF;
END $$;
