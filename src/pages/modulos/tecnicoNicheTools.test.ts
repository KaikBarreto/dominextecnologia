import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/lib/i18n';
import { localizeNicheTools, TOOLS_BY_SEGMENT } from './tecnicoNicheTools';

function registryFor(locale: 'en' | 'es' | 'fr') {
  return MESSAGES[locale].app.technicianTools.toolsRegistry as Record<
    string,
    { label: string; description: string }
  >;
}

describe('localizeNicheTools', () => {
  it('traduz ferramentas disponíveis usando o registro real do produto', () => {
    const tools = localizeNicheTools(
      TOOLS_BY_SEGMENT.refrigeracao,
      'en',
      registryFor('en'),
    );

    expect(tools[0].title).toBe('Catalog');
    expect(tools[1].title).toBe('Thermal Load');
    expect(tools[0].accent).toBe('hsl(217 91% 60%)');
    expect(tools[1].accent).toBe('hsl(0 84% 60%)');
  });

  it('traduz também as ferramentas planejadas de cada segmento', () => {
    const tools = localizeNicheTools(
      TOOLS_BY_SEGMENT.eletrica,
      'es',
      registryFor('es'),
    );

    expect(tools[0].title).toBe('Dimensionamiento de Disyuntor');
    expect(tools[1].description).toContain('distancia');
  });
});
