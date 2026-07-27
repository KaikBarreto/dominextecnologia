/**
 * Helper para ler um campo traduzido de uma coluna `i18n` (jsonb) do banco.
 *
 * Contrato de leitura:
 *   valor exibido = i18n[locale]?.[campo] ?? campo_base
 *
 * Shapes esperados:
 *   equipment_models.i18n         = {"en":{"name":"..."},"es":{...},"fr":{...}}
 *   equipment_model_categories.i18n = {"en":{"name":"..."},"es":{...},"fr":{...}}
 *   equipment_error_codes.i18n    = {"en":{"title","description","diagnosis","solution","component"},...}
 *
 * Regras:
 *  - pt-br SEMPRE usa a coluna base (i18n ignorado — é a fonte da verdade).
 *  - locale sem entrada na coluna → fallback para base.
 *  - i18n nulo/inválido → fallback para base.
 *  - type-safe: i18n é `Json | null | undefined` (unknown-ish); castamos com cuidado.
 */

import type { LocaleCode } from '@/lib/i18n/locales';
import type { Json } from '@/integrations/supabase/types';

export function pickI18n(
  i18n: Json | null | undefined,
  locale: LocaleCode,
  field: string,
  base: string | null,
): string | null {
  // pt-br é sempre a coluna base — nunca lemos o json para ele.
  if (locale === 'pt-br') return base;

  if (!i18n || typeof i18n !== 'object' || Array.isArray(i18n)) return base;

  const localeEntry = (i18n as Record<string, unknown>)[locale];
  if (!localeEntry || typeof localeEntry !== 'object' || Array.isArray(localeEntry)) return base;

  const value = (localeEntry as Record<string, unknown>)[field];
  if (typeof value === 'string' && value.trim() !== '') return value;

  return base;
}
