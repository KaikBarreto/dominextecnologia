import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configuração do fluxo do PDV', () => {
  const source = readFileSync(`${process.cwd()}/src/pages/PdvSettings.tsx`, 'utf8');

  it('oferece as três formas de atendimento em linguagem direta', () => {
    expect(source).toContain('Configurações do PDV');
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

  it('não oferece gravação da empresa para perfil somente leitura', () => {
    expect(source).toContain('actions={canManageWorkflow ?');
    expect(source).toContain('disabled={!canManageWorkflow}');
    expect(source).toContain("writeDeviceReceiptFormat(next === 'company' ? null : next)");
    expect(source).toContain('Fica salvo automaticamente somente neste navegador.');
  });
});
