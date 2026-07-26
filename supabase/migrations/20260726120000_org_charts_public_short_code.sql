-- =============================================================================
-- org_charts — coluna public_short_code (link amigável de organograma)
-- =============================================================================
-- OBJETIVO: adicionar `public_short_code` à tabela org_charts, seguindo o mesmo
-- mecanismo das tabelas contracts/service_orders/customers/equipment/employees
-- (migration 20260620200000_public_short_codes_links_amigaveis.sql +
--  migration 20260726100000_employees_public_short_code.sql como modelo direto).
--
-- MECANISMO REUTILIZADO:
--   - Função geradora já existente: generate_public_short_code(12)
--   - Trigger genérico já existente: ensure_public_short_code()
--   - UNIQUE GLOBAL (mesmo padrão: código aleatório 60 bits, nunca digitado,
--     resolve 1:1 no banco inteiro).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   DROP TRIGGER IF EXISTS antes do CREATE TRIGGER.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — coluna public_short_code (nullable; trigger preenche) +
-- índice UNIQUE GLOBAL.
-- =====================================================================
ALTER TABLE public.org_charts
  ADD COLUMN IF NOT EXISTS public_short_code text;

COMMENT ON COLUMN public.org_charts.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Usado pra montar o link amigável do organograma (/funcionarios/organograma/<slug>-<codigo>). NÃO digitado pelo usuário.';

CREATE UNIQUE INDEX IF NOT EXISTS org_charts_public_short_code_key
  ON public.org_charts (public_short_code);

-- =====================================================================
-- PASSO 2 — trigger BEFORE INSERT OR UPDATE que chama ensure_public_short_code().
-- A função genérica já existe desde 20260620200000. DROP IF EXISTS antes do
-- CREATE para garantir idempotência (sem duplicar handler).
-- =====================================================================
DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.org_charts;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.org_charts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

-- =====================================================================
-- PASSO 3 — backfill: preencher todos os org_charts existentes que ainda
-- não têm public_short_code. Usa o mesmo padrão de loop + retry da migration
-- original (7 tentativas; colisão em 60 bits é astronômica).
-- RAISE NOTICE reporta quantidade afetada por auditoria.
-- =====================================================================
DO $$
DECLARE
  r          record;
  v_code     text;
  v_attempts int;
  v_exists   boolean;
  v_done     int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.org_charts WHERE public_short_code IS NULL
  LOOP
    v_attempts := 0;
    LOOP
      v_code := public.generate_public_short_code(12);
      SELECT EXISTS (
        SELECT 1 FROM public.org_charts WHERE public_short_code = v_code
      ) INTO v_exists;

      IF NOT v_exists THEN
        EXIT;
      END IF;

      v_attempts := v_attempts + 1;
      IF v_attempts >= 7 THEN
        RAISE EXCEPTION '[public-short-code backfill] código único não gerado para org_charts.% após % tentativas', r.id, v_attempts;
      END IF;
    END LOOP;

    UPDATE public.org_charts
      SET public_short_code = v_code
      WHERE id = r.id;

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE '[public-short-code backfill] org_charts: % linha(s) preenchidas', v_done;
END $$;
