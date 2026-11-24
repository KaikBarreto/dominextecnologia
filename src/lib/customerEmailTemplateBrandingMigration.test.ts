import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123153000_customer_email_template_branding.sql'),
  'utf8',
);

describe('branding dos modelos de e-mail de cobrança', () => {
  it('persiste somente os três modelos permitidos', () => {
    expect(migration).toContain("template_style text NOT NULL DEFAULT 'classic_light'");
    expect(migration).toContain("CHECK (template_style IN ('classic_light', 'brand_light', 'premium_dark'))");
    expect(migration).toContain('code=customer_email_template_invalid');
  });

  it('libera identidade white-label apenas com módulo e ativação', () => {
    expect(migration).toContain("company_has_module(s.company_id, 'white_label') IS TRUE");
    expect(migration).toContain('COALESCE(cs.white_label_enabled, false)');
    expect(migration).toContain('CASE WHEN wl.enabled THEN cs.white_label_primary_color END');
    expect(migration).toContain('CASE WHEN wl.enabled');
    expect(migration).toContain('cs.white_label_logo_url');
  });

  it('respeita a visibilidade configurada para dados dos documentos', () => {
    expect(migration).toContain('cs.show_name_in_documents');
    expect(migration).toContain('cs.show_cnpj_in_documents');
    expect(migration).toContain('cs.show_phone_in_documents');
    expect(migration).toContain('cs.show_email_in_documents');
    expect(migration).toContain('cs.show_address_in_documents');
  });
});
