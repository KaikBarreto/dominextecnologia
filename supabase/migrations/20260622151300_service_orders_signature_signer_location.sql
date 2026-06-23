-- Reforço do "carimbo legal" da assinatura da OS.
-- Além do timestamp (tech_signature_at/client_signature_at), guardamos QUEM assinou
-- de fato e a LOCALIZAÇÃO capturada NO MOMENTO da assinatura — não derivar da OS,
-- pois o check-in/check-out pode ter sido em outro ponto/horário.
-- Todas as colunas NULL (retrocompat com OSs já assinadas).

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS tech_signed_by text NULL,
  ADD COLUMN IF NOT EXISTS tech_signed_location jsonb NULL,
  ADD COLUMN IF NOT EXISTS client_signed_by text NULL,
  ADD COLUMN IF NOT EXISTS client_signed_location jsonb NULL;

COMMENT ON COLUMN public.service_orders.tech_signed_by IS
  'Carimbo legal — nome do signatário real (técnico/usuário logado) capturado no momento da assinatura.';
COMMENT ON COLUMN public.service_orders.tech_signed_location IS
  'Carimbo legal — localização {lat,lng} real capturada no momento da assinatura do técnico.';
COMMENT ON COLUMN public.service_orders.client_signed_by IS
  'Carimbo legal — nome do signatário real (cliente) capturado no momento da assinatura.';
COMMENT ON COLUMN public.service_orders.client_signed_location IS
  'Carimbo legal — localização {lat,lng} real capturada no momento da assinatura do cliente.';
