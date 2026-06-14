-- Adiciona logo_url para as marcas globais GREE e Midea, que estavam sem logo
-- (o app não exibia a marca por falta de logo_url).
-- URLs públicas estáveis do Wikimedia Commons (mesmo padrão SVG de LG/Samsung/Fujitsu).
-- Idempotente: só preenche quando o logo_url está vazio, não sobrescreve ajuste manual.

UPDATE public.equipment_brands
SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/4/4b/GREE_logo.svg'
WHERE slug = 'gree'
  AND (logo_url IS NULL OR logo_url = '');

UPDATE public.equipment_brands
SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/b/bf/Midea.svg'
WHERE slug = 'midea'
  AND (logo_url IS NULL OR logo_url = '');
