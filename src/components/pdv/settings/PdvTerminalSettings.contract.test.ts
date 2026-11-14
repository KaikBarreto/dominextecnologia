import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cadastro de caixas do PDV', () => {
  const source = readFileSync(`${process.cwd()}/src/components/pdv/settings/PdvTerminalSettings.tsx`, 'utf8');

  it('fecha o estado vazio com uma ação real e linguagem de loja', () => {
    expect(source).toContain('Cadastrar primeiro caixa');
    expect(source).toContain('Cada caixa usa um local de estoque');
    expect(source).toContain('Estoque:');
    expect(source).not.toContain('terminal físico');
  });

  it('mantém as ações secundárias no menu de três pontos', () => {
    expect(source).toContain('MoreHorizontal');
    expect(source).toContain('<DropdownMenuLabel>Ações</DropdownMenuLabel>');
    expect(source).toContain("terminal.isActive ? 'Desativar' : 'Reativar'");
  });
});
