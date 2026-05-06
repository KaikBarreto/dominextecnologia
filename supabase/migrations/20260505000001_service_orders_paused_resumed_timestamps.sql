-- ============================================================================
-- Timestamps de pausa/retomada em service_orders (Glacial Cold)
-- ----------------------------------------------------------------------------
-- Cliente quer:
--   1. Lista de OS pausadas (ordenadas por quando foram pausadas).
--   2. Ao retomar, a OS reaparece na agenda do dia da retomada — sem perder
--      a marcação na data original.
-- Para isso, a query da agenda precisa saber QUANDO a OS foi retomada.
--
-- Caminho aprovado: colunas `paused_at` + `resumed_at` mantidas via trigger
-- BEFORE UPDATE em service_orders. O trigger já existente
-- `update_service_orders_updated_at` cuida só de updated_at — não conflita.
-- ============================================================================

-- 1. Colunas ---------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS paused_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz NULL;

-- Índice parcial para a query da agenda (apenas OS retomadas)
CREATE INDEX IF NOT EXISTS idx_service_orders_resumed_at
  ON public.service_orders (resumed_at)
  WHERE resumed_at IS NOT NULL;

-- 2. Trigger ---------------------------------------------------------------
-- Mantém paused_at e resumed_at ao detectar transições de status.
--   - Qualquer status -> 'pausada'  =>  paused_at = now(), resumed_at = NULL
--   - 'pausada' -> qualquer ativo   =>  resumed_at = now() (paused_at preservado)
CREATE OR REPLACE FUNCTION public.service_orders_track_pause_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Pausou agora (transição de qualquer status -> pausada)
  IF NEW.status = 'pausada'::os_status
     AND (OLD.status IS DISTINCT FROM 'pausada'::os_status) THEN
    NEW.paused_at  := now();
    NEW.resumed_at := NULL; -- zera resumed_at, próxima retomada vai ser nova
  END IF;

  -- Retomou agora (transição pausada -> qualquer status ativo)
  IF OLD.status = 'pausada'::os_status
     AND NEW.status IS DISTINCT FROM 'pausada'::os_status THEN
    NEW.resumed_at := now();
    -- NÃO zera paused_at — fica como histórico da última pausa
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_track_pause_resume ON public.service_orders;
CREATE TRIGGER trg_service_orders_track_pause_resume
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.service_orders_track_pause_resume();

-- 3. Backfill de OS já pausadas -------------------------------------------
-- Aproxima paused_at via updated_at pra ordenação inicial do dialog.
-- (Imprecisão aceitável — única referência temporal disponível.)
DO $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE public.service_orders
     SET paused_at = updated_at
   WHERE status = 'pausada'::os_status
     AND paused_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'service_orders paused_at backfill: % linhas atualizadas', v_rows;
END $$;
