-- migration: adiciona coluna default_price em service_types
-- motivo: permitir que o catálogo de tipos de serviço tenha um preço padrão
--         para auto-preenchimento da linha de orçamento (Quote) quando o
--         serviço não tiver calculadora de preço configurada. Campo opcional
--         (NULLABLE sem default) — equipe CRM usará depois.

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS default_price numeric;

-- Comentário descritivo para facilitar auditoria futura
COMMENT ON COLUMN public.service_types.default_price IS
  'Preço padrão do serviço para auto-preenchimento de orçamentos. Opcional; quando nulo o CRM não pré-preenche.';
