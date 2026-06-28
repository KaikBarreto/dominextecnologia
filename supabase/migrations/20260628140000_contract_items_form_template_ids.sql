-- Múltiplos checklists por equipamento (contrato).
-- Lista de form_templates daquele item do contrato. Vazio = usar o
-- form_template_id único (compat). DDL aditiva idempotente; já aplicada em prod.
ALTER TABLE public.contract_items
  ADD COLUMN IF NOT EXISTS form_template_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contract_items.form_template_ids IS
  'Lista de form_templates (checklists) deste equipamento no contrato. Array jsonb de ids. Vazio = usar form_template_id único (retrocompat).';
