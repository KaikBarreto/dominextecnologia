-- Cor visual do funil no CRM/Kanban. A alteração é aditiva e não muda as
-- policies: a leitura/escrita continua protegida pela RLS de crm_pipelines.
ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#2563EB';

ALTER TABLE public.crm_pipelines
  DROP CONSTRAINT IF EXISTS crm_pipelines_color_hex_check;

ALTER TABLE public.crm_pipelines
  ADD CONSTRAINT crm_pipelines_color_hex_check
  CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.crm_pipelines.color IS
  'Cor hexadecimal usada para identificar o funil na navegação e nos seletores do CRM/Kanban.';
