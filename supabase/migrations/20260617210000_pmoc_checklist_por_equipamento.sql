-- PMOC Fase 3: checklist da visita POR EQUIPAMENTO.
-- Por que: hoje service_order_activities é flat (não sabe a qual aparelho a linha
-- se refere) e contract_plan_activities não distingue atividade por-aparelho de
-- atividade de local. Estas 2 colunas aditivas habilitam a expansão por equipamento
-- na geração do checklist. Migração aditiva, sem default que trave.
-- RLS: colunas cobertas pelas policies tenant já existentes — nada de policy nova.

-- 1) A qual aparelho a linha do checklist se refere (NULL = atividade de local).
ALTER TABLE public.service_order_activities
  ADD COLUMN IF NOT EXISTS equipment_id uuid NULL
  REFERENCES public.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_activities_so_equipment
  ON public.service_order_activities (service_order_id, equipment_id);

-- 2) true = a atividade expande por equipamento na geração;
--    false = atividade de local (uma linha só).
ALTER TABLE public.contract_plan_activities
  ADD COLUMN IF NOT EXISTS applies_per_equipment boolean NOT NULL DEFAULT true;
