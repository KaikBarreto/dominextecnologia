-- ============================================================================
-- Linha do tempo completa de execução em service_orders (Glacial Cold)
-- ----------------------------------------------------------------------------
-- Cliente quer ver, por OS:
--   - Quando começou a executar  (transição -> 'em_andamento')   = started_at
--   - Quando pausou              (já existe: paused_at)
--   - Quando retomou             (já existe: resumed_at)
--   - Quando finalizou           (transição -> 'concluida')      = completed_at
--
-- Hoje, ao concluir uma OS, perde-se a data de início. Estas colunas + extensão
-- do trigger existente `service_orders_track_pause_resume` resolvem isso.
--
-- Sem índices: colunas são pra exibição/auditoria, não filtragem em massa.
-- ============================================================================

-- 1. Colunas ---------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS started_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- 2. Trigger ---------------------------------------------------------------
-- ESTENDE a função existente (criada na migration 20260505000001) com as novas
-- regras de started_at/completed_at, preservando as regras de pausa/retomada.
-- 'a_caminho' é status técnico (saída da base) e NÃO conta como início da obra:
-- started_at só é setado na entrada efetiva em 'em_andamento'.
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

  -- Iniciou execução pela primeira vez (qualquer -> em_andamento, started_at NULL)
  -- Só marca uma vez: pausa+retomada não reabre started_at.
  IF NEW.status = 'em_andamento'::os_status
     AND (OLD.status IS DISTINCT FROM 'em_andamento'::os_status)
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  -- Finalizou (transição de qualquer status -> concluida)
  IF NEW.status = 'concluida'::os_status
     AND (OLD.status IS DISTINCT FROM 'concluida'::os_status) THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger BEFORE UPDATE já está registrado pela migration 20260505000001.
-- CREATE OR REPLACE FUNCTION acima atualiza o corpo sem precisar recriar trigger.

-- 3. Backfill --------------------------------------------------------------
-- OS já concluídas: completed_at ≈ updated_at (mesma aproximação que paused_at).
-- OS que rodaram em algum momento (a_caminho, em_andamento, pausada, concluida):
--   started_at ≈ created_at (única referência disponível).
-- OS 'agendada'/'pendente'/'cancelada' que nunca foram iniciadas: started_at = NULL.
DO $$
DECLARE
  v_completed INT;
  v_started   INT;
BEGIN
  UPDATE public.service_orders
     SET completed_at = updated_at
   WHERE status = 'concluida'::os_status
     AND completed_at IS NULL;

  GET DIAGNOSTICS v_completed = ROW_COUNT;
  RAISE NOTICE 'service_orders completed_at backfill: % linhas atualizadas', v_completed;

  UPDATE public.service_orders
     SET started_at = created_at
   WHERE status IN (
           'a_caminho'::os_status,
           'em_andamento'::os_status,
           'pausada'::os_status,
           'concluida'::os_status
         )
     AND started_at IS NULL;

  GET DIAGNOSTICS v_started = ROW_COUNT;
  RAISE NOTICE 'service_orders started_at backfill: % linhas atualizadas', v_started;
END $$;
