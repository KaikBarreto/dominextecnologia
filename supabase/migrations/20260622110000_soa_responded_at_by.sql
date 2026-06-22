-- Frente F / Fase 1 — Conformidade PMOC a nível de pergunta.
--
-- Hoje service_order_activities (itens do checklist de conformidade PMOC) só tem
-- updated_at global; não registra QUANDO/QUEM respondeu cada item individualmente.
-- Espelhamos aqui o par responded_at/responded_by que form_responses já possui,
-- para permitir auditoria e relatórios por tarefa (Fase 2/4).

-- 1) Colunas novas (idempotente). responded_by referencia o auth user que respondeu.
ALTER TABLE public.service_order_activities
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_order_activities.responded_at IS
  'Data/hora em que o item foi respondido. Para linhas pré-feature (Frente F Fase 1) é ESTIMADO via updated_at no backfill.';
COMMENT ON COLUMN public.service_order_activities.responded_by IS
  'Auth user que respondeu o item. NULL no histórico pré-feature (não recuperável).';

-- 2) Backfill aproximado: linhas já respondidas antes da feature recebem
-- responded_at = updated_at (estimativa). responded_by fica NULL (sem como recuperar quem).
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.service_order_activities
     SET responded_at = updated_at
   WHERE responded_at IS NULL
     AND (conformity_status IS NOT NULL OR measured_value IS NOT NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill responded_at (estimado via updated_at): % linhas afetadas', v_count;
END $$;

-- 3) Índice para consultas de histórico/relatório por data de resposta.
CREATE INDEX IF NOT EXISTS idx_soa_responded_at
  ON public.service_order_activities(responded_at);
