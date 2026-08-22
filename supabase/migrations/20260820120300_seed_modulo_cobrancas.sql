-- =====================================================================
-- Registrar módulo 'cobrancas' no catálogo subscription_modules
-- =====================================================================
-- CONTEXTO: add-on "Cobranças" — o tenant cobra os clientes finais dele
-- online via Asaas (BYO). Feature gate consome company_has_module(company_id,
-- 'cobrancas'). Esta linha faz o módulo aparecer no painel admin e poder ser
-- contratado avulsamente.
--
-- Add-on PAGO R$ 150/mês (decisão CEO 2026-08-20), NÃO incluído nos planos
-- base. O wiring de plano/preço (ligar o módulo à company que contrata) é
-- responsabilidade da Plataforma; aqui só criamos a linha do catálogo.
--
-- Shape espelha o seed do módulo 'whatsapp' (20260730120001). subscription_modules
-- é o catálogo real (code UNIQUE, name, description, price, type, sort_order,
-- is_active). type='addon'. sort_order=13 (logo após whatsapp=12).
-- Idempotente via ON CONFLICT (code).
-- =====================================================================

INSERT INTO public.subscription_modules (code, name, description, price, type, sort_order, is_active)
VALUES (
  'cobrancas',
  'Cobranças',
  'Cobre seus clientes online por Pix, boleto ou cartão via Asaas (sua própria conta). Gera link de pagamento e baixa o recebível automaticamente quando o cliente paga.',
  150,
  'addon',
  13,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price       = EXCLUDED.price,
      type        = EXCLUDED.type,
      sort_order  = EXCLUDED.sort_order,
      is_active   = true;
