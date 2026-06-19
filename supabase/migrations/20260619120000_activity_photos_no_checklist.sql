-- Foto(s) opcional(is) por item de checklist da visita técnica.
-- As respostas de cada item vivem em service_order_activities; aqui adicionamos
-- um campo para anexar VÁRIAS fotos por item, no mesmo padrão de
-- form_responses.response_photo_url (CSV de URLs do bucket os-photos).
-- Nullable, sem default, sem índice. A coluna herda a RLS multi-tenant
-- (company_id) já existente na tabela: UPDATE/SELECT por usuários da empresa dona da OS.

ALTER TABLE public.service_order_activities
  ADD COLUMN IF NOT EXISTS activity_photos text;

COMMENT ON COLUMN public.service_order_activities.activity_photos IS
  'URLs de fotos do item de checklist, separadas por vírgula (CSV). Apontam para o bucket de storage os-photos. Mesmo formato de form_responses.response_photo_url. Nullable.';
