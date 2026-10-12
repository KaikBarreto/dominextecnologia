import { describe, expect, it } from 'vitest';
import { stripDuplicateLeadingTitle } from './blogContent';

describe('stripDuplicateLeadingTitle', () => {
  it('remove o H1 inicial quando repete o título do layout', () => {
    expect(
      stripDuplicateLeadingTitle(
        '<h1>Segurança do trabalho para técnicos de campo: NR-10, NR-35 e boas práticas</h1><p>Resposta direta</p>',
        'Segurança do trabalho para técnicos de campo: NR-10, NR-35 e boas práticas',
      ),
    ).toBe('<p>Resposta direta</p>');
  });

  it('compara texto formatado e entidades HTML sem duplicar o título', () => {
    expect(
      stripDuplicateLeadingTitle(
        '\n<!-- abertura --><h1><strong>OS digital</strong> &amp; PMOC</h1>\n<p>Conteúdo</p>',
        'OS digital & PMOC',
      ),
    ).toBe('\n<!-- abertura --><p>Conteúdo</p>');
  });

  it('preserva um H1 inicial diferente do título da página', () => {
    const content = '<h1>Guia prático complementar</h1><p>Conteúdo</p>';
    expect(stripDuplicateLeadingTitle(content, 'Título editorial')).toBe(content);
  });
});
