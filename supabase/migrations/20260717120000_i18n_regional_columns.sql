-- Migration: i18n regional columns (Fase 0)
-- Adiciona preferências de idioma em user_preferences e configurações
-- regionais (idioma, moeda, fuso) em company_settings.
-- Nenhuma policy RLS é criada, alterada ou removida — as fronteiras
-- existentes (own-row em user_preferences, company_id em company_settings)
-- permanecem intactas.

-- ─────────────────────────────────────────
-- 1. user_preferences.language
-- ─────────────────────────────────────────
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-br'
    CHECK (language IN ('pt-br', 'en', 'es', 'fr'));

COMMENT ON COLUMN public.user_preferences.language IS
  'Idioma preferido do usuário (pt-br | en | es | fr). Padrão: pt-br.';

-- ─────────────────────────────────────────
-- 2. company_settings.language
-- ─────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-br'
    CHECK (language IN ('pt-br', 'en', 'es', 'fr'));

COMMENT ON COLUMN public.company_settings.language IS
  'Idioma padrão da empresa (pt-br | en | es | fr). Padrão: pt-br.';

-- ─────────────────────────────────────────
-- 3. company_settings.currency
-- ─────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL';
  -- Código ISO 4217; validação de lista fica no app (flexível para
  -- expansão futura sem nova migration).

COMMENT ON COLUMN public.company_settings.currency IS
  'Moeda padrão da empresa (código ISO 4217). Padrão: BRL.';

-- ─────────────────────────────────────────
-- 4. company_settings.timezone
-- ─────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
  -- Nome IANA; validação de lista fica no app (flexível).

COMMENT ON COLUMN public.company_settings.timezone IS
  'Fuso horário padrão da empresa (nome IANA). Padrão: America/Sao_Paulo.';
