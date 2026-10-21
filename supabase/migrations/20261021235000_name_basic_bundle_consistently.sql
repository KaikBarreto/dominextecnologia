-- Os entitlements gratuitos continuam separados tecnicamente, mas a unidade
-- comercial exibida em proposta, checkout e gestão da assinatura é uma só.
UPDATE public.subscription_modules
   SET name = 'Kit Básico Dominex',
       description = 'OS, agenda, clientes, equipamentos, serviços, estoque, orçamentos, precificação, financeiro completo, Portal do Cliente, Área do Técnico e perguntas em vídeo.'
 WHERE code = 'basic';
