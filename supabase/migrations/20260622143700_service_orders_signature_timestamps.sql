-- Carimbo legal da assinatura na OS.
-- Hoje a OS guarda a imagem da assinatura, mas NÃO o momento exato em que cada
-- assinatura foi capturada. Para fins de validade jurídica do documento, gravamos
-- o timestamp (timestamptz) de quando o técnico e quando o cliente assinaram.
--
-- Ambas colunas são NULL por design:
--   - OS antigas (anteriores a esta migration) ficam NULL.
--   - OS que não chegaram a ser assinadas (por uma das partes) ficam NULL.
--
-- RLS: nenhuma policy nova. service_orders já é multi-tenant por company_id e as
-- policies existentes são por LINHA (não por coluna), então cobrem estas colunas
-- automaticamente em SELECT/UPDATE.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS tech_signature_at timestamptz NULL;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS client_signature_at timestamptz NULL;

COMMENT ON COLUMN public.service_orders.tech_signature_at
  IS 'Momento em que a assinatura do técnico foi capturada — carimbo legal.';

COMMENT ON COLUMN public.service_orders.client_signature_at
  IS 'Momento em que a assinatura do cliente foi capturada — carimbo legal.';
