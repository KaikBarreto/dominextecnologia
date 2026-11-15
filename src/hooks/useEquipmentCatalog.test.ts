import { describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '@/lib/i18n/messages';
import { rotuloManual } from './useEquipmentCatalog';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('tipos documentais do catálogo', () => {
  it('distingue aplicação, catálogo e ficha elétrica em todos os idiomas', () => {
    for (const locale of ['pt-br', 'en', 'es', 'fr'] as const) {
      const labels = MESSAGES[locale].app.technicianTools.catalog.manualTypes;
      for (const type of ['aplicacao', 'catalogo_tecnico', 'ficha_eletrica'] as const) {
        expect(rotuloManual(type, labels)).toBe(labels[type]);
        expect(rotuloManual(type, labels)).not.toBe(labels.default);
      }
    }
    expect(rotuloManual('unknown')).toBe('Baixar Manual');
  });
});
