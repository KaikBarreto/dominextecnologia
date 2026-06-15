-- Coluna de gás refrigerante no catálogo de modelos de equipamento.
-- Já aplicada no prod via db query; esta migration documenta no repo (git hygiene).
-- Idempotente: no prod a coluna já existe, então o ADD COLUMN é no-op.

ALTER TABLE public.equipment_models ADD COLUMN IF NOT EXISTS refrigerant text;
COMMENT ON COLUMN public.equipment_models.refrigerant IS 'Gás refrigerante do modelo (id de REFRIGERANTES: R-32, R-410A, R-22...). NULL = desconhecido (sem fonte firme).';
