-- Consumo de energia por modelo no catálogo de referência (tabela global Auctus, não multi-tenant).
-- Usado pra exibir kWh/h, kWh/mês e gasto estimado em R$ no Catálogo de Equipamentos.
-- Só fazem sentido em domain IN ('ar_condicionado','linha_branca'); demais domínios ficam null.
-- Sem CHECK amarrando o domain (regra de produto, não de banco). Idempotente.

ALTER TABLE public.equipment_models ADD COLUMN IF NOT EXISTS consumo_kwh_mes numeric;
COMMENT ON COLUMN public.equipment_models.consumo_kwh_mes IS 'Consumo mensal oficial (Procel/INMETRO) em kWh; null = não informado';

ALTER TABLE public.equipment_models ADD COLUMN IF NOT EXISTS potencia_w integer;
COMMENT ON COLUMN public.equipment_models.potencia_w IS 'Potência nominal em W; null = não informado';
