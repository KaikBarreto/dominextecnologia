-- =============================================================================
-- Registrar módulo 'whatsapp' no catálogo subscription_modules
-- =============================================================================
-- CONTEXTO: o frontend/edge de gating do add-on "Avisos de WhatsApp" (Onda 4)
-- já está pronto e consome company_has_module(company_id, 'whatsapp'). Faltava
-- a linha no catálogo para o módulo aparecer no painel admin e poder ser
-- contratado avulsamente.
--
-- company_modules.module_code é TEXT livre (sem CHECK/enum enumerando códigos)
-- — confirmado na migration de criação da tabela e na migration do módulo
-- video_questions (20260715120000). Nenhum ALTER TYPE necessário.
--
-- Shape espelhado de 'nfe' (sort_order 5) com ajustes:
--   type       = 'addon'  (igual ao padrão de add-ons vendáveis avulso)
--   sort_order = 12       (logo após video_questions que ficou em 11)
--   price      = 50       (placeholder — mesmo valor dos outros add-ons; CEO calibra)
-- =============================================================================

INSERT INTO public.subscription_modules (code, name, description, price, type, sort_order, is_active)
VALUES (
  'whatsapp',
  'Avisos de WhatsApp',
  'Avisos automáticos por WhatsApp ao cliente a cada mudança de status da OS (a caminho, iniciado, concluído).',
  50,
  'addon',
  12,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price       = EXCLUDED.price,
      type        = EXCLUDED.type,
      sort_order  = EXCLUDED.sort_order,
      is_active   = true;
