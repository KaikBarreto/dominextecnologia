import { describe, expect, it } from 'vitest';

import {
  PMOC_PREVIEW_SAMPLE,
  PMOC_VARIABLES,
} from './pmocVariables';

describe('variáveis de validação pública do certificado', () => {
  it('mantém catálogo e prévia sincronizados', () => {
    expect(PMOC_VARIABLES['documento.codigo_validacao'].category).toBe('documento');
    expect(PMOC_VARIABLES['documento.url_validacao'].category).toBe('documento');
    expect(PMOC_PREVIEW_SAMPLE['documento.codigo_validacao']).toMatch(/^PMOC-\d{6,}$/);
    expect(PMOC_PREVIEW_SAMPLE['documento.url_validacao']).toMatch(/^dominex\.app\/c\/[A-Za-z0-9_-]{16}$/);
  });
});
