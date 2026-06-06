-- ============================================================================
-- Sincroniza contract_occurrences.status a partir do status da OS vinculada
-- ----------------------------------------------------------------------------
-- PROBLEMA: nao existia trigger ligando o ciclo de vida da OS
-- (service_orders.status) ao status da ocorrencia recorrente do contrato
-- (contract_occurrences.status). Quando o tecnico concluia a OS, a ocorrencia
-- ficava travada em 'scheduled' pra sempre, mostrando "Agendada" mesmo com a
-- visita ja realizada e zerando as barras de progresso do contrato.
--
-- SOLUCAO: funcao + trigger AFTER INSERT OR UPDATE OF status em service_orders
-- que projeta o status da OS na ocorrencia ligada por service_order_id, mais um
-- backfill conservador pra corrigir todos os tenants de uma vez.
--
-- Mapa de status (OS -> ocorrencia) — mesmo mapa usado pelo frontend:
--   concluida -> completed
--   cancelada -> skipped
--   demais (agendada/pendente/em_andamento/pausada) -> scheduled (so reabre
--     'completed'; preserva 'skipped'/'rescheduled' manuais do gestor).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Funcao de sincronizacao
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER porque e uma sincronizacao de SISTEMA disparada pela propria
-- OS: o tecnico que conclui a OS nao tem (e nao precisa de) permissao de UPDATE
-- na ocorrencia do contrato. O escopo e estritamente a ocorrencia vinculada
-- (WHERE service_order_id = NEW.id), que por construcao pertence a MESMA tenant
-- da OS (uma OS aponta pra uma unica ocorrencia do mesmo company_id via
-- contract). Logo, nao ha risco de vazamento cross-tenant (licao do 1.8.4).
CREATE OR REPLACE FUNCTION public.sync_occurrence_status_from_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_status text;
BEGIN
  -- Mapeia o status da OS para o status-alvo da ocorrencia.
  IF NEW.status = 'concluida' THEN
    v_target_status := 'completed';
  ELSIF NEW.status = 'cancelada' THEN
    v_target_status := 'skipped';
  ELSE
    -- OS ativa (agendada/pendente/em_andamento/pausada).
    v_target_status := 'scheduled';
  END IF;

  IF v_target_status = 'scheduled' THEN
    -- OS ativa: so REBAIXA pra 'scheduled' quem estava 'completed'
    -- (caso de OS reaberta). Nunca clobbera estado manual do gestor:
    -- 'skipped' e 'rescheduled' permanecem intactos enquanto a OS estiver ativa.
    -- Condicao status = 'completed' garante UPDATE so quando o valor muda mesmo.
    UPDATE public.contract_occurrences
       SET status = 'scheduled'
     WHERE service_order_id = NEW.id
       AND status = 'completed';
  ELSE
    -- OS concluida ou cancelada: projeta o status-alvo na ocorrencia vinculada.
    -- A condicao status <> v_target_status evita escrita no-op (e recursao).
    UPDATE public.contract_occurrences
       SET status = v_target_status
     WHERE service_order_id = NEW.id
       AND status <> v_target_status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_occurrence_status_from_os() IS
  'Projeta service_orders.status na contract_occurrences ligada por service_order_id. SECURITY DEFINER escopado a OS (mesma tenant); preserva estado manual skipped/rescheduled enquanto a OS estiver ativa.';

-- ----------------------------------------------------------------------------
-- 2) Trigger (idempotente)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_occurrence_from_os ON public.service_orders;
CREATE TRIGGER trg_sync_occurrence_from_os
  AFTER INSERT OR UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_occurrence_status_from_os();

-- ----------------------------------------------------------------------------
-- 3) Backfill conservador das ocorrencias existentes (todos os tenants)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_completed integer;
  v_skipped   integer;
BEGIN
  -- Promove ocorrencias cuja OS ja esta concluida.
  UPDATE public.contract_occurrences o
     SET status = 'completed'
    FROM public.service_orders so
   WHERE o.service_order_id = so.id
     AND so.status = 'concluida'
     AND o.status <> 'completed';
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- Canceladas viram puladas, sem rebaixar nada ja finalizado:
  -- so toca ocorrencias que ainda estao em 'scheduled'.
  UPDATE public.contract_occurrences o
     SET status = 'skipped'
    FROM public.service_orders so
   WHERE o.service_order_id = so.id
     AND so.status = 'cancelada'
     AND o.status = 'scheduled';
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  RAISE NOTICE 'Backfill ocorrencias: % promovidas para completed, % marcadas como skipped.', v_completed, v_skipped;
END $$;

COMMIT;
