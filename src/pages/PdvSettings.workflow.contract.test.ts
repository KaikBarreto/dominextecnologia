import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configuração do fluxo do PDV', () => {
  const source = readFileSync(`${process.cwd()}/src/pages/PdvSettings.tsx`, 'utf8');

  it('oferece as três formas de atendimento em linguagem direta', () => {
    expect(source).toContain('Caixas e equipamentos');
    expect(source).toContain('Venda direta');
    expect(source).toContain('Balcão + caixa');
    expect(source).toContain('Balcão + caixa + retirada');
    expect(source).toContain('o caixa recebe ou aprova o fiado e entrega na hora');
    expect(source).toContain('A mudança vale para todos os caixas.');
    expect(source).not.toContain('A mudança vale para todos os terminais.');
  });

  it('usa cor primária saturada somente na escolha ativa', () => {
    expect(source).toContain("'border-primary bg-primary text-primary-foreground'");
    expect(source).toContain("selected ? 'text-primary-foreground/80' : 'text-muted-foreground'");
  });
});
