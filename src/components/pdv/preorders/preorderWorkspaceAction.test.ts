import { describe, expect, it } from 'vitest';
import { preorderWorkspaceAction } from './preorderWorkspaceAction';

describe('entrada na revisão do orçamento', () => {
  it('permite valorizar sem conceder conversão', () => {
    expect(preorderWorkspaceAction('encaminhado', true, false)).toBe('Valorizar orçamento');
  });
  it('permite gerar pedido já valorizado sem conceder edição de preços', () => {
    expect(preorderWorkspaceAction('encaminhado', false, true)).toBe('Gerar pedido');
  });
  it('não abre operações sem nenhuma permissão', () => {
    expect(preorderWorkspaceAction('encaminhado', false, false)).toBeNull();
  });
  it('preserva edição do rascunho e não reabre orçamento já convertido', () => {
    expect(preorderWorkspaceAction('edicao', false, false)).toBe('Editar orçamento');
    expect(preorderWorkspaceAction('convertido', true, true)).toBeNull();
  });
});
