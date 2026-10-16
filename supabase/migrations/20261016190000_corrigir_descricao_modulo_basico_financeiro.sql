-- Corrige a descrição comercial do módulo básico sem anunciar Contratos/PMOC,
-- que continua sendo um módulo próprio. O Financeiro completo inclui Cobranças.

UPDATE public.subscription_modules
   SET description = 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Financeiro Completo com Cobranças, Precificação Avançada, Perguntas em Vídeo e 5 usuários.'
 WHERE code = 'basic';
