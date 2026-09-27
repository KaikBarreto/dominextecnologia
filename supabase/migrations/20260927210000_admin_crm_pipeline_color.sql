-- Cor visual dos funis do CRM/Kanban administrativo.
-- A tabela já possui RLS e policies próprias; esta alteração é apenas aditiva.
ALTER TABLE public.admin_crm_pipelines
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#2563EB';

ALTER TABLE public.admin_crm_pipelines
  DROP CONSTRAINT IF EXISTS admin_crm_pipelines_color_hex_check;

ALTER TABLE public.admin_crm_pipelines
  ADD CONSTRAINT admin_crm_pipelines_color_hex_check
  CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.admin_crm_pipelines.color IS
  'Cor hexadecimal usada para identificar o funil no CRM/Kanban administrativo.';
