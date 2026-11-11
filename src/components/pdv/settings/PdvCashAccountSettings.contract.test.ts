import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  `${process.cwd()}/src/components/pdv/settings/PdvCashAccountSettings.tsx`,
  'utf8',
);

describe('configuração da conta de dinheiro do PDV', () => {
  it('explica abertura e fechamento em linguagem direta', () => {
    expect(source).toContain('Conta do dinheiro');
    expect(source).toContain('O saldo total fica nesta conta.');
    expect(source).toContain('Ao abrir, uma parte fica separada no caixa.');
    expect(source).toContain('Ao fechar, volta a ficar livre.');
  });

  it('bloqueia visualmente a troca com caixa aberto', () => {
    expect(source).toContain('disabled={!canManage || hasOpenCash}');
    expect(source).toContain('Feche todos os caixas antes de trocar esta conta.');
  });

  it('usa superfície neutra e ícone saturado, sem card pastel', () => {
    expect(source).toContain('bg-emerald-600 p-2 text-white');
    expect(source).not.toContain('bg-emerald-50');
    expect(source).not.toContain('bg-green-50');
  });
});
