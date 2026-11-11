import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('abertura do primeiro caixa na própria tela', () => {
  const source = readFileSync(`${process.cwd()}/src/components/pdv/caixa/PdvFirstCashSetupDialog.tsx`, 'utf8');

  it('cadastra uma vez e segue para a abertura', () => {
    expect(source).toContain('Abrir o primeiro caixa');
    expect(source).toContain('Continuar para abertura');
    expect(source).toContain('await settings.save.mutateAsync');
    expect(source).toContain('await onCreated()');
  });

  it('exige nome e estoque sem expor termos técnicos', () => {
    expect(source).toContain('Nome do caixa');
    expect(source).toContain('Local de estoque');
    expect(source).not.toContain('terminal_id');
    expect(source).not.toContain('RPC');
  });
});
