-- Controle explicito dos campos personalizados de equipamento publicados nos portais.
-- Campos existentes preservam o comportamento atual; novos campos nascem privados.

BEGIN;

ALTER TABLE public.equipment_field_config
  ADD COLUMN IF NOT EXISTS is_visible_in_portal boolean NOT NULL DEFAULT false;

UPDATE public.equipment_field_config
   SET is_visible_in_portal = is_visible
 WHERE is_visible_in_portal = false;

COMMENT ON COLUMN public.equipment_field_config.is_visible_in_portal IS
  'Permite publicar o campo personalizado do equipamento em portais autenticados/compartilhados.';

COMMIT;
