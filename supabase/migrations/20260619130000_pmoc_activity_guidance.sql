-- Instrução de "como fazer" por atividade do checklist PMOC.
-- Separa a ORIENTAÇÃO (guidance) do TÍTULO (description). Mesmo conceito de
-- form_questions.description: texto auxiliar exibido APENAS para o técnico no
-- preenchimento do checklist da visita, explicando o passo a passo da atividade.
-- O título da atividade continua em `description`; `guidance` é só o complemento.
--
-- Adicionada nas 3 camadas do plano PMOC para o conteúdo poder fluir do
-- catálogo (pmoc_activity_catalog) -> plano do contrato (contract_plan_activities)
-- -> itens da OS (service_order_activities).
--
-- Nullable, sem default, sem índice. NÃO seedamos conteúdo aqui: as 149
-- instruções vêm em despacho separado (Fase B / backfill). A coluna herda a
-- RLS já existente em cada tabela (multi-tenant por company_id onde houver;
-- pmoc_activity_catalog é catálogo global).

ALTER TABLE public.pmoc_activity_catalog
  ADD COLUMN IF NOT EXISTS guidance text;

ALTER TABLE public.contract_plan_activities
  ADD COLUMN IF NOT EXISTS guidance text;

ALTER TABLE public.service_order_activities
  ADD COLUMN IF NOT EXISTS guidance text;

COMMENT ON COLUMN public.pmoc_activity_catalog.guidance IS
  'Instrução intuitiva de como fazer a atividade, exibida apenas para o técnico no preenchimento do checklist (mesmo conceito de form_questions.description). Não é o título: o título continua em description. Nullable.';

COMMENT ON COLUMN public.contract_plan_activities.guidance IS
  'Instrução intuitiva de como fazer a atividade, exibida apenas para o técnico no preenchimento do checklist (mesmo conceito de form_questions.description). Não é o título: o título continua em description. Nullable.';

COMMENT ON COLUMN public.service_order_activities.guidance IS
  'Instrução intuitiva de como fazer a atividade, exibida apenas para o técnico no preenchimento do checklist (mesmo conceito de form_questions.description). Não é o título: o título continua em description. Nullable.';
