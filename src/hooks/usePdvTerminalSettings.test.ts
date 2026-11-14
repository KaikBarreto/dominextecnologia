import { describe, expect, it } from 'vitest';
import { projectPdvTerminalSettings } from './usePdvTerminalSettings';

describe('projectPdvTerminalSettings', () => {
  it('projeta caixas e estoques sem misturar o formato do servidor com a tela', () => {
    expect(projectPdvTerminalSettings({
      terminals: [{ id: 'cash-1', name: 'Caixa 01', stock_id: 'stock-1', is_active: true, sort_order: 1 }],
      stocks: [{ id: 'stock-1', name: 'Loja', purpose: 'pdv', is_default: true }],
    })).toEqual({
      terminals: [{ id: 'cash-1', name: 'Caixa 01', stockId: 'stock-1', isActive: true, sortOrder: 1 }],
      stocks: [{ id: 'stock-1', name: 'Loja', purpose: 'pdv', isDefault: true }],
    });
  });

  it('falha fechado quando o servidor não confirma as duas listas', () => {
    expect(() => projectPdvTerminalSettings({ terminals: [] })).toThrow('Não foi possível carregar');
  });
});
