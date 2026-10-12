import { describe, expect, it } from 'vitest';

import { localizePath, stripLocale } from './paths';

describe('paths i18n', () => {
  it('usa a URL final do Cloudflare Pages nas homes internacionais', () => {
    expect(localizePath('/', 'en')).toBe('/en/');
    expect(localizePath('/', 'es')).toBe('/es/');
    expect(localizePath('/', 'fr')).toBe('/fr/');
  });

  it('preserva a home padrão e as URLs internas existentes', () => {
    expect(localizePath('/', 'pt-br')).toBe('/');
    expect(localizePath('/blog', 'en')).toBe('/en/blog');
    expect(localizePath('/os-digital', 'es')).toBe('/es/os-digital');
  });

  it('remove o prefixo tanto da raiz com barra quanto sem barra', () => {
    expect(stripLocale('/en')).toBe('/');
    expect(stripLocale('/en/')).toBe('/');
  });
});
