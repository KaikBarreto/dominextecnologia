import { describe, expect, it } from 'vitest';

const pdvSources = import.meta.glob('./**/*.tsx', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

describe('contrato visual sem verde ou amarelo pastel no PDV', () => {
  it('mantém avisos e estados em cor cheia ou superfície neutra', () => {
    const forbiddenPastel = /\bbg-(?:green|emerald|yellow|amber|lime)-(?:50|100|200|300|950(?:\/\d+)?)\b|\bbg-(?:success|warning)\/\d+\b/;

    for (const [file, source] of Object.entries(pdvSources)) {
      expect(source, file).not.toMatch(forbiddenPastel);
    }
  });
});
