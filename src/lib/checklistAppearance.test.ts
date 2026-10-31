import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHECKLIST_COLOR,
  DEFAULT_CHECKLIST_ICON,
  normalizeChecklistColor,
  normalizeChecklistIcon,
} from '@/lib/checklistAppearance';

describe('checklistAppearance', () => {
  it('normaliza uma aparência válida para persistência e renderização', () => {
    expect(normalizeChecklistColor('#0f766e')).toBe('#0F766E');
    expect(normalizeChecklistIcon('snowflake')).toBe('snowflake');
  });

  it('usa defaults seguros quando recebe valores inválidos ou legados', () => {
    expect(normalizeChecklistColor('teal')).toBe(DEFAULT_CHECKLIST_COLOR);
    expect(normalizeChecklistColor(null)).toBe(DEFAULT_CHECKLIST_COLOR);
    expect(normalizeChecklistIcon('icone-inexistente')).toBe(DEFAULT_CHECKLIST_ICON);
    expect(normalizeChecklistIcon(undefined)).toBe(DEFAULT_CHECKLIST_ICON);
  });
});
