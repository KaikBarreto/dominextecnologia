// =============================================================================
// Paridade entre os módulos compartilhados do front e os do runtime Deno.
// =============================================================================
// A edge function não consegue importar de `src/`, então os módulos puros da
// spec de arte existem em DUAS cópias. O histórico do repo mostra que cópia
// manual desencontra em silêncio (foi assim com os templates PMOC e com o
// catálogo de variáveis), e aí o preview mostra uma coisa e o PDF sai outra.
//
// Este teste transforma esse desencontro em build quebrado: as cópias têm que
// ser byte-a-byte idênticas. Mudou um lado, roda:
//
//   for f in types.ts inline.ts resolve.ts templates/*.ts; do \
//     cp "src/lib/docArt/$f" "supabase/functions/_shared/doc-art/$f"; done
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Arquivos que existem nos dois lados e precisam bater exatamente. */
const SHARED_FILES = [
  'types.ts',
  'inline.ts',
  'resolve.ts',
  'fonts/data.ts',
  'templates/slots.ts',
  'templates/blocks.ts',
  'templates/aurora.ts',
  'templates/bloco.ts',
  'templates/circuito.ts',
  'templates/grade.ts',
  'templates/marca.ts',
  'templates/monolito.ts',
  'templates/noturno.ts',
  'templates/onda.ts',
  'templates/portico.ts',
  'templates/prisma.ts',
  'templates/selo.ts',
  'templates/index.ts',
];

/** O vitest roda com o cwd na raiz do projeto. */
function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('docArt — paridade front ↔ edge', () => {
  it.each(SHARED_FILES)('%s é idêntico nas duas cópias', (file) => {
    const front = read(`src/lib/docArt/${file}`);
    const edge = read(`supabase/functions/_shared/doc-art/${file}`);
    expect(edge).toBe(front);
  });

  it('os módulos compartilhados não importam nada específico do front', () => {
    for (const file of SHARED_FILES) {
      const source = read(`src/lib/docArt/${file}`);
      const imports = source.match(/from\s+'([^']+)'/g) ?? [];
      for (const statement of imports) {
        const specifier = statement.replace(/^from\s+'/, '').replace(/'$/, '');
        // Alias do Vite não existe no Deno; pacote npm idem.
        expect(specifier.startsWith('@/')).toBe(false);
        expect(specifier.startsWith('.')).toBe(true);
        // Deno exige extensão explícita no import relativo.
        expect(specifier.endsWith('.ts')).toBe(true);
      }
    }
  });
});
