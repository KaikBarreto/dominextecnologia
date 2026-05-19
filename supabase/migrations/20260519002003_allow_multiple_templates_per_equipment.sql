-- Permite múltiplos questionários (form_template) por (OS, equipamento).
-- Antes: UNIQUE (service_order_id, equipment_id) bloqueava o mesmo equipamento de
-- aparecer mais de uma vez na OS, impedindo vincular vários templates ao mesmo equip.
-- Agora: a unicidade passa a considerar também form_template_id, permitindo múltiplos
-- templates por equipamento dentro da mesma OS, mas barrando duplicata exata do mesmo
-- (OS, equipamento, template).

-- Drop UNIQUE antigo (nome conferido via pg_constraint na sondagem).
ALTER TABLE public.service_order_equipment
  DROP CONSTRAINT IF EXISTS service_order_equipment_service_order_id_equipment_id_key;

-- Novo UNIQUE composto incluindo form_template_id.
-- Observação: como (service_order_id, equipment_id, form_template_id) inclui colunas
-- nullable, o Postgres trata NULLs como distintos por padrão — ou seja, várias linhas
-- com form_template_id NULL para o mesmo (OS, equip) continuarão sendo aceitas.
-- Isso é o comportamento desejado: o bloqueio só vale pra triplet totalmente preenchido.
ALTER TABLE public.service_order_equipment
  ADD CONSTRAINT service_order_equipment_unique_triplet
  UNIQUE (service_order_id, equipment_id, form_template_id);
