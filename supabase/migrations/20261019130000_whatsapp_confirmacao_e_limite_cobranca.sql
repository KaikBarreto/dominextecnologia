-- Confirmações de entrega/leitura dependem da assinatura correta dos eventos
-- da Evolution. A versão persistida permite reconciliar instâncias antigas
-- antes do próximo envio, sem pedir um novo QR Code ao tenant.
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS webhook_config_version text;

COMMENT ON COLUMN public.whatsapp_connections.webhook_config_version IS
  'Versão da configuração de webhook aplicada na instância Evolution. NULL ou divergente faz o worker reaplicar os eventos antes de enviar.';
