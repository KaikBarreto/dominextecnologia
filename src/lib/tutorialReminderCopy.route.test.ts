import { describe, expect, it } from 'vitest';
import { shouldShowTutorialReminder } from './tutorialReminderCopy';

describe('lembrete de tutoriais durante operação do PDV', () => {
  it.each(['/pdv', '/pdv/venda', '/pdv/compra', '/pdv/expedicao', '/pos/sale', '/pos/venta', '/pos/vente'])('não ocupa a tela operacional %s', pathname => {
    expect(shouldShowTutorialReminder(pathname)).toBe(false);
  });
  it.each(['/dashboard', '/domiflix', '/clientes', '/financeiro'])('preserva o lembrete fora do balcão em %s', pathname => {
    expect(shouldShowTutorialReminder(pathname)).toBe(true);
  });
});
