-- Identidade visual canônica dos checklists. Os defaults mantêm compatibilidade
-- com templates existentes e com inserções antigas que ainda não enviam os campos.
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#0F766E',
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'clipboard-check';

ALTER TABLE public.form_templates
  DROP CONSTRAINT IF EXISTS form_templates_color_hex_check,
  ADD CONSTRAINT form_templates_color_hex_check
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS form_templates_icon_check,
  ADD CONSTRAINT form_templates_icon_check
    CHECK (icon IN (
      'clipboard-check', 'list-checks', 'wrench', 'shield-check',
      'snowflake', 'fan', 'thermometer', 'gauge', 'droplets', 'zap',
      'flame', 'sparkles'
    ));

COMMENT ON COLUMN public.form_templates.color IS
  'Cor hexadecimal usada para identificar o checklist em todo o produto.';
COMMENT ON COLUMN public.form_templates.icon IS
  'Chave do ícone Lucide permitida para identificar o checklist.';
