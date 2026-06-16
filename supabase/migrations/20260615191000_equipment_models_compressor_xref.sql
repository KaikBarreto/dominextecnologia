-- Cross-reference: liga cada máquina (ar_condicionado) ao compressor TÍPICO
-- daquela faixa de capacidade (BTU). É referência didática "Ferramentas do
-- Técnico", NÃO o compressor exato de fábrica daquele modelo — apenas o que
-- normalmente equipa máquinas dessa BTU. ON DELETE SET NULL para não estourar
-- FK se o compressor de referência for removido do catálogo.

ALTER TABLE public.equipment_models
  ADD COLUMN IF NOT EXISTS compressor_model_id uuid
  REFERENCES public.equipment_models(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipment_models.compressor_model_id IS
  'compressor típico desta máquina, ligado por capacidade — referência, não o exato';
